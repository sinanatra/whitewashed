<script>
  const encodedEmail = "Y2lhb0BnaWFjb21vLndlYnNpdGU=";

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

  function decodeBase64(value) {
    if (typeof atob === "function") {
      return atob(value);
    }

    return Buffer.from(value, "base64").toString("utf8");
  }

  const submissionEmail = decodeBase64(encodedEmail);
  const promptWords = createRevealSequence("Have an image to add to the archive?");
  const emailWords = createRevealSequence(`Submit at ${submissionEmail}`);
</script>

<footer class="border-t border-black bg-black px-4 py-6 text-white sm:px-6 lg:px-6 min-h-60">
  <div class="mx-auto flex max-w-[1800px] flex-col gap-2 text-sm text-white/80 sm:flex-row sm:items-center sm:justify-between">
    <p>
      <span class="marker-text">
        {#each promptWords as item, index}
          <span
            class="marker-word"
            style={`--word-order:${item.order};--marker-sequence-delay:0ms;`}
            >{item.word}</span
          >{index < promptWords.length - 1 ? ' ' : ''}
        {/each}
      </span>
    </p>
    <a
      href={`mailto:${submissionEmail}`}
      class="text-white underline underline-offset-4"
    >
      <span class="marker-text">
        {#each emailWords as item, index}
          <span
            class="marker-word"
            style={`--word-order:${item.order};--marker-sequence-delay:180ms;`}
            >{item.word}</span
          >{index < emailWords.length - 1 ? ' ' : ''}
        {/each}
      </span>
    </a>
  </div>
</footer>
