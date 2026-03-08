const GOOGLE_APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL;

export async function pushToGoogleSheets(record) {
  if (!GOOGLE_APPS_SCRIPT_URL) {
    return { skipped: true, provider: 'google-sheets' };
  }

  const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(record)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Sheets error: ${response.status} ${body}`);
  }

  return { skipped: false, provider: 'google-sheets' };
}
