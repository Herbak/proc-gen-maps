import { describe, expect, it } from 'vitest';
import {
  SphereSurface,
  azimuthal,
  equirect,
  generateWorld,
  localEquirect,
  mercator,
  mollweide,
  renderView,
} from '../src/index.js';

const surface = new SphereSurface(6371);
const SAMPLE: Array<{ u: number; v: number }> = [
  { u: 0.1, v: 0.3 },
  { u: 0.5, v: 0.5 },
  { u: 0.25, v: 0.7 },
  { u: 0.9, v: 0.45 },
  { u: 0.6, v: 0.2 },
];

function roundTrip(projection: ReturnType<typeof equirect>): void {
  for (const { u, v } of SAMPLE) {
    const xy = projection.forward(u, v);
    expect(xy).not.toBeNull();
    const back = projection.inverse(xy!.x, xy!.y);
    expect(back).not.toBeNull();
    let du = Math.abs(((back!.u - u + 0.5) % 1) - 0.5);
    expect(du).toBeLessThan(0.01);
    expect(Math.abs(back!.v - v)).toBeLessThan(0.01);
  }
}

describe('projections', () => {
  it('equirectangular round-trips', () => roundTrip(equirect()));
  it('Mollweide round-trips inside the ellipse', () => roundTrip(mollweide()));
  it('Mercator round-trips', () => roundTrip(mercator()));
  it('azimuthal round-trips near the centre', () =>
    roundTrip(azimuthal(surface, { u: 0.5, v: 0.5 }, 4000)));
  it('local equirect round-trips', () =>
    roundTrip(localEquirect(surface, { u: 0.5, v: 0.5 }, { width: 8000, height: 5000 })));

  it('Mollweide maps the poles to points and rejects outside the ellipse', () => {
    const m = mollweide();
    const top = m.inverse(0.5, 0);
    const bottom = m.inverse(0.5, 1);
    expect(top).not.toBeNull();
    expect(bottom).not.toBeNull();
    expect(Math.abs(top!.v - 0)).toBeLessThan(0.02);
    expect(Math.abs(bottom!.v - 1)).toBeLessThan(0.02);
    // Corners are outside the ellipse.
    expect(m.inverse(0.02, 0.02)).toBeNull();
    expect(m.inverse(0.98, 0.98)).toBeNull();
  });
});

describe('renderView', () => {
  const world = generateWorld({
    preset: 'earth',
    seed: 'views',
    size: { width: 256, height: 128 },
    erosion: { enabled: false },
  });

  it('produces the requested size and is deterministic', () => {
    const a = renderView(world, mollweide(), { width: 200, height: 100 });
    const b = renderView(world, mollweide(), { width: 200, height: 100 });
    expect(a.width).toBe(200);
    expect(a.height).toBe(100);
    expect(a.data).toEqual(b.data);
  });

  it('leaves Mollweide corners transparent', () => {
    const image = renderView(world, mollweide(), { width: 200, height: 100 });
    expect(image.data[(0 * 200 + 0) * 4 + 3]).toBe(0);
  });

  it('field sampling matches the canonical grid', () => {
    let maxDiff = 0;
    for (let i = 0; i < world.elevation.length; i++) {
      const x = i % world.width;
      const y = (i - x) / world.width;
      const model = world.sample((x + 0.5) / world.width, (y + 0.5) / world.height);
      maxDiff = Math.max(maxDiff, Math.abs(model - world.elevation[i]!));
    }
    expect(maxDiff).toBeLessThan(0.02);
  });

  it('the model is resolution independent', () => {
    const fine = generateWorld({ preset: 'earth', seed: 'res', size: { width: 512, height: 256 }, erosion: { enabled: false } });
    const coarse = generateWorld({ preset: 'earth', seed: 'res', size: { width: 256, height: 128 }, erosion: { enabled: false } });
    // Same seed -> same world: sampling the fine grid at a coarse pixel should
    // match the coarse grid there (both from the same continuous field).
    const x = 100;
    const y = 50;
    const v = (y + 0.5) / coarse.height;
    const u = (x + 0.5) / coarse.width;
    expect(Math.abs(fine.sample(u, v) - coarse.elevation[coarse.index(x, y)]!)).toBeLessThan(0.05);
  });
});
