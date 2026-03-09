import { fetchSeatableAsset, getSeatableStatus } from '$lib/server/seatable-store';

function logServerError(error) {
  console.error('[api/photos/image] GET failed', error);
}

function isAbsoluteHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

export async function GET({ url }) {
  const src = String(url.searchParams.get('src') || '').trim();

  try {
    const seatable = getSeatableStatus();
    if (!seatable.configured) {
      return new Response('SeaTable not configured', { status: 503 });
    }

    if (!src) {
      return new Response('Missing src', { status: 400 });
    }

    const asset = await fetchSeatableAsset(src);
    const contentType = asset.headers.get('content-type') || 'application/octet-stream';
    const body = await asset.arrayBuffer();

    const headers = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800'
    };

    const etag = asset.headers.get('etag');
    if (etag) {
      headers.ETag = etag;
    }

    const lastModified = asset.headers.get('last-modified');
    if (lastModified) {
      headers['Last-Modified'] = lastModified;
    }

    return new Response(body, {
      status: 200,
      headers
    });
  } catch (error) {
    logServerError(error);

    if (isAbsoluteHttpUrl(src)) {
      return Response.redirect(src, 302);
    }

    return new Response('Image proxy error', { status: 502 });
  }
}
