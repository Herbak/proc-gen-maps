<script lang="ts">
  import { onMount } from 'svelte';
  import { Application, Container, Sprite, Texture } from 'pixi.js';
  import { renderView, rasterToCanvas, type MapStyle, type Projection, type World } from '@lib';

  let { world, projection, mapLayer }: { world: World; projection: Projection; mapLayer: MapStyle } =
    $props();

  let host: HTMLDivElement;
  let app: Application | null = null;
  let layer: Container | null = null;
  let sprite: Sprite | null = null;
  let ready = false;

  const RENDER_WIDTH = 1600;

  onMount(() => {
    let disposed = false;

    (async () => {
      const instance = new Application();
      await instance.init({
        background: '#0a0f1c',
        resizeTo: host,
        antialias: false,
        preference: 'webgl',
      });
      if (disposed) {
        instance.destroy(true);
        return;
      }
      host.appendChild(instance.canvas);
      layer = new Container();
      instance.stage.addChild(layer);
      app = instance;
      ready = true;
      draw();
    })();

    return () => {
      disposed = true;
      window.removeEventListener('resize', fit);
      app?.destroy(true, { children: true });
      app = null;
      layer = null;
      sprite = null;
      ready = false;
    };
  });

  function draw(): void {
    if (!app || !layer || !ready) return;

    const width = RENDER_WIDTH;
    const height = Math.max(1, Math.round(width / projection.aspect));
    const image = renderView(world, projection, { width, height, style: mapLayer });
    const texture = Texture.from(rasterToCanvas(image));

    if (sprite) {
      layer.removeChild(sprite);
      sprite.destroy(true);
    }
    sprite = new Sprite(texture);
    layer.addChild(sprite);
    fit();
    window.removeEventListener('resize', fit);
    window.addEventListener('resize', fit);
  }

  function fit(): void {
    if (!app || !sprite) return;
    const { width, height } = sprite.texture;
    const scale = Math.min(app.screen.width / width, app.screen.height / height);
    sprite.scale.set(scale || 1);
    sprite.position.set(
      (app.screen.width - width * scale) / 2,
      (app.screen.height - height * scale) / 2,
    );
  }

  $effect(() => {
    // Re-render whenever the world, the representation, or the layer changes.
    world;
    projection;
    mapLayer;
    draw();
  });
</script>

<div class="map" bind:this={host}></div>

<style>
  .map {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }
</style>
