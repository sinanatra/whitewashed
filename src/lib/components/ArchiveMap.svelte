<script>
  let { photos = [], activePhotoId = "", onhover, onleave } = $props();

  const TILE_SIZE = 256;
  const MIN_ZOOM = 10;
  const MAX_ZOOM = 16;
  const BERLIN_BOUNDS = {
    minLat: 52.3383,
    maxLat: 52.6755,
    minLng: 13.0884,
    maxLng: 13.7612,
  };
  const DEFAULT_CENTER = { lat: 52.52, lng: 13.405 };
  const MAX_MARKERS = 160;

  let viewportWidth = $state(0);
  let viewportHeight = $state(0);
  let mapElement = $state();
  let isDragging = $state(false);
  let center = $state(DEFAULT_CENTER);
  let zoom = $state(MIN_ZOOM);
  let hasInitializedCenter = $state(false);
  let hasInitializedZoom = $state(false);
  let activePointers = new Map();
  let lastPinchDistance = null;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function clampLatitude(lat) {
    return clamp(lat, -85.05112878, 85.05112878);
  }

  function clampCenter(nextCenter) {
    return {
      lat: clamp(nextCenter.lat, BERLIN_BOUNDS.minLat, BERLIN_BOUNDS.maxLat),
      lng: clamp(nextCenter.lng, BERLIN_BOUNDS.minLng, BERLIN_BOUNDS.maxLng),
    };
  }

  function projectToWorld(lat, lng, zoom) {
    const scale = TILE_SIZE * 2 ** zoom;
    const clampedLat = clampLatitude(lat);
    const sinLat = Math.sin((clampedLat * Math.PI) / 180);

    return {
      x: ((lng + 180) / 360) * scale,
      y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
    };
  }

  function unprojectFromWorld(x, y, zoom) {
    const scale = TILE_SIZE * 2 ** zoom;
    const lng = (x / scale) * 360 - 180;
    const mercatorY = 0.5 - y / scale;
    const lat = (Math.atan(Math.sinh(mercatorY * 2 * Math.PI)) * 180) / Math.PI;

    return {
      lat,
      lng,
    };
  }

  function resolveZoom(count) {
    if (count > 140) return 10;
    if (count > 60) return 11;
    return 12;
  }

  function setZoom(nextZoom, focusPoint = null) {
    const clampedZoom = clamp(Math.round(nextZoom), MIN_ZOOM, MAX_ZOOM);
    if (clampedZoom === zoom) {
      return;
    }

    if (!mapElement || !focusPoint) {
      zoom = clampedZoom;
      return;
    }

    const rect = mapElement.getBoundingClientRect();
    const localX = focusPoint.clientX - rect.left;
    const localY = focusPoint.clientY - rect.top;
    const focusWorld = {
      x: centerWorld.x - halfWidth + localX,
      y: centerWorld.y - halfHeight + localY,
    };
    const focusLatLng = unprojectFromWorld(focusWorld.x, focusWorld.y, zoom);

    zoom = clampedZoom;

    const nextFocusWorld = projectToWorld(
      focusLatLng.lat,
      focusLatLng.lng,
      clampedZoom,
    );

    center = clampCenter(
      unprojectFromWorld(
        nextFocusWorld.x - localX + halfWidth,
        nextFocusWorld.y - localY + halfHeight,
        clampedZoom,
      ),
    );
  }

  function handlePointerDown(event) {
    if (!mapElement) {
      return;
    }

    mapElement.setPointerCapture(event.pointerId);
    activePointers.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY,
    });

    if (activePointers.size === 1) {
      isDragging = true;
      lastPinchDistance = null;
    } else if (activePointers.size >= 2) {
      isDragging = false;
      const [p1, p2] = [...activePointers.values()];
      lastPinchDistance = Math.hypot(
        p2.clientX - p1.clientX,
        p2.clientY - p1.clientY,
      );
    }
  }

  function handlePointerMove(event) {
    if (!activePointers.has(event.pointerId)) {
      return;
    }

    const prev = activePointers.get(event.pointerId);
    activePointers.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY,
    });

    if (activePointers.size >= 2) {
      const [p1, p2] = [...activePointers.values()];
      const distance = Math.hypot(
        p2.clientX - p1.clientX,
        p2.clientY - p1.clientY,
      );

      if (lastPinchDistance !== null && distance > 0) {
        const midX = (p1.clientX + p2.clientX) / 2;
        const midY = (p1.clientY + p2.clientY) / 2;
        setZoom(zoom + Math.log2(distance / lastPinchDistance), {
          clientX: midX,
          clientY: midY,
        });
      }

      lastPinchDistance = distance;
    } else if (isDragging) {
      const dx = event.clientX - prev.clientX;
      const dy = event.clientY - prev.clientY;
      const currentWorld = projectToWorld(center.lat, center.lng, zoom);
      center = clampCenter(
        unprojectFromWorld(currentWorld.x - dx, currentWorld.y - dy, zoom),
      );
    }
  }

  function handlePointerUp(event) {
    if (!mapElement) {
      return;
    }

    if (mapElement.hasPointerCapture(event.pointerId)) {
      mapElement.releasePointerCapture(event.pointerId);
    }

    activePointers.delete(event.pointerId);

    if (activePointers.size === 0) {
      isDragging = false;
      lastPinchDistance = null;
    } else if (activePointers.size === 1) {
      isDragging = true;
      lastPinchDistance = null;
      const [pointerId] = [...activePointers.keys()];
      try {
        mapElement.setPointerCapture(pointerId);
      } catch (_) {}
    }
  }

  function zoomBy(step) {
    setZoom(zoom + step);
  }

  let geotaggedPhotos = $derived(
    photos
      .map((photo) => ({
        ...photo,
        lat: Number(photo.lat),
        lng: Number(photo.lng),
      }))
      .filter(
        (photo) => Number.isFinite(photo.lat) && Number.isFinite(photo.lng),
      ),
  );

  let resolvedZoom = $derived(resolveZoom(geotaggedPhotos.length));
  let initialCenter = $derived(
    geotaggedPhotos.length
      ? clampCenter({
          lat:
            geotaggedPhotos.reduce((sum, photo) => sum + photo.lat, 0) /
            geotaggedPhotos.length,
          lng:
            geotaggedPhotos.reduce((sum, photo) => sum + photo.lng, 0) /
            geotaggedPhotos.length,
        })
      : DEFAULT_CENTER,
  );

  $effect(() => {
    if (!hasInitializedCenter) {
      center = initialCenter;
      hasInitializedCenter = true;
    }
  });

  $effect(() => {
    if (!hasInitializedZoom) {
      zoom = resolvedZoom;
      hasInitializedZoom = true;
    }
  });

  let centerWorld = $derived(projectToWorld(center.lat, center.lng, zoom));
  let halfWidth = $derived(viewportWidth / 2);
  let halfHeight = $derived(viewportHeight / 2);
  let startTileX = $derived(
    Math.floor((centerWorld.x - halfWidth) / TILE_SIZE),
  );
  let endTileX = $derived(Math.floor((centerWorld.x + halfWidth) / TILE_SIZE));
  let startTileY = $derived(
    Math.floor((centerWorld.y - halfHeight) / TILE_SIZE),
  );
  let endTileY = $derived(Math.floor((centerWorld.y + halfHeight) / TILE_SIZE));

  let tiles = $derived(
    Array.from(
      {
        length: Math.max(
          0,
          (endTileY - startTileY + 1) * (endTileX - startTileX + 1),
        ),
      },
      (_, index) => {
        const widthCount = endTileX - startTileX + 1;
        const x = startTileX + (index % widthCount);
        const y = startTileY + Math.floor(index / widthCount);

        return {
          key: `${zoom}-${x}-${y}`,
          left: x * TILE_SIZE - centerWorld.x + halfWidth,
          top: y * TILE_SIZE - centerWorld.y + halfHeight,
          src: `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`,
        };
      },
    ),
  );

  let markers = $derived(
    geotaggedPhotos.slice(0, MAX_MARKERS).map((photo) => {
      const point = projectToWorld(photo.lat, photo.lng, zoom);
      return {
        ...photo,
        left: point.x - centerWorld.x + halfWidth,
        top: point.y - centerWorld.y + halfHeight,
      };
    }),
  );
</script>

<section class="flex bg-white">
  {#if geotaggedPhotos.length}
    <div class="flex-1">
      <div
        bind:this={mapElement}
        bind:clientWidth={viewportWidth}
        bind:clientHeight={viewportHeight}
        class={`relative h-[35vh] sm:h-[40rem] overflow-hidden touch-none -black bg-neutral-200 ${
          isDragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        role="application"
        aria-label="Interactive map of Berlin archive locations"
        onpointerdown={handlePointerDown}
        onpointermove={handlePointerMove}
        onpointerup={handlePointerUp}
        onpointercancel={handlePointerUp}
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
          <div class="absolute inset-0 bg-white/12"></div>
        </div>

        <div
          class="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.14)_1px,transparent_1px)] bg-[size:56px_56px] opacity-20"
        ></div>

        <div class="absolute right-4 top-4 z-10 flex flex-col gap-2">
          <button
            type="button"
            class="flex h-8 w-8 items-center justify-center -black bg-white text-xl leading-none text-black transition-colors hover:bg-black hover:text-white"
            aria-label="Zoom in"
            onclick={() => zoomBy(1)}
            onpointerdown={(event) => event.stopPropagation()}
          >
            +
          </button>
          <button
            type="button"
            class="flex h-8 w-8 items-center justify-center -black bg-white text-xl leading-none text-black transition-colors hover:bg-black hover:text-white"
            aria-label="Zoom out"
            onclick={() => zoomBy(-1)}
            onpointerdown={(event) => event.stopPropagation()}
          >
            -
          </button>
        </div>

        {#each markers as marker}
          {#if marker.left >= -20 && marker.left <= viewportWidth + 20 && marker.top >= -20 && marker.top <= viewportHeight + 20}
            <button
              type="button"
              class="group absolute -translate-x-1/2 -translate-y-1/2"
              style={`left:${marker.left}px;top:${marker.top}px;`}
              aria-label={`Marker ${marker.title || marker.id}`}
              onmouseenter={() => onhover?.({ id: marker.id })}
              onmouseleave={() => onleave?.()}
              onfocus={() => onhover?.({ id: marker.id })}
              onblur={() => onleave?.()}
            >
              <span
                class={`relative flex items-center justify-center rounded-full  -white bg-[#0000ff] transition-all duration-200 ${
                  activePhotoId === marker.id ? "h-4 w-4" : "h-2 w-2"
                }`}
              >
              </span></button
            >
          {/if}
        {/each}
      </div>
    </div>
  {:else}
    <div class="px-4 py-10 text-sm text-black/65">
      <span class="marker-text">No geotagged images available yet.</span>
    </div>
  {/if}
</section>
