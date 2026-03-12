import { randomUUID } from 'node:crypto';
import { env as privateEnv } from '$env/dynamic/private';
import * as exifr from 'exifr';

const DEFAULT_SERVER_URL = 'https://cloud.seatable.io';
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const EXTERNAL_LINK_CACHE_TTL_MS = 10 * 60 * 1000;
const externalLinkContextCache = new Map();

function readEnv(key, fallback = '') {
  const value = privateEnv[key];
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  const processValue = process.env[key];
  if (typeof processValue === 'string' && processValue.length > 0) {
    return processValue;
  }

  return fallback;
}

function getConfig() {
  return {
    serverUrl: String(readEnv('SEATABLE_SERVER_URL', DEFAULT_SERVER_URL)).replace(/\/$/, ''),
    apiToken: String(readEnv('SEATABLE_API_TOKEN')).trim(),
    accountToken: String(readEnv('SEATABLE_ACCOUNT_TOKEN')).trim(),
    workspaceId: String(readEnv('SEATABLE_WORKSPACE_ID')).trim(),
    baseName: String(readEnv('SEATABLE_BASE_NAME')).trim(),
    baseUuid: String(readEnv('SEATABLE_BASE_UUID')).trim(),
    tableName: String(readEnv('SEATABLE_TABLE_NAME', 'Archive')).trim(),
    externalLinkUrl: String(readEnv('SEATABLE_EXTERNAL_LINK_URL')).trim(),
    externalLinkToken: String(readEnv('SEATABLE_EXTERNAL_LINK_TOKEN')).trim(),
    maxBase64Length: Number(readEnv('SEATABLE_MAX_IMAGE_BASE64_LENGTH', '60000')) || 60000,
    safeBase64Cap: Number(readEnv('SEATABLE_SAFE_BASE64_CAP', '60000')) || 60000,
    enableLegacyBase64Fallback: /^(1|true|yes)$/i.test(
      String(readEnv('SEATABLE_ENABLE_LEGACY_BASE64_FALLBACK', 'false')).trim()
    ),
    columns: {
      id: String(readEnv('SEATABLE_COL_ID', 'id')),
      title: String(readEnv('SEATABLE_COL_TITLE', 'title')),
      description: String(readEnv('SEATABLE_COL_DESCRIPTION', 'description')),
      city: String(readEnv('SEATABLE_COL_CITY', 'city')),
      neighborhood: String(readEnv('SEATABLE_COL_NEIGHBORHOOD', 'neighborhood')),
      lat: String(readEnv('SEATABLE_COL_LAT', 'lat')),
      lng: String(readEnv('SEATABLE_COL_LNG', 'lng')),
      takenAt: String(readEnv('SEATABLE_COL_TAKEN_AT', 'taken_at')),
      createdAt: String(readEnv('SEATABLE_COL_CREATED_AT', 'created_at')),
      imageFile: String(readEnv('SEATABLE_COL_IMAGE_FILE', 'image')),
      imageUrl: String(readEnv('SEATABLE_COL_IMAGE_URL', 'image_url')),
      imageBase64: String(readEnv('SEATABLE_COL_IMAGE_BASE64', 'image_base64')),
      imageMime: String(readEnv('SEATABLE_COL_IMAGE_MIME', 'image_mime')),
      imageName: String(readEnv('SEATABLE_COL_IMAGE_NAME', 'image_name'))
    }
  };
}

function hasApiTokenConfig(config) {
  return Boolean(config.apiToken);
}

function hasAccountTokenConfig(config) {
  return Boolean(config.accountToken || config.workspaceId || config.baseName);
}

function isAccountTokenConfigComplete(config) {
  return Boolean(config.accountToken && config.workspaceId && config.baseName);
}

function extractExternalLinkToken(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  const match = raw.match(/\/dtable\/external-links\/([^/?#]+)/i);
  if (match?.[1]) {
    return match[1].trim();
  }

  return raw.replace(/^\/+|\/+$/g, '');
}

function resolveExternalLinkUrl(config) {
  const explicitUrl = String(config.externalLinkUrl || '').trim();
  if (explicitUrl) {
    try {
      return new URL(explicitUrl).toString();
    } catch {
      const token = extractExternalLinkToken(explicitUrl);
      if (token) {
        return `${config.serverUrl}/dtable/external-links/${token}/`;
      }
    }
  }

  const token = extractExternalLinkToken(config.externalLinkToken);
  if (!token) {
    return '';
  }

  return `${config.serverUrl}/dtable/external-links/${token}/`;
}

function hasExternalLinkConfig(config) {
  return Boolean(resolveExternalLinkUrl(config));
}

function textValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return textValue(value[0]);
  }

  if (typeof value === 'object') {
    if (typeof value.name === 'string') return value.name.trim();
    if (typeof value.text === 'string') return value.text.trim();
    if (typeof value.value === 'string') return value.value.trim();
    return '';
  }

  return String(value || '').trim();
}

function normalizeBase64Payload(value) {
  const raw = textValue(value);
  if (!raw) {
    return '';
  }

  if (raw.startsWith('data:image/')) {
    const parts = raw.split(',');
    const payload = parts.length > 1 ? parts.slice(1).join(',') : '';
    return normalizeBase64Payload(payload);
  }

  const compact = raw.replace(/\s+/g, '');
  if (!compact) {
    return '';
  }

  const remainder = compact.length % 4;
  if (remainder === 0) {
    return compact;
  }

  return compact + '='.repeat(4 - remainder);
}

function isLikelyValidImagePayload(base64Payload, mimeType) {
  const payload = normalizeBase64Payload(base64Payload);
  if (!payload) {
    return false;
  }

  try {
    const bytes = Buffer.from(payload, 'base64');
    if (!bytes || bytes.length < 16) {
      return false;
    }

    const mime = String(mimeType || '').toLowerCase();
    const isJpeg = mime.includes('jpeg') || mime.includes('jpg');
    const isPng = mime.includes('png');
    const isWebp = mime.includes('webp');

    if (isJpeg) {
      const startsCorrectly = bytes[0] === 0xff && bytes[1] === 0xd8;
      const endsCorrectly = bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
      return startsCorrectly && endsCorrectly;
    }

    if (isPng) {
      const startsCorrectly =
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47;
      const tail = bytes.subarray(Math.max(0, bytes.length - 12)).toString('hex');
      return startsCorrectly && tail.includes('49454e44');
    }

    if (isWebp) {
      return (
        bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
        bytes.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    }

    return true;
  } catch {
    return false;
  }
}

function repairLikelyTruncatedJpeg(base64Payload, mimeType) {
  const mime = String(mimeType || '').toLowerCase();
  if (!mime.includes('jpeg') && !mime.includes('jpg')) {
    return normalizeBase64Payload(base64Payload);
  }

  const payload = normalizeBase64Payload(base64Payload);
  if (!payload) {
    return '';
  }

  try {
    const bytes = Buffer.from(payload, 'base64');
    if (!bytes || bytes.length < 4) {
      return payload;
    }

    const hasJpegStart = bytes[0] === 0xff && bytes[1] === 0xd8;
    const hasJpegEnd = bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;

    if (hasJpegStart && !hasJpegEnd) {
      const repaired = Buffer.concat([bytes, Buffer.from([0xff, 0xd9])]);
      return repaired.toString('base64');
    }

    return payload;
  } catch {
    return payload;
  }
}

function numberValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string' && value.trim() === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getRowValue(row, key, fallback = null) {
  if (!row || typeof row !== 'object') {
    return fallback;
  }

  return row[key] ?? fallback;
}

function getColumnValue(row, columnName, schema = null, fallbacks = []) {
  if (!row || typeof row !== 'object') {
    return null;
  }

  const keyFromName = schema?.nameToKey?.[columnName];
  const candidates = [columnName, keyFromName, ...fallbacks].filter(Boolean);

  for (const key of candidates) {
    if (row[key] !== undefined && row[key] !== null) {
      return row[key];
    }
  }

  return null;
}

function parseMaybeJson(value) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
    return value;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function looksLikeImagePath(value) {
  const str = String(value || '').trim();
  if (!str) return false;
  if (str.startsWith('data:image/')) return true;
  if (/^https?:\/\//i.test(str) && /\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?|$)/i.test(str)) {
    return true;
  }
  if (str.startsWith('/workspace/') || str.includes('/asset/')) return true;
  if (/\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?|$)/i.test(str)) return true;
  return false;
}

function extractImageUrlFromUnknownCell(config, value) {
  const parsed = parseMaybeJson(value);

  if (typeof parsed === 'string') {
    const str = parsed.trim();
    if (!looksLikeImagePath(str)) return '';
    return normalizeImageUrl(config, str);
  }

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const hit = extractImageUrlFromUnknownCell(config, item);
      if (hit) return hit;
    }
    return '';
  }

  if (parsed && typeof parsed === 'object') {
    const candidates = [
      parsed.url,
      parsed.download_link,
      parsed.download_url,
      parsed.path,
      parsed.src,
      parsed.image,
      parsed.photo
    ];

    for (const candidate of candidates) {
      const hit = extractImageUrlFromUnknownCell(config, candidate);
      if (hit) return hit;
    }
  }

  return '';
}

function fallbackImageUrlFromRow(config, row) {
  if (!row || typeof row !== 'object') return '';

  const priorityEntries = Object.entries(row).sort((a, b) => {
    const aKey = a[0].toLowerCase();
    const bKey = b[0].toLowerCase();
    const aScore = /image|photo|file|attachment/.test(aKey) ? 0 : 1;
    const bScore = /image|photo|file|attachment/.test(bKey) ? 0 : 1;
    return aScore - bScore;
  });

  for (const [, value] of priorityEntries) {
    const hit = extractImageUrlFromUnknownCell(config, value);
    if (hit) return hit;
  }

  return '';
}

function fallbackText(row, includeRegex, excludeRegex = null) {
  if (!row || typeof row !== 'object') return '';

  for (const [key, value] of Object.entries(row)) {
    const lowKey = key.toLowerCase();
    if (includeRegex && !includeRegex.test(lowKey)) continue;
    if (excludeRegex && excludeRegex.test(lowKey)) continue;

    const text = textValue(value);
    if (text) return text;
  }

  return '';
}

function fallbackNumber(row, includeRegex) {
  if (!row || typeof row !== 'object') return null;

  for (const [key, value] of Object.entries(row)) {
    if (!includeRegex.test(key.toLowerCase())) continue;
    const num = numberValue(value);
    if (num !== null) return num;
  }

  return null;
}

function parseCoordinates(formData) {
  const rawLat = textValue(formData.get('lat'));
  const rawLng = textValue(formData.get('lng'));

  if (!rawLat && !rawLng) {
    return { lat: null, lng: null };
  }

  if (!rawLat || !rawLng) {
    throw new Error('Latitude and longitude must be provided together');
  }

  const lat = numberValue(rawLat);
  const lng = numberValue(rawLng);

  if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error('Invalid coordinates');
  }

  return { lat, lng };
}

function assertFile(file) {
  if (
    !file ||
    typeof file !== 'object' ||
    typeof file.arrayBuffer !== 'function' ||
    typeof file.size !== 'number'
  ) {
    throw new Error('Missing file');
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error('File too large (max 10MB)');
  }
}

async function extractUploadedPhotoMetadata(file) {
  const [gpsResult, exifResult] = await Promise.allSettled([
    exifr.gps(file),
    exifr.parse(file, ['DateTimeOriginal', 'CreateDate'])
  ]);

  const gps = gpsResult.status === 'fulfilled' ? gpsResult.value : null;
  const exif = exifResult.status === 'fulfilled' ? exifResult.value : null;
  const lat = Number.isFinite(gps?.latitude) ? gps?.latitude ?? null : null;
  const lng = Number.isFinite(gps?.longitude) ? gps?.longitude ?? null : null;

  return {
    lat,
    lng,
    takenAt: textValue(exif?.DateTimeOriginal || exif?.CreateDate) || null
  };
}

function assertReadConfig(config) {
  const hasApiToken = Boolean(config.apiToken);
  const hasAccountToken = Boolean(config.accountToken && config.workspaceId && config.baseName);
  const hasExternalLink = hasExternalLinkConfig(config);

  if (!hasApiToken && !hasAccountToken && !hasExternalLink) {
    throw new Error(
      'Config SeaTable incompleta: usa API token oppure Account token + workspace/base oppure SEATABLE_EXTERNAL_LINK_URL'
    );
  }

  if (!config.tableName) {
    throw new Error('Config SeaTable incompleta: table name mancante');
  }
}

function assertWriteConfig(config) {
  const hasApiToken = Boolean(config.apiToken);
  const hasAccountToken = Boolean(config.accountToken && config.workspaceId && config.baseName);

  if (!hasApiToken && !hasAccountToken) {
    throw new Error(
      'Config SeaTable incompleta: gli upload richiedono API token oppure Account token + workspace/base'
    );
  }

  if (!config.tableName) {
    throw new Error('Config SeaTable incompleta: table name mancante');
  }
}

function parseExternalLinkPageValue(html, key) {
  const pattern = new RegExp(`${key}\\s*:\\s*['"]([^'"]*)['"]`);
  const match = String(html || '').match(pattern);
  return match?.[1] ? match[1].trim() : '';
}

function splitSetCookieHeader(value) {
  return String(value || '')
    .split(/,(?=[^;,=\s]+=[^;,]+)/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getSetCookieValues(response) {
  if (response?.headers && typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie().filter(Boolean);
  }

  const header = response?.headers?.get('set-cookie');
  return header ? splitSetCookieHeader(header) : [];
}

function toCookieHeader(setCookies) {
  return setCookies
    .map((cookie) => String(cookie || '').split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

async function getExternalLinkContext(config) {
  const externalLinkUrl = resolveExternalLinkUrl(config);
  if (!externalLinkUrl) {
    throw new Error('SEATABLE_EXTERNAL_LINK_URL mancante');
  }

  const cached = externalLinkContextCache.get(externalLinkUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const response = await fetch(externalLinkUrl, {
    headers: {
      'Accept-Encoding': 'identity'
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SeaTable external-link error: ${response.status} ${body}`);
  }

  const html = await response.text();
  const accessToken = parseExternalLinkPageValue(html, 'accessToken');
  const workspaceId = parseExternalLinkPageValue(html, 'workspaceID');
  const baseUuid = parseExternalLinkPageValue(html, 'dtableUuid');
  const cookieHeader = toCookieHeader(getSetCookieValues(response));

  if (!accessToken || !workspaceId || !baseUuid) {
    throw new Error('SeaTable external-link page missing access token or base identifiers');
  }

  const context = {
    accessToken,
    workspaceId,
    baseUuid,
    externalLinkUrl,
    cookieHeader
  };

  externalLinkContextCache.set(externalLinkUrl, {
    expiresAt: Date.now() + EXTERNAL_LINK_CACHE_TTL_MS,
    value: context
  });

  return context;
}

async function getBaseTokenWithApiToken(config) {
  const endpoint = `${config.serverUrl}/api/v2.1/dtable/app-access-token/`;
  const authHeaders = [{ Authorization: `Bearer ${config.apiToken}` }, { Authorization: `Token ${config.apiToken}` }];

  let response = null;
  for (const headers of authHeaders) {
    response = await fetch(endpoint, { headers });
    if (response.ok) {
      break;
    }
  }

  if (!response.ok) {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(config.baseUuid ? { dtable_uuid: config.baseUuid } : {})
    });
  }

  if (!response.ok) {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Token ${config.apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(config.baseUuid ? { dtable_uuid: config.baseUuid } : {})
    });
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SeaTable auth error (api token): ${response.status} ${body}`);
  }

  const body = await response.json();
  const token = body?.access_token || body?.token || body?.app_access_token;

  if (!token) {
    throw new Error('SeaTable base token mancante nella risposta (api token)');
  }

  return {
    accessToken: token,
    baseUuid: body?.dtable_uuid || body?.base_uuid || config.baseUuid || '',
    workspaceId: String(body?.workspace_id || config.workspaceId || '').trim()
  };
}

async function getBaseTokenWithAccountToken(config) {
  const baseNameEncoded = encodeURIComponent(config.baseName);
  const endpoint = `${config.serverUrl}/api/v2.1/workspace/${config.workspaceId}/dtable/${baseNameEncoded}/access-token/`;
  const authHeaders = [
    { Authorization: `Bearer ${config.accountToken}` },
    { Authorization: `Token ${config.accountToken}` }
  ];

  let response = null;
  for (const headers of authHeaders) {
    response = await fetch(endpoint, { headers });
    if (response.ok) {
      break;
    }
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SeaTable auth error (account token): ${response.status} ${body}`);
  }

  const body = await response.json();
  const token = body?.access_token || body?.token || body?.app_access_token;

  if (!token) {
    throw new Error('SeaTable base token mancante nella risposta (account token)');
  }

  return {
    accessToken: token,
    baseUuid: body?.dtable_uuid || body?.base_uuid || config.baseUuid || '',
    workspaceId: String(body?.workspace_id || config.workspaceId || '').trim()
  };
}

async function getSeaTableAccessToken(config) {
  const authErrors = [];

  if (config.apiToken) {
    try {
      return await getBaseTokenWithApiToken(config);
    } catch (error) {
      authErrors.push(error.message || 'Errore auth con API token');
    }
  }

  if (config.accountToken && config.workspaceId && config.baseName) {
    try {
      return await getBaseTokenWithAccountToken(config);
    } catch (error) {
      authErrors.push(error.message || 'Errore auth con Account token');
    }
  }

  throw new Error(authErrors.join(' | ') || 'Impossibile ottenere un base token SeaTable');
}

async function getSeaTableReadContext(config) {
  const authErrors = [];

  if (hasExternalLinkConfig(config)) {
    try {
      const external = await getExternalLinkContext(config);
      return {
        accessToken: external.accessToken,
        baseUuid: external.baseUuid,
        workspaceId: external.workspaceId,
        cookieHeader: external.cookieHeader,
        externalLinkUrl: external.externalLinkUrl
      };
    } catch (error) {
      authErrors.push(error?.message || 'Errore auth con external link');
    }
  }

  try {
    return await getSeaTableAccessToken(config);
  } catch (error) {
    authErrors.push(error?.message || 'Impossibile ottenere un base token SeaTable');
  }

  throw new Error(authErrors.join(' | ') || 'Impossibile ottenere accesso in lettura a SeaTable');
}

function extractedRowsLookUsable(config, extracted, schema) {
  return extracted.some((row) => {
    if (!row || typeof row !== 'object') {
      return false;
    }

    const probes = [
      getColumnValue(row, config.columns.id, schema, ['id', '_id']),
      getColumnValue(row, config.columns.title, schema, ['title', '_name']),
      getColumnValue(row, config.columns.createdAt, schema, ['created_at', '_ctime']),
      getColumnValue(row, config.columns.imageFile, schema, ['image', 'file', 'files', 'attachment']),
      getColumnValue(row, config.columns.imageUrl, schema, ['image_url', 'imageUrl']),
      getColumnValue(row, config.columns.imageBase64, schema, ['image_base64', 'imageBase64']),
      getColumnValue(row, 'image_url', schema, [
        'imageUrl',
        'image',
        'photo',
        'photo_url',
        'thumbnail',
        'url'
      ])
    ];

    return probes.some((value) => textValue(value).length > 0);
  });
}

async function listRows(config, accessToken, baseUuid, schema) {
  const url = new URL(`${config.serverUrl}/api-gateway/api/v2/dtables/${baseUuid}/rows/`);
  url.searchParams.set('table_name', config.tableName);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SeaTable read error: ${response.status} ${body}`);
  }

  const body = await response.json();
  const extracted = extractRowsFromPayload(body);

  if (extracted.length && extractedRowsLookUsable(config, extracted, schema)) {
    return extracted;
  }

  const sqlRows = await listRowsViaSql(config, accessToken, baseUuid);
  if (sqlRows.length) {
    return sqlRows;
  }

  return extracted;
}

function extractRowsFromPayload(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const candidates = ['rows', 'results', 'data', 'items'];
  for (const key of candidates) {
    if (Array.isArray(payload[key])) {
      return payload[key];
    }
  }

  return [];
}

async function listRowsViaSql(config, accessToken, baseUuid) {
  const url = `${config.serverUrl}/api-gateway/api/v2/dtables/${baseUuid}/sql/`;
  const safeTableName = config.tableName.replace(/`/g, '');
  const sql = `select * from \`${safeTableName}\` order by _ctime desc limit 500`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sql })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SeaTable SQL read error: ${response.status} ${body}`);
  }

  const body = await response.json();
  return extractRowsFromPayload(body);
}

async function addRow(config, accessToken, baseUuid, row) {
  const url = `${config.serverUrl}/api-gateway/api/v2/dtables/${baseUuid}/rows/`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      table_name: config.tableName,
      rows: [row]
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SeaTable write error: ${response.status} ${body}`);
  }
}

function withRetJsonParam(uploadLink, serverUrl) {
  const raw = String(uploadLink || '').trim();
  if (!raw) {
    return '';
  }

  const url = raw.startsWith('http://') || raw.startsWith('https://')
    ? new URL(raw)
    : new URL(raw, `${String(serverUrl || '').replace(/\/$/, '')}/`);
  url.searchParams.set('ret-json', '1');
  return url.toString();
}

async function requestJsonWithAuth(endpoint, authHeaders, errorPrefix) {
  let lastStatus = 0;
  let lastBody = '';

  for (const headers of authHeaders) {
    const response = await fetch(endpoint, { headers });
    if (response.ok) {
      return response.json();
    }
    lastStatus = response.status;
    lastBody = await response.text();
  }

  throw new Error(`${errorPrefix}: ${lastStatus} ${lastBody}`);
}

async function getUploadLink(config, auth, baseUuid) {
  if (config.apiToken) {
    const endpointUrl = new URL(`${config.serverUrl}/api/v2.1/dtable/app-upload-link/`);
    if (baseUuid) {
      endpointUrl.searchParams.set('dtable_uuid', baseUuid);
    }
    const body = await requestJsonWithAuth(
      endpointUrl.toString(),
      [{ Authorization: `Bearer ${config.apiToken}` }, { Authorization: `Token ${config.apiToken}` }],
      'SeaTable upload-link error (api token)'
    );
    return {
      uploadLink: body?.upload_link || '',
      parentPath: String(body?.parent_path || '').trim(),
      relativePath: String(body?.img_relative_path || '').trim(),
      workspaceId: String(body?.workspace_id || auth.workspaceId || config.workspaceId || '').trim()
    };
  }

  throw new Error(
    'SeaTable image upload requires SEATABLE_API_TOKEN. The official upload-link flow for image/file assets uses a base API token, not only SEATABLE_ACCOUNT_TOKEN.'
  );
}

function buildAssetRelativeUrl(workspaceId, parentPath, relativePath, fileName) {
  const parent = String(parentPath || '').trim();
  const normalizedParent = parent.replace(/^\/+|\/+$/g, '');
  const normalizedRelative = String(relativePath || '').trim().replace(/^\/+|\/+$/g, '');
  const normalizedName = String(fileName || '').trim().replace(/^\/+|\/+$/g, '');
  const normalizedWorkspace = String(workspaceId || '').trim().replace(/^\/+|\/+$/g, '');

  const parentAlreadyContainsWorkspace = normalizedParent.startsWith('workspace/');
  const parts = [
    parentAlreadyContainsWorkspace || !normalizedWorkspace ? '' : `workspace/${normalizedWorkspace}`,
    normalizedParent,
    normalizedRelative,
    normalizedName
  ].filter(Boolean);

  return parts.length ? `/${parts.join('/')}` : '';
}

function toRelativeAssetUrl(candidate) {
  const raw = String(candidate || '').trim();
  if (!raw) {
    return '';
  }

  if (raw.startsWith('/workspace/')) {
    return raw;
  }

  if (isAbsoluteHttpUrl(raw)) {
    try {
      const parsed = new URL(raw);
      return parsed.pathname || '';
    } catch {
      return '';
    }
  }

  if (raw.includes('/workspace/')) {
    return raw.slice(raw.indexOf('/workspace/'));
  }

  return '';
}

function resolveUploadedImageRelativeUrl(upload, fileInfo, fallbackFileName) {
  const directPathCandidates = [
    fileInfo?.url,
    fileInfo?.path,
    fileInfo?.download_link,
    fileInfo?.download_url
  ];

  for (const candidate of directPathCandidates) {
    const relativeUrl = toRelativeAssetUrl(candidate);
    if (relativeUrl) {
      return relativeUrl;
    }
  }

  const fileName = textValue(fileInfo?.name || fallbackFileName);
  return buildAssetRelativeUrl(
    upload.workspaceId,
    upload.parentPath || '/',
    upload.relativePath || 'images',
    fileName
  );
}

async function uploadImageToSeaTable(config, auth, baseUuid, file) {
  const upload = await getUploadLink(config, auth, baseUuid);
  if (!upload.uploadLink) {
    throw new Error('SeaTable upload-link mancante nella risposta');
  }

  const uploadUrl = withRetJsonParam(upload.uploadLink, config.serverUrl);
  const formData = new FormData();
  formData.set('parent_dir', upload.parentPath || '/');
  formData.set('relative_path', upload.relativePath || 'images');
  formData.set('replace', '1');
  formData.set('file', file, textValue(file.name) || 'upload.jpg');

  const response = await fetch(uploadUrl, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SeaTable upload error: ${response.status} ${body}`);
  }

  const payload = await response.json();
  const fileInfo = Array.isArray(payload) ? payload[0] : payload;
  const fileName = textValue(fileInfo?.name || file.name);
  const relativeUrl = resolveUploadedImageRelativeUrl(
    {
      workspaceId: upload.workspaceId || config.workspaceId,
      parentPath: upload.parentPath || '/',
      relativePath: upload.relativePath || 'images'
    },
    fileInfo,
    fileName
  );

  if (!relativeUrl) {
    throw new Error('Impossibile costruire URL asset SeaTable');
  }

  return {
    relativeUrl,
    absoluteUrl: normalizeImageUrl(config, relativeUrl),
    fileName
  };
}

async function getMetadata(config, accessToken, baseUuid) {
  const response = await fetch(
    `${config.serverUrl}/api-gateway/api/v2/dtables/${baseUuid}/metadata/`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SeaTable metadata error: ${response.status} ${body}`);
  }

  return response.json();
}

async function ensureTableSchema(config, accessToken, baseUuid) {
  const metadata = await getMetadata(config, accessToken, baseUuid);
  const tables = metadata?.metadata?.tables || metadata?.tables || [];
  const targetTable = tables.find((table) => table?.name === config.tableName);

  if (!targetTable) {
    const availableTables = tables.map((table) => table?.name).filter(Boolean);
    throw new Error(
      `Tabella SeaTable non trovata: "${config.tableName}". Tabelle disponibili: ${availableTables.join(', ') || 'nessuna'}`
    );
  }

  const nameToKey = {};
  const imageTypeColumns = [];
  const availableColumns = (targetTable.columns || [])
    .map((column) => {
      const name = column?.name;
      const key = column?.key;
      const type = String(column?.type || '').toLowerCase();
      if (name && key) {
        nameToKey[name] = key;
      }
      if (name && type === 'image') {
        imageTypeColumns.push(name);
      }
      return name;
    })
    .filter(Boolean);
  const requiredColumns = [
    config.columns.id,
    config.columns.title,
    config.columns.description,
    config.columns.lat,
    config.columns.lng,
    config.columns.takenAt,
    config.columns.createdAt
  ];
  const missingColumns = requiredColumns.filter((columnName) => !availableColumns.includes(columnName));

  if (missingColumns.length) {
    throw new Error(
      `Mancano colonne in "${config.tableName}": ${missingColumns.join(', ')}`
    );
  }

  const detectedImageColumnName =
    imageTypeColumns.find((name) => name === config.columns.imageFile) ||
    imageTypeColumns[0] ||
    '';
  const hasImageColumn = Boolean(detectedImageColumnName);
  const hasLegacyBase64Columns =
    availableColumns.includes(config.columns.imageBase64) &&
    availableColumns.includes(config.columns.imageMime) &&
    availableColumns.includes(config.columns.imageName);

  if (!hasImageColumn && !hasLegacyBase64Columns) {
    throw new Error(
      `Manca una colonna SeaTable di tipo Image in "${config.tableName}". Crea "${config.columns.imageFile}" oppure imposta SEATABLE_COL_IMAGE_FILE sul nome corretto.`
    );
  }

  return {
    availableColumnNames: new Set(availableColumns),
    nameToKey,
    imageColumnName: detectedImageColumnName,
    imageTypeColumns,
    hasImageColumn,
    hasLegacyBase64Columns
  };
}

function rowToPhoto(config, row, schema) {
  const imageColumnName = schema?.imageColumnName || config.columns.imageFile;
  let imageBase64 = normalizeBase64Payload(
    getColumnValue(row, config.columns.imageBase64, schema, ['image_base64', 'imageBase64'])
  );
  const imageMime = textValue(
    getColumnValue(row, config.columns.imageMime, schema, ['image_mime', 'imageMime'])
  ) || 'image/jpeg';

  if (imageBase64) {
    imageBase64 = repairLikelyTruncatedJpeg(imageBase64, imageMime);
  }

  if (imageBase64 && !isLikelyValidImagePayload(imageBase64, imageMime)) {
    imageBase64 = '';
  }

  const directImageValue = getColumnValue(row, config.columns.imageUrl, schema, [
    'image_url',
    'imageUrl',
    'image',
    'photo',
    'photo_url',
    'thumbnail',
    'url'
  ]);

  const fileCell = parseMaybeJson(
    getColumnValue(row, imageColumnName, schema, [
      'image_file',
      'image',
      'file',
      'files',
      'attachment',
      'attachments'
    ])
  );

  let imageUrl = '';
  imageUrl = extractImageUrlFromUnknownCell(config, directImageValue);

  if (!imageUrl) {
    imageUrl = extractImageUrlFromUnknownCell(config, fileCell);
  }

  if (!imageUrl && imageBase64) {
    imageUrl = `data:${imageMime};base64,${imageBase64}`;
  }

  if (!imageUrl) {
    imageUrl = fallbackImageUrlFromRow(config, row);
  }

  let lat = numberValue(getColumnValue(row, config.columns.lat, schema, ['latitude', 'lat']));
  let lng = numberValue(getColumnValue(row, config.columns.lng, schema, ['longitude', 'lng']));

  if (lat === null) {
    lat = fallbackNumber(row, /lat|latitude/);
  }

  if (lng === null) {
    lng = fallbackNumber(row, /lng|lon|long|longitude/);
  }

  const title =
    textValue(getColumnValue(row, config.columns.title, schema, ['title', '_name'])) ||
    fallbackText(row, /title|name|caption/, /image|photo|file|url|id/) ||
    'Untitled';

  const description =
    textValue(getColumnValue(row, config.columns.description, schema, ['description'])) ||
    fallbackText(row, /description|desc|text|note|comment/, /image|photo|file|url|id/);

  return {
    id: textValue(
      getColumnValue(row, config.columns.id, schema, ['id', '_id']) || randomUUID()
    ),
    title,
    description,
    lat,
    lng,
    takenAt: textValue(getColumnValue(row, config.columns.takenAt, schema, ['taken_at'])) || null,
    createdAt:
      textValue(getColumnValue(row, config.columns.createdAt, schema, ['created_at', '_ctime'])) ||
      new Date().toISOString(),
    imageUrl
  };
}

function normalizeImageUrl(config, rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!url) {
    return '';
  }

  if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  if (url.startsWith('/')) {
    return `${config.serverUrl}${url}`;
  }

  return `${config.serverUrl}/${url}`;
}

function isAbsoluteHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function isUsableAssetResponse(response) {
  if (!response?.ok) {
    return false;
  }

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('text/html')) {
    return false;
  }

  return true;
}

export function isSeatableConfigured() {
  const status = getSeatableStatus();
  return status.configured;
}

export function getSeatableStatus() {
  const config = getConfig();
  const apiTokenProvided = hasApiTokenConfig(config);
  const accountTokenProvided = hasAccountTokenConfig(config);
  const accountTokenComplete = isAccountTokenConfigComplete(config);
  const externalLinkProvided = hasExternalLinkConfig(config);

  const configured = Boolean(
    config.tableName && (externalLinkProvided || apiTokenProvided || accountTokenComplete)
  );
  const partial =
    !configured &&
    Boolean(apiTokenProvided || accountTokenProvided || config.baseUuid || config.externalLinkUrl);

  const missingKeys = [];
  if (!apiTokenProvided && !externalLinkProvided) {
    if (!config.accountToken) missingKeys.push('SEATABLE_ACCOUNT_TOKEN');
    if (!config.workspaceId) missingKeys.push('SEATABLE_WORKSPACE_ID');
    if (!config.baseName) missingKeys.push('SEATABLE_BASE_NAME');
  }
  if (!apiTokenProvided && !accountTokenComplete && !externalLinkProvided) {
    missingKeys.push('SEATABLE_EXTERNAL_LINK_URL');
  }

  const missingReason = `SeaTable obbligatorio: configura SEATABLE_EXTERNAL_LINK_URL per la lettura pubblica oppure SEATABLE_API_TOKEN oppure SEATABLE_ACCOUNT_TOKEN + SEATABLE_WORKSPACE_ID + SEATABLE_BASE_NAME. Mancanti: ${missingKeys.join(', ') || 'n/d'}`;

  return {
    configured,
    partial,
    reason: partial
      ? 'SeaTable config parziale: completa external link oppure token e identificativi base'
      : missingReason
  };
}

export async function listSeatablePhotos() {
  const config = getConfig();
  assertReadConfig(config);

  const auth = await getSeaTableReadContext(config);
  const baseUuid = auth.baseUuid || config.baseUuid;

  if (!baseUuid) {
    throw new Error('SEATABLE_BASE_UUID mancante e non restituito dal token endpoint');
  }

  const schema = await ensureTableSchema(config, auth.accessToken, baseUuid);
  const rows = await listRows(config, auth.accessToken, baseUuid, schema);

  return rows
    .map((row) => rowToPhoto(config, row, schema))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function saveSeatablePhoto(formData) {
  const config = getConfig();
  assertWriteConfig(config);

  const file = formData.get('photo');
  assertFile(file);

  const providedCoordinates = parseCoordinates(formData);
  const extractedMetadata = await extractUploadedPhotoMetadata(file);
  const lat = providedCoordinates.lat ?? extractedMetadata.lat;
  const lng = providedCoordinates.lng ?? extractedMetadata.lng;

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const takenAt = textValue(formData.get('takenAt')) || extractedMetadata.takenAt || null;
  const imageMime = textValue(file.type) || 'image/jpeg';
  const imageName = textValue(file.name) || `${id}.jpg`;

  const auth = await getSeaTableAccessToken(config);
  const baseUuid = auth.baseUuid || config.baseUuid;

  if (!baseUuid) {
    throw new Error('SEATABLE_BASE_UUID mancante e non restituito dal token endpoint');
  }

  const schema = await ensureTableSchema(config, auth.accessToken, baseUuid);

  const row = {};
  const setIfColumnExists = (columnName, value) => {
    if (schema.availableColumnNames.has(columnName)) {
      row[columnName] = value;
    }
  };

  setIfColumnExists(config.columns.id, id);
  setIfColumnExists(config.columns.title, textValue(formData.get('title')));
  setIfColumnExists(config.columns.description, textValue(formData.get('description')));
  setIfColumnExists(config.columns.lat, lat);
  setIfColumnExists(config.columns.lng, lng);
  setIfColumnExists(config.columns.takenAt, takenAt);
  setIfColumnExists(config.columns.createdAt, createdAt);

  let imageUrl = '';
  if (schema.hasImageColumn) {
    const uploaded = await uploadImageToSeaTable(config, auth, baseUuid, file);
    imageUrl = uploaded.relativeUrl;
    const imageColumnName = schema.imageColumnName || config.columns.imageFile;

    if (schema.availableColumnNames.has(imageColumnName)) {
      row[imageColumnName] = [imageUrl];
    }

    setIfColumnExists(config.columns.imageUrl, imageUrl);
    setIfColumnExists(config.columns.imageMime, imageMime);
    setIfColumnExists(config.columns.imageName, uploaded.fileName || imageName);
  } else if (schema.hasLegacyBase64Columns) {
    if (!config.enableLegacyBase64Fallback) {
      throw new Error(
        `Nessuna colonna SeaTable di tipo Image trovata in "${config.tableName}". Configura "${config.columns.imageFile}" oppure imposta SEATABLE_COL_IMAGE_FILE sul nome corretto. Il fallback base64 e' disattivato.`
      );
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const imageBase64 = fileBuffer.toString('base64');
    const effectiveBase64Limit = Math.min(config.maxBase64Length, config.safeBase64Cap);
    if (imageBase64.length > effectiveBase64Limit) {
      throw new Error(
        `Nessuna colonna SeaTable di tipo Image trovata in "${config.tableName}" e il fallback base64 non puo' contenere questo file (${imageBase64.length} caratteri > ${effectiveBase64Limit}). Configura "${config.columns.imageFile}" oppure imposta SEATABLE_COL_IMAGE_FILE sul nome corretto.`
      );
    }
    if (!isLikelyValidImagePayload(imageBase64, imageMime)) {
      throw new Error('Immagine non valida o corrotta dopo conversione base64');
    }

    setIfColumnExists(config.columns.imageBase64, imageBase64);
    setIfColumnExists(config.columns.imageMime, imageMime);
    setIfColumnExists(config.columns.imageName, imageName);
    imageUrl = `data:${imageMime};base64,${imageBase64}`;
  } else {
    throw new Error(
      `Manca colonna immagine. Configura "${config.columns.imageFile}" (tipo Image) in SeaTable.`
    );
  }

  await addRow(config, auth.accessToken, baseUuid, row);

  return {
    id,
    title: row[config.columns.title],
    description: row[config.columns.description],
    lat,
    lng,
    takenAt,
    createdAt,
    imageUrl: imageUrl ? normalizeImageUrl(config, imageUrl) : ''
  };
}

export async function fetchSeatableAsset(sourceUrl) {
  const config = getConfig();
  assertReadConfig(config);

  const src = String(sourceUrl || '').trim();
  if (!src) {
    throw new Error('URL immagine mancante');
  }

  const targetUrl = isAbsoluteHttpUrl(src) ? src : normalizeImageUrl(config, src);
  const auth = await getSeaTableReadContext(config);

  if (auth.cookieHeader && auth.externalLinkUrl) {
    const sharedResponse = await fetch(targetUrl, {
      headers: {
        Cookie: auth.cookieHeader,
        Referer: auth.externalLinkUrl,
        'Accept-Encoding': 'identity'
      },
      redirect: 'follow'
    });

    if (isUsableAssetResponse(sharedResponse)) {
      return sharedResponse;
    }
  }

  const authHeaders = [
    { Authorization: `Bearer ${auth.accessToken}` },
    { Authorization: `Token ${auth.accessToken}` },
    ...(config.accountToken
      ? [{ Authorization: `Bearer ${config.accountToken}` }, { Authorization: `Token ${config.accountToken}` }]
      : []),
    ...(config.apiToken
      ? [{ Authorization: `Bearer ${config.apiToken}` }, { Authorization: `Token ${config.apiToken}` }]
      : [])
  ];

  for (const headers of authHeaders) {
    const response = await fetch(targetUrl, {
      headers: {
        ...headers,
        'Accept-Encoding': 'identity'
      }
    });
    if (isUsableAssetResponse(response)) {
      return response;
    }
  }

  const publicResponse = await fetch(targetUrl, {
    headers: {
      'Accept-Encoding': 'identity'
    }
  });
  if (isUsableAssetResponse(publicResponse)) {
    return publicResponse;
  }

  throw new Error('Impossibile recuperare asset immagine da SeaTable');
}
