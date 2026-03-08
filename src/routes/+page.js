export async function load({ fetch }) {
  const response = await fetch('/api/photos');

  if (!response.ok) {
    let message = 'Errore caricamento archivio';
    try {
      const body = await response.json();
      message = body?.error || message;
    } catch {
      // ignore parsing errors
    }

    return { photos: [], storage: 'unknown', error: message };
  }

  const { photos, storage } = await response.json();
  return { photos, storage: storage || 'unknown', error: '' };
}
