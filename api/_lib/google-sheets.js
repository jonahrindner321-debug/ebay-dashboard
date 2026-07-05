const crypto = require('crypto');

const SNAPSHOT_MAGIC = 'seller-os-snapshot-v1';
const DEFAULT_SNAPSHOT_TAB = '_seller_os_snapshot';
const READ_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const WRITE_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

const tokenCache = new Map();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function normalizePrivateKey(value) {
  if (!value) return '';
  return String(value).replace(/\\n/g, '\n');
}

function parseServiceAccountJson(raw) {
  if (!raw) return null;
  const value = String(raw).trim();
  const json = value.startsWith('{')
    ? value
    : Buffer.from(value, 'base64').toString('utf8');
  return JSON.parse(json);
}

function serviceAccountFromEnv(env = process.env) {
  const jsonRaw = env.GOOGLE_SERVICE_ACCOUNT_JSON || env.SELLER_OS_GOOGLE_SERVICE_ACCOUNT_JSON;
  if (jsonRaw) {
    const parsed = parseServiceAccountJson(jsonRaw);
    return {
      clientEmail: parsed.client_email,
      privateKey: normalizePrivateKey(parsed.private_key),
    };
  }

  const clientEmail = env.GOOGLE_SERVICE_ACCOUNT_EMAIL || env.GOOGLE_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || env.GOOGLE_PRIVATE_KEY);
  if (!clientEmail || !privateKey) return null;
  return { clientEmail, privateKey };
}

function googleApiKey(env = process.env) {
  return env.GOOGLE_API_KEY || env.NEXT_PUBLIC_GOOGLE_API_KEY || 'AIzaSyB7URTxURLa4p7gPpgXCBGiHajWv9rXREw';
}

async function getServiceAccountToken(scopes, env = process.env) {
  const account = serviceAccountFromEnv(env);
  if (!account) return null;

  const scopeText = Array.isArray(scopes) ? scopes.join(' ') : String(scopes || READ_SCOPE);
  const cacheKey = `${account.clientEmail}:${scopeText}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60000) return cached.token;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: account.clientEmail,
    scope: scopeText,
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(account.privateKey);
  const assertion = `${unsigned}.${base64url(signature)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || `Google OAuth HTTP ${res.status}`);

  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(60, Number(data.expires_in || 3600) - 60) * 1000,
  });
  return data.access_token;
}

function appendQuery(url, query = {}) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) value.forEach(item => params.append(key, item));
    else params.set(key, value);
  });
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function googleSheetsRequest(path, {
  method = 'GET',
  query = {},
  body,
  scopes = [READ_SCOPE],
  env = process.env,
  requireServiceAccount = false,
  allowApiKey = true,
} = {}) {
  const headers = {};
  const token = await getServiceAccountToken(scopes, env);
  const nextQuery = { ...query };
  if (token) {
    headers.authorization = `Bearer ${token}`;
  } else if (requireServiceAccount) {
    throw new Error('Google service account credentials are required for snapshot writes.');
  } else if (allowApiKey) {
    nextQuery.key = googleApiKey(env);
  } else {
    throw new Error('Google credentials are not configured.');
  }

  if (body !== undefined) headers['content-type'] = 'application/json';
  const url = appendQuery(`https://sheets.googleapis.com/v4/${path}`, nextQuery);
  const requestBody = body === undefined ? undefined : JSON.stringify(body);
  const maxRetries = Math.max(1, Number(env.SELLER_OS_GOOGLE_RETRIES || 6));

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(url, { method, headers, body: requestBody });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (res.ok) return data;

    const canRetry = res.status === 429 || res.status >= 500;
    if (canRetry && attempt < maxRetries - 1) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(2000 * Math.pow(2, attempt), 30000);
      await sleep(delay);
      continue;
    }
    throw new Error(data.error?.message || `Google Sheets HTTP ${res.status}`);
  }
  throw new Error('Google Sheets request failed after retries.');
}

function sheetRange(title, a1 = 'A:Z') {
  return `'${String(title).replace(/'/g, "''")}'!${a1}`;
}

async function getSpreadsheetSheets(spreadsheetId, options = {}) {
  return googleSheetsRequest(`spreadsheets/${spreadsheetId}`, {
    ...options,
    query: { fields: 'sheets.properties(title,sheetType)', ...(options.query || {}) },
  });
}

async function getValues(spreadsheetId, range, options = {}) {
  return googleSheetsRequest(`spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`, options);
}

async function batchGetValues(spreadsheetId, ranges, options = {}) {
  return googleSheetsRequest(`spreadsheets/${spreadsheetId}/values:batchGet`, {
    ...options,
    query: { ranges, ...(options.query || {}) },
  });
}

async function clearValues(spreadsheetId, range, options = {}) {
  return googleSheetsRequest(`spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:clear`, {
    ...options,
    method: 'POST',
    body: {},
    scopes: [WRITE_SCOPE],
    requireServiceAccount: true,
  });
}

async function updateValues(spreadsheetId, range, values, options = {}) {
  return googleSheetsRequest(`spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`, {
    ...options,
    method: 'PUT',
    query: { valueInputOption: 'RAW', ...(options.query || {}) },
    body: { values },
    scopes: [WRITE_SCOPE],
    requireServiceAccount: true,
  });
}

async function ensureSheet(spreadsheetId, title, options = {}) {
  const meta = await getSpreadsheetSheets(spreadsheetId, {
    ...options,
    scopes: [WRITE_SCOPE],
    requireServiceAccount: true,
  });
  const exists = (meta.sheets || []).some(sheet => sheet.properties?.title === title);
  if (exists) return;
  await googleSheetsRequest(`spreadsheets/${spreadsheetId}:batchUpdate`, {
    ...options,
    method: 'POST',
    body: {
      requests: [{
        addSheet: {
          properties: {
            title,
            gridProperties: { rowCount: 200, columnCount: 4 },
          },
        },
      }],
    },
    scopes: [WRITE_SCOPE],
    requireServiceAccount: true,
  });
}

function snapshotSpreadsheetId(env = process.env) {
  return env.SELLER_OS_SNAPSHOT_SPREADSHEET_ID || env.SNAPSHOT_SPREADSHEET_ID || '';
}

function snapshotTab(env = process.env) {
  return env.SELLER_OS_SNAPSHOT_TAB || env.SNAPSHOT_TAB || DEFAULT_SNAPSHOT_TAB;
}

function chunkText(text, size = 45000) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}

async function writeSnapshotToSheet(snapshot, { env = process.env } = {}) {
  const spreadsheetId = snapshotSpreadsheetId(env);
  if (!spreadsheetId) throw new Error('SELLER_OS_SNAPSHOT_SPREADSHEET_ID is not configured.');
  const tab = snapshotTab(env);
  const json = JSON.stringify(snapshot);
  const chunks = chunkText(json);
  await ensureSheet(spreadsheetId, tab, { env });
  await clearValues(spreadsheetId, sheetRange(tab, 'A:C'), { env });
  await updateValues(spreadsheetId, sheetRange(tab, `A1:C${chunks.length + 1}`), [
    [SNAPSHOT_MAGIC, snapshot.generatedAt || new Date().toISOString(), String(json.length)],
    ...chunks.map((chunk, idx) => [chunk, String(idx + 1), String(chunks.length)]),
  ], { env });
  return { spreadsheetId, tab, chunks: chunks.length, bytes: json.length };
}

async function readSnapshotFromSheet({ env = process.env } = {}) {
  const spreadsheetId = snapshotSpreadsheetId(env);
  if (!spreadsheetId) return { configured: false, reason: 'missing_snapshot_spreadsheet_id' };
  const tab = snapshotTab(env);
  const data = await getValues(spreadsheetId, sheetRange(tab, 'A:C'), { env });
  const rows = data.values || [];
  if (!rows.length || rows[0][0] !== SNAPSHOT_MAGIC) {
    throw new Error(`Snapshot tab ${tab} is empty or not a Seller OS snapshot.`);
  }
  const json = rows.slice(1).map(row => row[0] || '').join('');
  const snapshot = JSON.parse(json);
  return {
    configured: true,
    spreadsheetId,
    tab,
    generatedAt: rows[0][1] || snapshot.generatedAt || null,
    bytes: Number(rows[0][2] || json.length),
    chunks: Math.max(0, rows.length - 1),
    snapshot,
  };
}

module.exports = {
  DEFAULT_SNAPSHOT_TAB,
  READ_SCOPE,
  SNAPSHOT_MAGIC,
  WRITE_SCOPE,
  batchGetValues,
  clearValues,
  getServiceAccountToken,
  getSpreadsheetSheets,
  getValues,
  googleApiKey,
  googleSheetsRequest,
  readSnapshotFromSheet,
  serviceAccountFromEnv,
  sheetRange,
  snapshotSpreadsheetId,
  snapshotTab,
  updateValues,
  writeSnapshotToSheet,
};
