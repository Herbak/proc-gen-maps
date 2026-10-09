import { describe, expect, it } from 'vitest';
import { Biome, classifyBiome, generateWorld } from '../src/index.js';

describe('climate + biomes', () => {
  const world = generateWorld({
    preset: 'earth',
    seed: 'climate',
    size: { width: 256, height: 128 },
    erosion: { enabled: false },
  });

  it('is deterministic', () => {
    const other = generateWorld({
      preset: 'earth',
      seed: 'climate',
      size: { width: 256, height: 128 },
      erosion: { enabled: false },
    });
    expect(world.temperature).toEqual(other.temperature);
    expect(world.moisture).toEqual(other.moisture);
    expect(world.biome).toEqual(other.biome);
  });

  it('is warmer at the equator than at the poles', () => {
    const rowMean = (y: number): number => {
      let sum = 0;
      for (let x = 0; x < world.width; x++) sum += world.temperature[world.index(x, y)]!;
      return sum / world.width;
    };
    const equator = rowMean(Math.floor(world.height / 2));
    expect(equator).toBeGreaterThan(rowMean(0));
    expect(equator).toBeGreaterThan(rowMean(world.height - 1));
  });

  it('keeps moisture within [0, 1]', () => {
    for (let i = 0; i < world.moisture.length; i++) {
      const m = world.moisture[i]!;
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThanOrEqual(1);
    }
  });

  it('labels every ocean cell as ocean', () => {
    for (let i = 0; i < world.elevation.length; i++) {
      if (world.elevation[i]! <= world.seaLevel) {
        expect(world.biome[i]).toBe(Biome.Ocean);
      }
    }
  });

  it('produces a variety of land biomes', () => {
    const seen = new Set<number>();
    for (let i = 0; i < world.biome.length; i++) {
      const b = world.biome[i]!;
      if (b !== Biome.Ocean) seen.add(b);
    }
    expect(seen.size).toBeGreaterThan(4);
  });

  it('is much drier in continental interiors than at the coast', () => {
    // Average land moisture should be well below the ocean value (1).
    let landSum = 0;
    let land = 0;
    for (let i = 0; i < world.biome.length; i++) {
      if (world.biome[i] !== Biome.Ocean) {
        landSum += world.moisture[i]!;
        land++;
      }
    }
    const mean = landSum / land;
    expect(mean).toBeGreaterThan(0.2);
    expect(mean).toBeLessThan(0.8);
  });
});

describe('classifyBiome', () => {
  it('puts high altitude under snow / alpine', () => {
    expect(classifyBiome(0.95, 25, 0.6)).toBe(Biome.Snow);
    expect(classifyBiome(0.8, 25, 0.6)).toBe(Biome.Alpine);
  });

  it('puts the warm equator under tropical biomes', () => {
    expect(classifyBiome(0.1, 26, 0.9)).toBe(Biome.TropicalRainforest);
    expect(classifyBiome(0.1, 26, 0.25)).toBe(Biome.Savanna);
  });

  it('puts the cold poles under ice / tundra', () => {
    expect(classifyBiome(0.1, -15, 0.5)).toBe(Biome.Ice);
    expect(classifyBiome(0.1, -4, 0.5)).toBe(Biome.Tundra);
  });

  it('makes deserts where it is warm and dry', () => {
    expect(classifyBiome(0.1, 25, 0.1)).toBe(Biome.Desert);
  });
});
