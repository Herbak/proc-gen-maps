import type { Noise } from '../noise/index.js';
import type { Seed } from '../rng/index.js';
import type { Surface } from '../surface/index.js';
import type { ResolvedWorldConfig } from './config.js';
import { samplePlates, type PlateModel } from './tectonics.js';

/** Weight of the low-frequency continentalness field on top of the plate base. */
const CONTINENTALNESS_WEIGHT = 0.42;
/** Weight of the medium-scale noise (coastline complexity + uplift modulation). */
const MEDIUM_WEIGHT = 0.1;
/** Band above sea level over which fine detail ramps in (avoids noisy coastlines). */
const DETAIL_RAMP = 0.06;

/**
 * The resolution-independent description of a world. Everything here is derived
 * deterministically from the seed, so the elevation can be evaluated at *any*
 * surface point (any resolution, any projection) via `sampleField`.
 */
export interface WorldModel {
  config: ResolvedWorldConfig;
  surface: Surface;
  seed: Seed;
  noise: Noise;
  plates: PlateModel;
  /** Normalisation constants (raw field -> [0, 1]). */
  normLo: number;
  normHi: number;
  /** Raw (pre-normalisation) field value at sea level. */
  seaLevelRaw: number;
  /** Raw depression applied toward each pole when `poles` is 'ocean'. */
  polarPenalty: number;
}

export interface BaseSample {
  value: number;
  plateId: number;
  boundaryKm: number;
  uplift: number;
}

/** Plate base + continentalness + medium noise + uplift modulation (no detail, no polar). */
export function sampleBase(model: WorldModel, u: number, v: number): BaseSample {
  const { surface, noise, config, plates } = model;
  const p = samplePlates(plates, surface, u, v);
  const [px, py, pz] = surface.toPoint(u, v);

  const { frequency, octaves, warp } = config.noise;
  const mediumFreq = frequency * 5;
  const macro = noise.warped(px * frequency, py * frequency, pz * frequency, warp, { octaves });
  const medium = noise.fbm(px * mediumFreq, py * mediumFreq, pz * mediumFreq, { octaves: 3 });

  let value = p.base + macro * CONTINENTALNESS_WEIGHT + medium * MEDIUM_WEIGHT;
  if (p.uplift !== 0) value += p.uplift * (0.5 + 0.9 * medium);

  return { value, plateId: p.plateId, boundaryKm: p.boundaryKm, uplift: p.uplift };
}

/** Smooth polar depression as a function of `v` (0 in the interior). */
export function polarDrop(config: ResolvedWorldConfig, v: number, penalty: number): number {
  if (penalty <= 0) return 0;
  const margin = config.polarMarginDeg / 180;
  const t = Math.min(v, 1 - v) / margin;
  if (t >= 1) return 0;
  const f = t < 0 ? 0 : t;
  const smooth = f * f * (3 - 2 * f);
  return (1 - smooth) * penalty;
}

/** Fine detail + ridged mountain texture (call only for land). */
export function detailTerm(
  model: WorldModel,
  u: number,
  v: number,
  value: number,
  uplift: number,
): number {
  const { surface, noise, config, seaLevelRaw } = model;
  const { detailFrequency, detailWeight } = config.noise;
  const [px, py, pz] = surface.toPoint(u, v);
  const detail = noise.fbm(
    px * detailFrequency,
    py * detailFrequency,
    pz * detailFrequency,
    { octaves: 4 },
  );
  const land = smoothstep(seaLevelRaw, seaLevelRaw + DETAIL_RAMP, value);
  const upliftMask = clamp01(uplift * 2);
  const ridge =
    upliftMask > 0
      ? noise.ridged(
          px * detailFrequency * 0.5,
          py * detailFrequency * 0.5,
          pz * detailFrequency * 0.5,
          { octaves: 4 },
        )
      : 0;
  return (detail + ridge * upliftMask) * detailWeight * land;
}

/** Fully evaluate the field at a surface point, normalised to [0, 1]. */
export function sampleField(model: WorldModel, u: number, v: number): number {
  const base = sampleBase(model, u, v);
  let value = base.value - polarDrop(model.config, v, model.polarPenalty);
  if (value > model.seaLevelRaw) value += detailTerm(model, u, v, value, base.uplift);
  const inv = model.normHi - model.normLo > 0 ? 1 / (model.normHi - model.normLo) : 1;
  return clamp01((value - model.normLo) * inv);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1));
  return t * t * (3 - 2 * t);
}
