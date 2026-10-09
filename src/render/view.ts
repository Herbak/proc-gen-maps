import type { Projection } from '../projection/index.js';
import { Biome, classifyBiome } from '../world/biome.js';
import type { World } from '../world/World.js';
import { RasterImage } from './RasterImage.js';
import { renderMap, type MapFields, type RenderRasterOptions } from './terrain.js';

export type SamplerKind = 'grid' | 'field';

export interface ViewOptions extends RenderRasterOptions {
  width: number;
  height: number;
  /** Force a sampler; defaults to the projection's preferred one. */
  sampler?: SamplerKind;
}

/** Bilinear sample of a float grid at a surface coordinate (x wraps, y clamps). */
function bilinear(
  field: Float32Array,
  W: number,
  H: number,
  u: number,
  v: number,
): number {
  const fx = (((u % 1) + 1) % 1) * W - 0.5;
  const fy = v * H - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const g = (x: number, y: number): number => {
    const xx = ((x % W) + W) % W;
    const yy = y < 0 ? 0 : y >= H ? H - 1 : y;
    return field[yy * W + xx]!;
  };
  const v00 = g(x0, y0);
  const v10 = g(x0 + 1, y0);
  const v01 = g(x0, y0 + 1);
  const v11 = g(x0 + 1, y0 + 1);
  return (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
}

function nearest(field: Uint8Array, W: number, H: number, u: number, v: number): number {
  const x = ((Math.floor(u * W) % W) + W) % W;
  let y = Math.floor(v * H);
  if (y < 0) y = 0;
  if (y >= H) y = H - 1;
  return field[y * W + x]!;
}

/**
 * Render the world through any projection.
 *
 * - `grid` sampler: fast bilinear resample of the canonical raster — good for
 *   whole-world overviews.
 * - `field` sampler: evaluates the resolution-independent model per pixel — crisp
 *   at any zoom (regions, azimuthal charts).
 *
 * Biomes are re-classified per pixel from smooth (bilinear) temperature + moisture,
 * so biome boundaries stay crisp at any zoom rather than showing grid steps.
 */
export function renderView(
  world: World,
  projection: Projection,
  options: ViewOptions,
): RasterImage {
  const { width: OW, height: OH } = options;
  const style = options.style ?? 'biome';
  const sampler = options.sampler ?? projection.preferredSampler;
  const useField = sampler === 'field';

  const wantBiome = style === 'biome';
  const wantMoisture = style === 'moisture' || wantBiome;
  const wantTemperature = style === 'temperature' || wantBiome;
  const wantWater = style === 'biome' || style === 'terrain';

  const elevation = new Float32Array(OW * OH).fill(NaN);
  const moisture = wantMoisture ? new Float32Array(OW * OH) : undefined;
  const temperature = wantTemperature ? new Float32Array(OW * OH) : undefined;
  const biome = wantBiome ? new Uint8Array(OW * OH) : undefined;
  const flow = wantWater ? new Float32Array(OW * OH) : undefined;
  const lake = wantWater ? new Uint8Array(OW * OH) : undefined;

  const invLand = 1 / (1 - world.seaLevel || 1);

  for (let py = 0; py < OH; py++) {
    const y = (py + 0.5) / OH;
    for (let px = 0; px < OW; px++) {
      const x = (px + 0.5) / OW;
      const c = projection.inverse(x, y);
      if (!c) continue;
      const i = py * OW + px;
      let e: number;
      if (useField) {
        // Analytic field + erosion delta (sampled from the grid) = eroded elevation.
        const base = world.sample(c.u, c.v);
        const delta = bilinear(world.erosionDelta, world.width, world.height, c.u, c.v);
        e = base + delta;
        e = e < 0 ? 0 : e > 1 ? 1 : e;
      } else {
        e = bilinear(world.elevation, world.width, world.height, c.u, c.v);
      }
      elevation[i] = e;
      if (moisture) {
        moisture[i] = bilinear(world.moisture, world.width, world.height, c.u, c.v);
      }
      if (temperature) {
        temperature[i] = bilinear(world.temperature, world.width, world.height, c.u, c.v);
      }
      if (biome) {
        if (e <= world.seaLevel) {
          biome[i] = Biome.Ocean;
        } else {
          const altNorm = (e - world.seaLevel) * invLand;
          biome[i] = classifyBiome(altNorm, temperature![i]!, moisture![i]!);
        }
      }
      if (flow) flow[i] = bilinear(world.flow, world.width, world.height, c.u, c.v);
      if (lake) lake[i] = nearest(world.lake, world.width, world.height, c.u, c.v);
    }
  }

  const fields: MapFields = {
    elevation,
    seaLevel: world.seaLevel,
    biome,
    moisture,
    temperature,
    flow,
    lake,
  };
  return renderMap(fields, OW, OH, {
    riverThreshold: world.config.hydrology.riverThreshold,
    ...options,
  });
}
