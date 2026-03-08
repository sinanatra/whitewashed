import { fetchSeatableAsset, getSeatableStatus } from '$lib/server/seatable-store';

export async function GET({ url }) {
  try {
    const seatable = getSeatableStatus();
    if (!seatable.configured) {
      return new Response('SeaTable not configured', { status: 500 });
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
    return new Response(error.message || 'Image proxy error', { status: 502 });
  }
}
