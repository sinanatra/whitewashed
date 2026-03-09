import { timingSafeEqual } from 'node:crypto';
import { env as privateEnv } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import { getSeatableStatus, listSeatablePhotos, saveSeatablePhoto } from '$lib/server/seatable-store';

const SAFE_UPLOAD_ERRORS = new Set([
  'Latitude and longitude must be provided together',
  'Invalid coordinates',
  'Missing file',
  'File too large (max 10MB)',
  'Upload password is not configured',
  'Invalid upload password'
]);

function getUploadPassword() {
  return String(privateEnv.UPLOAD_PASSWORD || process.env.UPLOAD_PASSWORD || '').trim();
}

function passwordsMatch(expectedPassword, providedPassword) {
  const expected = Buffer.from(expectedPassword, 'utf8');
  const provided = Buffer.from(providedPassword, 'utf8');

  if (expected.length !== provided.length) {
    return false;
  }

  return timingSafeEqual(expected, provided);
}

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
    const seatable = getSeatableStatus();
    if (!seatable.configured) {
      return json({ error: 'Config issue' }, { status: 503 });
    }

    const formData = await request.formData();
    const expectedPassword = getUploadPassword();
    if (!expectedPassword) {
      throw new Error('Upload password is not configured');
    }

    const providedPassword = String(formData.get('password') || '').trim();
    if (!providedPassword || !passwordsMatch(expectedPassword, providedPassword)) {
      throw new Error('Invalid upload password');
    }

    formData.delete('password');
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
