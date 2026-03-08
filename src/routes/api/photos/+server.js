import { json } from '@sveltejs/kit';
import { getSeatableStatus, listSeatablePhotos, saveSeatablePhoto } from '$lib/server/seatable-store';

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
    return json({ error: 'Errore lettura archivio' }, { status: 500 });
  }
}

export async function POST({ request }) {
  try {
    const seatable = getSeatableStatus();
    if (!seatable.configured) {
      return json({ error: 'Archivio non configurato' }, { status: 503 });
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
