import { createNoise3D, type NoiseFunction3D } from 'simplex-noise';
import { Rng } from '../rng/index.js';

/** Options for fractal Brownian motion. */
export interface FbmOptions {
  /** Number of noise layers. Default 6. */
  octaves?: number;
  /** Base frequency. Default 1. */
  frequency?: number;
  /** Base amplitude. Default 1. */
  amplitude?: number;
  /** Frequency multiplier per octave. Default 2. */
  lacunarity?: number;
  /** Amplitude multiplier per octave. Default 0.5. */
  gain?: number;
}

/**
 * Deterministic 3D noise with fractal helpers.
 *
 * All sampling is 3D and driven by a `Surface`, so the same code works on a
 * cylinder today and a sphere later.
 */
export class Noise {
  readonly noise3D: NoiseFunction3D;

  constructor(rng: Rng) {
    this.noise3D = createNoise3D(() => rng.next());
  }

  /** Standard fractal Brownian motion, normalised to roughly [-1, 1]. */
  fbm(x: number, y: number, z: number, opts: FbmOptions = {}): number {
    const octaves = opts.octaves ?? 6;
    const lacunarity = opts.lacunarity ?? 2;
    const gain = opts.gain ?? 0.5;
    let frequency = opts.frequency ?? 1;
    let amplitude = opts.amplitude ?? 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amplitude * this.noise3D(x * frequency, y * frequency, z * frequency);
      norm += amplitude;
      frequency *= lacunarity;
      amplitude *= gain;
    }
    return norm > 0 ? sum / norm : 0;
  }

  /** Ridged multifractal — good for mountain ranges and sharp chains. [-1, 1]. */
  ridged(x: number, y: number, z: number, opts: FbmOptions = {}): number {
    const octaves = opts.octaves ?? 5;
    const lacunarity = opts.lacunarity ?? 2;
    const gain = opts.gain ?? 0.5;
    let frequency = opts.frequency ?? 1;
    let amplitude = opts.amplitude ?? 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(this.noise3D(x * frequency, y * frequency, z * frequency));
      sum += amplitude * n * n;
      norm += amplitude;
      frequency *= lacunarity;
      amplitude *= gain;
    }
    return norm > 0 ? (sum / norm) * 2 - 1 : 0;
  }

  /**
   * Domain-warped fBm. Offsets the sample point by another noise field, which
   * produces organic, non-grid-aligned coastlines.
   */
  warped(
    x: number,
    y: number,
    z: number,
    warpAmount = 0.5,
    opts: FbmOptions = {},
  ): number {
    const wx = this.noise3D(x + 5.2, y + 1.3, z + 9.1);
    const wy = this.noise3D(x + 3.7, y + 8.4, z + 2.6);
    const wz = this.noise3D(x + 1.9, y + 4.5, z + 7.3);
    return this.fbm(
      x + warpAmount * wx,
      y + warpAmount * wy,
      z + warpAmount * wz,
      opts,
    );
  }
}
