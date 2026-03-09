<script>
  import ArchiveMap from "$lib/components/ArchiveMap.svelte";
  import Footer from "$lib/components/Footer.svelte";
  import Hero from "$lib/components/Hero.svelte";

  export let data;

  const photos = data.photos ?? [];
  const loadError = data.error || "";
  let activePhotoId = "";
  const photoElements = new Map();
  let loadedPhotoIds = {};

  function registerPhoto(node, photoId) {
    if (photoId) {
      photoElements.set(photoId, node);
    }

    return {
      update(nextPhotoId) {
        if (nextPhotoId !== photoId) {
          if (photoId) {
            photoElements.delete(photoId);
          }
          photoId = nextPhotoId;
          if (photoId) {
            photoElements.set(photoId, node);
          }
        }
      },
      destroy() {
        if (photoId) {
          photoElements.delete(photoId);
        }
      },
    };
  }

  function setActivePhoto(photoId) {
    activePhotoId = photoId || "";
  }

  function clearActivePhoto() {
    activePhotoId = "";
  }

  function focusPhoto(photoId) {
    setActivePhoto(photoId);

    const node = photoElements.get(photoId);
    if (!node) {
      return;
    }

    node.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }

  function tryDirectSource(event) {
    const img = event.currentTarget;
    const src = String(img?.getAttribute("src") || "");
    const marker = "/api/photos/image?src=";

    if (!src.includes(marker)) {
      return;
    }

    const encoded = src.split(marker)[1] || "";
    const direct = decodeURIComponent(encoded);

    if (!direct || direct === src) {
      return;
    }

    img.src = direct;
  }

  function markPhotoLoaded(photoId) {
    loadedPhotoIds = { ...loadedPhotoIds, [photoId]: true };
  }
</script>

<svelte:head>
  <title>Whitewashed</title>
</svelte:head>

<main>
  <Hero />

  <section>
    {#if loadError}
      <p class="mb-6 -black px-3 py-2 text-sm">
        <span class="marker-text">{loadError}</span>
      </p>
    {/if}

    {#if !photos.length}
      <div class="mx-auto max-w-[1800px] -black px-5 py-10 text-sm">
        <span class="marker-text">No photos yet.</span>
      </div>
    {:else}
      <section
        class="mx-auto grid max-w-[1800px] xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)] xl:items-start"
      >
        <div class="grid gap-0 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-5">
          {#each photos as photo}
            {#if photo.imageUrl}
              <a
                href={photo.imageUrl}
                target="_blank"
                rel="noreferrer"
                use:registerPhoto={photo.id}
                class={`group block overflow-hidden  -black bg-white ""
                }`}
                on:mouseenter={() => setActivePhoto(photo.id)}
                on:mouseleave={clearActivePhoto}
                on:focusin={() => setActivePhoto(photo.id)}
                on:focusout={clearActivePhoto}
              >
                <div class="image-frame aspect-[4/5] min-h-[200px] w-full">
                  <div
                    class={`scan-overlay ${
                      loadedPhotoIds[photo.id] ? "scan-overlay-hidden" : ""
                    }`}
                    aria-hidden="true"
                  ></div>
                  <img
                    src={photo.imageUrl}
                    alt={photo.title || "Archive photo"}
                    class={`image-resolve aspect-[4/5] min-h-[200px] w-full object-cover transition duration-500 ${
                      activePhotoId === photo.id
                        ? "grayscale-0"
                        : "threshold-image"
                    } ${loadedPhotoIds[photo.id] ? "image-resolve-loaded" : ""}`}
                    loading="lazy"
                    decoding="async"
                    on:load={() => markPhotoLoaded(photo.id)}
                    on:error={tryDirectSource}
                  />
                </div>
              </a>
            {:else}
              <div
                use:registerPhoto={photo.id}
                class={`group block overflow-hidden  -black bg-white ${
                  activePhotoId === photo.id ? "ring-1 ring-black" : ""
                }`}
                on:mouseenter={() => setActivePhoto(photo.id)}
                on:mouseleave={clearActivePhoto}
                on:focusin={() => setActivePhoto(photo.id)}
                on:focusout={clearActivePhoto}
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

        <div class="xl:sticky xl:top-2">
          <ArchiveMap
            {photos}
            {activePhotoId}
            on:hover={(event) => focusPhoto(event.detail.id)}
            on:leave={clearActivePhoto}
          />
        </div>
      </section>
    {/if}
  </section>

  <Footer />
</main>
