# proc-gen-maps — World layer v1

A standalone TypeScript library that generates seed-deterministic RPG world maps,
viewed interactively (Pixi + Svelte), and saved as JSON data + raster image.

Built so **sphere / sci-fi**, **regions**, and **towns** can land later without rewrites.
ControlNet is explicitly **out of scope** (handled by the host ComfyUI app).

## Locked decisions

| Area | Decision |
|---|---|
| Language / stack | TypeScript, Vite (playground + lib build), Vitest |
| UI | Svelte (playground only) |
| Rendering | Framework-free core -> RGBA raster; **Pixi as optional adapter** (peer dep) |
| Surface model | **Cylinder** now, behind a `Surface` abstraction so **sphere** is a drop-in later |
| Engine | Fast: fBm + domain warp + Poisson continent/island masks (plates/erosion later) |
| Runtime | Browser + Node (generation/JSON/PNG in both) |
| Visual style | **`flat-vector` now**, `painted` later (hooks left in place) |
| v1 scope | Terrain, land/sea, climate, biomes, coastlines, rivers |
| Zoom | Single resolution; vector zoom (windowed regeneration deferred) |
| Package | One library repo + a separate non-published `playground/` app |

## Architecture

### Layout

```
src/
  rng/        seeded PRNG (string seed -> deterministic streams)
  noise/      fBm, domain warp, ridged, octave rotation
  surface/    Surface interface + CylinderSurface (+ Plane, later Sphere)
  world/      continents, mountains, climate, biomes, hydrology
  vectors/    marching squares, Douglas-Peucker, polyline utils
  render/     RGBA raster buffer + PNG encode (fast-png / OffscreenCanvas)
  pixi/       optional Pixi adapter (public subpath export)
  index.ts    public API
playground/   Svelte + Vite app: Pixi view + sliders + seed box  (daily driver)
test/         vitest: determinism, invariants, golden snapshots
```

### Keystone abstraction

Everything samples 3D noise at a surface point:

```ts
interface Surface {
  toPoint(u: number, v: number): Vec3;          // map coord -> 3D point
  wrapX: boolean;
  distance(a: MapCoord, b: MapCoord): number;   // scatter + flow neighbors
  project(u: number, v: number): { x: number; y: number }; // render / region crop
}
```

`Cylinder`: `(cos2πu, sin2πu, v)` -> seamless east-west, no poles.
Later `Sphere` swaps only this object; continents, climate, rivers, biomes never change.

### Generation pipeline (v1)

1. Seed string -> PRNG (deterministic; streams: base + noise).
2. Continent masks: Poisson-scatter seeds (count from `density × planet area`, sizes
   in **km** -> planet-relative number/size). Add hill/cone profiles to a Float32 heightmap.
3. Island masks: higher-frequency Poisson scatter, smaller sizes.
4. Detail: fBm + domain warp added to the mask; optional ridged noise for mountain chains.
5. Sea level by percentile -> exact `seaFraction`.
6. Climate: temperature = `f(latitude) − altitude·lapse`; moisture = `f(ocean distance, wind, rain shadow)`.
7. Biomes: Whittaker (temp × moisture) -> Uint8 biome IDs + table.
8. Hydrology: priority-flood depression fill -> D8 flow directions -> flow accumulation -> rivers + lakes.
9. Coastlines: marching squares at sea level -> polylines -> simplify.
10. Optional contour lines + biome boundaries (needed for the vector style).

### Data model & save

- `world.data.*` = typed arrays (height Float32, biome Uint8, flow Float32).
- `world.vectors.*` = coastlines, rivers, contours, biome boundaries (polylines).
- `world.toJSON({ mode: 'seed-only' | 'full' })` — seed-only regenerates exactly;
  full bakes arrays (quantised/base64) for guaranteed fidelity.
- `world.toImage({ scale })` — rasterise Pixi stage or headless canvas -> PNG.

## Public API sketch

```ts
const world = generateWorld({
  seed: 'classic-01',
  surface: 'cylinder',
  planet: { radiusKm: 6371 },
  size: { width: 2048, height: 1024 },
  land: { seaFraction: 0.62,
          continents: { count: 6, sizeKm: [800, 2500] },
          islands:    { density: 0.6, sizeKm: [30, 300] } },
  climate: { equatorTempC: 30, lapseCPerKm: 6.5 },
  hydrology: { riverThreshold: 0.02 },
});
```

## Milestones

- **M0 — Skeleton:** repo, TS/Vite/Vitest/Svelte, empty `generateWorld`, PNG round-trip,
  determinism test harness.
- **M1 — Heightmap:** PRNG + noise + Surface/Cylinder + continent/island masks + sea level.
  Grayscale preview in playground.
- **M2 — Climate & biomes:** temperature/moisture + Whittaker -> biome raster.
- **M3 — Hydrology:** depression fill + D8 + rivers/lakes.
- **M4 — Vector style:** marching squares + simplification -> `flat-vector` Pixi renderer
  (biome fills, coast strokes, rivers).
- **M5 — Export:** `toJSON` (seed-only + full) and `toImage(scale)`; docs + API polish.
- **M6 (post-v1):** `Sphere` surface, `painted` preset, regions, town scatter, labels.

## M1.5 — Tectonic landmasses + Earth presets (in progress)

Motivation: the M1 output read as an archipelago because isotropic noise dominated the
circular domes. M1.5 replaces the dome landmass model with lightweight tectonic plates
and rebalances the field composition so continents stay contiguous.

### Plate engine (`src/world/tectonics.ts`)

1. Poisson-scatter `plateCount` plate seeds (planet-relative spacing). On the sphere,
   seeds use Poisson-disk blue noise (`spherePoisson`) — irregular and seed-dependent —
   not a Fibonacci lattice (which produced a near-identical pattern every seed).
   Each plate also gets a random base-elevation offset so continents/islands vary.
2. **Jump-flooding (JFA)** computes the **two nearest** plates per cell:
   - nearest plate id (stored), `boundaryKm ≈ (d₂ − d₁) / 2`.
   - distances in km (grid aspect matches the km extent; x wraps).
3. Per-plate: `oceanic | continental` (assigned so continental **area** ≈ target),
   a `baseElevation`, and a random `drift` vector.
4. **Boundary stress** from relative drift vs the boundary normal:
   - convergent -> uplift (continental-continental strongest; island arcs for oceanic-oceanic),
   - divergent -> rift valley (continental) or mid-ocean ridge (oceanic),
   - transform -> negligible. Attenuated over `boundaryWidthKm`.
5. No time-stepping. Deterministic.

### Field composition (kills the archipelago look)

- `continentalness` — low-frequency (2–3 octaves) noise; sea level is computed on the
  combined field so continents stay whole.
- `uplift` — tectonic boundary term -> mountain chains.
- `detail` — high-frequency, gated to land, plus ridged texture on uplifted areas.

### Presets (`src/world/presets.ts`)

`generateWorld({ preset, ...overrides })` — preset is a base layer, explicit config wins.

| Preset | seaFraction | plateCount | continentalFraction |
|---|---|---|---|
| `earth` | 0.71 | 14 | 0.42 |
| `continents` | 0.62 | 9 | 0.62 |
| `archipelago` | 0.78 | 26 | 0.20 |
| `pangea` | 0.68 | 6 | 0.85 |
| `islands` | 0.88 | 32 | 0.10 |

`earth` = full globe (360° lon x 180° lat), radius 6371 km, ~29% land.

### Also

- `World` gains `plateId: Uint8Array` + `boundaryDistance: Float32Array` for later
  (regions, biomes, town placement).
- Playground: preset dropdown + plate-count slider.
- Domes removed from the default pipeline (Poisson retained for plate seeds / towns).

### Deferred

- Erosion (hydraulic/thermal) — its own pass after plates.

## M1.6 — True sphere surface + pole handling

Motivation: on the cylinder the north/south poles are full-width lines, so polar land
was cut flat by the map edge with no indication of continuity. The sphere makes the
poles converge (pinch) instead.

### Surface

- Added `SphereSurface`: `u` = longitude, `v` = latitude (+90deg at top), `toPoint`
  returns unit-sphere points, `distanceKm` is great-circle. Noise sampled on the
  sphere is seamless east-west **and** pole-correct.
- `surface: 'cylinder' | 'plane' | 'sphere'` (presets default to `sphere`).

### Pole behaviour (configurable)

- `poles: 'native' | 'ocean'`, `polarMarginDeg` (default 6).
  - `native` — geometry decides: sphere pinches at the poles.
  - `ocean` — forces ocean within `polarMarginDeg` of each pole, so land is never cut.
- Presets: `earth` / `continents` / `pangea` = `native`; `archipelago` / `islands` = `ocean`.

### Plate engine

- Replaced grid jump-flooding with **brute-force nearest + second-nearest** (plate
  counts are small) using a squared metric: 3D chord on the sphere, scaled `(u,v)` on
  flat surfaces. Correct and pole-safe on every surface.
- Cell 3D points are **precomputed once** and reused by plates + noise + detail.
- Plate drift is a 3D tangent vector; boundary normal is the 3D seed->seed direction.
- Sphere plate seeds use Poisson-disk blue noise (`spherePoisson`) — irregular and
  seed-dependent — and each plate has a random base-elevation offset; boundary uplift
  is box-blurred so ridges read as ranges, not thin walls.

### Playground / tests

- Surface + Poles dropdowns.
- Tests: antipodal distance ~ pi*R, pole convergence (top row far less varied),
  ocean poles are sea, sphere determinism, presets still hit land targets.

### Tradeoff

- On `native` presets, equirectangular polar land is *stretched* (Antarctica-style);
  `ocean` presets keep the poles watery. Vertical (`v`) wrapping (a torus) remains
  deferred — it needs a 4D/torus noise mapping.

## M1.7 — One world model, many representations

Motivation: a flat whole-world map must distort; and a fixed grid can't be viewed
at other projections/zooms. Split the world into a **resolution-independent model**
plus **projections** that sample it, so every view shows the same world.

### Model / sampler split

- `WorldModel` (`src/world/model.ts`) — everything deterministic from the seed
  (surface, plate model, noise, sea level, normalisation, polar penalty).
- `sampleField(model, u, v)` — continuous elevation at any surface point.
- The plate engine (`src/world/tectonics.ts`) is now continuous: `createPlates`
  (seeds, area-based continental assignment, drift) + `samplePlates(model, u, v)`
  (nearest/second plate, shelf-blended base, boundary uplift). The grid box-blur is
  gone — the shelf is an analytic blend, so it is resolution independent.
- `generateWorld` samples the model onto the canonical equirectangular grid; the
  grid equals `sampleField` at the same points (verified by a test).

### Projections (`src/projection/index.ts`)

`Projection` = inverse `output pixel -> (u, v)` + forward (for graticules) + `aspect`
+ preferred sampler. Shipped: `equirect`, `mollweide` (equal-area; poles are points,
no polar band), `mercator`, `localEquirect` (region, near-undistorted), `azimuthal`
(distances from centre).

### Views (`src/render/view.ts`)

- `gridSampler` — bilinear resample of the canonical raster (fast) -> overviews.
- `fieldSampler` — `sampleField` per pixel (crisp) -> regions / deep zoom.
- `renderView(world, projection, { width, height, sampler })` -> `RasterImage`.
- `renderRaster` generalised to paint `NaN` (outside a projection's domain) as
  transparent (e.g. Mollweide corners).

### Playground

Representation dropdown (equirect / Mollweide / Mercator / region) + region centre
and span controls.

### Explicitly deferred

- Interactive 3D globe (the `Projection` interface leaves room for `orthographic`).
- Biomes, rivers, erosion.

## M2 — Climate + Biomes

Everything inferred from the planet (no hand-authored templates), computed once on
the canonical grid and sampled by every representation.

### Climate (`src/world/climate.ts`)

- **Temperature**: real zonal profile ~linear in `cos(latitude)` (warm equator, cold
  poles) minus an altitude lapse (`maxReliefKm`, mild power curve). Gives polar ice.
- **Moisture**: oceans are the source; **zonal winds** (easterlies / westerlies /
  polar easterlies by latitude) advect humid air inland; **orographic rain-out** on
  smoothed terrain makes rain shadows; **latitude belts** add the wet ITCZ, dry
  subtropics, wet mid-latitudes and dry poles; a gamma lift approximates recycling so
  interiors are not uniformly arid.

### Biomes (`src/world/biome.ts`)

- Whittaker `temperature x moisture` table plus altitudinal (alpine/snow) and polar
  (ice/tundra) overrides and a beach fringe. 15 biomes with a colour palette.

### Wiring

- `World` gains `temperature`, `moisture`, `biome`; config gets a `climate` block
  (`equatorTempC`, `poleTempC`, `lapseRateCPerKm`, `maxReliefKm`, `moistureScale`).
- `renderMap` gains `style: terrain | biome | temperature | moisture`; biomes stay
  hillshaded; `renderWorld` defaults to biome; `renderTerrain` keeps terrain.
- `renderView` samples the climate/biome grids for whole-world and region views.
- Playground gains a **Layer** dropdown (biome default).

### Deferred

- Rivers/hydrology, erosion, labels.

## M3 — Hydrology (rivers + lakes)

Computed from the canonical elevation grid, resolution-independent in the sense that
views sample the resulting `flow` / `lake` fields.

### `src/world/hydrology.ts`

1. **Smooth terrain** (box blur) — drainage follows landforms, not noise pits.
2. **Priority-flood** depression filling (min-heap), oceans as outlets.
3. **D8** steepest-descent flow directions.
4. **Flow accumulation** (drainage area), processed high-to-low fill order.
5. **Lakes** = filled depressions, filtered to substantial connected basins so
   shallow pits are ignored.

### Wiring

- `World` gains `flow`, `filled`, `lake`; config gets `hydrology.riverThreshold`.
- `renderMap` overlays rivers (blue, width/brightness by drainage) and lakes
  (inland water) on the terrain/biome styles.
- `renderView` samples `flow` (bilinear) and `lake` for region/whole-world views.
- `World` constructor refactored to a single init object.

### Known limitation

- Rivers are per-pixel from a D8 grid, so they look blocky at deep zoom. Smooth,
  anti-aliased vector rivers are part of M4 (vector layer).

### Deferred

- Erosion, labels, vector rivers.

## M4 — Erosion (hydraulic + thermal)

Applied to the canonical elevation grid after normalisation, before climate/biome/hydrology
(rivers then follow the eroded terrain).

### `src/world/erosion.ts`

- **Hydraulic (droplet) erosion** — particles flow downhill with inertia, pick up
  sediment on steep ground and deposit it in flats; erodes within a small brush.
  Carves valleys, builds deltas, produces dendritic drainage.
- **Thermal (talus) erosion** — relaxes slopes steeper than the talus angle.

### Wiring

- New `erosion` config block (droplets per cell, inertia, capacity, deposit, erode,
  gravity, brush radius, lifetime, thermal passes, talus).
- After erosion the sea level is **re-derived** so the ocean fraction stays exact.
- `World` gains `erosionDelta` (eroded minus pre-erosion). Resolution-independent
  views apply it to the analytic field (`model.sample + sampled delta`), so regions
  show the eroded terrain too.
- Playground renders erosion automatically (it's baked into the terrain/biome/rivers).

### Deferred

- Vector/raster river smoothing (rivers are still D8 grid lines), labels, export.

## Notes / risks

- **Pole handling** only bites when we add sphere — deferred, and the abstraction contains it.
- **Biome polygon fragmentation** (tiny isolated biome islands) needs merging/simplification;
  budget time in M4.
- **Node-WebGL Pixi** is avoided by keeping the *raster export* in pure TS; Pixi is browser-first.
- Kept the raster path alive so a future structural-export feature (depth/lineart) stays cheap,
  but we do not build it now.

## Ideas / tunables (future)

- **Expose the per-plate base-offset range** (`tectonics.baseOffset` range, currently a
  fixed `[-0.12, +0.12]`) in the config. Lowering it makes continents/islands more
  uniform; raising it makes some plates barely emerge (more small islands) and others
  dominate. This is the main knob for the "repetitive vs. varied" and
  "few big islands vs. many small ones" trade-off, alongside `plateCount`,
  `continentalFraction`, and `boundaryWidthKm`.
- **M5 — Vector layer + export**: marching-squares/spline coastlines and rivers
  (fixes the blocky D8 rivers at deep zoom), plus JSON / SVG / PNG export.
- Labels/names for settlements, regions and seas.
- Interactive 3D globe (`orthographic` projection / Three.js).
- Optional night/day or seasonal climate variants.
