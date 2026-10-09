import type { Seed } from '../rng/index.js';

export type SurfaceKind = 'cylinder' | 'plane' | 'sphere';

/**
 * How map edges behave.
 * - `native`: geometry decides (sphere pinches at the poles; cylinder is cut).
 * - `ocean`: force ocean within `polarMarginDeg` of each pole, so land is never cut.
 */
export type PoleMode = 'native' | 'ocean';

/** Named world generation presets. */
export type PresetName = 'earth' | 'continents' | 'archipelago' | 'pangea' | 'islands';

export interface PlanetConfig {
  /** Planet radius in km. Drives feature size and landmass counts. Default 6371. */
  radiusKm?: number;
}

export interface SizeConfig {
  /** Sampling grid width in pixels. */
  width: number;
  /** Sampling grid height in pixels. */
  height: number;
}

export interface LandConfig {
  /** Target ocean fraction in [0, 1). Default 0.71 (Earth-like). */
  seaFraction?: number;
}

export interface NoiseConfig {
  octaves?: number;
  /** Base frequency of the low-frequency continentalness field. Default 0.8. */
  frequency?: number;
  /** Base frequency of the fine detail layer. Default 6. */
  detailFrequency?: number;
  /** Weight of the fine detail relative to the landmass field. Default 0.12. */
  detailWeight?: number;
  /** Domain-warp strength (organic coastlines). Default 0.12. */
  warp?: number;
}

export interface TectonicsConfig {
  /** Enable the tectonic plate layer. Default true. */
  enabled?: boolean;
  /** Number of tectonic plates. Default 14. */
  plateCount?: number;
  /** Target fraction of the surface covered by continental plates. Default 0.42. */
  continentalFraction?: number;
  /** Strength of convergent-boundary uplift (mountain chains). Default 1. */
  uplift?: number;
  /** Strength of divergent-boundary rifting. Default 0.35. */
  rift?: number;
  /** How far boundary influence reaches from a plate margin, in km. Default 900. */
  boundaryWidthKm?: number;
}

export interface ClimateConfig {
  /** Equatorial mean temperature in degrees Celsius. Default 30. */
  equatorTempC?: number;
  /** Polar mean temperature in degrees Celsius. Default -28. */
  poleTempC?: number;
  /** Temperature drop per km of altitude. Default 6.5. */
  lapseRateCPerKm?: number;
  /** Elevation mapped to the top of the normalised range, in km. Default 8. */
  maxReliefKm?: number;
  /** Overall moisture multiplier. Default 1. */
  moistureScale?: number;
}

export type ResolvedClimateConfig = Required<ClimateConfig>;

export interface HydrologyConfig {
  /** Minimum drainage (upstream cells) for a cell to count as a river. Default 40. */
  riverThreshold?: number;
}

export type ResolvedHydrologyConfig = Required<HydrologyConfig>;

export interface ErosionConfig {
  /** Enable erosion. Default true. */
  enabled?: boolean;
  /** Hydraulic droplets per cell. Default 0.4. */
  dropletsPerCell?: number;
  /** Droplet inertia (0 = follow slope, 1 = keep direction). Default 0.05. */
  inertia?: number;
  /** Sediment capacity factor. Default 4. */
  capacity?: number;
  /** Deposition rate. Default 0.3. */
  deposit?: number;
  /** Erosion rate. Default 0.3. */
  erode?: number;
  /** Water evaporation per step. Default 0.02. */
  evaporate?: number;
  /** Gravity term for droplet speed. Default 4. */
  gravity?: number;
  /** Minimum sediment capacity (keeps flats eroding a little). Default 0.01. */
  minSlope?: number;
  /** Erosion brush radius (cells). Default 2. */
  erodeRadius?: number;
  /** Droplet lifetime (steps). Default 30. */
  lifetime?: number;
  /** Droplet initial speed. Default 1. */
  initialSpeed?: number;
  /** Droplet initial water. Default 1. */
  initialWater?: number;
  /** Thermal erosion passes. Default 4. */
  thermalIterations?: number;
  /** Talus angle (max stable slope per cell). Default 0.02. */
  talus?: number;
}

export type ResolvedErosionConfig = Required<ErosionConfig>;

export interface WorldConfig {
  seed?: Seed;
  preset?: PresetName;
  surface?: SurfaceKind;
  /** Edge behaviour. Default 'native'. */
  poles?: PoleMode;
  /** Degrees from each pole forced to ocean when `poles` is 'ocean'. Default 6. */
  polarMarginDeg?: number;
  planet?: PlanetConfig;
  size?: SizeConfig;
  land?: LandConfig;
  noise?: NoiseConfig;
  tectonics?: TectonicsConfig;
  climate?: ClimateConfig;
  hydrology?: HydrologyConfig;
  erosion?: ErosionConfig;
}

/** Fully-resolved configuration used internally after defaults are applied. */
export interface ResolvedWorldConfig {
  seed: Seed;
  preset: PresetName | null;
  surface: SurfaceKind;
  poles: PoleMode;
  polarMarginDeg: number;
  planet: { radiusKm: number };
  size: SizeConfig;
  land: { seaFraction: number };
  noise: Required<NoiseConfig>;
  tectonics: Required<TectonicsConfig>;
  climate: ResolvedClimateConfig;
  hydrology: ResolvedHydrologyConfig;
  erosion: ResolvedErosionConfig;
}

export const DEFAULT_CONFIG: ResolvedWorldConfig = {
  seed: 'proc-gen-maps',
  preset: null,
  surface: 'sphere',
  poles: 'native',
  polarMarginDeg: 6,
  planet: { radiusKm: 6371 },
  size: { width: 1024, height: 512 },
  land: { seaFraction: 0.71 },
  noise: { octaves: 3, frequency: 0.8, detailFrequency: 6, detailWeight: 0.12, warp: 0.12 },
  tectonics: {
    enabled: true,
    plateCount: 14,
    continentalFraction: 0.33,
    uplift: 1,
    rift: 0.35,
    boundaryWidthKm: 900,
  },
  climate: {
    equatorTempC: 30,
    poleTempC: -18,
    lapseRateCPerKm: 6.5,
    maxReliefKm: 5,
    moistureScale: 1,
  },
  hydrology: {
    riverThreshold: 40,
  },
  erosion: {
    enabled: true,
    dropletsPerCell: 0.25,
    inertia: 0.05,
    capacity: 4,
    deposit: 0.3,
    erode: 0.3,
    evaporate: 0.02,
    gravity: 4,
    minSlope: 0.01,
    erodeRadius: 2,
    lifetime: 30,
    initialSpeed: 1,
    initialWater: 1,
    thermalIterations: 4,
    talus: 0.02,
  },
};
