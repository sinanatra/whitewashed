<script>
  import * as exifr from 'exifr';

  const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
  const OPTIMIZE_TRIGGER_BYTES = 6 * 1024 * 1024;
  const MAX_DIMENSION = 2800;
  const MIN_DIMENSION = 1200;

  let loading = false;
  let error = '';
  let success = '';
  let optimizationNote = '';
  let uploadFile = null;
  let fileInput;

  let formState = {
    title: '',
    description: '',
    lat: '',
    lng: '',
    takenAt: ''
  };

  function toLocalDatetimeValue(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }

    const pad = (num) => String(num).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function titleFromFileName(fileName) {
    const clean = String(fileName || '')
      .replace(/\.[^.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .trim();

    return clean || 'Untitled';
  }

  async function applyExif(file) {
    try {
      const exif = await exifr.parse(file, {
        gps: true,
        tiff: true,
        exif: true,
        pick: ['DateTimeOriginal', 'CreateDate', 'latitude', 'longitude']
      });

      if (!formState.takenAt && (exif?.DateTimeOriginal || exif?.CreateDate)) {
        formState.takenAt = toLocalDatetimeValue(exif.DateTimeOriginal || exif.CreateDate);
      }

      if (!formState.lat && Number.isFinite(exif?.latitude)) {
        formState.lat = String(exif.latitude);
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
      optimizationNote = '';
      return;
    }

    if (!formState.title) {
      formState.title = titleFromFileName(file.name);
    }

    if (!formState.takenAt && file.lastModified) {
      formState.takenAt = toLocalDatetimeValue(file.lastModified);
    }

    await applyExif(file);
    const optimized = await optimizeForUpload(file);
    uploadFile = optimized.file;
    optimizationNote = optimized.note;
  }

  async function optimizeForUpload(file) {
    if (!file.type.startsWith('image/') || file.type === 'image/gif') {
      return { file, note: '' };
    }

    if (file.size <= OPTIMIZE_TRIGGER_BYTES) {
      return { file, note: '' };
    }

    try {
      const bitmap = await createImageBitmap(file);
      let width = bitmap.width;
      let height = bitmap.height;

      const maxSide = Math.max(width, height);
      if (maxSide > MAX_DIMENSION) {
        const ratio = MAX_DIMENSION / maxSide;
        width = Math.max(1, Math.round(width * ratio));
        height = Math.max(1, Math.round(height * ratio));
      }

      let quality = 0.9;
      let blob = null;
      let attempts = 0;
      let outputType = file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
      let convertedToJpeg = outputType === 'image/jpeg' && file.type !== 'image/jpeg';

      while (attempts < 12) {
        attempts += 1;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          bitmap.close();
          return { file, note: '' };
        }
        ctx.drawImage(bitmap, 0, 0, width, height);

        blob = await canvasToBlob(canvas, outputType, quality);
        if (blob && blob.size <= MAX_UPLOAD_BYTES) {
          break;
        }

        if (quality > 0.68) {
          quality = Math.max(0.68, quality - 0.06);
        } else {
          width = Math.max(MIN_DIMENSION, Math.round(width * 0.88));
          height = Math.max(MIN_DIMENSION, Math.round(height * 0.88));
        }

        if (
          attempts >= 6 &&
          outputType !== 'image/jpeg' &&
          (!blob || blob.size > MAX_UPLOAD_BYTES)
        ) {
          outputType = 'image/jpeg';
          convertedToJpeg = file.type !== 'image/jpeg';
          quality = 0.86;
        }
      }

      bitmap.close();

      if (!blob) {
        return { file, note: '' };
      }

      if (blob.size > MAX_UPLOAD_BYTES) {
        return {
          file,
          note: `Image is ${Math.round(file.size / (1024 * 1024) * 10) / 10}MB and could not be reduced enough automatically`
        };
      }

      const extension = outputType === 'image/webp' ? 'webp' : 'jpg';
      const optimized = new File(
        [blob],
        `${file.name.replace(/\.[^.]+$/, '') || 'upload'}.${extension}`,
        { type: outputType, lastModified: Date.now() }
      );

      if (optimized.size >= file.size && file.size <= MAX_UPLOAD_BYTES) {
        return { file, note: '' };
      }

      const beforeMb = Math.round((file.size / (1024 * 1024)) * 10) / 10;
      const afterMb = Math.round((optimized.size / (1024 * 1024)) * 10) / 10;
      const conversionNote = convertedToJpeg ? ', converted to JPEG' : '';
      return { file: optimized, note: `Optimized ${beforeMb}MB -> ${afterMb}MB${conversionNote}` };
    } catch {
      return { file, note: '' };
    }
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), type, quality);
    });
  }

  function useBrowserLocation() {
    if (!navigator.geolocation) {
      error = 'Geolocation not supported';
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        formState.lat = String(position.coords.latitude);
        formState.lng = String(position.coords.longitude);
      },
      () => {
        error = 'Unable to read current position';
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function submit(event) {
    event.preventDefault();
    loading = true;
    error = '';
    success = '';

    try {
      if (!uploadFile) {
        throw new Error('Select a photo first');
      }
      if (uploadFile.size > MAX_UPLOAD_BYTES) {
        throw new Error('Image is larger than 10MB. Use a smaller photo or compress it first.');
      }

      const formData = new FormData();
      formData.set('photo', uploadFile);
      formData.set('title', formState.title);
      formData.set('description', formState.description);
      formData.set('takenAt', formState.takenAt);
      formData.set('lat', formState.lat);
      formData.set('lng', formState.lng);

      const response = await fetch('/api/photos', {
        method: 'POST',
        body: formData
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Upload failed');
      }

      success = 'Saved.';
      formState = { title: '', description: '', lat: '', lng: '', takenAt: '' };
      uploadFile = null;
      optimizationNote = '';
      if (fileInput) {
        fileInput.value = '';
      }
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
  <header class="mb-8 flex items-end justify-between border-b border-black pb-3">
    <h1 class="text-2xl font-semibold tracking-tight"><span class="marker-text">Upload</span></h1>
    <a href="/" class="text-sm underline underline-offset-4"><span class="marker-text">Back</span></a>
  </header>

  <form class="space-y-4" on:submit={submit}>
    <label class="block text-sm">
      <span class="marker-text">Photo</span>
      <input
        name="photo"
        type="file"
        accept="image/*"
        bind:this={fileInput}
        on:change={onFileChange}
        class="mt-1 w-full border border-black px-3 py-2"
        required
      />
    </label>
    {#if optimizationNote}
      <p class="text-sm"><span class="marker-text">{optimizationNote}</span></p>
    {/if}

    <label class="block text-sm">
      <span class="marker-text">Title</span>
      <input name="title" bind:value={formState.title} class="mt-1 w-full border border-black px-3 py-2" required />
    </label>

    <label class="block text-sm">
      <span class="marker-text">Description</span>
      <textarea name="description" bind:value={formState.description} rows="4" class="mt-1 w-full border border-black px-3 py-2"></textarea>
    </label>

    <div class="grid gap-4 sm:grid-cols-2">
      <label class="block text-sm">
        <span class="marker-text">Taken at</span>
        <input type="datetime-local" name="takenAt" bind:value={formState.takenAt} class="mt-1 w-full border border-black px-3 py-2" />
      </label>

      <div class="pt-6">
        <button type="button" on:click={useBrowserLocation} class="border border-black px-3 py-2 text-sm"><span class="marker-text">Use current location</span></button>
      </div>

      <label class="block text-sm">
        <span class="marker-text">Latitude</span>
        <input type="number" step="any" min="-90" max="90" name="lat" bind:value={formState.lat} class="mt-1 w-full border border-black px-3 py-2" />
      </label>

      <label class="block text-sm">
        <span class="marker-text">Longitude</span>
        <input type="number" step="any" min="-180" max="180" name="lng" bind:value={formState.lng} class="mt-1 w-full border border-black px-3 py-2" />
      </label>
    </div>

    <button type="submit" disabled={loading} class="border border-black px-4 py-2 text-sm">
      <span class="marker-text">{loading ? 'Saving...' : 'Save'}</span>
    </button>

    {#if error}
      <p class="text-sm"><span class="marker-text">{error}</span></p>
    {/if}

    {#if success}
      <p class="text-sm"><span class="marker-text">{success}</span></p>
    {/if}
  </form>
</main>
