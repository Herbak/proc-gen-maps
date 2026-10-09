<script lang="ts">
  import {
    PRESETS,
    equirect,
    generateWorld,
    localEquirect,
    mercator,
    mollweide,
    type MapStyle,
    type PoleMode,
    type PresetName,
    type Projection,
    type SurfaceKind,
    type WorldConfig,
  } from '@lib';
  import MapView from './MapView.svelte';

  const PRESET_NAMES = Object.keys(PRESETS) as PresetName[];
  const REPRESENTATIONS = ['equirect', 'mollweide', 'mercator', 'region'] as const;
  const LAYERS: MapStyle[] = ['biome', 'terrain', 'temperature', 'moisture'];
  type Representation = (typeof REPRESENTATIONS)[number];

  let preset = $state<PresetName>('earth');
  let seed = $state('terra');
  let radiusKm = $state(6371);
  let width = $state(1400);
  let height = $state(700);
  let seaFraction = $state(0.71);
  let plateCount = $state(14);
  let surface = $state<SurfaceKind>('sphere');
  let poles = $state<PoleMode>('native');

  let representation = $state<Representation>('equirect');
  let layer = $state<MapStyle>('biome');
  let regionU = $state(0.5);
  let regionV = $state(0.42);
  let regionSpanKm = $state(9000);

  function buildConfig(): WorldConfig {
    return {
      preset,
      seed,
      surface,
      poles,
      planet: { radiusKm },
      size: { width, height },
      land: { seaFraction },
      tectonics: { plateCount },
    };
  }

  let world = $state.raw(generateWorld(buildConfig()));

  const projection = $derived(buildProjection());

  function buildProjection(): Projection {
    switch (representation) {
      case 'mollweide':
        return mollweide();
      case 'mercator':
        return mercator();
      case 'region':
        return localEquirect(
          world.surface,
          { u: regionU, v: regionV },
          { width: regionSpanKm, height: regionSpanKm / 1.6 },
        );
      default:
        return equirect();
    }
  }

  function regenerate(): void {
    world = generateWorld(buildConfig());
  }

  function onPresetChange(): void {
    const p = PRESETS[preset];
    if (p.land?.seaFraction !== undefined) seaFraction = p.land.seaFraction;
    if (p.tectonics?.plateCount !== undefined) plateCount = p.tectonics.plateCount;
    if (p.planet?.radiusKm !== undefined) radiusKm = p.planet.radiusKm;
    if (p.surface !== undefined) surface = p.surface;
    if (p.poles !== undefined) poles = p.poles;
    regenerate();
  }

  function randomizeSeed(): void {
    seed = Math.random().toString(36).slice(2, 10);
    regenerate();
  }
</script>

<main>
  <aside class="panel">
    <header>
      <h1>proc-gen-maps</h1>
      <p class="subtitle">World generator playground</p>
    </header>

    <label>
      <span>Preset</span>
      <select bind:value={preset} onchange={onPresetChange}>
        {#each PRESET_NAMES as name}
          <option value={name}>{name}</option>
        {/each}
      </select>
    </label>

    <label>
      <span>Representation</span>
      <select bind:value={representation}>
        {#each REPRESENTATIONS as name}
          <option value={name}>{name}</option>
        {/each}
      </select>
    </label>

    <label>
      <span>Layer</span>
      <select bind:value={layer}>
        {#each LAYERS as name}
          <option value={name}>{name}</option>
        {/each}
      </select>
    </label>

    {#if representation === 'region'}
      <label>
        <span>Region centre <em>{regionU.toFixed(2)}, {regionV.toFixed(2)}</em></span>
        <input type="range" min="0" max="1" step="0.01" bind:value={regionU} />
        <input type="range" min="0" max="1" step="0.01" bind:value={regionV} />
      </label>
      <label>
        <span>Region span <em>{regionSpanKm.toLocaleString()} km</em></span>
        <input type="range" min="1500" max="20000" step="500" bind:value={regionSpanKm} />
      </label>
    {/if}

    <label>
      <span>Seed</span>
      <div class="row">
        <input type="text" bind:value={seed} />
        <button type="button" onclick={randomizeSeed} title="Random seed">🎲</button>
      </div>
    </label>

    <label>
      <span>Surface</span>
      <select bind:value={surface} onchange={() => regenerate()}>
        <option value="sphere">sphere</option>
        <option value="cylinder">cylinder</option>
        <option value="plane">plane</option>
      </select>
    </label>

    <label>
      <span>Poles</span>
      <select bind:value={poles} onchange={() => regenerate()}>
        <option value="native">native (pinch)</option>
        <option value="ocean">ocean</option>
      </select>
    </label>

    <label>
      <span>Planet radius <em>{radiusKm.toLocaleString()} km</em></span>
      <input type="range" min="2000" max="12000" step="100" bind:value={radiusKm} />
    </label>

    <label>
      <span>Ocean fraction <em>{(seaFraction * 100).toFixed(0)}%</em></span>
      <input type="range" min="0.3" max="0.92" step="0.01" bind:value={seaFraction} />
    </label>

    <label>
      <span>Tectonic plates <em>{plateCount}</em></span>
      <input type="range" min="3" max="40" step="1" bind:value={plateCount} />
    </label>

    <label>
      <span>Width <em>{width}px</em></span>
      <input type="range" min="256" max="2048" step="128" bind:value={width} />
    </label>

    <label>
      <span>Height <em>{height}px</em></span>
      <input type="range" min="128" max="1024" step="64" bind:value={height} />
    </label>

    <button class="primary" type="button" onclick={regenerate}>Generate</button>
  </aside>

  <section class="stage">
    <MapView {world} {projection} mapLayer={layer} />
  </section>
</main>

<style>
  :global(html, body) {
    margin: 0;
    height: 100%;
    background: #0a0f1c;
    color: #e6ecf5;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }

  :global(#app) {
    height: 100vh;
  }

  main {
    display: grid;
    grid-template-columns: 300px 1fr;
    height: 100%;
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px;
    background: #111a2e;
    border-right: 1px solid #1e2b46;
    overflow-y: auto;
  }

  h1 {
    margin: 0;
    font-size: 1.1rem;
    letter-spacing: 0.02em;
  }

  .subtitle {
    margin: 2px 0 0;
    font-size: 0.78rem;
    color: #7f8ea8;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.82rem;
    color: #aebbd0;
  }

  label em {
    font-style: normal;
    float: right;
    color: #6ea8ff;
  }

  .row {
    display: flex;
    gap: 8px;
  }

  input[type="text"],
  select {
    flex: 1;
    min-width: 0;
    padding: 7px 9px;
    background: #0a0f1c;
    border: 1px solid #24344f;
    border-radius: 6px;
    color: #e6ecf5;
    font-size: 0.82rem;
  }

  input[type="range"] {
    width: 100%;
    accent-color: #6ea8ff;
  }

  button {
    padding: 7px 10px;
    background: #1b2a44;
    border: 1px solid #2a3d5e;
    border-radius: 6px;
    color: #e6ecf5;
    cursor: pointer;
    font-size: 0.82rem;
  }

  button:hover {
    background: #223454;
  }

  button.primary {
    background: #2f6bff;
    border-color: #2f6bff;
    font-weight: 600;
  }

  button.primary:hover {
    background: #3f79ff;
  }

  .stage {
    position: relative;
    min-width: 0;
  }
</style>
