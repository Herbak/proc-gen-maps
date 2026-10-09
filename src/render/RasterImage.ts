/**
 * A simple RGBA raster buffer. Framework-free: it is the common currency between
 * generation, rendering, PNG encoding, and the Pixi adapter.
 */
export class RasterImage {
  readonly data: Uint8ClampedArray;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  setPixel(x: number, y: number, r: number, g: number, b: number, a = 255): void {
    const i = (y * this.width + x) * 4;
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
    this.data[i + 3] = a;
  }

  /** A `Uint8Array` view over the same bytes (for encoders that want one). */
  toUint8Array(): Uint8Array {
    return new Uint8Array(this.data.buffer, this.data.byteOffset, this.data.length);
  }
}
