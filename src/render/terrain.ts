import { BIOME_COLORS } from '../world/biome.js';
import type { World } from '../world/World.js';
import { RasterImage } from './RasterImage.js';

export type MapStyle = 'terrain' | 'biome' | 'temperature' | 'moisture';

/** Fields a renderer may use. `elevation` is required; others depend on the style. */
export interface MapFields {
  elevation: Float32Array;
  seaLevel: number;
  biome?: Uint8Array;
  temperature?: Float32Array;
  moisture?: Float32Array;
  /** Upstream drainage per cell (0 = none). */
  flow?: Float32Array;
  /** Lake mask (1 = inland water). */
  lake?: Uint8Array;
}

export interface RenderRasterOptions {
  style?: MapStyle;
  /** Apply slope-based hillshading (terrain + biome styles). Default true. */
  hillshade?: boolean;
  /** Sun azimuth in degrees (compass, clockwise from north). Default 315. */
  sunAzimuthDeg?: number;
  /** Sun altitude in degrees above the horizon. Default 45. */
  sunAltitudeDeg?: number;
  /** Vertical exaggeration for hillshading. Default 1.2. */
  relief?: number;
  /** Minimum drainage for a cell to be drawn as a river. Default 40. */
  riverThreshold?: number;
  /** Colour for cells outside the projection domain (NaN). Default transparent. */
  outside?: [r: number, g: number, b: number, a: number];
}

type RGB = readonly [r: number, g: number, b: number];

// Ocean depth ramp (shallow -> deep).
const OCEAN: readonly [number, RGB][] = [
  [0.0, [90, 150, 190]],
  [0.5, [40, 90, 140]],
  [1.0, [12, 30, 58]],
];

// Land ramp by height above sea level (low -> high).
const LAND: readonly [number, RGB][] = [
  [0.0, [66, 122, 63]],
  [0.25, [110, 143, 61]],
  [0.45, [159, 154, 82]],
  [0.65, [176, 140, 90]],
  [0.85, [154, 143, 138]],
  [1.0, [255, 255, 255]],
];

// Temperature ramp: -40C (cold) -> +40C (hot).
const TEMPERATURE: readonly [number, RGB][] = [
  [0.0, [40, 60, 140]],
  [0.25, [80, 140, 200]],
  [0.4, [130, 190, 220]],
  [0.55, [120, 200, 140]],
  [0.7, [220, 200, 90]],
  [0.85, [220, 120, 60]],
  [1.0, [180, 40, 40]],
];

// Moisture ramp: dry (brown) -> wet (blue).
const MOISTURE: readonly [number, RGB][] = [
  [0.0, [200, 170, 110]],
  [0.5, [150, 190, 120]],
  [1.0, [40, 90, 150]],
];

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function sampleRamp(ramp: readonly [number, RGB][], t: number): RGB {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  for (let i = 1; i < ramp.length; i++) {
    const [stop, color] = ramp[i]!;
    if (clamped <= stop) {
      const [prevStop, prevColor] = ramp[i - 1]!;
      const span = stop - prevStop || 1;
      const f = (clamped - prevStop) / span;
      return [
        prevColor[0] + (color[0] - prevColor[0]) * f,
        prevColor[1] + (color[1] - prevColor[1]) * f,
        prevColor[2] + (color[2] - prevColor[2]) * f,
      ];
    }
  }
  return ramp[ramp.length - 1]![1];
}

/**
 * Render a set of fields to a coloured raster. Cells with `NaN` elevation
 * (outside a projection's domain) are painted with `outside` (transparent).
 */
export function renderMap(
  fields: MapFields,
  width: number,
  height: number,
  options: RenderRasterOptions = {},
): RasterImage {
  const style = options.style ?? 'biome';
  const useBiome = style === 'biome' && !!fields.biome;
  const hillshade = (options.hillshade ?? true) && (style === 'terrain' || useBiome);
  const relief = options.relief ?? 1.2;
  const azimuth = ((options.sunAzimuthDeg ?? 315) * Math.PI) / 180;
  const altitude = ((options.sunAltitudeDeg ?? 45) * Math.PI) / 180;
  const lx = Math.cos(altitude) * Math.sin(azimuth);
  const ly = Math.cos(altitude) * Math.cos(azimuth);
  const lz = Math.sin(altitude);
  const outside = options.outside ?? [0, 0, 0, 0];
  const riverThreshold = options.riverThreshold ?? 40;
  const showWater = style === 'terrain' || useBiome;
  const { elevation, seaLevel, biome, temperature, moisture, flow, lake } = fields;
  const image = new RasterImage(width, height);

  const at = (x: number, y: number): number => {
    if (y < 0 || y >= height) return NaN;
    const xx = ((x % width) + width) % width;
    return elevation[y * width + xx]!;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const e = elevation[i]!;
      if (Number.isNaN(e)) {
        image.setPixel(x, y, outside[0], outside[1], outside[2], outside[3]);
        continue;
      }

      let color: RGB;
      let shade = 1;

      if (style === 'temperature') {
        color = sampleRamp(TEMPERATURE, ((temperature?.[i] ?? 0) + 40) / 80);
      } else if (style === 'moisture') {
        color = sampleRamp(MOISTURE, moisture?.[i] ?? 0);
      } else if (e <= seaLevel) {
        const depth = seaLevel > 0 ? (seaLevel - e) / seaLevel : 0;
        color = sampleRamp(OCEAN, depth);
      } else if (useBiome) {
        const b = biome![i]!;
        color = BIOME_COLORS[b] ?? BIOME_COLORS[0]!;
      } else {
        color = sampleRamp(LAND, (e - seaLevel) / (1 - seaLevel || 1));
      }

      if (hillshade && e > seaLevel) {
        const left = at(x - 1, y);
        const right = at(x + 1, y);
        const up = at(x, y - 1);
        const down = at(x, y + 1);
        const sx = Number.isNaN(right) || Number.isNaN(left) ? 0 : (right - left) * 0.5;
        const sy = Number.isNaN(down) || Number.isNaN(up) ? 0 : (down - up) * 0.5;
        const dzdx = sx * relief * width;
        const dzdy = sy * relief * height;
        const len = Math.hypot(dzdx, dzdy, 1);
        const dot = (-dzdx / len) * lx + (-dzdy / len) * ly + (1 / len) * lz;
        shade = 0.55 + 0.65 * (dot < 0 ? 0 : dot);
        if (shade > 1.35) shade = 1.35;
      }

      // Overlay inland water (lakes) and rivers on land.
      if (showWater && e > seaLevel) {
        if (lake && lake[i]) {
          color = [58, 120, 170];
          shade = 1;
        } else if (flow) {
          const f = flow[i]!;
          if (f > riverThreshold) {
            const t = clamp01((f - riverThreshold) / (riverThreshold * 12));
            const a = 0.5 + 0.5 * t;
            color = [
              color[0] + (48 - color[0]) * a,
              color[1] + (104 - color[1]) * a,
              color[2] + (158 - color[2]) * a,
            ];
            shade = 1;
          }
        }
      }

      image.setPixel(x, y, color[0] * shade, color[1] * shade, color[2] * shade);
    }
  }

  return image;
}

/** Render the world's canonical grid (default style: biome). */
export function renderWorld(world: World, options: RenderRasterOptions = {}): RasterImage {
  return renderMap(
    {
      elevation: world.elevation,
      seaLevel: world.seaLevel,
      biome: world.biome,
      temperature: world.temperature,
      moisture: world.moisture,
      flow: world.flow,
      lake: world.lake,
    },
    world.width,
    world.height,
    { riverThreshold: world.config.hydrology.riverThreshold, ...options },
  );
}

/** Render the world's canonical grid in the terrain style (unless overridden). */
export function renderTerrain(world: World, options: RenderRasterOptions = {}): RasterImage {
  return renderWorld(world, { style: 'terrain', ...options });
}

/** Back-compat: render a single elevation field in the terrain style. */
export function renderRaster(
  elevation: Float32Array,
  width: number,
  height: number,
  seaLevel: number,
  options: RenderRasterOptions = {},
): RasterImage {
  return renderMap({ elevation, seaLevel }, width, height, { style: 'terrain', ...options });
}

/** Render elevation as a plain grayscale heightmap (white = high). */
export function renderElevationGray(world: World): RasterImage {
  const { width: W, height: H, elevation } = world;
  const image = new RasterImage(W, H);
  for (let i = 0; i < elevation.length; i++) {
    const g = elevation[i]! * 255;
    const x = i % W;
    const y = (i - x) / W;
    image.setPixel(x, y, g, g, g);
  }
  return image;
}
