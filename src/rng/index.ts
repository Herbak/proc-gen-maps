/**
 * Seeded, deterministic pseudo-random number generation.
 *
 * A single `Seed` (string or number) reproduces an entire world. Independent
 * sub-streams are derived via `fork()` so adding a new generation stage does not
 * shift the numbers consumed by existing stages.
 */

export type Seed = string | number;

/**
 * High-quality 32-bit hash of a seed. Used for quick numeric seeding and for
 * non-sequential uses (e.g. per-cell hashing) where a stream is overkill.
 */
export function hashSeed(seed: Seed, salt = ''): number {
  const str = `${salt}:${String(seed)}`;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // final avalanche
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Deterministic PRNG (cyrb128 seed expansion + sfc32 core).
 * `next()` yields floats in [0, 1).
 */
export class Rng {
  private a = 0;
  private b = 0;
  private c = 0;
  private d = 0;
  private readonly source: string;

  constructor(seed: Seed) {
    this.source = String(seed);

    // --- cyrb128: expand an arbitrary string into four 32-bit words ---
    let h1 = 1779033703;
    let h2 = 3144134277;
    let h3 = 1013904242;
    let h4 = 2773480762;
    const str = this.source;
    for (let i = 0; i < str.length; i++) {
      const k = str.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    this.a = (h1 ^ h2 ^ h3 ^ h4) >>> 0;
    this.b = (h2 ^ h1) >>> 0;
    this.c = (h3 ^ h1) >>> 0;
    this.d = (h4 ^ h1) >>> 0;

    if ((this.a | this.b | this.c | this.d) === 0) {
      this.a = 0x9e3779b9;
    }

    // warm up so early outputs are well mixed
    for (let i = 0; i < 12; i++) this.next();
  }

  /** Next float in [0, 1). */
  next(): number {
    let { a, b, c, d } = this;
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    return (t >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  float(min = 0, max = 1): number {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.float(min, max + 1));
  }

  /** True with probability `p`. */
  bool(p = 0.5): boolean {
    return this.next() < p;
  }

  /** Uniform pick from a non-empty array. */
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)]!;
  }

  /**
   * Derive an independent stream. Deterministic for a given (source, tag), and
   * unaffected by how many numbers this stream has consumed.
   */
  fork(tag: string): Rng {
    return new Rng(`${this.source}::${tag}`);
  }
}
