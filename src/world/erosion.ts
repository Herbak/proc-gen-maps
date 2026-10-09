import type { Rng } from '../rng/index.js';
import type { Surface } from '../surface/index.js';
import type { ResolvedErosionConfig } from './config.js';

/**
 * Particle-based hydraulic erosion plus thermal (talus) erosion.
 *
 * Operates on the normalised elevation grid. Hydraulic droplets flow downhill,
 * picking up sediment on steep slopes and depositing it in flats/lakes, which
 * carves valleys and builds deltas. Thermal erosion relaxes slopes steeper than
 * the talus angle. Deterministic for a given RNG.
 */
export function erode(
  elevation: Float32Array,
  W: number,
  H: number,
  _surface: Surface,
  rng: Rng,
  cfg: ResolvedErosionConfig,
): void {
  hydraulicErosion(elevation, W, H, rng.fork('hydraulic'), cfg);
  if (cfg.thermalIterations > 0) {
    thermalErosion(elevation, W, H, cfg.thermalIterations, cfg.talus);
  }
}

function hydraulicErosion(
  h: Float32Array,
  W: number,
  H: number,
  rng: Rng,
  cfg: ResolvedErosionConfig,
): void {
  const maxX = W - 2;
  const maxY = H - 2;
  if (maxX < 1 || maxY < 1) return;

  const brush = buildBrush(cfg.erodeRadius);
  const droplets = Math.max(0, Math.round(W * H * cfg.dropletsPerCell));

  for (let d = 0; d < droplets; d++) {
    let px = rng.float(0, maxX);
    let py = rng.float(0, maxY);
    let dirX = 0;
    let dirY = 0;
    let speed = cfg.initialSpeed;
    let water = cfg.initialWater;
    let sediment = 0;

    for (let step = 0; step < cfg.lifetime; step++) {
      const nx = Math.floor(px);
      const ny = Math.floor(py);
      const fx = px - nx;
      const fy = py - ny;
      const idx = ny * W + nx;

      const h00 = h[idx]!;
      const h10 = h[idx + 1]!;
      const h01 = h[idx + W]!;
      const h11 = h[idx + W + 1]!;

      // Bilinear height and gradient.
      const gx = (h10 - h00) * (1 - fy) + (h11 - h01) * fy;
      const gy = (h01 - h00) * (1 - fx) + (h11 - h10) * fx;
      const height =
        h00 * (1 - fx) * (1 - fy) +
        h10 * fx * (1 - fy) +
        h01 * (1 - fx) * fy +
        h11 * fx * fy;

      dirX = dirX * cfg.inertia - gx * (1 - cfg.inertia);
      dirY = dirY * cfg.inertia - gy * (1 - cfg.inertia);
      const len = Math.hypot(dirX, dirY);
      if (len > 1e-8) {
        dirX /= len;
        dirY /= len;
      } else {
        const a = rng.float(0, Math.PI * 2);
        dirX = Math.cos(a);
        dirY = Math.sin(a);
      }

      const newX = px + dirX;
      const newY = py + dirY;
      if (newX < 0 || newX > maxX || newY < 0 || newY > maxY) break;

      const newHeight = bilinear(h, W, newX, newY);
      const deltaH = newHeight - height;
      const capacity = Math.max(-deltaH * speed * water * cfg.capacity, cfg.minSlope);

      if (sediment > capacity || deltaH > 0) {
        const amount =
          deltaH > 0
            ? Math.min(deltaH, sediment)
            : (sediment - capacity) * cfg.deposit;
        deposit(h, W, px, py, fx, fy, idx, amount);
        sediment -= amount;
      } else {
        const amount = Math.min((capacity - sediment) * cfg.erode, -deltaH);
        erodeBrush(h, W, nx, ny, idx, amount, brush);
        sediment += amount;
      }

      speed = Math.sqrt(Math.max(0, speed * speed - deltaH * cfg.gravity));
      water *= 1 - cfg.evaporate;
      px = newX;
      py = newY;
      if (water < 0.001) break;
    }
  }
}

function thermalErosion(
  h: Float32Array,
  W: number,
  H: number,
  iterations: number,
  talus: number,
): void {
  const delta = new Float32Array(h.length);
  const neighbors: ReadonlyArray<readonly [number, number, number]> = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, Math.SQRT2],
    [1, -1, Math.SQRT2],
    [-1, 1, Math.SQRT2],
    [-1, -1, Math.SQRT2],
  ];

  for (let iter = 0; iter < iterations; iter++) {
    delta.fill(0);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const hi = h[i]!;
        for (const [ox, oy, dist] of neighbors) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          const j = ny * W + nx;
          const diff = hi - h[j]!;
          const threshold = talus * dist;
          if (diff > threshold) {
            const move = (diff - threshold) * 0.5;
            delta[i] -= move;
            delta[j] += move;
          }
        }
      }
    }
    for (let i = 0; i < h.length; i++) h[i] += delta[i]!;
  }
}

function bilinear(h: Float32Array, W: number, x: number, y: number): number {
  const nx = Math.floor(x);
  const ny = Math.floor(y);
  const fx = x - nx;
  const fy = y - ny;
  const idx = ny * W + nx;
  const h00 = h[idx]!;
  const h10 = h[idx + 1]!;
  const h01 = h[idx + W]!;
  const h11 = h[idx + W + 1]!;
  return (
    h00 * (1 - fx) * (1 - fy) +
    h10 * fx * (1 - fy) +
    h01 * (1 - fx) * fy +
    h11 * fx * fy
  );
}

function deposit(
  h: Float32Array,
  W: number,
  _px: number,
  _py: number,
  fx: number,
  fy: number,
  idx: number,
  amount: number,
): void {
  h[idx] += amount * (1 - fx) * (1 - fy);
  h[idx + 1] += amount * fx * (1 - fy);
  h[idx + W] += amount * (1 - fx) * fy;
  h[idx + W + 1] += amount * fx * fy;
}

interface Brush {
  offsets: Int32Array;
  weights: Float32Array;
}

function buildBrush(radius: number): Brush {
  const offsets: number[] = [];
  const weights: number[] = [];
  let total = 0;
  const r = Math.max(1, Math.round(radius));
  for (let oy = -r; oy <= r; oy++) {
    for (let ox = -r; ox <= r; ox++) {
      const dist = Math.hypot(ox, oy);
      if (dist > r) continue;
      const w = r - dist;
      if (w <= 0) continue;
      offsets.push(ox, oy);
      weights.push(w);
      total += w;
    }
  }
  const norm = weights.map((w) => w / total);
  return { offsets: Int32Array.from(offsets), weights: Float32Array.from(norm) };
}

function erodeBrush(
  h: Float32Array,
  W: number,
  cx: number,
  cy: number,
  _idx: number,
  amount: number,
  brush: Brush,
): void {
  const { offsets, weights } = brush;
  for (let k = 0; k < weights.length; k++) {
    const x = cx + offsets[k * 2]!;
    const y = cy + offsets[k * 2 + 1]!;
    if (x < 0 || x >= W) continue;
    const i = y * W + x;
    if (i < 0 || i >= h.length) continue;
    h[i] -= amount * weights[k]!;
  }
}
