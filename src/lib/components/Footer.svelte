<script>
  import { submissionFormUrl } from "$lib/constants/submission.js";

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

  const promptWords = createRevealSequence(
    "Have an image to add to the archive?",
  );
  const formWords = createRevealSequence("Submit through this form");
</script>

<footer
  class="-t -black bg-black px-4 py-6 text-white sm:px-6 lg:px-6 min-h-60"
>
  <div
    class="mx-auto max-w-[1800px] text-xl text-white/80 sm:flex-row sm:items-center sm:justify-between"
  >
    <p>
      <span class="marker-text">
        {#each promptWords as item, index}
          <span
            class="marker-word"
            style={`--word-order:${item.order};--marker-sequence-delay:0ms;`}
            >{item.word}</span
          >{index < promptWords.length - 1 ? " " : ""}
        {/each}
      </span>
    </p>
    <a
      href={submissionFormUrl}
      target="_blank"
      rel="noreferrer"
      class="text-white underline underline-offset-4"
    >
      <span class="marker-text">
        {#each formWords as item, index}
          <span
            class="marker-word"
            style={`--word-order:${item.order};--marker-sequence-delay:180ms;`}
            >{item.word}</span
          >{index < formWords.length - 1 ? " " : ""}
        {/each}
      </span>
    </a>
  </div>
</footer>
