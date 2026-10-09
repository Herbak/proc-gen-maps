import type { MapCoord, Surface } from '../surface/index.js';

/**
 * A projection maps the flat output image to coordinates on the world's surface,
 * so any world can be shown in many representations. `inverse` is what `renderView`
 * uses per output pixel; `forward` is available for graticules etc.
 *
 * Output coordinates `(x, y)` are normalised: x = 0..1 left→right, y = 0..1 top→bottom.
 */
export interface Projection {
  readonly id: string;
  /** Natural width / height of the projection's extent. */
  readonly aspect: number;
  /** Which sampler suits this projection best. */
  readonly preferredSampler: 'grid' | 'field';
  inverse(x: number, y: number): MapCoord | null;
  forward(u: number, v: number): { x: number; y: number } | null;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const wrap01 = (v: number): number => ((((v % 1) + 1) % 1));

/** Whole world, Plate Carree (2:1). Distorted at high latitudes; the reference view. */
export function equirect(): Projection {
  return {
    id: 'equirect',
    aspect: 2,
    preferredSampler: 'grid',
    inverse: (x, y) => ({ u: wrap01(x), v: clamp(y, 0, 1) }),
    forward: (u, v) => ({ x: wrap01(u), y: clamp(v, 0, 1) }),
  };
}

/**
 * Whole world, Mollweide (equal-area, 2:1 ellipse). Poles become points, so there
 * is no polar stretch/band.
 */
export function mollweide(): Projection {
  return {
    id: 'mollweide',
    aspect: 2,
    preferredSampler: 'grid',
    inverse(x, y) {
      const yn = clamp(1 - 2 * y, -1, 1);
      const theta = Math.asin(yn);
      const phi = Math.asin(clamp((2 * theta + Math.sin(2 * theta)) / Math.PI, -1, 1));
      const xn = 2 * x - 1;
      const cosT = Math.cos(theta);
      if (Math.abs(xn) > cosT + 1e-9) return null; // outside the ellipse
      const lambda = cosT > 1e-9 ? (xn * Math.PI) / cosT : 0;
      return { u: wrap01(lambda / (2 * Math.PI)), v: clamp(0.5 - phi / Math.PI, 0, 1) };
    },
    forward(u, v) {
      let lambda = wrap01(u) * 2 * Math.PI;
      if (lambda > Math.PI) lambda -= 2 * Math.PI;
      const phi = (0.5 - v) * Math.PI;
      let theta = phi;
      for (let i = 0; i < 8; i++) {
        theta -= (2 * theta + Math.sin(2 * theta) - Math.PI * Math.sin(phi)) / (2 + 2 * Math.cos(2 * theta));
      }
      const X = ((2 * Math.SQRT2) / Math.PI) * Math.cos(theta) * lambda;
      const Y = Math.SQRT2 * Math.sin(theta);
      return { x: X / (4 * Math.SQRT2) + 0.5, y: 0.5 - Y / (2 * Math.SQRT2) };
    },
  };
}

/** Whole world, Mercator (angle-true, square; latitudes clamp to ~85deg). */
export function mercator(): Projection {
  return {
    id: 'mercator',
    aspect: 1,
    preferredSampler: 'grid',
    inverse(x, y) {
      const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * y)));
      return { u: wrap01(x), v: clamp(0.5 - lat / Math.PI, 0, 1) };
    },
    forward(u, v) {
      const lat = (0.5 - v) * Math.PI;
      const y = 0.5 - Math.asinh(Math.tan(lat)) / (2 * Math.PI);
      return { x: wrap01(u), y: clamp(y, 0, 1) };
    },
  };
}

/**
 * A local, near-undistorted flat map centred on `center` (regional / Azgaar-style).
 * Equirectangular around the centre; distortion is negligible for small spans.
 */
export function localEquirect(
  surface: Surface,
  center: MapCoord,
  spanKm: { width: number; height: number },
): Projection {
  const radiusKm = surface.heightKm / Math.PI;
  const lat0 = (0.5 - center.v) * Math.PI;
  const cos0 = Math.max(0.05, Math.cos(lat0));

  return {
    id: 'region',
    aspect: spanKm.width / spanKm.height,
    preferredSampler: 'field',
    inverse(x, y) {
      const east = (x - 0.5) * spanKm.width;
      const north = (0.5 - y) * spanKm.height;
      const u = wrap01(center.u + east / (radiusKm * cos0) / (2 * Math.PI));
      const v = clamp(center.v - north / radiusKm / Math.PI, 0, 1);
      return { u, v };
    },
    forward(u, v) {
      let du = u - center.u;
      du -= Math.round(du);
      const east = du * 2 * Math.PI * radiusKm * cos0;
      const north = (center.v - v) * Math.PI * radiusKm;
      return { x: east / spanKm.width + 0.5, y: 0.5 - north / spanKm.height };
    },
  };
}

/** Azimuthal equidistant centred on `center` (true distances from the centre). */
export function azimuthal(
  surface: Surface,
  center: MapCoord,
  radiusKm: number,
): Projection {
  const R = surface.heightKm / Math.PI;
  const lat0 = (0.5 - center.v) * Math.PI;
  const lon0 = center.u * 2 * Math.PI;
  const sin0 = Math.sin(lat0);
  const cos0 = Math.cos(lat0);

  return {
    id: 'azimuthal',
    aspect: 1,
    preferredSampler: 'field',
    inverse(x, y) {
      const dx = (2 * x - 1) * radiusKm;
      const dy = (1 - 2 * y) * radiusKm;
      const c = Math.hypot(dx, dy) / R;
      if (c > Math.PI) return null;
      const bearing = Math.atan2(dx, dy);
      const sinC = Math.sin(c);
      const cosC = Math.cos(c);
      const lat = Math.asin(clamp(sin0 * cosC + cos0 * sinC * Math.cos(bearing), -1, 1));
      const lon = lon0 + Math.atan2(sinC * Math.sin(bearing) * cos0, cosC - sin0 * Math.sin(lat));
      return { u: wrap01(lon / (2 * Math.PI)), v: clamp(0.5 - lat / Math.PI, 0, 1) };
    },
    forward(u, v) {
      const lat = (0.5 - v) * Math.PI;
      const lon = u * 2 * Math.PI;
      const cosC = sin0 * Math.sin(lat) + cos0 * Math.cos(lat) * Math.cos(lon - lon0);
      const c = Math.acos(clamp(cosC, -1, 1));
      const bearing = Math.atan2(
        Math.cos(lat) * Math.sin(lon - lon0),
        cos0 * Math.sin(lat) - sin0 * Math.cos(lat) * Math.cos(lon - lon0),
      );
      const dx = c * R * Math.sin(bearing);
      const dy = c * R * Math.cos(bearing);
      return { x: dx / (2 * radiusKm) + 0.5, y: 0.5 - dy / (2 * radiusKm) };
    },
  };
}
