<script>
  import * as exifr from "exifr";
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

  const backWords = createRevealSequence('back');


  const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
  const TARGET_UPLOAD_BYTES = 2 * 1024 * 1024;
  const OPTIMIZE_TRIGGER_BYTES = 2 * 1024 * 1024;
  const MAX_DIMENSION = 2200;
  const MIN_LONG_SIDE = 1400;

  let loading = false;
  let error = "";
  let success = "";
  let optimizationNote = "";
  let uploadFile = null;
  let originalUploadFile = null;
  let fileInput;
  let cameraFileInput;
  let locationSource = "";
  let exifDebug = "";
  let formState = {
    description: "",
    lat: "",
    lng: "",
    takenAt: "",
  };

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
      _raw: parsed,
    };
  }

  async function applyExif(file) {
    try {
      const exif = await readExifMetadata(file);

      const hasGps = Number.isFinite(exif?.latitude) && Number.isFinite(exif?.longitude);
      const hasDate = !!exif?.takenAt;
      exifDebug = exif._raw
        ? `EXIF found — GPS: ${hasGps ? `${exif.latitude?.toFixed(4)}, ${exif.longitude?.toFixed(4)}` : "none"} — Date: ${hasDate ? "yes" : "no"}`
        : "No EXIF data found in this file";

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
    } catch (e) {
      exifDebug = `EXIF error: ${e?.message || e}`;
    }
  }

  async function onFileChange(event) {
    const input = event.currentTarget;
    const [file] = input.files || [];

    if (!file) {
      uploadFile = null;
      originalUploadFile = null;
      optimizationNote = "";
      return;
    }

    originalUploadFile = file;

    if (!formState.takenAt && file.lastModified) {
      formState.takenAt = toLocalDatetimeValue(file.lastModified);
    }

    await applyExif(file);
    const optimized = await optimizeForUpload(file);
    uploadFile = optimized.file;
    optimizationNote = optimized.note;
  }

  async function optimizeForUpload(file) {
    if (!file.type.startsWith("image/") || file.type === "image/gif") {
      return { file, note: "" };
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
        return { file, note: "" };
      }

      if (originalMaxSide > MAX_DIMENSION) {
        const ratio = MAX_DIMENSION / originalMaxSide;
        width = Math.max(1, Math.round(width * ratio));
        height = Math.max(1, Math.round(height * ratio));
      }

      let quality = file.type === "image/webp" ? 0.82 : 0.84;
      let blob = null;
      let attempts = 0;
      let outputType = file.type === "image/webp" ? "image/webp" : "image/jpeg";
      let convertedToJpeg =
        outputType === "image/jpeg" && file.type !== "image/jpeg";

      while (attempts < 12) {
        attempts += 1;

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          bitmap.close();
          return { file, note: "" };
        }
        ctx.drawImage(bitmap, 0, 0, width, height);

        blob = await canvasToBlob(canvas, outputType, quality);
        if (blob && blob.size <= TARGET_UPLOAD_BYTES) {
          break;
        }

        if (quality > 0.66) {
          quality = Math.max(0.66, quality - 0.05);
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
          convertedToJpeg = file.type !== "image/jpeg";
          quality = 0.8;
        }
      }

      bitmap.close();

      if (!blob) {
        return { file, note: "" };
      }

      if (blob.size > MAX_UPLOAD_BYTES) {
        return {
          file,
          note: `Image is ${Math.round((file.size / (1024 * 1024)) * 10) / 10}MB and could not be reduced enough automatically`,
        };
      }

      const extension = outputType === "image/webp" ? "webp" : "jpg";
      const optimized = new File(
        [blob],
        `${file.name.replace(/\.[^.]+$/, "") || "upload"}.${extension}`,
        { type: outputType, lastModified: Date.now() },
      );

      if (optimized.size >= file.size && file.size <= MAX_UPLOAD_BYTES) {
        return { file, note: "" };
      }

      const beforeMb = Math.round((file.size / (1024 * 1024)) * 10) / 10;
      const afterMb = Math.round((optimized.size / (1024 * 1024)) * 10) / 10;
      const resized = width !== originalWidth || height !== originalHeight;
      const resizeNote = resized
        ? `, ${originalWidth}x${originalHeight} -> ${width}x${height}`
        : "";
      const conversionNote = convertedToJpeg ? ", converted to JPEG" : "";
      return {
        file: optimized,
        note: `Optimized ${beforeMb}MB -> ${afterMb}MB${resizeNote}${conversionNote}`,
      };
    } catch {
      return { file, note: "" };
    }
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), type, quality);
    });
  }

  async function useBrowserLocation() {
    error = "";

    if (!navigator.geolocation) {
      error = "Geolocation not supported by this browser.";
      return;
    }

    if (navigator.permissions) {
      try {
        const status = await navigator.permissions.query({ name: "geolocation" });
        if (status.state === "denied") {
          error = "Location access is blocked. Go to your phone Settings → Apps → Chrome → Permissions → Location → Allow.";
          return;
        }
      } catch {
        // permissions API not supported, proceed anyway
      }
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        formState.lat = String(position.coords.latitude);
        formState.lng = String(position.coords.longitude);
        locationSource = "device";
        error = "";
      },
      (err) => {
        locationSource = "";
        if (err.code === 1) {
          error = "Location denied. Go to phone Settings → Apps → Chrome → Permissions → Location → Allow.";
        } else if (err.code === 3) {
          error = "Location timed out. Try again or enter coordinates manually.";
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
          "Image is larger than 10MB. Use a smaller photo or compress it first.",
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
      optimizationNote = "";
      locationSource = "";
      exifDebug = "";
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
        <span class="marker-word" style={`--word-order:${item.order};--marker-sequence-delay:0ms;`}>{item.word}</span>{index < backWords.length - 1 ? ' ' : ''}
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
        the map and won't be published.</span
      >
    </p>
    <p>
      <span class="marker-text"
        >If your photo doesn't have GPS metadata, use the "Use current location"
        button or enter coordinates manually. You can find coordinates by
        right-clicking any location on Google Maps.</span
      >
    </p>
    <p>
      <span class="marker-text"
        >Use the description to add any context: street name, neighbourhood,
        what was written, when it was removed.</span
      >
    </p>
  </div>

  <form class="space-y-4" on:submit={submit}>
    <div class="block text-sm">
      <span class="marker-text">Photo</span>
      <div class="mt-1 grid grid-cols-2 gap-2">
        <label class="cursor-pointer border border-black px-3 py-2 text-center text-sm">
          <span class="marker-text">Choose from gallery</span>
          <input
            name="photo"
            type="file"
            accept="image/*"
            bind:this={fileInput}
            on:change={onFileChange}
            class="sr-only"
          />
        </label>
        <label class="cursor-pointer border border-black px-3 py-2 text-center text-sm">
          <span class="marker-text">Take a photo</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            bind:this={cameraFileInput}
            on:change={onFileChange}
            class="sr-only"
          />
        </label>
      </div>
      {#if uploadFile}
        <p class="mt-1 text-xs text-black/50"><span class="marker-text">Photo selected</span></p>
      {/if}
    </div>
    {#if exifDebug}
      <p class="text-xs text-black/40"><span class="marker-text">{exifDebug}</span></p>
    {/if}
    {#if optimizationNote}
      <p class="text-sm"><span class="marker-text">{optimizationNote}</span></p>
    {/if}

    <label class="block text-sm">
      <span class="marker-text">Description</span>
      <textarea
        name="description"
        bind:value={formState.description}
        rows="4"
        class="mt-1 w-full border border-black px-3 py-2"
      ></textarea>
    </label>

    <div class="grid gap-4 sm:grid-cols-2">
      <label class="block text-sm">
        <span class="marker-text">Taken at</span>
        <input
          type="datetime-local"
          name="takenAt"
          bind:value={formState.takenAt}
          class="mt-1 w-full border border-black px-3 py-2"
        />
      </label>

      <div class="pt-6 flex items-center gap-3">
        <button
          type="button"
          on:click={useBrowserLocation}
          class="border border-black px-3 py-2 text-sm"
          ><span class="marker-text">Use current location</span></button
        >
        {#if locationSource === "device"}
          <span class="text-xs text-black/50"><span class="marker-text">from device</span></span>
        {:else if locationSource === "photo"}
          <span class="text-xs text-black/50"><span class="marker-text">from photo</span></span>
        {/if}
      </div>

      <label class="block text-sm">
        <span class="marker-text">Latitude</span>
        <input
          type="number"
          step="any"
          min="-90"
          max="90"
          name="lat"
          bind:value={formState.lat}
          placeholder="e.g. 52.5200"
          class="mt-1 w-full border border-black px-3 py-2"
        />
      </label>

      <label class="block text-sm">
        <span class="marker-text">Longitude</span>
        <input
          type="number"
          step="any"
          min="-180"
          max="180"
          name="lng"
          bind:value={formState.lng}
          placeholder="e.g. 13.4050"
          class="mt-1 w-full border border-black px-3 py-2"
        />
      </label>

      {#if (!formState.lat || !formState.lng) && uploadFile}
        <p class="col-span-2 text-sm text-black/50">
          <span class="marker-text">No location found — allow location access when prompted, or enter coordinates manually.</span>
        </p>
      {/if}
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
