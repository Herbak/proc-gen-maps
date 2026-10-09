import type { RasterImage } from './RasterImage.js';

/**
 * Encode a `RasterImage` to PNG bytes.
 *
 * Browser: uses `OffscreenCanvas`. Node: falls back to `fast-png` (imported
 * lazily so the browser bundle never pulls it in).
 */
export async function encodePng(image: RasterImage): Promise<Uint8Array> {
  const { width, height } = image;

  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Offscreen 2D canvas context unavailable');
    ctx.putImageData(new ImageData(new Uint8ClampedArray(image.data), width, height), 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return new Uint8Array(await blob.arrayBuffer());
  }

  const { encode } = await import('fast-png');
  return encode({
    width,
    height,
    channels: 4,
    data: image.toUint8Array(),
  });
}
