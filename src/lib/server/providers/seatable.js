const SEATABLE_WEBHOOK_URL = process.env.SEATABLE_WEBHOOK_URL;
const SEATABLE_API_TOKEN = process.env.SEATABLE_API_TOKEN;

export async function pushToSeatable(record) {
  if (!SEATABLE_WEBHOOK_URL) {
    return { skipped: true, provider: 'seatable' };
  }

  const response = await fetch(SEATABLE_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(SEATABLE_API_TOKEN ? { Authorization: `Token ${SEATABLE_API_TOKEN}` } : {})
    },
    body: JSON.stringify(record)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SeaTable error: ${response.status} ${body}`);
  }

  return { skipped: false, provider: 'seatable' };
}
