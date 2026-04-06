<script>
  let { photos = [], filteredPhotos = $bindable([]) } = $props();

  function photoDate(photo) {
    const raw = photo.takenAt || photo.createdAt;
    if (!raw) return null;
    const t = new Date(raw).getTime();
    return isNaN(t) ? null : t;
  }

  function formatDateLabel(ts) {
    return new Date(ts).toLocaleDateString("en-GB", {
      month: "short",
      year: "numeric",
    });
  }

  let sortedDates = $derived(
    photos.map(photoDate).filter(Boolean).sort((a, b) => a - b),
  );
  let minTs = $derived(sortedDates[0] ?? 0);
  let maxTs = $derived(sortedDates[sortedDates.length - 1] ?? 0);
  let hasRange = $derived(minTs !== maxTs && sortedDates.length > 0);

  let fromTs = $state(0);
  let toTs = $state(0);
  let ready = $state(false);

  $effect(() => {
    if (!ready && minTs && maxTs) {
      fromTs = minTs;
      toTs = maxTs;
      ready = true;
    }
  });

  $effect(() => {
    filteredPhotos =
      !ready || !hasRange
        ? photos
        : photos.filter((p) => {
            const t = photoDate(p);
            if (t === null) return true;
            return t >= fromTs && t <= toTs;
          });
  });

  let leftPct = $derived(hasRange ? ((fromTs - minTs) / (maxTs - minTs)) * 100 : 0);
  let rightPct = $derived(hasRange ? ((maxTs - toTs) / (maxTs - minTs)) * 100 : 0);
</script>

{#if hasRange && ready}
  <div class="bg-white z-10 flex items-center gap-4 px-4 py-4 text-xs text-neutral-500">
    <span class="w-20 tabular-nums">{formatDateLabel(fromTs)}</span>
    <div class="dual-range flex-1">
      <div class="track">
        <div class="fill" style="left:{leftPct}%;right:{rightPct}%"></div>
      </div>
      <input
        type="range"
        min={minTs}
        max={maxTs}
        bind:value={fromTs}
        oninput={() => { if (fromTs > toTs) toTs = fromTs; }}
      />
      <input
        type="range"
        min={minTs}
        max={maxTs}
        bind:value={toTs}
        oninput={() => { if (toTs < fromTs) fromTs = toTs; }}
      />
    </div>
    <span class="w-20 text-right tabular-nums">{formatDateLabel(toTs)}</span>
  </div>
{/if}

<style>
  .dual-range {
    position: relative;
    height: 20px;
  }
  .dual-range .track {
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    height: 1px;
    background: #e5e5e5;
    transform: translateY(-50%);
  }
  .dual-range .fill {
    position: absolute;
    height: 100%;
    background: black;
  }
  .dual-range input[type="range"] {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    background: transparent;
    pointer-events: none;
    -webkit-appearance: none;
    appearance: none;
    outline: none;
  }
  .dual-range input[type="range"]::-webkit-slider-runnable-track {
    background: transparent;
    height: 1px;
  }
  .dual-range input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    pointer-events: all;
    width: 14px;
    height: 14px;
    background: black;
    border-radius: 50%;
    cursor: pointer;
    margin-top: -6px;
  }
  .dual-range input[type="range"]::-moz-range-track {
    background: transparent;
  }
  .dual-range input[type="range"]::-moz-range-thumb {
    pointer-events: all;
    width: 14px;
    height: 14px;
    background: black;
    border-radius: 50%;
    border: none;
    cursor: pointer;
  }
</style>
