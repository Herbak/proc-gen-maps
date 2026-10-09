import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/index.js';

describe('hydrology', () => {
  const world = generateWorld({
    preset: 'earth',
    seed: 'hydro',
    size: { width: 256, height: 128 },
    erosion: { enabled: false },
  });
  const threshold = world.config.hydrology.riverThreshold;

  it('is deterministic', () => {
    const other = generateWorld({
      preset: 'earth',
      seed: 'hydro',
      size: { width: 256, height: 128 },
      erosion: { enabled: false },
    });
    expect(world.flow).toEqual(other.flow);
    expect(world.lake).toEqual(other.lake);
  });

  it('fills depressions to a finite surface', () => {
    for (let i = 0; i < world.filled.length; i++) {
      expect(Number.isFinite(world.filled[i]!)).toBe(true);
    }
  });

  it('produces a river network', () => {
    let riverCells = 0;
    for (let i = 0; i < world.flow.length; i++) {
      if (world.flow[i]! > threshold) riverCells++;
    }
    expect(riverCells).toBeGreaterThan(0);
  });

  it('never accumulates more flow than there are land cells', () => {
    const land = Math.round(world.landFraction() * world.elevation.length);
    let maxFlow = 0;
    for (let i = 0; i < world.flow.length; i++) maxFlow = Math.max(maxFlow, world.flow[i]!);
    expect(maxFlow).toBeLessThanOrEqual(land + 1);
  });

  it('keeps lakes a modest fraction of the land', () => {
    const big = generateWorld({
      preset: 'earth',
      seed: 'hydro',
      size: { width: 512, height: 256 },
      erosion: { enabled: false },
    });
    let land = 0;
    let lake = 0;
    for (let i = 0; i < big.elevation.length; i++) {
      if (big.elevation[i]! > big.seaLevel) {
        land++;
        if (big.lake[i]) lake++;
      }
    }
    expect(lake / land).toBeLessThan(0.25);
    expect(lake).toBeGreaterThan(0);
  });

  it('has no lakes on the ocean', () => {
    for (let i = 0; i < world.lake.length; i++) {
      if (world.elevation[i]! <= world.seaLevel) expect(world.lake[i]).toBe(0);
    }
  });
});
