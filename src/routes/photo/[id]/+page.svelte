<script>
  export let data;

  const photo = data.photo;

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
  <div class="mb-4 flex items-center justify-between border-b border-black pb-3">
    <a href="/" class="text-[11px] uppercase tracking-[0.22em] underline underline-offset-4">Archive</a>
    <p class="text-[11px] uppercase tracking-[0.22em] text-black/55">Image</p>
  </div>

  <div class="flex min-h-[calc(100vh-6rem)] items-center justify-center">
    {#if photo.imageUrl}
      <img
        src={photo.imageUrl}
        alt={photo.title || 'Archive image'}
        class="max-h-[88vh] w-auto max-w-full object-contain"
        on:error={tryDirectSource}
      />
    {:else}
      <div class="border border-black px-6 py-10 text-sm">Image unavailable</div>
    {/if}
  </div>
</main>
