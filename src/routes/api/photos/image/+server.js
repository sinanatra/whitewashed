import { fetchSeatableAsset, getSeatableStatus } from '$lib/server/seatable-store';
import { env as privateEnv } from '$env/dynamic/private';

const DEFAULT_SEATABLE_SERVER = 'https://cloud.seatable.io';

function logServerError(error) {
  console.error('[api/photos/image] GET failed', error);
}

function getAllowedHostname() {
  const serverUrl = (
    privateEnv.SEATABLE_SERVER_URL ||
    process.env.SEATABLE_SERVER_URL ||
    DEFAULT_SEATABLE_SERVER
  ).replace(/\/$/, '');
  try {
    return new URL(serverUrl).hostname;
  } catch {
    return new URL(DEFAULT_SEATABLE_SERVER).hostname;
  }
}

function isSeatableUrl(src) {
  try {
    const parsed = new URL(src);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const allowed = getAllowedHostname();
    return parsed.hostname === allowed || parsed.hostname.endsWith('.' + allowed);
  } catch {
    return false;
  }
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

    if (src.startsWith('http://') || src.startsWith('https://')) {
      if (!isSeatableUrl(src)) {
        return new Response('Forbidden', { status: 403 });
      }
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
    return new Response('Image proxy error', { status: 502 });
  }
}
