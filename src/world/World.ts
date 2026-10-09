import type { Seed } from '../rng/index.js';
import type { MapCoord, Surface } from '../surface/index.js';
import type { ResolvedWorldConfig } from './config.js';
import { sampleField, type WorldModel } from './model.js';

export interface WorldInit {
  config: ResolvedWorldConfig;
  surface: Surface;
  width: number;
  height: number;
  /** Normalised elevation in [0, 1]. */
  elevation: Float32Array;
  /** Normalised sea level. */
  seaLevel: number;
  seed: Seed;
  /** Nearest tectonic plate id per cell. */
  plateId: Uint8Array;
  /** Distance to the nearest plate margin, in km (0 on margins). */
  boundaryKm: Float32Array;
  /** Air temperature in degrees Celsius per cell. */
  temperature: Float32Array;
  /** Precipitation index in [0, 1] per cell. */
  moisture: Float32Array;
  /** Biome id per cell (see `Biome`). */
  biome: Uint8Array;
  /** Upstream drainage (cell count) per cell. */
  flow: Float32Array;
  /** Depression-filled elevation per cell. */
  filled: Float32Array;
  /** 1 where a cell is a lake / inland waterbody. */
  lake: Uint8Array;
  /**
   * Erosion height change per cell (eroded minus pre-erosion). Lets resolution-
   * independent views apply erosion to the analytic field.
   */
  erosionDelta: Float32Array;
  /** Resolution-independent model, for sampling at any projection/resolution. */
  model: WorldModel;
}

/**
 * A generated world. Holds the sampled terrain, climate and hydrology, plus the
 * surface they live on. This is the object renderers and later stages consume.
 */
export class World {
  readonly config: ResolvedWorldConfig;
  readonly surface: Surface;
  readonly width: number;
  readonly height: number;
  readonly elevation: Float32Array;
  readonly seaLevel: number;
  readonly seed: Seed;
  readonly plateId: Uint8Array;
  readonly boundaryKm: Float32Array;
  readonly temperature: Float32Array;
  readonly moisture: Float32Array;
  readonly biome: Uint8Array;
  readonly flow: Float32Array;
  readonly filled: Float32Array;
  readonly lake: Uint8Array;
  readonly erosionDelta: Float32Array;
  readonly model: WorldModel;

  constructor(init: WorldInit) {
    this.config = init.config;
    this.surface = init.surface;
    this.width = init.width;
    this.height = init.height;
    this.elevation = init.elevation;
    this.seaLevel = init.seaLevel;
    this.seed = init.seed;
    this.plateId = init.plateId;
    this.boundaryKm = init.boundaryKm;
    this.temperature = init.temperature;
    this.moisture = init.moisture;
    this.biome = init.biome;
    this.flow = init.flow;
    this.filled = init.filled;
    this.lake = init.lake;
    this.erosionDelta = init.erosionDelta;
    this.model = init.model;
  }

  get length(): number {
    return this.width * this.height;
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }

  elevationAt(x: number, y: number): number {
    return this.elevation[this.index(x, y)]!;
  }

  isLandAt(x: number, y: number): boolean {
    return this.elevationAt(x, y) > this.seaLevel;
  }

  plateAt(x: number, y: number): number {
    return this.plateId[this.index(x, y)]!;
  }

  boundaryKmAt(x: number, y: number): number {
    return this.boundaryKm[this.index(x, y)]!;
  }

  /** Nearest-cell land test for a normalised surface coordinate. */
  isLandAtCoord({ u, v }: MapCoord): boolean {
    const x = Math.min(this.width - 1, Math.max(0, Math.floor(u * this.width)));
    const y = Math.min(this.height - 1, Math.max(0, Math.floor(v * this.height)));
    return this.isLandAt(x, y);
  }

  /** Fraction of the map that is land, in [0, 1]. */
  landFraction(): number {
    let land = 0;
    for (let i = 0; i < this.elevation.length; i++) {
      if (this.elevation[i]! > this.seaLevel) land++;
    }
    return land / this.elevation.length;
  }

  /**
   * Evaluate normalised elevation at any surface coordinate. Lets views sample
   * the world at arbitrary resolution/projection (see `renderView`).
   */
  sample(u: number, v: number): number {
    return sampleField(this.model, u, v);
  }
}
