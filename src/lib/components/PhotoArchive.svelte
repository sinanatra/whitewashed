<script>
  import { imageReady } from "$lib/actions/image-ready.js";

  let { photos = [], activePhotoId = "", onenter, onleave } = $props();

  const photoElements = new Map();
  let loadedPhotoIds = $state({});

  export function scrollToPhoto(photoId) {
    const node = photoElements.get(photoId);
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  }

  function registerPhoto(node, photoId) {
    if (photoId) photoElements.set(photoId, node);
    return {
      update(nextPhotoId) {
        if (nextPhotoId !== photoId) {
          if (photoId) photoElements.delete(photoId);
          photoId = nextPhotoId;
          if (photoId) photoElements.set(photoId, node);
        }
      },
      destroy() {
        if (photoId) photoElements.delete(photoId);
      },
    };
  }

  function markPhotoLoaded(photoId) {
    loadedPhotoIds = { ...loadedPhotoIds, [photoId]: true };
  }

  function tryDirectSource(event) {
    const img = event.currentTarget;
    const src = String(img?.getAttribute("src") || "");
    const marker = "/api/photos/image?src=";
    if (!src.includes(marker)) return;
    const encoded = src.split(marker)[1] || "";
    const direct = decodeURIComponent(encoded);
    if (!direct || direct === src) return;
    img.src = direct;
  }
</script>

<div class="grid gap-0 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-5 bg-white">
  {#each photos as photo}
    {#if photo.imageUrl}
      <a
        href={photo.imageUrl}
        target="_blank"
        rel="noreferrer"
        use:registerPhoto={photo.id}
        class="group block overflow-hidden -black bg-white"
        onmouseenter={() => onenter?.(photo.id)}
        onmouseleave={() => onleave?.()}
        onfocusin={() => onenter?.(photo.id)}
        onfocusout={() => onleave?.()}
      >
        <div class="image-frame aspect-[4/5] min-h-[200px] w-full">
          <div
            class={`scan-overlay ${loadedPhotoIds[photo.id] ? "scan-overlay-hidden" : ""}`}
            aria-hidden="true"
          ></div>
          <img
            src={photo.imageUrl}
            alt={photo.title || "Archive photo"}
            use:imageReady={() => markPhotoLoaded(photo.id)}
            class={`image-resolve aspect-[4/5] min-h-[200px] w-full object-cover transition duration-500 ${
              activePhotoId === photo.id ? "grayscale-0" : "grayscale"
            } ${loadedPhotoIds[photo.id] ? "image-resolve-loaded" : ""}`}
            loading="lazy"
            decoding="async"
            onload={() => markPhotoLoaded(photo.id)}
            onerror={tryDirectSource}
          />
        </div>
      </a>
    {:else}
      <div
        role="button"
        tabindex="0"
        use:registerPhoto={photo.id}
        class={`group block overflow-hidden -black bg-white ${
          activePhotoId === photo.id ? "ring-1 ring-black" : ""
        }`}
        onmouseenter={() => onenter?.(photo.id)}
        onmouseleave={() => onleave?.()}
        onfocusin={() => onenter?.(photo.id)}
        onfocusout={() => onleave?.()}
      >
        <div
          class="flex aspect-[4/5] min-h-[200px] w-full items-center justify-center bg-neutral-100 text-xs uppercase tracking-[0.24em] text-black/50"
        >
          <span class="marker-text">Image unavailable</span>
        </div>
      </div>
    {/if}
  {/each}
</div>
