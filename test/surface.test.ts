import { describe, expect, it } from 'vitest';
import { SphereSurface } from '../src/index.js';

describe('SphereSurface', () => {
  const surface = new SphereSurface(6371);

  it('measures antipodal distance as ~pi * R', () => {
    const d = surface.distanceKm({ u: 0, v: 0.5 }, { u: 0.5, v: 0.5 });
    expect(d).toBeCloseTo(Math.PI * 6371, -1);
  });

  it('has zero distance to itself', () => {
    expect(surface.distanceKm({ u: 0.3, v: 0.4 }, { u: 0.3, v: 0.4 })).toBeCloseTo(0, 6);
  });

  it('converges at the poles (all longitudes map to the same point)', () => {
    const a = surface.toPoint(0, 0);
    const b = surface.toPoint(0.5, 0);
    const c = surface.toPoint(0.25, 0);
    expect(a[2]).toBeCloseTo(1, 5);
    expect(b[2]).toBeCloseTo(1, 5);
    expect(c[2]).toBeCloseTo(1, 5);
    expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeLessThan(1e-6);
  });
});
