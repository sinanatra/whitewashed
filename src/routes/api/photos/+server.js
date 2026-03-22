import { json } from '@sveltejs/kit';
import { getSeatableStatus, listSeatablePhotos, saveSeatablePhoto } from '$lib/server/seatable-store';

const uploadAttempts = new Map();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function isRateLimited(ip) {
  const now = Date.now();
  const attempts = (uploadAttempts.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (attempts.length >= RATE_LIMIT_MAX) return true;
  attempts.push(now);
  uploadAttempts.set(ip, attempts);
  return false;
}

const SAFE_UPLOAD_ERRORS = new Set([
  'Latitude and longitude must be provided together',
  'Invalid coordinates',
  'Missing file',
  'File too large (max 10MB)'
]);

function proxifyPhotoImageUrl(imageUrl) {
  const url = String(imageUrl || '').trim();
  if (!url || url.startsWith('data:')) {
    return url;
  }

  return `/api/photos/image?src=${encodeURIComponent(url)}`;
}

function logServerError(context, error) {
  console.error(`[api/photos] ${context}`, error);
}

export async function GET() {
  try {
    const seatable = getSeatableStatus();
    if (!seatable.configured) {
      return json({ error: 'Archivio non configurato' }, { status: 503 });
    }

    const photos = (await listSeatablePhotos()).map((photo) => ({
      ...photo,
      imageUrl: proxifyPhotoImageUrl(photo.imageUrl)
    }));
    return json({ photos, storage: 'seatable' });
  } catch (error) {
    logServerError('GET failed', error);
    return json({ error: 'Error Loading the archive' }, { status: 500 });
  }
}

export async function POST({ request }) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
    if (isRateLimited(ip)) {
      return json({ error: 'Too many uploads. Try again later.' }, { status: 429 });
    }

    const seatable = getSeatableStatus();
    if (!seatable.configured) {
      return json({ error: 'Config issue' }, { status: 503 });
    }

    const formData = await request.formData();
    const photo = await saveSeatablePhoto(formData);

    return json(
      {
        photo: {
          ...photo,
          imageUrl: proxifyPhotoImageUrl(photo.imageUrl)
        },
        storage: 'seatable'
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const isSafeValidationError = SAFE_UPLOAD_ERRORS.has(message);

    if (!isSafeValidationError) {
      logServerError('POST failed', error);
    }

    return json(
      { error: isSafeValidationError ? message : 'Errore salvataggio' },
      { status: isSafeValidationError ? 400 : 500 }
    );
  }
}
