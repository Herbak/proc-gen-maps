/**
 * Optional Pixi adapter for proc-gen-maps.
 *
 * Kept in its own entry point so the core stays free of any rendering dependency.
 * `pixi.js` is a peer dependency.
 */
import { Texture } from 'pixi.js';
import { rasterToCanvas } from '../render/canvas.js';
import type { RasterImage } from '../render/RasterImage.js';

export { rasterToCanvas } from '../render/canvas.js';

/** Turn a `RasterImage` into a Pixi `Texture`. */
export function rasterToTexture(image: RasterImage): Texture {
  return Texture.from(rasterToCanvas(image));
}
