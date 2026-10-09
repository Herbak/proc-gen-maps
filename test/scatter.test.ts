import { describe, expect, it } from 'vitest';
import { CylinderSurface, Rng, poissonDisk } from '../src/index.js';

describe('poissonDisk', () => {
  it('respects the minimum distance', () => {
    const surface = new CylinderSurface(6371);
    const points = poissonDisk(surface, new Rng('poisson'), { radiusKm: 2500 });
    expect(points.length).toBeGreaterThan(0);
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        expect(surface.distanceKm(points[i]!, points[j]!)).toBeGreaterThanOrEqual(2499);
      }
    }
  });

  it('is deterministic', () => {
    const surface = new CylinderSurface(6371);
    const a = poissonDisk(surface, new Rng('same'), { radiusKm: 1500 });
    const b = poissonDisk(surface, new Rng('same'), { radiusKm: 1500 });
    expect(a).toEqual(b);
  });
});
