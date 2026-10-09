import type { RasterImage } from './RasterImage.js';

/**
 * Convert a `RasterImage` into a canvas usable as a Pixi texture source.
 * Uses `document.createElement` in the browser, `OffscreenCanvas` otherwise.
 */
export function rasterToCanvas(
  image: RasterImage,
): HTMLCanvasElement | OffscreenCanvas {
  const { data, width, height } = image;

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    const imageData = ctx.createImageData(width, height);
    imageData.data.set(data);
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Offscreen 2D canvas context unavailable');
    ctx.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
    return canvas;
  }

  throw new Error('No canvas implementation available in this environment');
}
