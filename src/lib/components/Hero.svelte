<script>
  function createRevealSequence(text) {
    const words = text.trim().split(/\s+/);
    const ranked = words
      .map((word, index) => {
        let hash = 2166136261;
        const source = `${word}-${index}`;

        for (let i = 0; i < source.length; i += 1) {
          hash ^= source.charCodeAt(i);
          hash = Math.imul(hash, 16777619);
        }

        return { word, index, hash: hash >>> 0 };
      })
      .sort((a, b) => a.hash - b.hash)
      .map((entry, order) => ({ ...entry, order }));

    return words.map((word, index) => {
      const match = ranked.find((entry) => entry.index === index);
      return { word, order: match ? match.order : index };
    });
  }

  const headlineWords = createRevealSequence(
    "A collective archive documenting pro-Palestinian graffiti and the censorship of it across Berlin.",
  );
  const descriptionWords = createRevealSequence(
    "Tracking where graffiti appears and disappears, mapping the erasure of pro-Palestinian expression through photographs and locations across the city.",
  );
  const submitWords = createRevealSequence("submit");
</script>

<div class="absolute right-0 top-0 z-10">
  <a
    href="/upload"
    class="inline-flex items-center justify-center text-xl text-white transition hover:bg-neutral-900"
  >
    <span class="marker-text">
      {#each submitWords as item, index}
        <span
          class="marker-word"
          style={`--word-order:${item.order};--marker-sequence-delay:120ms;`}
          >{item.word}</span
        >{index < submitWords.length - 1 ? " " : ""}
      {/each}
    </span>
  </a>
</div>
<section class="relative bg-black text-white">
  <div class="pointer-events-none absolute right-10 top-10">
    <svg width="215" height="164" viewBox="0 0 430 328" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 313.377C10.3847 313.377 45.2239 313.509 108.102 315.121C188.829 317.191 214.973 320.766 234.129 311.875C243.633 307.464 256.225 293.941 274.857 271.893C296.748 245.99 315.194 203.889 334.748 159.374C350.176 124.252 361.182 94.2062 371.814 70.9569C384.197 43.8808 393.392 26.5115 394.214 22.1339C396.198 11.5652 369.301 20.668 356.018 24.4974C349.322 26.4279 342.578 26.0259 339.494 26.2399C329.668 26.9216 368.184 19.0475 380.366 13.3772C385.232 11.1121 390.061 8.92042 394.854 10.5482C402.577 25.9275 408.096 35.8744 411.403 41.1702C413.473 44.1811 416.338 47.8489 419.411 53.6074" stroke="white" stroke-width="20" stroke-linecap="round"/>
    </svg>
  </div>
  <div
    class="mx-auto flex max-w-7xl items-end px-4 py-10 sm:px-6 lg:px-8"
  >
    <div class="max-w-8xl pb-2">
      <h1 class="max-w-4xl text-4xl tracking-tight sm:text-5xl lg:text-6xl">
        <span class="marker-text">
          {#each headlineWords as item, index}
            <span
              class="marker-word"
              style={`--word-order:${item.order};--marker-sequence-delay:0ms;`}
              >{item.word}</span
            >{index < headlineWords.length - 1 ? " " : ""}
          {/each}
        </span>
      </h1>
      <p class="mt-5 max-w-xl text-sm leading-6 sm:text-base">
        <span class="marker-text">
          {#each descriptionWords as item, index}
            <span
              class="marker-word"
              style={`--word-order:${item.order};--marker-sequence-delay:240ms;`}
              >{item.word}</span
            >{index < descriptionWords.length - 1 ? " " : ""}
          {/each}
        </span>
      </p>
    </div>
  </div>
</section>
