import type { Rng } from '../rng/index.js';
import type { MapCoord, Surface } from '../surface/index.js';

/** Options for Poisson-disk sampling. */
export interface PoissonOptions {
  /** Minimum distance between points, in km. */
  radiusKm: number;
  /** Attempts per active point before it is retired. Default 30. */
  attempts?: number;
}

/**
 * Poisson-disk (blue-noise) seeds on a unit sphere, returned as `(u, v)`
 * coordinates. Irregular yet well-spaced, and fully seed-dependent — unlike a
 * Fibonacci lattice, which is nearly deterministic and produces a repeating
 * pattern regardless of seed.
 */
export function spherePoisson(rng: Rng, count: number, minAngle?: number): MapCoord[] {
  const n = Math.max(1, Math.round(count));
  const angle = minAngle ?? Math.sqrt((4 * Math.PI) / n) * 0.8;
  const minCos = Math.cos(angle);
  const pts: number[] = []; // x, y, z triplets

  const maxAttempts = n * 80;
  let attempts = 0;
  while (pts.length / 3 < n && attempts < maxAttempts) {
    attempts++;
    const [x, y, z] = randomUnit(rng);
    let ok = true;
    for (let k = 0; k < pts.length; k += 3) {
      if (x * pts[k]! + y * pts[k + 1]! + z * pts[k + 2]! > minCos) {
        ok = false;
        break;
      }
    }
    if (ok) pts.push(x, y, z);
  }
  // Fallback: fill any remainder with random points (still seed-dependent).
  while (pts.length / 3 < n) {
    const [x, y, z] = randomUnit(rng);
    pts.push(x, y, z);
  }

  const out: MapCoord[] = [];
  for (let k = 0; k < pts.length; k += 3) {
    const x = pts[k]!;
    const y = pts[k + 1]!;
    const z = pts[k + 2]!;
    const lat = Math.asin(Math.max(-1, Math.min(1, z)));
    const lon = Math.atan2(y, x);
    out.push({
      u: ((((lon / (2 * Math.PI)) % 1) + 1) % 1),
      v: 0.5 - lat / Math.PI,
    });
  }
  return out;
}

function randomUnit(rng: Rng): [number, number, number] {
  const z = rng.float(-1, 1);
  const phi = rng.float(0, Math.PI * 2);
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return [r * Math.cos(phi), r * Math.sin(phi), z];
}

/**
 * Well-spread seeds on a unit sphere via a jittered Fibonacci lattice. Kept for
 * callers that want a guaranteed regular spread.
 */
export function sphereSeeds(rng: Rng, count: number): MapCoord[] {
  const n = Math.max(1, Math.round(count));
  const golden = Math.PI * (3 - Math.sqrt(5));
  const jitter = 0.5 / Math.sqrt(n);
  const out: MapCoord[] = [];

  for (let i = 0; i < n; i++) {
    const y = n === 1 ? 0 : 1 - (i / (n - 1)) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = i * golden;

    let x = Math.cos(theta) * radius + rng.float(-jitter, jitter);
    let yy = y + rng.float(-jitter, jitter);
    let z = Math.sin(theta) * radius + rng.float(-jitter, jitter);

    const len = Math.hypot(x, yy, z) || 1;
    x /= len;
    yy /= len;
    z /= len;

    const lat = Math.asin(Math.max(-1, Math.min(1, yy)));
    const lon = Math.atan2(z, x);
    const u = ((((lon / (2 * Math.PI)) % 1) + 1) % 1);
    const v = 0.5 - lat / Math.PI;
    out.push({ u, v });
  }

  return out;
}


/**
 * Poisson-disk sampling (Bridson's algorithm) on a `Surface`, using distances in
 * km so distribution is uniform in physical space. Respects horizontal wrapping.
 *
 * Reused for continent seeds, islands, and later for towns/villages.
 */
export function poissonDisk(
  surface: Surface,
  rng: Rng,
  options: PoissonOptions,
): MapCoord[] {
  const radiusKm = options.radiusKm;
  const attempts = options.attempts ?? 30;
  const points: MapCoord[] = [];

  const cellU = radiusKm / surface.widthKm;
  const cellV = radiusKm / surface.heightKm;
  const cols = Math.max(1, Math.ceil(1 / cellU));
  const rows = Math.max(1, Math.ceil(1 / cellV));
  const grid = new Map<number, number[]>();

  const wrapCol = (cx: number) => ((cx % cols) + cols) % cols;

  const cellKey = (u: number, v: number): number => {
    const cx = wrapCol(Math.floor(u * cols));
    let cy = Math.floor(v * rows);
    if (cy < 0) cy = 0;
    if (cy >= rows) cy = rows - 1;
    return cy * cols + cx;
  };

  const insert = (p: MapCoord): void => {
    const index = points.length;
    points.push(p);
    const key = cellKey(p.u, p.v);
    const bucket = grid.get(key);
    if (bucket) bucket.push(index);
    else grid.set(key, [index]);
  };

  const fits = (p: MapCoord): boolean => {
    const key = cellKey(p.u, p.v);
    const gx = key % cols;
    const gy = (key - gx) / cols;
    for (let oy = -2; oy <= 2; oy++) {
      const yy = gy + oy;
      if (yy < 0 || yy >= rows) continue;
      for (let ox = -2; ox <= 2; ox++) {
        let xx = gx + ox;
        if (surface.wrapX) xx = wrapCol(xx);
        else if (xx < 0 || xx >= cols) continue;
        const bucket = grid.get(yy * cols + xx);
        if (!bucket) continue;
        for (const i of bucket) {
          if (surface.distanceKm(p, points[i]!) < radiusKm) return false;
        }
      }
    }
    return true;
  };

  insert({ u: rng.next(), v: rng.next() });
  const active: number[] = [0];

  while (active.length > 0) {
    const ai = rng.int(0, active.length - 1);
    const origin = points[active[ai]!]!;
    let accepted = false;

    for (let k = 0; k < attempts; k++) {
      const angle = rng.next() * Math.PI * 2;
      const dist = rng.float(radiusKm, 2 * radiusKm);
      const du = (Math.cos(angle) * dist) / surface.widthKm;
      const dv = (Math.sin(angle) * dist) / surface.heightKm;
      const u = ((origin.u + du) % 1 + 1) % 1;
      const v = origin.v + dv;
      if (v < 0 || v > 1) continue;
      const candidate = { u, v };
      if (fits(candidate)) {
        insert(candidate);
        active.push(points.length - 1);
        accepted = true;
        break;
      }
    }

    if (!accepted) active.splice(ai, 1);
  }

  return points;
}
