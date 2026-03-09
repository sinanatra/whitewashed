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
    "A visual archive of censorship in Berlin, documenting pro-Palestinian graffiti and whitewashed walls left as evidence of attempts to silence them.",
  );
  const descriptionWords = createRevealSequence(
    "Photographs, and locations document how public expression is erased, covered, and contested across the city.",
  );
</script>

<section
  class="relative isolate overflow-hidden -b -black bg-black text-white"
>
  <div class="group absolute inset-0">
    <img
      src="/hero.png"
      alt="Whitewashed cover"
      class="threshold-image-strong h-[450px] w-full object-cover"
      loading="eager"
    />
    <div class="absolute inset-0 bg-black/55"></div>
    <div
      class="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/0"
    ></div>
  </div>

  <div
    class="relative mx-auto flex min-h-[450px] max-w-7xl items-end px-4 py-10 sm:px-6 lg:px-8"
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
