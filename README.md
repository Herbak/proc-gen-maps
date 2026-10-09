# proc-gen-maps

Procedural **world map** generation for RPG games. Seed-deterministic, framework-free
core with an optional [Pixi](https://pixijs.com/) adapter. Designed so **sphere / sci-fi**,
**regions** and **towns** can be added later without rewrites.

See [`PLAN.md`](./PLAN.md) for the full design and roadmap.

## Status

Early scaffold. Currently implemented:

- Seeded, deterministic PRNG (`Rng`)
- Simplex fBm / ridged / domain-warped noise
- `Surface` abstraction — `CylinderSurface`, `PlaneSurface`, and **`SphereSurface`**
  (3D noise sampling, pole-correct, seamless east-west)
- Poisson-disk scatter (planet-relative sizes in km)
- **Tectonic plate layer** (Voronoi plates, continental/oceanic base,
  convergent uplift / divergent rifting) — landmasses are plate-shaped
- **Presets**: `earth`, `continents`, `archipelago`, `pangea`, `islands`
- **Climate + biomes** — temperature (latitude + altitude), moisture (winds + rain
  shadow + belts), Whittaker biomes with a colour palette
- **Hydrology** — depression fill + D8 flow accumulation → rivers + lakes
- **Erosion** — hydraulic (droplet) + thermal, carving valleys and dendritic drainage
- **Representations** — `equirect`, `mollweide`, `mercator`, `localEquirect` (region),
  `azimuthal`; `renderView(world, projection, ...)`
- Terrain + biome raster render (colormap + hillshade, rivers/lakes) and PNG encode
- Svelte + Pixi playground

Not yet: labels, export.

## Install

```bash
npm install
```

## Develop

```bash
npm run dev        # Svelte + Pixi playground (Vite)
npm test           # vitest
npm run typecheck  # tsc --noEmit
npm run build      # library build -> dist/
```

## Usage

```ts
import { generateWorld, renderView, renderWorld, mollweide, encodePng } from 'proc-gen-maps';

const world = generateWorld({
  preset: 'earth',                 // earth | continents | archipelago | pangea | islands
  seed: 'terra',
  surface: 'sphere',               // 'sphere' | 'cylinder' | 'plane'
  poles: 'native',                 // 'native' (pinch) | 'ocean'
  size: { width: 1400, height: 700 },
  tectonics: { plateCount: 14, continentalFraction: 0.33, uplift: 1 },
  climate: { equatorTempC: 30, poleTempC: -18 },
  land: { seaFraction: 0.71 },
});

renderWorld(world);                               // canonical grid, biome colours
renderView(world, mollweide(), { width: 1200, height: 600, style: 'biome' });

// World data:
world.elevation;   // Float32Array [0, 1] (canonical equirectangular grid)
world.temperature; // Float32Array (degC)
world.moisture;    // Float32Array [0, 1]
world.biome;       // Uint8Array (see Biome)
world.flow;        // Float32Array (drainage / upstream cell count)
world.lake;        // Uint8Array (1 = inland water)
world.sample(u, v); // resolution-independent elevation at any surface coord
```

### Pixi adapter

```ts
import { rasterToTexture } from 'proc-gen-maps/pixi';
```

## Project layout

```
src/        library (published)
playground/ Svelte + Vite dev app (not published)
test/       vitest
```
