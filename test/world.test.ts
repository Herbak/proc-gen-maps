import { describe, expect, it } from 'vitest';
import { PRESETS, generateWorld } from '../src/index.js';

const SMALL = { width: 320, height: 160 };

describe('generateWorld', () => {
  it('is deterministic for a given seed', () => {
    const a = generateWorld({ preset: 'earth', seed: 'deterministic', size: SMALL });
    const b = generateWorld({ preset: 'earth', seed: 'deterministic', size: SMALL });
    expect(a.seaLevel).toBe(b.seaLevel);
    expect(a.elevation).toEqual(b.elevation);
    expect(a.plateId).toEqual(b.plateId);
  });

  it('produces different worlds for different seeds', () => {
    const a = generateWorld({ preset: 'earth', seed: 'one', size: SMALL });
    const b = generateWorld({ preset: 'earth', seed: 'two', size: SMALL });
    let differences = 0;
    for (let i = 0; i < a.elevation.length; i++) {
      if (a.elevation[i] !== b.elevation[i]) differences++;
    }
    expect(differences).toBeGreaterThan(a.elevation.length * 0.5);
  });

  it('keeps elevation in [0, 1]', () => {
    const world = generateWorld({ preset: 'earth', seed: 'bounded', size: SMALL });
    for (let i = 0; i < world.elevation.length; i++) {
      const e = world.elevation[i]!;
      expect(e).toBeGreaterThanOrEqual(0);
      expect(e).toBeLessThanOrEqual(1);
    }
  });

  it('approximates the requested sea fraction', () => {
    const world = generateWorld({
      preset: 'earth',
      seed: 'sea',
      size: { width: 480, height: 240 },
      land: { seaFraction: 0.75 },
    });
    const ocean = 1 - world.landFraction();
    expect(ocean).toBeGreaterThan(0.68);
    expect(ocean).toBeLessThan(0.82);
  });

  it('produces an Earth-like land fraction by default', () => {
    const world = generateWorld({ preset: 'earth', seed: 'terra', size: { width: 480, height: 240 } });
    const land = world.landFraction();
    expect(land).toBeGreaterThan(0.22);
    expect(land).toBeLessThan(0.36);
  });

  it('assigns valid plate ids', () => {
    const plateCount = 14;
    const world = generateWorld({
      preset: 'earth',
      seed: 'plates',
      size: SMALL,
      tectonics: { plateCount },
    });
    const seen = new Set<number>();
    for (let i = 0; i < world.plateId.length; i++) {
      const id = world.plateId[i]!;
      expect(id).toBeLessThan(plateCount);
      seen.add(id);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('produces a non-negative boundary distance field', () => {
    const world = generateWorld({ preset: 'earth', seed: 'boundary', size: SMALL });
    for (let i = 0; i < world.boundaryKm.length; i++) {
      expect(world.boundaryKm[i]!).toBeGreaterThanOrEqual(0);
    }
  });

  it('every preset generates a plausible map', () => {
    for (const preset of Object.keys(PRESETS) as (keyof typeof PRESETS)[]) {
      const world = generateWorld({ preset, seed: `preset-${preset}`, size: SMALL });
      const land = world.landFraction();
      expect(land).toBeGreaterThan(0);
      expect(land).toBeLessThan(1);
    }
  });

  it('pinches at the poles on a sphere (top row is far less varied than the equator)', () => {
    const world = generateWorld({ preset: 'earth', seed: 'pinch', size: { width: 256, height: 128 } });
    const rowStd = (y: number): number => {
      let mean = 0;
      for (let x = 0; x < world.width; x++) mean += world.elevationAt(x, y);
      mean /= world.width;
      let variance = 0;
      for (let x = 0; x < world.width; x++) {
        const d = world.elevationAt(x, y) - mean;
        variance += d * d;
      }
      return Math.sqrt(variance / world.width);
    };
    expect(rowStd(0)).toBeLessThan(rowStd(64) * 0.5);
  });

  it('forces ocean poles when poles is "ocean"', () => {
    const world = generateWorld({ preset: 'islands', seed: 'oceanpoles', size: { width: 256, height: 128 } });
    for (let x = 0; x < world.width; x++) {
      expect(world.elevationAt(x, 0)).toBeLessThanOrEqual(world.seaLevel);
      expect(world.elevationAt(x, 1)).toBeLessThanOrEqual(world.seaLevel);
      expect(world.elevationAt(x, world.height - 1)).toBeLessThanOrEqual(world.seaLevel);
      expect(world.elevationAt(x, world.height - 2)).toBeLessThanOrEqual(world.seaLevel);
    }
  });
});
