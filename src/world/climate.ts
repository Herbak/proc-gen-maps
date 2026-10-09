import type { Surface } from '../surface/index.js';
import type { ResolvedClimateConfig } from './config.js';

/** Per-cell base loss as air moves inland along the wind. */
const BASE_RAINOUT = 0.006;
/** Rain-out per km of upslope (orographic effect -> rain shadows). */
const OROGRAPHIC = 0.28;

export interface ClimateFields {
  /** Air temperature in degrees Celsius. */
  temperature: Float32Array;
  /** Precipitation index in [0, 1]. */
  moisture: Float32Array;
}

/**
 * Compute temperature and moisture from the elevation field.
 *
 * - Temperature: insolation by latitude + altitude lapse rate.
 * - Moisture: oceans are the source; zonal winds carry humid air inland where it
 *   rains out (more on upslopes -> rain shadows); latitude bands add the wet ITCZ,
 *   dry subtropics, wet mid-latitudes and dry poles.
 *
 * Both are low-frequency, so they are computed once on the canonical grid.
 */
export function computeClimate(
  elevation: Float32Array,
  seaLevel: number,
  width: number,
  height: number,
  surface: Surface,
  cfg: ResolvedClimateConfig,
): ClimateFields {
  const n = width * height;
  const temperature = new Float32Array(n);
  const moisture = new Float32Array(n);
  const invRelief = 1 / (1 - seaLevel || 1);

  // --- Temperature ---------------------------------------------------------
  for (let y = 0; y < height; y++) {
    const v = (y + 0.5) / height;
    const lat = (0.5 - v) * Math.PI;
    // Real zonal means are close to linear in cos(latitude): warm equator, cold poles.
    const c = Math.cos(lat);
    const base = cfg.poleTempC + (cfg.equatorTempC - cfg.poleTempC) * c;
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const e = elevation[i]!;
      let t = base;
      if (e > seaLevel) {
        // Altitude with a mild curve so most lowland stays warm; ranges cool fast.
        const altNorm = Math.pow((e - seaLevel) * invRelief, 1.4);
        t -= cfg.lapseRateCPerKm * altNorm * cfg.maxReliefKm;
      }
      temperature[i] = t;
    }
  }

  // --- Moisture ------------------------------------------------------------
  const isOcean = (i: number) => elevation[i]! <= seaLevel;
  // Smooth the terrain for the orographic term, so micro-noise does not rain out
  // moisture on flat land (only real mountains cast rain shadows).
  const smooth = boxBlur(elevation, width, height, 3, surface.wrapX);
  for (let i = 0; i < n; i++) moisture[i] = isOcean(i) ? 1 : 0;

  for (let y = 0; y < height; y++) {
    const v = (y + 0.5) / height;
    const latDeg = (0.5 - v) * 180;
    const abs = Math.abs(latDeg);
    // Wind blows from the east in the tropics/poles, from the west in the mid-latitudes.
    const fromWest = abs >= 30 && abs < 60;
    const row = y * width;

    // Two sweeps resolve the horizontal wrap.
    for (let pass = 0; pass < 2; pass++) {
      if (fromWest) {
        for (let x = 0; x < width; x++) {
          const i = row + x;
          if (isOcean(i)) {
            moisture[i] = 1;
            continue;
          }
          const up = row + ((x - 1 + width) % width);
          const upslope = Math.max(0, smooth[i]! - smooth[up]!) * cfg.maxReliefKm;
          const loss = clamp(BASE_RAINOUT + OROGRAPHIC * upslope, 0, 0.6);
          moisture[i] = moisture[up]! * (1 - loss);
        }
      } else {
        for (let x = width - 1; x >= 0; x--) {
          const i = row + x;
          if (isOcean(i)) {
            moisture[i] = 1;
            continue;
          }
          const up = row + ((x + 1) % width);
          const upslope = Math.max(0, smooth[i]! - smooth[up]!) * cfg.maxReliefKm;
          const loss = clamp(BASE_RAINOUT + OROGRAPHIC * upslope, 0, 0.6);
          moisture[i] = moisture[up]! * (1 - loss);
        }
      }
    }

    const belt = latitudeBelt(abs);
    for (let x = 0; x < width; x++) {
      const i = row + x;
      // Gamma lift approximates moisture recycling, so continental interiors are
      // not uniformly arid.
      moisture[i] = clamp01(Math.pow(clamp01(moisture[i]! * belt * cfg.moistureScale), 0.55));
    }
  }

  return { temperature, moisture };
}

/** Precipitation multiplier by absolute latitude (wet equator, dry ~30deg, wet ~55deg). */
const BELT: ReadonlyArray<readonly [number, number]> = [
  [0, 1.15],
  [12, 1.05],
  [25, 0.55],
  [33, 0.5],
  [45, 0.95],
  [57, 1.15],
  [70, 0.9],
  [90, 0.6],
];

function latitudeBelt(absLatDeg: number): number {
  for (let i = 1; i < BELT.length; i++) {
    const [stop, value] = BELT[i]!;
    if (absLatDeg <= stop) {
      const [prevStop, prevValue] = BELT[i - 1]!;
      const f = (absLatDeg - prevStop) / (stop - prevStop || 1);
      return prevValue + (value - prevValue) * f;
    }
  }
  return BELT[BELT.length - 1]![1];
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Separable box blur (wrap-aware in x), used to smooth terrain for rain shadows. */
function boxBlur(
  src: Float32Array,
  W: number,
  H: number,
  radius: number,
  wrapX: boolean,
): Float32Array {
  const window = radius * 2 + 1;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const wrap = (i: number) => ((i % W) + W) % W;
  const clampX = (i: number) => (i < 0 ? 0 : i >= W ? W - 1 : i);

  for (let y = 0; y < H; y++) {
    const base = y * W;
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += src[base + (wrapX ? wrap(k) : clampX(k))]!;
    for (let x = 0; x < W; x++) {
      tmp[base + x] = sum / window;
      const outX = wrapX ? wrap(x - radius) : clampX(x - radius);
      const inX = wrapX ? wrap(x + radius + 1) : clampX(x + radius + 1);
      sum += src[base + inX]! - src[base + outX]!;
    }
  }

  for (let x = 0; x < W; x++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) {
      const yy = k < 0 ? 0 : k >= H ? H - 1 : k;
      sum += tmp[yy * W + x]!;
    }
    for (let y = 0; y < H; y++) {
      out[y * W + x] = sum / window;
      const outY = y - radius < 0 ? 0 : y - radius >= H ? H - 1 : y - radius;
      const inY = y + radius + 1 < 0 ? 0 : y + radius + 1 >= H ? H - 1 : y + radius + 1;
      sum += tmp[inY * W + x]! - tmp[outY * W + x]!;
    }
  }

  return out;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
