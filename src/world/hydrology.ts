import type { Surface } from '../surface/index.js';
import type { ResolvedHydrologyConfig } from './config.js';

/** Tiny slope added while flooding, so every filled cell drains strictly downhill. */
const EPSILON = 1e-4;
/** Terrain smoothing radius (cells) before drainage: removes noise pits -> clean rivers. */
const SMOOTH_RADIUS = 4;
/** Minimum basin depth (on smoothed terrain) to count as a lake. */
const LAKE_DEPTH = 0.03;

export interface HydrologyFields {
  /** Upstream cell count draining through each cell (drainage area). */
  flow: Float32Array;
  /** Depression-filled elevation (never below the original; adds lake surfaces). */
  filled: Float32Array;
  /** 1 where a cell is a lake / inland waterbody. */
  lake: Uint8Array;
}

/** 8-connected neighbour offsets (x, y, distance). */
const NEIGHBOURS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/**
 * Compute river/lake hydrology from an elevation grid.
 *
 * 1. Smooth the terrain (drainage should follow landforms, not noise pits).
 * 2. Priority-flood depression filling (oceans are the outlets).
 * 3. D8 steepest-descent flow directions on the filled surface.
 * 4. Flow accumulation (drainage area) in high-to-low fill order.
 * 5. Lakes where filling raised the surface above the original terrain.
 */
export function computeHydrology(
  elevation: Float32Array,
  seaLevel: number,
  W: number,
  H: number,
  surface: Surface,
  _cfg: ResolvedHydrologyConfig,
): HydrologyFields {
  const n = W * H;
  const wrapX = surface.wrapX;
  const terrain = boxBlur(elevation, W, H, SMOOTH_RADIUS, wrapX);
  const filled = new Float32Array(n).fill(Infinity);
  const visited = new Uint8Array(n);

  // --- 1. Priority-flood fill ----------------------------------------------
  const heap = new MinHeap(n);
  for (let i = 0; i < n; i++) {
    if (terrain[i]! <= seaLevel) {
      filled[i] = terrain[i]!;
      visited[i] = 1;
      heap.push(i, terrain[i]!);
    }
  }

  while (heap.length > 0) {
    const i = heap.pop();
    const x = i % W;
    const y = (i - x) / W;
    const base = filled[i]!;
    for (const [ox, oy] of NEIGHBOURS) {
      let nx = x + ox;
      if (wrapX) nx = ((nx % W) + W) % W;
      else if (nx < 0 || nx >= W) continue;
      const ny = y + oy;
      if (ny < 0 || ny >= H) continue;
      const j = ny * W + nx;
      if (visited[j]) continue;
      visited[j] = 1;
      const level = Math.max(terrain[j]!, base + EPSILON);
      filled[j] = level;
      heap.push(j, level);
    }
  }

  // --- 2. D8 flow directions -----------------------------------------------
  const flowTo = new Int32Array(n).fill(-1);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (terrain[i]! <= seaLevel) continue;
      let best = -1;
      let bestSlope = 0;
      for (const [ox, oy, dist] of NEIGHBOURS) {
        let nx = x + ox;
        if (wrapX) nx = ((nx % W) + W) % W;
        else if (nx < 0 || nx >= W) continue;
        const ny = y + oy;
        if (ny < 0 || ny >= H) continue;
        const j = ny * W + nx;
        const slope = (filled[i]! - filled[j]!) / dist;
        if (slope > bestSlope) {
          bestSlope = slope;
          best = j;
        }
      }
      flowTo[i] = best;
    }
  }

  // --- 3. Flow accumulation (process high -> low) --------------------------
  const sorted = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => filled[b]! - filled[a]!,
  );
  const flow = new Float32Array(n);
  for (let i = 0; i < n; i++) flow[i] = terrain[i]! > seaLevel ? 1 : 0;
  for (const i of sorted) {
    if (terrain[i]! <= seaLevel) continue;
    const j = flowTo[i]!;
    if (j >= 0) flow[j] += flow[i]!;
  }

  // --- 4. Lakes (keep only substantial basins) -----------------------------
  const lake = new Uint8Array(n);
  const label = new Int32Array(n).fill(-1);
  const stack: number[] = [];
  const minLake = Math.max(12, Math.round(n / 15000));
  const isBasin = (i: number) =>
    elevation[i]! > seaLevel &&
    terrain[i]! > seaLevel &&
    filled[i]! - terrain[i]! > LAKE_DEPTH;

  for (let start = 0; start < n; start++) {
    if (label[start] !== -1 || !isBasin(start)) continue;
    label[start] = start;
    stack.length = 0;
    stack.push(start);
    const members: number[] = [];
    while (stack.length > 0) {
      const c = stack.pop()!;
      members.push(c);
      const cx = c % W;
      const cy = (c - cx) / W;
      for (const [ox, oy] of NEIGHBOURS) {
        let nx = cx + ox;
        if (wrapX) nx = ((nx % W) + W) % W;
        else if (nx < 0 || nx >= W) continue;
        const ny = cy + oy;
        if (ny < 0 || ny >= H) continue;
        const j = ny * W + nx;
        if (label[j] === -1 && isBasin(j)) {
          label[j] = start;
          stack.push(j);
        }
      }
    }
    if (members.length >= minLake) {
      for (const c of members) lake[c] = 1;
    }
  }

  return { flow, filled, lake };
}

/** Separable box blur (wrap-aware in x). */
function boxBlur(
  src: Float32Array,
  W: number,
  H: number,
  radius: number,
  wrapX: boolean,
): Float32Array {
  const window = radius * 2 + 1;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const wrap = (i: number) => ((i % W) + W) % W;
  const clampX = (i: number) => (i < 0 ? 0 : i >= W ? W - 1 : i);

  for (let y = 0; y < H; y++) {
    const base = y * W;
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += src[base + (wrapX ? wrap(k) : clampX(k))]!;
    for (let x = 0; x < W; x++) {
      tmp[base + x] = sum / window;
      const outX = wrapX ? wrap(x - radius) : clampX(x - radius);
      const inX = wrapX ? wrap(x + radius + 1) : clampX(x + radius + 1);
      sum += src[base + inX]! - src[base + outX]!;
    }
  }

  for (let x = 0; x < W; x++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) {
      const yy = k < 0 ? 0 : k >= H ? H - 1 : k;
      sum += tmp[yy * W + x]!;
    }
    for (let y = 0; y < H; y++) {
      out[y * W + x] = sum / window;
      const outY = y - radius < 0 ? 0 : y - radius >= H ? H - 1 : y - radius;
      const inY = y + radius + 1 < 0 ? 0 : y + radius + 1 >= H ? H - 1 : y + radius + 1;
      sum += tmp[inY * W + x]! - tmp[outY * W + x]!;
    }
  }

  return out;
}

/** Simple binary min-heap keyed by float, storing cell indices. */
class MinHeap {
  private readonly items: Int32Array;
  private readonly keys: Float32Array;
  private size = 0;

  constructor(capacity: number) {
    this.items = new Int32Array(capacity + 1);
    this.keys = new Float32Array(capacity + 1);
  }

  get length(): number {
    return this.size;
  }

  push(item: number, key: number): void {
    let i = ++this.size;
    this.items[i] = item;
    this.keys[i] = key;
    while (i > 1) {
      const parent = i >> 1;
      if (this.keys[parent]! <= this.keys[i]!) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.items[1]!;
    this.items[1] = this.items[this.size]!;
    this.keys[1] = this.keys[this.size]!;
    this.size--;
    let i = 1;
    for (;;) {
      const left = i << 1;
      const right = left + 1;
      let smallest = i;
      if (left <= this.size && this.keys[left]! < this.keys[smallest]!) smallest = left;
      if (right <= this.size && this.keys[right]! < this.keys[smallest]!) smallest = right;
      if (smallest === i) break;
      this.swap(i, smallest);
      i = smallest;
    }
    return top;
  }

  private swap(a: number, b: number): void {
    const ti = this.items[a]!;
    this.items[a] = this.items[b]!;
    this.items[b] = ti;
    const tk = this.keys[a]!;
    this.keys[a] = this.keys[b]!;
    this.keys[b] = tk;
  }
}
