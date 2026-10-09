/**
 * proc-gen-maps — procedural world map generation for RPG games.
 *
 * The core is framework-free: it produces typed-array data and RGBA rasters.
 * Rendering framework adapters (e.g. Pixi) live in separate entry points.
 */

export * from './rng/index.js';
export * from './noise/index.js';
export * from './surface/index.js';
export * from './scatter/index.js';

export * from './world/config.js';
export * from './world/presets.js';
export * from './world/tectonics.js';
export * from './world/climate.js';
export * from './world/biome.js';
export * from './world/hydrology.js';
export * from './world/erosion.js';
export * from './world/model.js';
export * from './world/World.js';
export * from './world/generate.js';

export * from './projection/index.js';

export * from './render/RasterImage.js';
export * from './render/terrain.js';
export * from './render/view.js';
export * from './render/canvas.js';
export * from './render/png.js';
