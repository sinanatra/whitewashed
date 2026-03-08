import { error } from '@sveltejs/kit';

export async function load({ fetch, params }) {
  const response = await fetch('/api/photos');

  if (!response.ok) {
    throw error(response.status, 'Unable to load archive image');
  }

  const { photos } = await response.json();
  const photo = Array.isArray(photos) ? photos.find((entry) => entry?.id === params.id) : null;

  if (!photo) {
    throw error(404, 'Image not found');
  }

  return { photo };
}
