import { json } from '@sveltejs/kit';
import { getSeatableStatus, listSeatablePhotos, saveSeatablePhoto } from '$lib/server/seatable-store';

function proxifyPhotoImageUrl(imageUrl) {
  const url = String(imageUrl || '').trim();
  if (!url || url.startsWith('data:')) {
    return url;
  }

  return `/api/photos/image?src=${encodeURIComponent(url)}`;
}

export async function GET() {
  try {
    const seatable = getSeatableStatus();
    if (!seatable.configured) {
      throw new Error(seatable.reason);
    }

    const photos = (await listSeatablePhotos()).map((photo) => ({
      ...photo,
      imageUrl: proxifyPhotoImageUrl(photo.imageUrl)
    }));
    return json({ photos, storage: 'seatable' });
  } catch (error) {
    return json({ error: error.message || 'Errore lettura archivio' }, { status: 500 });
  }
}

export async function POST({ request }) {
  try {
    const seatable = getSeatableStatus();
    if (!seatable.configured) {
      throw new Error(seatable.reason);
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
    return json({ error: error.message || 'Errore salvataggio' }, { status: 400 });
  }
}
