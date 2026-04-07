<script>
  import * as exifr from "exifr";
  import LocationPicker from "$lib/components/LocationPicker.svelte";
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

  const backWords = createRevealSequence("back");

  const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
  const TARGET_UPLOAD_BYTES = 500 * 1024;
  const OPTIMIZE_TRIGGER_BYTES = 200 * 1024;
  const MAX_DIMENSION = 1600;
  const MIN_LONG_SIDE = 900;

  let loading = $state(false);
  let error = $state("");
  let success = $state("");
  let uploadFile = $state(null);
  let originalUploadFile = $state(null);
  let fileInput = $state();
  let cameraFileInput = $state();
  let locationSource = $state("");
  let locationMode = $state("");
  let formState = $state({
    description: "",
    lat: "",
    lng: "",
    takenAt: "",
  });

  function toLocalDatetimeValue(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const pad = (num) => String(num).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  async function readExifMetadata(file) {
    const buffer = await file.arrayBuffer();
    const parsed = await exifr.parse(buffer, {
      gps: true,
      exif: true,
      ifd0: true,
      reviveValues: true,
      translateKeys: true,
      translateValues: true,
      mergeOutput: true,
    });
    return {
      takenAt: parsed?.DateTimeOriginal || parsed?.CreateDate || null,
      latitude: parsed?.latitude,
      longitude: parsed?.longitude,
    };
  }

  async function applyExif(file) {
    try {
      const exif = await readExifMetadata(file);

      if (!formState.takenAt && exif?.takenAt) {
        formState.takenAt = toLocalDatetimeValue(exif.takenAt);
      }

      if (!formState.lat && Number.isFinite(exif?.latitude)) {
        formState.lat = String(exif.latitude);
        locationSource = "photo";
      }

      if (!formState.lng && Number.isFinite(exif?.longitude)) {
        formState.lng = String(exif.longitude);
      }
    } catch {
      // ignore missing EXIF
    }
  }

  async function onFileChange(event) {
    const input = event.currentTarget;
    const [file] = input.files || [];

    if (!file) {
      uploadFile = null;
      originalUploadFile = null;
      return;
    }

    originalUploadFile = file;

    if (!formState.takenAt && file.lastModified) {
      formState.takenAt = toLocalDatetimeValue(file.lastModified);
    }

    await applyExif(file);
    uploadFile = await optimizeForUpload(file);
  }

  async function optimizeForUpload(file) {
    if (!file.type.startsWith("image/") || file.type === "image/gif") {
      return file;
    }

    try {
      const bitmap = await createImageBitmap(file);
      const originalWidth = bitmap.width;
      const originalHeight = bitmap.height;
      let width = originalWidth;
      let height = originalHeight;

      const originalMaxSide = Math.max(width, height);
      const shouldOptimize =
        file.size > OPTIMIZE_TRIGGER_BYTES || originalMaxSide > MAX_DIMENSION;

      if (!shouldOptimize) {
        bitmap.close();
        return file;
      }

      if (originalMaxSide > MAX_DIMENSION) {
        const ratio = MAX_DIMENSION / originalMaxSide;
        width = Math.max(1, Math.round(width * ratio));
        height = Math.max(1, Math.round(height * ratio));
      }

      let quality = file.type === "image/webp" ? 0.72 : 0.74;
      let blob = null;
      let attempts = 0;
      let outputType = file.type === "image/webp" ? "image/webp" : "image/jpeg";

      while (attempts < 12) {
        attempts += 1;

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          bitmap.close();
          return file;
        }
        ctx.drawImage(bitmap, 0, 0, width, height);

        blob = await canvasToBlob(canvas, outputType, quality);
        if (blob && blob.size <= TARGET_UPLOAD_BYTES) {
          break;
        }

        if (quality > 0.45) {
          quality = Math.max(0.45, quality - 0.06);
        } else if (Math.max(width, height) > MIN_LONG_SIDE) {
          width = Math.max(1, Math.round(width * 0.86));
          height = Math.max(1, Math.round(height * 0.86));
          quality = Math.min(0.8, quality + 0.04);
        } else if (blob && blob.size <= MAX_UPLOAD_BYTES) {
          break;
        }

        if (
          attempts >= 4 &&
          outputType !== "image/jpeg" &&
          (!blob || blob.size > MAX_UPLOAD_BYTES)
        ) {
          outputType = "image/jpeg";
          quality = 0.8;
        }
      }

      bitmap.close();

      if (!blob || blob.size > MAX_UPLOAD_BYTES) {
        return file;
      }

      const extension = outputType === "image/webp" ? "webp" : "jpg";
      const optimized = new File(
        [blob],
        `${file.name.replace(/\.[^.]+$/, "") || "upload"}.${extension}`,
        { type: outputType, lastModified: Date.now() },
      );

      return optimized.size < file.size ? optimized : file;
    } catch {
      return file;
    }
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), type, quality);
    });
  }

  function useBrowserLocation() {
    error = "";

    if (!navigator.geolocation) {
      error = "Geolocation not supported by this browser.";
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        formState.lat = String(position.coords.latitude);
        formState.lng = String(position.coords.longitude);
        locationSource = "device";
        locationMode = "";
        error = "";
      },
      (err) => {
        locationSource = "";
        if (err.code === 1) {
          error =
            "Location denied. Go to phone Settings → Apps → Chrome → Permissions → Location → Allow.";
        } else if (err.code === 3) {
          error =
            "Location timed out. Try again or enter coordinates manually.";
        } else {
          error = "Could not get location. Enter coordinates manually.";
        }
      },
      { enableHighAccuracy: false, timeout: 30000, maximumAge: 60000 },
    );
  }

  async function submit(event) {
    event.preventDefault();
    loading = true;
    error = "";
    success = "";

    try {
      if (!uploadFile) {
        throw new Error("Select a photo first");
      }
      if (uploadFile.size > MAX_UPLOAD_BYTES) {
        throw new Error(
          "Image is larger than 4MB. Use a smaller photo or compress it first.",
        );
      }

      const formData = new FormData();
      formData.set("photo", uploadFile);
      if (originalUploadFile && originalUploadFile !== uploadFile) {
        formData.set("photoMetadataSource", originalUploadFile);
      }
      formData.set("description", formState.description);
      formData.set("takenAt", formState.takenAt);
      formData.set("lat", formState.lat);
      formData.set("lng", formState.lng);
      const response = await fetch("/api/photos", {
        method: "POST",
        body: formData,
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Upload failed");
      }

      success = "Saved.";
      formState = { description: "", lat: "", lng: "", takenAt: "" };
      uploadFile = null;
      originalUploadFile = null;
      locationSource = "";
      locationMode = "";
      if (fileInput) fileInput.value = "";
      if (cameraFileInput) cameraFileInput.value = "";
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Upload | Whitewashed</title>
</svelte:head>

<main class="mx-auto max-w-2xl px-4 py-8 sm:px-6">
  <a href="/" class="mb-6 block text-xl">
    <span class="marker-text">
      {#each backWords as item, index}
        <span
          class="marker-word"
          style={`--word-order:${item.order};--marker-sequence-delay:0ms;`}
          >{item.word}</span
        >{index < backWords.length - 1 ? " " : ""}
      {/each}
    </span>
  </a>

  <div class="mb-6 space-y-1 text-xl text-black/60">
    <p>
      <span class="marker-text"
        >Submit photos of pro-Palestinian graffiti and its erasure across
        Berlin.</span
      >
    </p>
    <p>
      <span class="marker-text"
        >Location coordinates are required. Photos without them won't appear on
        the map and won't be published. If your photo doesn't have GPS metadata,
        use the "Use current location" button or enter coordinates manually.
      </span>
    </p>
    <p>
      <span class="marker-text"
        >Use the description to add any context: street name, neighbourhood,
        what was written, when it was removed.</span
      >
    </p>
    <p><span class="marker-text">Thank you.</span></p>
  </div>

  <form class="space-y-4" onsubmit={submit}>
    <div class="block text-sm">
      <span class="marker-text">Photo</span>
      <div class="mt-1 grid grid-cols-2 gap-2">
        <label
          class="cursor-pointer border border-black px-3 py-2 text-center text-sm"
        >
          <span class="marker-text">Choose from gallery</span>
          <input
            name="photo"
            type="file"
            accept="image/*"
            bind:this={fileInput}
            onchange={onFileChange}
            class="sr-only"
          />
        </label>
        <label
          class="cursor-pointer border border-black px-3 py-2 text-center text-sm"
        >
          <span class="marker-text">Take a photo</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            bind:this={cameraFileInput}
            onchange={onFileChange}
            class="sr-only"
          />
        </label>
      </div>
    </div>

    <label class="block text-sm">
      <span class="marker-text">Description</span>
      <textarea
        name="description"
        bind:value={formState.description}
        rows="4"
        class="mt-1 w-full border border-black px-3 py-2"
      ></textarea>
    </label>

    <label class="block text-sm">
      <span class="marker-text">Taken at</span>
      <input
        type="datetime-local"
        name="takenAt"
        bind:value={formState.takenAt}
        class="mt-1 w-full border border-black px-3 py-2"
      />
    </label>

    <div class="block text-sm">
      <span class="marker-text">Location</span>
      <div class="mt-1 flex flex-wrap gap-2">
        <button
          type="button"
          onclick={() => { useBrowserLocation(); locationMode = ""; }}
          class="border border-black px-3 py-2 text-sm"
        ><span class="marker-text">Use current location</span></button>
        <button
          type="button"
          onclick={() => { locationMode = locationMode === "map" ? "" : "map"; }}
          class={`border px-3 py-2 text-sm ${locationMode === "map" ? "border-black bg-black text-white" : "border-black"}`}
        ><span class="marker-text">Pick on map</span></button>
      </div>

      {#if locationMode === "map"}
        <div class="mt-2">
          <LocationPicker bind:lat={formState.lat} bind:lng={formState.lng} />
        </div>
      {/if}

      {#if formState.lat && formState.lng}
        <p class="mt-2 text-xs text-black/50">
          <span class="marker-text">
            {#if locationSource === "photo"}from photo — {/if}
            {#if locationSource === "device"}from device — {/if}
            {Number(formState.lat).toFixed(5)}, {Number(formState.lng).toFixed(5)}
          </span>
        </p>
      {:else if uploadFile}
        <p class="mt-2 text-xs text-black/50">
          <span class="marker-text">No location found in photo — use current location or pick on map.</span>
        </p>
      {/if}

      <input type="hidden" name="lat" value={formState.lat} />
      <input type="hidden" name="lng" value={formState.lng} />
    </div>

    <button
      type="submit"
      disabled={loading}
      class="border border-black px-4 py-2 text-sm"
    >
      <span class="marker-text">{loading ? "Saving..." : "Save"}</span>
    </button>

    {#if error}
      <p class="text-sm"><span class="marker-text">{error}</span></p>
    {/if}

    {#if success}
      <p class="text-sm"><span class="marker-text">{success}</span></p>
    {/if}
  </form>
</main>
