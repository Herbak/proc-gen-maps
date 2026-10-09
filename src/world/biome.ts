/**
 * Biome classification from climate (temperature x moisture) plus altitude, and
 * a colour palette for rendering.
 */

export const Biome = {
  Ocean: 0,
  Beach: 1,
  Ice: 2,
  Tundra: 3,
  Taiga: 4,
  TemperateForest: 5,
  TemperateRainforest: 6,
  Grassland: 7,
  Shrubland: 8,
  Desert: 9,
  Savanna: 10,
  TropicalForest: 11,
  TropicalRainforest: 12,
  Alpine: 13,
  Snow: 14,
} as const;

export type BiomeId = (typeof Biome)[keyof typeof Biome];
export const BIOME_COUNT = 15;

export const BIOME_NAMES: readonly string[] = [
  'Ocean',
  'Beach',
  'Ice',
  'Tundra',
  'Taiga',
  'Temperate forest',
  'Temperate rainforest',
  'Grassland',
  'Shrubland',
  'Desert',
  'Savanna',
  'Tropical forest',
  'Tropical rainforest',
  'Alpine',
  'Snow',
];

/** RGB colour per biome id (Ocean is a fallback; water is drawn by depth). */
export const BIOME_COLORS: ReadonlyArray<readonly [number, number, number]> = [
  [30, 70, 120], // Ocean
  [214, 203, 150], // Beach
  [233, 240, 246], // Ice
  [150, 160, 140], // Tundra
  [45, 92, 62], // Taiga
  [58, 122, 66], // Temperate forest
  [32, 96, 56], // Temperate rainforest
  [130, 160, 78], // Grassland
  [150, 150, 100], // Shrubland
  [216, 192, 132], // Desert
  [182, 176, 96], // Savanna
  [62, 132, 56], // Tropical forest
  [30, 106, 46], // Tropical rainforest
  [142, 136, 130], // Alpine
  [250, 250, 255], // Snow
];

export interface BiomeThresholds {
  /** Normalised altitude above which permanent snow / bare alpine rock appears. */
  snowline?: number;
  /** Width of the alpine band below the snowline. */
  alpineBand?: number;
}

/**
 * Classify a land cell from climate + altitude.
 *
 * @param altNorm normalised altitude above sea level in [0, 1]
 * @param temperatureC air temperature in degrees Celsius
 * @param moisture precipitation index in [0, 1]
 */
export function classifyBiome(
  altNorm: number,
  temperatureC: number,
  moisture: number,
  thresholds: BiomeThresholds = {},
): BiomeId {
  const snowline = thresholds.snowline ?? 0.86;
  const alpineBand = thresholds.alpineBand ?? 0.08;

  if (altNorm < 0.02) return Biome.Beach;
  if (altNorm > snowline) return Biome.Snow;
  if (altNorm > snowline - alpineBand) return Biome.Alpine;

  if (temperatureC < -10) return Biome.Ice;
  if (temperatureC < -2) return Biome.Tundra;
  if (temperatureC < 5) return moisture > 0.35 ? Biome.Taiga : Biome.Tundra;

  if (temperatureC < 12) {
    if (moisture < 0.24) return Biome.Shrubland;
    if (moisture < 0.45) return Biome.Grassland;
    if (moisture < 0.7) return Biome.TemperateForest;
    return Biome.TemperateRainforest;
  }

  if (temperatureC < 22) {
    if (moisture < 0.2) return Biome.Desert;
    if (moisture < 0.34) return Biome.Shrubland;
    if (moisture < 0.5) return Biome.Grassland;
    if (moisture < 0.72) return Biome.TemperateForest;
    return Biome.TemperateRainforest;
  }

  // Tropical.
  if (moisture < 0.2) return Biome.Desert;
  if (moisture < 0.42) return Biome.Savanna;
  if (moisture < 0.72) return Biome.TropicalForest;
  return Biome.TropicalRainforest;
}
