export type Vec3 = readonly [x: number, y: number, z: number];

/** A normalised coordinate on the map surface: `u` (horizontal) and `v` (vertical) in [0, 1]. */
export interface MapCoord {
  u: number;
  v: number;
}

/**
 * The map surface.
 *
 * This is the keystone abstraction: all generation samples noise at a 3D point
 * returned by `toPoint`, and all distance/scatter/region logic uses the surface
 * metrics. Swapping a cylinder for a sphere later changes only this object.
 */
export interface Surface {
  readonly kind: 'cylinder' | 'plane' | 'sphere';
  /** Does the horizontal axis wrap (seamless left/right)? */
  readonly wrapX: boolean;
  /** Physical width of the mapped area, in km. */
  readonly widthKm: number;
  /** Physical height of the mapped area, in km. */
  readonly heightKm: number;
  /** Map a normalised coordinate to a 3D point for seamless noise sampling. */
  toPoint(u: number, v: number): Vec3;
  /** Great-circle-equivalent distance in km, respecting wrapping. */
  distanceKm(a: MapCoord, b: MapCoord): number;
  /** Map a normalised coordinate to normalised render space (identity for now). */
  project(u: number, v: number): { x: number; y: number };
}

function wrapDeltaX(delta: number, wrapX: boolean): number {
  if (!wrapX) return delta;
  let d = Math.abs(delta) % 1;
  if (d > 0.5) d = 1 - d;
  return d;
}

function identityProject(u: number, v: number) {
  return { x: u, y: v };
}

/**
 * Cylinder surface: horizontal axis wraps around a circle (seamless east-west),
 * vertical axis is a straight line. No polar singularity.
 *
 * Uses 3D noise on a circle so the seam is invisible. This is the default world
 * surface for classic RPG maps.
 */
export class CylinderSurface implements Surface {
  readonly kind = 'cylinder' as const;
  readonly wrapX = true;
  readonly widthKm: number;
  readonly heightKm: number;

  constructor(radiusKm: number, options: { heightKm?: number } = {}) {
    this.widthKm = 2 * Math.PI * radiusKm;
    // Default vertical extent is half the circumference (a north/south hemisphere band).
    this.heightKm = options.heightKm ?? Math.PI * radiusKm;
  }

  toPoint(u: number, v: number): Vec3 {
    const angle = 2 * Math.PI * u;
    const zScale = this.heightKm / this.widthKm;
    return [Math.cos(angle), Math.sin(angle), (v - 0.5) * zScale * 2 * Math.PI];
  }

  distanceKm(a: MapCoord, b: MapCoord): number {
    const du = wrapDeltaX(a.u - b.u, this.wrapX);
    const dv = a.v - b.v;
    return Math.hypot(du * this.widthKm, dv * this.heightKm);
  }

  project(u: number, v: number) {
    return identityProject(u, v);
  }
}

/**
 * Sphere surface: `u` is longitude, `v` is latitude (+90deg at the top). All
 * longitudes converge at the poles, so landmasses pinch toward them naturally
 * instead of being cut flat by the map edge. Noise is sampled on the unit sphere,
 * so it is seamless east-west and pole-correct.
 */
export class SphereSurface implements Surface {
  readonly kind = 'sphere' as const;
  readonly wrapX = true;
  readonly widthKm: number;
  readonly heightKm: number;

  constructor(readonly radiusKm: number) {
    this.widthKm = 2 * Math.PI * radiusKm;
    this.heightKm = Math.PI * radiusKm;
  }

  toPoint(u: number, v: number): Vec3 {
    const lon = 2 * Math.PI * u;
    const lat = (0.5 - v) * Math.PI;
    const cosLat = Math.cos(lat);
    return [cosLat * Math.cos(lon), cosLat * Math.sin(lon), Math.sin(lat)];
  }

  distanceKm(a: MapCoord, b: MapCoord): number {
    const [ax, ay, az] = this.toPoint(a.u, a.v);
    const [bx, by, bz] = this.toPoint(b.u, b.v);
    let dot = ax * bx + ay * by + az * bz;
    dot = dot < -1 ? -1 : dot > 1 ? 1 : dot;
    return Math.acos(dot) * this.radiusKm;
  }

  project(u: number, v: number) {
    return identityProject(u, v);
  }
}

/**
 * Flat plane surface with no wrapping. Intended for regions and standalone local
 * maps rather than whole worlds.
 */
export class PlaneSurface implements Surface {
  readonly kind = 'plane' as const;
  readonly wrapX = false;

  constructor(
    readonly widthKm: number,
    readonly heightKm: number,
  ) {}

  toPoint(u: number, v: number): Vec3 {
    const s = 1 / Math.max(this.widthKm, this.heightKm);
    return [u * this.widthKm * s, v * this.heightKm * s, 0];
  }

  distanceKm(a: MapCoord, b: MapCoord): number {
    return Math.hypot((a.u - b.u) * this.widthKm, (a.v - b.v) * this.heightKm);
  }

  project(u: number, v: number) {
    return identityProject(u, v);
  }
}
