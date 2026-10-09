import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/index.js';

describe('erosion', () => {
  it('is deterministic', () => {
    const a = generateWorld({ preset: 'earth', seed: 'erode', size: { width: 128, height: 64 } });
    const b = generateWorld({ preset: 'earth', seed: 'erode', size: { width: 128, height: 64 } });
    expect(a.elevation).toEqual(b.elevation);
    expect(a.erosionDelta).toEqual(b.erosionDelta);
  });

  it('keeps elevation within [0, 1]', () => {
    const world = generateWorld({ preset: 'earth', seed: 'bounds', size: { width: 128, height: 64 } });
    for (let i = 0; i < world.elevation.length; i++) {
      expect(world.elevation[i]!).toBeGreaterThanOrEqual(0);
      expect(world.elevation[i]!).toBeLessThanOrEqual(1);
    }
  });

  it('actually modifies the terrain', () => {
    const world = generateWorld({ preset: 'earth', seed: 'carve', size: { width: 128, height: 64 } });
    let changed = 0;
    for (let i = 0; i < world.erosionDelta.length; i++) {
      if (Math.abs(world.erosionDelta[i]!) > 1e-4) changed++;
    }
    expect(changed).toBeGreaterThan(world.erosionDelta.length * 0.05);
  });

  it('preserves the requested ocean fraction', () => {
    const world = generateWorld({
      preset: 'earth',
      seed: 'erode-sea',
      size: { width: 256, height: 128 },
      land: { seaFraction: 0.7 },
    });
    const ocean = 1 - world.landFraction();
    expect(ocean).toBeGreaterThan(0.62);
    expect(ocean).toBeLessThan(0.78);
  });

  it('does nothing when disabled', () => {
    const world = generateWorld({
      preset: 'earth',
      seed: 'noerode',
      size: { width: 128, height: 64 },
      erosion: { enabled: false },
    });
    for (let i = 0; i < world.erosionDelta.length; i++) {
      expect(world.erosionDelta[i]).toBe(0);
    }
  });
});
