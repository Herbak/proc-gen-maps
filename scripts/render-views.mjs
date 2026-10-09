// Renders the same world in several representations (projections).
// Usage: node scripts/render-views.mjs [seed] [preset]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  encodePng,
  equirect,
  generateWorld,
  localEquirect,
  mercator,
  mollweide,
  renderView,
} from '../dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '..', 'samples');
mkdirSync(outDir, { recursive: true });

const seed = process.argv[2] ?? 'terra';
const preset = process.argv[3] ?? 'earth';
const baseWidth = 1200;

const world = generateWorld({ preset, seed, size: { width: 1400, height: 700 } });

const views = [
  ['equirect', equirect(), 2],
  ['mollweide', mollweide(), 2],
  ['mercator', mercator(), 1],
  ['region', localEquirect(world.surface, { u: 0.5, v: 0.42 }, { width: 9000, height: 5500 }), 1.636],
  ['moisture', equirect(), 2, 'moisture'],
  ['temperature', equirect(), 2, 'temperature'],
];

for (const [name, projection, aspect, style] of views) {
  const started = Date.now();
  const width = baseWidth;
  const height = Math.round(baseWidth / aspect);
  const image = renderView(world, projection, { width, height, style });
  const png = await encodePng(image);
  const out = resolve(outDir, `view-${name}-${seed}.png`);
  writeFileSync(out, png);
  console.log(`${name}: ${width}x${height} in ${Date.now() - started}ms -> ${out}`);
}
