<script>
  export let data;

  const photo = data.photo;

  function formatCoordinate(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(6) : '';
  }

  function formatDate(value) {
    if (!value) {
      return 'n/a';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return 'n/a';
    }

    return date.toLocaleString();
  }

  function tryDirectSource(event) {
    const img = event.currentTarget;
    const src = String(img?.getAttribute('src') || '');
    const marker = '/api/photos/image?src=';

    if (!src.includes(marker)) {
      return;
    }

    const encoded = src.split(marker)[1] || '';
    const direct = decodeURIComponent(encoded);

    if (!direct || direct === src) {
      return;
    }

    img.src = direct;
  }
</script>

<svelte:head>
  <title>{photo.title || 'Archive Image'} | Whitewashed</title>
</svelte:head>

<main class="min-h-screen bg-white px-4 py-5 sm:px-6 lg:px-8">
  <div class="mb-4 flex items-center justify-between -b -black pb-3">
    <a href="/" class="text-sm underline underline-offset-4"><span class="marker-text">Archive</span></a>
  </div>

  <section class="mx-auto grid max-w-[1800px] gap-6 lg:grid-cols-[minmax(0,1.35fr)_20rem] lg:items-start">
    <div class="flex min-h-[calc(100vh-7rem)] items-center justify-center  -black bg-neutral-50 p-4 sm:p-6">
      {#if photo.imageUrl}
        <img
          src={photo.imageUrl}
          alt={photo.title || 'Archive image'}
          class="max-h-[84vh] w-auto max-w-full object-contain"
          on:error={tryDirectSource}
        />
      {:else}
        <div class=" -black px-6 py-10 text-sm"><span class="marker-text">Image unavailable</span></div>
      {/if}
    </div>

    <aside class=" -black bg-white">
      <div class="-b -black px-4 py-4">
        <h1 class="mt-2 text-2xl leading-tight tracking-tight">
          <span class="marker-text">{photo.title || 'Untitled'}</span>
        </h1>
      </div>

      <div class="space-y-4 px-4 py-4 text-sm">
        <div class="grid gap-3">
          <div>
            <p class="text-sm text-black/50"><span class="marker-text">Taken</span></p>
            <p class="mt-1 leading-6"><span class="marker-text">{formatDate(photo.takenAt)}</span></p>
          </div>

          <div>
            <p class="text-sm text-black/50"><span class="marker-text">Archived</span></p>
            <p class="mt-1 leading-6"><span class="marker-text">{formatDate(photo.createdAt)}</span></p>
          </div>

          {#if photo.lat !== null && photo.lng !== null && !(photo.lat === 0 && photo.lng === 0)}
            <div>
              <p class="text-sm text-black/50"><span class="marker-text">Coordinates</span></p>
              <p class="mt-1 leading-6">
                <span class="marker-text">{formatCoordinate(photo.lat)}, {formatCoordinate(photo.lng)}</span>
              </p>
            </div>
          {/if}
        </div>

        {#if photo.description}
          <div class="-t -black pt-4">
            <p class="text-sm text-black/50"><span class="marker-text">Notes</span></p>
            <p class="mt-2 leading-7 text-black/75"><span class="marker-text">{photo.description}</span></p>
          </div>
        {/if}
      </div>
    </aside>
  </section>
</main>
