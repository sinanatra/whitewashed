<script>
  import ArchiveMap from "$lib/components/ArchiveMap.svelte";
  import DateRangeSlider from "$lib/components/DateRangeSlider.svelte";
  import Footer from "$lib/components/Footer.svelte";
  import Hero from "$lib/components/Hero.svelte";
  import PhotoArchive from "$lib/components/PhotoArchive.svelte";

  let { data } = $props();

  const photos = data.photos ?? [];
  const loadError = data.error || "";
  let activePhotoId = $state("");
  let archiveRef = $state();
  let filteredPhotos = $state([]);

  function setActivePhoto(photoId) {
    activePhotoId = photoId || "";
  }

  function clearActivePhoto() {
    activePhotoId = "";
  }

  function focusPhoto(photoId) {
    setActivePhoto(photoId);
    archiveRef?.scrollToPhoto(photoId);
  }
</script>

<svelte:head>
  <title>Whitewashed</title>
</svelte:head>

<main>
  <div class="sticky top-0 z-0">
    <Hero />
  </div>

  <div class="relative z-10">
    {#if loadError}
      <p class="mb-6 px-3 py-2 text-sm">
        <span class="marker-text">{loadError}</span>
      </p>
    {/if}

    {#if !photos.length}
      <div class="mx-auto max-w-[1800px] px-5 py-10 text-sm">
        <span class="marker-text">No photos yet.</span>
      </div>
    {:else}
      <div
        class="relative grid xl:grid-cols-[minmax(0,0.6fr)_minmax(0,1.4fr)] xl:items-start"
      >
        <div
          class="pointer-events-none absolute inset-x-0 top-0 z-20 h-5 bg-gradient-to-b from-black to-transparent"
        ></div>
        <div class="sticky top-0 z-10 hidden xl:block">
          <ArchiveMap
            photos={filteredPhotos}
            {activePhotoId}
            onhover={(event) => focusPhoto(event.id)}
            onleave={clearActivePhoto}
          />
        </div>

        <div>
          <div class="xl:hidden">
            <ArchiveMap
              photos={filteredPhotos}
              {activePhotoId}
              onhover={(event) => focusPhoto(event.id)}
              onleave={clearActivePhoto}
            />
          </div>

          <DateRangeSlider {photos} bind:filteredPhotos />

          <PhotoArchive
            bind:this={archiveRef}
            photos={filteredPhotos}
            {activePhotoId}
            onenter={setActivePhoto}
            onleave={clearActivePhoto}
          />
        </div>
      </div>
    {/if}
  </div>

  <Footer />
</main>
