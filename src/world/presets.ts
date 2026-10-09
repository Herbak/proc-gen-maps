import type { PresetName, WorldConfig } from './config.js';

/**
 * Named presets. Each is a partial config layer; `generateWorld({ preset, ... })`
 * merges it under any explicit overrides, so a preset is a starting point, not a lock.
 */
export const PRESETS: Record<PresetName, WorldConfig> = {
  // Whole world, Earth radius, ~29% land, big continents with mountain chains.
  earth: {
    planet: { radiusKm: 6371 },
    surface: 'sphere',
    poles: 'native',
    land: { seaFraction: 0.71 },
    tectonics: {
      plateCount: 14,
      continentalFraction: 0.33,
      uplift: 1,
      rift: 0.35,
      boundaryWidthKm: 900,
    },
    noise: { octaves: 3, frequency: 0.8, detailFrequency: 6, detailWeight: 0.12, warp: 0.12 },
  },

  // A few large connected landmasses.
  continents: {
    surface: 'sphere',
    poles: 'native',
    land: { seaFraction: 0.62 },
    tectonics: {
      plateCount: 9,
      continentalFraction: 0.42,
      uplift: 0.85,
      rift: 0.3,
      boundaryWidthKm: 1000,
    },
    noise: { octaves: 3, frequency: 0.85, detailFrequency: 6, detailWeight: 0.12, warp: 0.12 },
  },

  // Many medium islands; little continental mass.
  archipelago: {
    surface: 'sphere',
    poles: 'ocean',
    land: { seaFraction: 0.78 },
    tectonics: {
      plateCount: 26,
      continentalFraction: 0.26,
      uplift: 0.7,
      rift: 0.4,
      boundaryWidthKm: 500,
    },
    noise: { octaves: 4, frequency: 1, detailFrequency: 7, detailWeight: 0.16, warp: 0.15 },
  },

  // One dominant supercontinent plus scattered islands.
  pangea: {
    surface: 'sphere',
    poles: 'native',
    land: { seaFraction: 0.68 },
    tectonics: {
      plateCount: 6,
      continentalFraction: 0.37,
      uplift: 0.9,
      rift: 0.25,
      boundaryWidthKm: 1200,
    },
    noise: { octaves: 3, frequency: 0.75, detailFrequency: 6, detailWeight: 0.12, warp: 0.1 },
  },

  // Sparse volcanic islands / atolls.
  islands: {
    surface: 'sphere',
    poles: 'ocean',
    land: { seaFraction: 0.88 },
    tectonics: {
      plateCount: 60,
      continentalFraction: 0.22,
      uplift: 0.6,
      rift: 0.4,
      boundaryWidthKm: 350,
    },
    noise: { octaves: 4, frequency: 1.1, detailFrequency: 7, detailWeight: 0.18, warp: 0.15 },
  },
};

/** Merge the selected preset under the explicit input (input wins). */
export function applyPreset(input: WorldConfig): WorldConfig {
  if (!input.preset) return input;
  return deepMerge(PRESETS[input.preset], input);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMerge<T extends object, U extends object>(base: T, override: U): T & U {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(override)) {
    const current = out[key];
    out[key] =
      isObject(value) && isObject(current) ? deepMerge(current, value) : value;
  }
  return out as T & U;
}
