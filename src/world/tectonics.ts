import type { Rng } from '../rng/index.js';
import { poissonDisk, spherePoisson } from '../scatter/index.js';
import type { MapCoord, Surface } from '../surface/index.js';

/** Base elevation added for each plate type (before continentalness noise). */
const CONTINENTAL_BASE = 0.28;
const OCEANIC_BASE = -0.42;

export interface PlateOptions {
  plateCount: number;
  continentalFraction: number;
  uplift: number;
  rift: number;
  boundaryWidthKm: number;
}

/**
 * A deterministic tectonic plate model. Holds everything needed to evaluate the
 * plate contribution at *any* point on the surface (not just on a grid), so views
 * at any resolution/projection stay consistent.
 */
export interface PlateModel {
  count: number;
  seeds: MapCoord[];
  /** Unit-sphere 3D point of each seed (3 floats per plate). */
  seedPts: Float32Array;
  /** Unit tangent drift vector of each plate (3 floats per plate). */
  drift: Float32Array;
  /** Per-plate base-elevation offset, so plates vary in height/size. */
  baseOffset: Float32Array;
  continental: Uint8Array;
  options: PlateOptions;
}

export interface PlateSample {
  plateId: number;
  secondId: number;
  /** Distance to the nearest plate margin, in km (0 on margins). */
  boundaryKm: number;
  /** Smoothed base elevation from plate type (shelf-blended across margins). */
  base: number;
  /** Signed boundary contribution: convergent uplift / divergent rift. */
  uplift: number;
}

/** Build the plate model: seeds, continental assignment (by area), and drift. */
export function createPlates(surface: Surface, rng: Rng, options: PlateOptions): PlateModel {
  const count = Math.max(1, Math.round(options.plateCount));
  const seeds = seedPlates(surface, rng.fork('seeds'), count);
  const n = seeds.length;

  const seedPts = new Float32Array(n * 3);
  for (let p = 0; p < n; p++) {
    const [sx, sy, sz] = surface.toPoint(seeds[p]!.u, seeds[p]!.v);
    seedPts[p * 3] = sx;
    seedPts[p * 3 + 1] = sy;
    seedPts[p * 3 + 2] = sz;
  }

  // Assign continental status by area to hit the target fraction. Areas are
  // estimated by random uniform sampling (area-correct on both sphere and plane).
  const counts = new Float64Array(n);
  const samples = Math.max(4096, n * 512);
  const areaRng = rng.fork('areas');
  for (let s = 0; s < samples; s++) {
    const c = randomCoord(surface, areaRng);
    counts[nearestPlate(surface, seeds, seedPts, c.u, c.v)]!++;
  }

  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
  }
  const continental = new Uint8Array(n);
  let cumulative = 0;
  for (const p of order) {
    if (cumulative / samples >= options.continentalFraction) break;
    continental[p] = 1;
    cumulative += counts[p]!;
  }

  // Per-plate drift: a random unit tangent vector at the seed.
  const drift = new Float32Array(n * 3);
  for (let p = 0; p < n; p++) {
    const sx = seedPts[p * 3]!;
    const sy = seedPts[p * 3 + 1]!;
    const sz = seedPts[p * 3 + 2]!;
    let rx = rng.float(-1, 1);
    let ry = rng.float(-1, 1);
    let rz = rng.float(-1, 1);
    const dot = rx * sx + ry * sy + rz * sz;
    rx -= dot * sx;
    ry -= dot * sy;
    rz -= dot * sz;
    const len = Math.hypot(rx, ry, rz) || 1;
    drift[p * 3] = rx / len;
    drift[p * 3 + 1] = ry / len;
    drift[p * 3 + 2] = rz / len;
  }

  // Vary each plate's base elevation so continents/islands are not all identical.
  const baseOffset = new Float32Array(n);
  for (let p = 0; p < n; p++) baseOffset[p] = rng.float(-0.12, 0.12);

  return { count: n, seeds, seedPts, drift, baseOffset, continental, options };
}

/** Evaluate the plate contribution at a surface coordinate. */
export function samplePlates(
  model: PlateModel,
  surface: Surface,
  u: number,
  v: number,
): PlateSample {
  const { seeds, seedPts, drift, continental, options } = model;
  const { sq1, sq2, i1, i2 } = twoNearest(surface, seeds, seedPts, u, v);
  const a = i1 < 0 ? 0 : i1;
  const b = i2;

  const baseA = (continental[a] ? CONTINENTAL_BASE : OCEANIC_BASE) + model.baseOffset[a]!;
  let base = baseA;
  let boundaryKm = Number.POSITIVE_INFINITY;
  let uplift = 0;

  if (b >= 0) {
    const baseB = (continental[b] ? CONTINENTAL_BASE : OCEANIC_BASE) + model.baseOffset[b]!;
    const km1 = sqToKm(surface, sq1);
    const km2 = sqToKm(surface, sq2);
    boundaryKm = (km2 - km1) * 0.5;

    const width = options.boundaryWidthKm > 0 ? options.boundaryWidthKm : 1;
    const s = smoothstep(0, width, boundaryKm);
    // Blend the two plate bases across the margin -> a thin continental shelf.
    base = lerp((baseA + baseB) * 0.5, baseA, s);

    if (boundaryKm <= width) {
      // Boundary normal: from plate a's seed to plate b's seed (3D).
      let nx = seedPts[b * 3]! - seedPts[a * 3]!;
      let ny = seedPts[b * 3 + 1]! - seedPts[a * 3 + 1]!;
      let nz = seedPts[b * 3 + 2]! - seedPts[a * 3 + 2]!;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl;
      ny /= nl;
      nz /= nl;

      const sep =
        (drift[a * 3]! - drift[b * 3]!) * nx +
        (drift[a * 3 + 1]! - drift[b * 3 + 1]!) * ny +
        (drift[a * 3 + 2]! - drift[b * 3 + 2]!) * nz;

      const t0 = 1 - boundaryKm / width;
      const falloff = t0 * t0 * (3 - 2 * t0);
      const bothContinental = continental[a] === 1 && continental[b] === 1;
      const eitherContinental = continental[a] === 1 || continental[b] === 1;

      if (sep > 0) {
        const factor = bothContinental ? 1.2 : eitherContinental ? 0.6 : 0.35;
        uplift = sep * factor * options.uplift * falloff;
      } else {
        const divergence = -sep;
        uplift = eitherContinental
          ? -divergence * options.rift * falloff
          : divergence * options.rift * 0.4 * falloff;
      }
    }
  }

  return { plateId: a, secondId: b, boundaryKm, base, uplift };
}

// --- internals -------------------------------------------------------------

function nearestPlate(
  surface: Surface,
  seeds: MapCoord[],
  seedPts: Float32Array,
  u: number,
  v: number,
): number {
  return twoNearest(surface, seeds, seedPts, u, v).i1;
}

function twoNearest(
  surface: Surface,
  seeds: MapCoord[],
  seedPts: Float32Array,
  u: number,
  v: number,
): { i1: number; i2: number; sq1: number; sq2: number } {
  const isSphere = surface.kind === 'sphere';
  const wrapX = surface.wrapX;
  const widthKm = surface.widthKm;
  const heightKm = surface.heightKm;

  let i1 = -1;
  let i2 = -1;
  let sq1 = Infinity;
  let sq2 = Infinity;

  if (isSphere) {
    const [px, py, pz] = surface.toPoint(u, v);
    for (let p = 0; p < seeds.length; p++) {
      const dx = px - seedPts[p * 3]!;
      const dy = py - seedPts[p * 3 + 1]!;
      const dz = pz - seedPts[p * 3 + 2]!;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < sq1) {
        sq2 = sq1;
        i2 = i1;
        sq1 = d;
        i1 = p;
      } else if (d < sq2) {
        sq2 = d;
        i2 = p;
      }
    }
  } else {
    for (let p = 0; p < seeds.length; p++) {
      let du = u - seeds[p]!.u;
      if (wrapX) {
        du = du % 1;
        if (du > 0.5) du -= 1;
        if (du < -0.5) du += 1;
      }
      const dv = v - seeds[p]!.v;
      const d = (du * widthKm) ** 2 + (dv * heightKm) ** 2;
      if (d < sq1) {
        sq2 = sq1;
        i2 = i1;
        sq1 = d;
        i1 = p;
      } else if (d < sq2) {
        sq2 = d;
        i2 = p;
      }
    }
  }

  return { i1, i2, sq1, sq2 };
}

function sqToKm(surface: Surface, sq: number): number {
  if (!Number.isFinite(sq)) return Infinity;
  if (surface.kind === 'sphere') {
    const radiusKm = surface.heightKm / Math.PI;
    let cos = 1 - sq / 2;
    if (cos < -1) cos = -1;
    if (cos > 1) cos = 1;
    return Math.acos(cos) * radiusKm;
  }
  return Math.sqrt(sq);
}

function randomCoord(surface: Surface, rng: Rng): MapCoord {
  if (surface.kind === 'sphere') {
    const z = rng.float(-1, 1);
    const lon = rng.float(0, Math.PI * 2);
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    // Recover (u, v) from the 3D point.
    const x = r * Math.cos(lon);
    const y = r * Math.sin(lon);
    const lat = Math.asin(Math.min(1, Math.max(-1, z)));
    return { u: ((((Math.atan2(y, x) / (2 * Math.PI)) % 1) + 1) % 1), v: 0.5 - lat / Math.PI };
  }
  return { u: rng.next(), v: rng.next() };
}

function seedPlates(surface: Surface, rng: Rng, count: number): MapCoord[] {
  if (surface.kind === 'sphere') {
    return spherePoisson(rng, count);
  }
  const areaKm2 = surface.widthKm * surface.heightKm;
  const radiusKm = Math.max(1, Math.sqrt(areaKm2 / count) * 0.6);
  const seeds = poissonDisk(surface, rng, { radiusKm }).slice(0, count);
  while (seeds.length < count) {
    seeds.push({ u: rng.next(), v: rng.next() });
  }
  return seeds;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0 || 1)));
  return t * t * (3 - 2 * t);
}
