<script lang="ts">
  let { lat = $bindable(""), lng = $bindable("") } = $props();

  const TILE_SIZE = 256;
  const MIN_ZOOM = 10;
  const MAX_ZOOM = 18;
  const DEFAULT_CENTER = { lat: 52.52, lng: 13.405 };

  let mapElement = $state<HTMLDivElement>();
  let viewportWidth = $state(0);
  let viewportHeight = $state(0);
  let isDragging = $state(false);
  let center = $state(DEFAULT_CENTER);
  let zoom = $state(13);
  let activePointers = new Map<number, { clientX: number; clientY: number }>();
  let lastPinchDistance: number | null = null;
  let initialized = $state(false);
  let didDrag = false;
  let wasDragging = false;

  function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }

  function projectToWorld(la: number, ln: number, z: number) {
    const scale = TILE_SIZE * 2 ** z;
    const sinLat = Math.sin((clamp(la, -85, 85) * Math.PI) / 180);
    return {
      x: ((ln + 180) / 360) * scale,
      y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
    };
  }

  function unprojectFromWorld(x: number, y: number, z: number) {
    const scale = TILE_SIZE * 2 ** z;
    const lng = (x / scale) * 360 - 180;
    const mercatorY = 0.5 - y / scale;
    const lat = (Math.atan(Math.sinh(mercatorY * 2 * Math.PI)) * 180) / Math.PI;
    return { lat, lng };
  }

  $effect(() => {
    if (!initialized && lat && lng) {
      center = { lat: Number(lat), lng: Number(lng) };
      initialized = true;
    }
  });

  let centerWorld = $derived(projectToWorld(center.lat, center.lng, zoom));
  let halfWidth = $derived(viewportWidth / 2);
  let halfHeight = $derived(viewportHeight / 2);
  let startTileX = $derived(Math.floor((centerWorld.x - halfWidth) / TILE_SIZE));
  let endTileX = $derived(Math.floor((centerWorld.x + halfWidth) / TILE_SIZE));
  let startTileY = $derived(Math.floor((centerWorld.y - halfHeight) / TILE_SIZE));
  let endTileY = $derived(Math.floor((centerWorld.y + halfHeight) / TILE_SIZE));

  let tiles = $derived(
    Array.from(
      { length: Math.max(0, (endTileY - startTileY + 1) * (endTileX - startTileX + 1)) },
      (_, i) => {
        const w = endTileX - startTileX + 1;
        const x = startTileX + (i % w);
        const y = startTileY + Math.floor(i / w);
        return {
          key: `${zoom}-${x}-${y}`,
          left: x * TILE_SIZE - centerWorld.x + halfWidth,
          top: y * TILE_SIZE - centerWorld.y + halfHeight,
          src: `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`,
        };
      },
    ),
  );

  let markerPos = $derived(
    lat && lng
      ? (() => {
          const p = projectToWorld(Number(lat), Number(lng), zoom);
          return { left: p.x - centerWorld.x + halfWidth, top: p.y - centerWorld.y + halfHeight };
        })()
      : null,
  );

  function placePin(clientX: number, clientY: number) {
    if (!mapElement) return;
    const rect = mapElement.getBoundingClientRect();
    const { lat: newLat, lng: newLng } = unprojectFromWorld(
      centerWorld.x - halfWidth + (clientX - rect.left),
      centerWorld.y - halfHeight + (clientY - rect.top),
      zoom,
    );
    lat = String(Math.round(newLat * 1e6) / 1e6);
    lng = String(Math.round(newLng * 1e6) / 1e6);
  }

  function handlePointerDown(event: PointerEvent) {
    if (!mapElement) return;
    mapElement.setPointerCapture(event.pointerId);
    activePointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    if (activePointers.size === 1) {
      isDragging = true;
      didDrag = false;
      lastPinchDistance = null;
    } else if (activePointers.size >= 2) {
      const [p1, p2] = [...activePointers.values()];
      lastPinchDistance = Math.hypot(p2.clientX - p1.clientX, p2.clientY - p1.clientY);
    }
  }

  function handlePointerMove(event: PointerEvent) {
    if (!activePointers.has(event.pointerId)) return;
    const prev = activePointers.get(event.pointerId)!;
    activePointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });

    if (activePointers.size >= 2) {
      const [p1, p2] = [...activePointers.values()];
      const distance = Math.hypot(p2.clientX - p1.clientX, p2.clientY - p1.clientY);
      if (lastPinchDistance !== null && distance > 0) {
        zoom = clamp(Math.round(zoom + Math.log2(distance / lastPinchDistance)), MIN_ZOOM, MAX_ZOOM);
      }
      lastPinchDistance = distance;
    } else {
      const dx = event.clientX - prev.clientX;
      const dy = event.clientY - prev.clientY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didDrag = true;
      const cw = projectToWorld(center.lat, center.lng, zoom);
      const next = unprojectFromWorld(cw.x - dx, cw.y - dy, zoom);
      center = { lat: clamp(next.lat, -85, 85), lng: clamp(next.lng, -180, 180) };
    }
  }

  function handlePointerUp(event: PointerEvent) {
    if (!mapElement) return;
    if (mapElement.hasPointerCapture(event.pointerId)) mapElement.releasePointerCapture(event.pointerId);
    activePointers.delete(event.pointerId);
    if (activePointers.size === 0) {
      wasDragging = didDrag;
      didDrag = false;
      isDragging = false;
      lastPinchDistance = null;
    }
  }

  function handleClick(event: MouseEvent) {
    if (wasDragging) { wasDragging = false; return; }
    placePin(event.clientX, event.clientY);
  }

  function zoomBy(step: number, e: MouseEvent) {
    e.stopPropagation();
    zoom = clamp(zoom + step, MIN_ZOOM, MAX_ZOOM);
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  bind:this={mapElement}
  bind:clientWidth={viewportWidth}
  bind:clientHeight={viewportHeight}
  class={`relative h-64 overflow-hidden border border-black touch-none bg-neutral-200 ${isDragging ? "cursor-grabbing" : "cursor-crosshair"}`}
  role="application"
  aria-label="Pick a location on the map"
  onpointerdown={handlePointerDown}
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
  onpointercancel={handlePointerUp}
  onclick={handleClick}
>
  <div class="absolute inset-0 grayscale contrast-125">
    {#each tiles as tile (tile.key)}
      <img
        src={tile.src}
        alt=""
        class="absolute h-64 w-64 max-w-none select-none object-cover"
        style={`left:${tile.left}px;top:${tile.top}px;`}
        draggable="false"
      />
    {/each}
  </div>

  <div class="absolute right-3 top-3 z-10 flex flex-col gap-1">
    <button
      type="button"
      class="flex h-7 w-7 items-center justify-center border border-black bg-white text-lg leading-none"
      onpointerdown={(e) => e.stopPropagation()}
      onclick={(e) => zoomBy(1, e)}
    >+</button>
    <button
      type="button"
      class="flex h-7 w-7 items-center justify-center border border-black bg-white text-lg leading-none"
      onpointerdown={(e) => e.stopPropagation()}
      onclick={(e) => zoomBy(-1, e)}
    >−</button>
  </div>

  {#if markerPos}
    <div
      class="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2"
      style={`left:${markerPos.left}px;top:${markerPos.top}px;`}
    >
      <div class="h-4 w-4 rounded-full border-2 border-white bg-[#0000ff] shadow"></div>
    </div>
  {/if}

  {#if !lat || !lng}
    <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
      <span class="bg-white/80 px-2 py-1 text-xs text-black/60">
        <span class="marker-text">tap to place pin</span>
      </span>
    </div>
  {/if}
</div>
