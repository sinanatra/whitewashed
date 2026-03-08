import { fetchSeatableAsset, getSeatableStatus } from '$lib/server/seatable-store';

function logServerError(error) {
  console.error('[api/photos/image] GET failed', error);
}

export async function GET({ url }) {
  try {
    const seatable = getSeatableStatus();
    if (!seatable.configured) {
      return new Response('SeaTable not configured', { status: 503 });
    }

    const src = String(url.searchParams.get('src') || '').trim();
    if (!src) {
      return new Response('Missing src', { status: 400 });
    }

    const asset = await fetchSeatableAsset(src);
    const contentType = asset.headers.get('content-type') || 'application/octet-stream';
    const body = await asset.arrayBuffer();

    const headers = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=300'
    };

    return new Response(body, {
      status: 200,
      headers
    });
  } catch (error) {
    logServerError(error);
    return new Response('Image proxy error', { status: 502 });
  }
}
