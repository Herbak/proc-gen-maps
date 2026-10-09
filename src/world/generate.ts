import { Noise } from '../noise/index.js';
import { Rng, type Seed } from '../rng/index.js';
import {
  CylinderSurface,
  PlaneSurface,
  SphereSurface,
  type Surface,
} from '../surface/index.js';
import { Biome, classifyBiome } from './biome.js';
import { computeClimate } from './climate.js';
import { DEFAULT_CONFIG, type ResolvedWorldConfig, type WorldConfig } from './config.js';
import { detailTerm, polarDrop, sampleBase, type WorldModel } from './model.js';
import { computeHydrology } from './hydrology.js';
import { erode } from './erosion.js';
import { applyPreset } from './presets.js';
import { createPlates } from './tectonics.js';
import { World } from './World.js';

/**
 * Generate a world map from a configuration.
 *
 * The elevation is first built as a resolution-independent model (see
 * `WorldModel`) and then sampled onto the canonical equirectangular grid. The
 * same model can later be sampled at any resolution/projection via `sampleField`
 * (see `renderView`), so every "view" shows the exact same world.
 *
 * Deterministic for a given seed.
 */
export function generateWorld(input: WorldConfig = {}): World {
  const config = resolveConfig(applyPreset(input));
  const { width: W, height: H } = config.size;
  const surface = createSurface(config);
  const seed: Seed = config.seed;

  const rng = new Rng(seed);
  const noise = new Noise(rng.fork('noise'));
  const plates = createPlates(surface, rng.fork('plates'), {
    plateCount: config.tectonics.plateCount,
    continentalFraction: config.tectonics.continentalFraction,
    uplift: config.tectonics.uplift,
    rift: config.tectonics.rift,
    boundaryWidthKm: config.tectonics.boundaryWidthKm,
  });

  const model: WorldModel = {
    config,
    surface,
    seed,
    noise,
    plates,
    normLo: 0,
    normHi: 1,
    seaLevelRaw: 0,
    polarPenalty: 0,
  };

  const n = W * H;
  const raw = new Float32Array(n);
  const uplift = new Float32Array(n);
  const plateId = new Uint8Array(n);
  const boundaryKm = new Float32Array(n);

  const uCoord = new Float32Array(W);
  for (let x = 0; x < W; x++) uCoord[x] = (x + 0.5) / W;
  const vCoord = new Float32Array(H);
  for (let y = 0; y < H; y++) vCoord[y] = (y + 0.5) / H;

  // --- 1. Base field (plate + continentalness + medium + uplift) -----------
  let min = Infinity;
  let max = -Infinity;
  for (let y = 0; y < H; y++) {
    const v = vCoord[y]!;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const b = sampleBase(model, uCoord[x]!, v);
      raw[i] = b.value;
      uplift[i] = b.uplift;
      plateId[i] = b.plateId;
      boundaryKm[i] = b.boundaryKm;
      if (b.value < min) min = b.value;
      if (b.value > max) max = b.value;
    }
  }

  // --- 2. Optional polar ocean margin --------------------------------------
  if (config.poles === 'ocean') {
    model.polarPenalty = Math.max(1e-6, max - min) * 0.6;
    for (let y = 0; y < H; y++) {
      const drop = polarDrop(config, vCoord[y]!, model.polarPenalty);
      if (drop === 0) continue;
      for (let x = 0; x < W; x++) raw[y * W + x] -= drop;
    }
  }

  // --- 3. Sea level from the base field ------------------------------------
  const ext = extent(raw);
  const hist = histogram(raw, ext.min, ext.max, 4096);
  const q = (p: number) => quantile(hist, ext.min, ext.max, p);
  const seaLevelRaw = q(config.land.seaFraction);
  const lo = q(0.002);
  const hi = q(0.998);
  model.normLo = lo;
  model.normHi = hi;
  model.seaLevelRaw = seaLevelRaw;

  // --- 4. Fine detail on land only -----------------------------------------
  for (let y = 0; y < H; y++) {
    const v = vCoord[y]!;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const value = raw[i]!;
      if (value <= seaLevelRaw) continue;
      raw[i] = value + detailTerm(model, uCoord[x]!, v, value, uplift[i]!);
    }
  }

  // --- 5. Normalise to [0, 1] ----------------------------------------------
  const inv = hi - lo > 0 ? 1 / (hi - lo) : 1;
  for (let i = 0; i < n; i++) {
    const nv = (raw[i]! - lo) * inv;
    raw[i] = nv < 0 ? 0 : nv > 1 ? 1 : nv;
  }
  let seaLevel = clamp01((seaLevelRaw - lo) * inv);

  // --- 6. Erosion (hydraulic + thermal) ------------------------------------
  const erosionDelta = new Float32Array(n);
  if (config.erosion.enabled && W > 3 && H > 3) {
    const pre = Float32Array.from(raw);
    erode(raw, W, H, surface, rng.fork('erosion'), config.erosion);
    for (let i = 0; i < n; i++) raw[i] = clamp01(raw[i]!);
    // Erosion changes the height distribution: re-derive sea level so the ocean
    // fraction stays exact.
    const eExtent = extent(raw);
    const eHist = histogram(raw, eExtent.min, eExtent.max, 4096);
    seaLevel = clamp01(quantile(eHist, eExtent.min, eExtent.max, config.land.seaFraction));
    for (let i = 0; i < n; i++) erosionDelta[i] = raw[i]! - pre[i]!;

    // Re-assert the polar ocean margin: erosion can lift polar cells back above
    // sea level, which would reintroduce a hard coastline at the map edge.
    if (config.poles === 'ocean') {
      const margin = config.polarMarginDeg / 180;
      const floor = Math.max(0, seaLevel - 0.01);
      for (let y = 0; y < H; y++) {
        const v = (y + 0.5) / H;
        if (v >= margin && v <= 1 - margin) continue;
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          if (raw[i]! > floor) {
            raw[i] = floor;
            erosionDelta[i] = raw[i]! - pre[i]!;
          }
        }
      }
    }
  }

  // --- 7. Climate + biomes --------------------------------------------------
  const climate = computeClimate(raw, seaLevel, W, H, surface, config.climate);
  const biome = new Uint8Array(n);
  const invLand = 1 / (1 - seaLevel || 1);
  for (let i = 0; i < n; i++) {
    const e = raw[i]!;
    if (e <= seaLevel) {
      biome[i] = Biome.Ocean;
    } else {
      const altNorm = (e - seaLevel) * invLand;
      biome[i] = classifyBiome(altNorm, climate.temperature[i]!, climate.moisture[i]!);
    }
  }

  // --- 8. Hydrology (rivers + lakes) ---------------------------------------
  const hydrology = computeHydrology(raw, seaLevel, W, H, surface, config.hydrology);

  return new World({
    config,
    surface,
    width: W,
    height: H,
    elevation: raw,
    seaLevel,
    seed,
    plateId,
    boundaryKm,
    temperature: climate.temperature,
    moisture: climate.moisture,
    biome,
    flow: hydrology.flow,
    filled: hydrology.filled,
    lake: hydrology.lake,
    erosionDelta,
    model,
  });
}

function resolveConfig(input: WorldConfig): ResolvedWorldConfig {
  const d = DEFAULT_CONFIG;
  return {
    seed: input.seed ?? d.seed,
    preset: input.preset ?? null,
    surface: input.surface ?? d.surface,
    poles: input.poles ?? d.poles,
    polarMarginDeg: input.polarMarginDeg ?? d.polarMarginDeg,
    planet: { radiusKm: input.planet?.radiusKm ?? d.planet.radiusKm },
    size: {
      width: input.size?.width ?? d.size.width,
      height: input.size?.height ?? d.size.height,
    },
    land: { seaFraction: input.land?.seaFraction ?? d.land.seaFraction },
    noise: {
      octaves: input.noise?.octaves ?? d.noise.octaves,
      frequency: input.noise?.frequency ?? d.noise.frequency,
      detailFrequency: input.noise?.detailFrequency ?? d.noise.detailFrequency,
      detailWeight: input.noise?.detailWeight ?? d.noise.detailWeight,
      warp: input.noise?.warp ?? d.noise.warp,
    },
    tectonics: {
      enabled: input.tectonics?.enabled ?? d.tectonics.enabled,
      plateCount: input.tectonics?.plateCount ?? d.tectonics.plateCount,
      continentalFraction:
        input.tectonics?.continentalFraction ?? d.tectonics.continentalFraction,
      uplift: input.tectonics?.uplift ?? d.tectonics.uplift,
      rift: input.tectonics?.rift ?? d.tectonics.rift,
      boundaryWidthKm: input.tectonics?.boundaryWidthKm ?? d.tectonics.boundaryWidthKm,
    },
    climate: {
      equatorTempC: input.climate?.equatorTempC ?? d.climate.equatorTempC,
      poleTempC: input.climate?.poleTempC ?? d.climate.poleTempC,
      lapseRateCPerKm: input.climate?.lapseRateCPerKm ?? d.climate.lapseRateCPerKm,
      maxReliefKm: input.climate?.maxReliefKm ?? d.climate.maxReliefKm,
      moistureScale: input.climate?.moistureScale ?? d.climate.moistureScale,
    },
    hydrology: {
      riverThreshold: input.hydrology?.riverThreshold ?? d.hydrology.riverThreshold,
    },
    erosion: {
      enabled: input.erosion?.enabled ?? d.erosion.enabled,
      dropletsPerCell: input.erosion?.dropletsPerCell ?? d.erosion.dropletsPerCell,
      inertia: input.erosion?.inertia ?? d.erosion.inertia,
      capacity: input.erosion?.capacity ?? d.erosion.capacity,
      deposit: input.erosion?.deposit ?? d.erosion.deposit,
      erode: input.erosion?.erode ?? d.erosion.erode,
      evaporate: input.erosion?.evaporate ?? d.erosion.evaporate,
      gravity: input.erosion?.gravity ?? d.erosion.gravity,
      minSlope: input.erosion?.minSlope ?? d.erosion.minSlope,
      erodeRadius: input.erosion?.erodeRadius ?? d.erosion.erodeRadius,
      lifetime: input.erosion?.lifetime ?? d.erosion.lifetime,
      initialSpeed: input.erosion?.initialSpeed ?? d.erosion.initialSpeed,
      initialWater: input.erosion?.initialWater ?? d.erosion.initialWater,
      thermalIterations: input.erosion?.thermalIterations ?? d.erosion.thermalIterations,
      talus: input.erosion?.talus ?? d.erosion.talus,
    },
  };
}

function createSurface(config: ResolvedWorldConfig): Surface {
  const { radiusKm } = config.planet;
  if (config.surface === 'sphere') {
    return new SphereSurface(radiusKm);
  }
  if (config.surface === 'plane') {
    return new PlaneSurface(2 * Math.PI * radiusKm, Math.PI * radiusKm);
  }
  return new CylinderSurface(radiusKm);
}

function extent(values: Float32Array): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min)) return { min: 0, max: 1 };
  return { min, max };
}

function histogram(
  values: Float32Array,
  min: number,
  max: number,
  bins: number,
): Uint32Array {
  const counts = new Uint32Array(bins);
  const span = max - min || 1;
  for (let i = 0; i < values.length; i++) {
    let b = Math.floor(((values[i]! - min) / span) * bins);
    if (b < 0) b = 0;
    if (b >= bins) b = bins - 1;
    counts[b]!++;
  }
  return counts;
}

/**
 * Approximate inverse CDF from a histogram. `p` in [0, 1]. Returns the upper edge
 * of the bin where the cumulative fraction reaches `p`, so a large atom of equal
 * values (e.g. a flat ocean floor) is fully included below the threshold.
 */
function quantile(counts: Uint32Array, min: number, max: number, p: number): number {
  let total = 0;
  for (let i = 0; i < counts.length; i++) total += counts[i]!;
  const target = p * total;
  let acc = 0;
  const binWidth = (max - min) / counts.length;
  for (let i = 0; i < counts.length; i++) {
    acc += counts[i]!;
    if (acc >= target) return min + (i + 1) * binWidth;
  }
  return max;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
