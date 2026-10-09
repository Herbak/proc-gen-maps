// Renders a sample world to a PNG using the built library.
// Usage: node scripts/render-sample.mjs [seed] [width] [height] [preset]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng, generateWorld, renderTerrain } from '../dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '..', 'samples');
mkdirSync(outDir, { recursive: true });

const seed = process.argv[2] ?? 'earth-01';
const width = Number(process.argv[3] ?? 1400);
const height = Number(process.argv[4] ?? 700);
const preset = process.argv[5] ?? 'earth';

const started = Date.now();
const world = generateWorld({ preset, seed, size: { width, height } });
const image = renderTerrain(world);
const png = await encodePng(image);

const out = resolve(outDir, `world-${preset}-${seed}.png`);
writeFileSync(out, png);

const ocean = 1 - world.landFraction();
console.log(`preset=${preset} seed=${seed} size=${width}x${height}`);
console.log(`sea level=${world.seaLevel.toFixed(3)} ocean=${(ocean * 100).toFixed(1)}%`);
console.log(`generated + encoded in ${Date.now() - started}ms -> ${out}`);
