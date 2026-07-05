const { getSql, hasDb } = require('./_lib/db');
const { AMAZON_FBM_SOURCES, SHEETS, TIKTOK_SOURCES, WALMART_SOURCES, currencyOptionsFor } = require('./_lib/seller-config');
const { normSpecial, parseAmazonFbmValues, parseExpenseTab, parseValues, r2 } = require('./_lib/seller-parse');

const SNAPSHOT_KEY = 'seller-os-main';
const REQUEST_GAP_MS = 350;
const SKIP_SOURCE_TABS = /^(?:_meta)$/i;
const SKIP_DATA_TABS = /expense|gift|giftcard|template|summary|overview|instruction/i;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function googleKey() {
  return process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_API_KEY || 'AIzaSyB7URTxURLa4p7gPpgXCBGiHajWv9rXREw';
}

async function googleFetch(type, { id, tab }) {
  const key = googleKey();
  if (!key) throw new Error('GOOGLE_API_KEY is not configured');
  let url;
  if (type === 'tabs') url = `https://sheets.googleapis.com/v4/spreadsheets/${id}?key=${key}&fields=sheets.properties(title,sheetType)`;
  if (type === 'values') url = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(tab)}!A:Z?key=${key}`;
  if (type === 'drive') url = `https://www.googleapis.com/drive/v3/files/${id}?key=${key}&fields=createdTime,modifiedTime`;
  if (type === 'meta') url = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/_meta!A1?key=${key}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Google ${type} HTTP ${res.status}`);
  return data;
}

async function googleBatchValues(id, tabs) {
  const key = googleKey();
  if (!key) throw new Error('GOOGLE_API_KEY is not configured');
  const params = new URLSearchParams({ key });
  tabs.forEach(tab => params.append('ranges', `${tab}!A:Z`));
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchGet?${params.toString()}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Google batchGet HTTP ${res.status}`);
  return data.valueRanges || [];
}

async function safeMeta(src, storeCreated, sheetModified, sheetStatus) {
  let hasTimestamp = false;
  let lastError = null;
  try {
    let meta = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        meta = await googleFetch('meta', { id: src.id });
        lastError = null;
        break;
      } catch (e) {
        lastError = e;
        if (attempt < 2) await sleep(REQUEST_GAP_MS * (attempt + 1));
      }
    }
    if (!meta) throw lastError || new Error('No _meta response');
    const val = meta.values && meta.values[0] && meta.values[0][0];
    if (val) {
      sheetModified[src.label] = val;
      hasTimestamp = true;
    }
  } catch (e) {
    lastError = e;
  }
  sheetStatus[src.label] = {
    state: hasTimestamp ? 'ok' : 'missing',
    checkedAt: Date.now(),
    type: src.type,
    error: hasTimestamp ? undefined : lastError?.message,
  };
}

async function buildSnapshot() {
  const raw = [];
  const expenses = {};
  const loadAudit = [];
  const storeCreated = {};
  const sheetModified = {};
  const sheetStatus = {};
  const tabErrors = [];
  let sourceCount = 0;

  const ids = Object.keys(SHEETS);
  for (const id of ids) {
    await sleep(REQUEST_GAP_MS);
    try {
      const data = await googleFetch('tabs', { id });
      const tabs = (data.sheets || [])
        .filter(s => s.properties.sheetType === 'GRID')
        .map(s => s.properties.title)
        .filter(tab => !/^_meta$/i.test(tab));
      sourceCount += tabs.length;
      const valueRanges = tabs.length ? await googleBatchValues(id, tabs) : [];
      tabs.forEach((tab, idx) => {
        const values = valueRanges[idx]?.values || [];
        const isExp = /^expenses?$/i.test(String(tab || '').trim());
        try {
          if (isExp) {
            const expRows = parseExpenseTab(values, SHEETS[id], currencyOptionsFor(SHEETS[id]));
            expRows.forEach(e => {
              if (!expenses[e.person]) expenses[e.person] = {};
              expenses[e.person][e.monthKey] = r2((expenses[e.person][e.monthKey] || 0) + e.amount);
            });
            loadAudit.push({ person: SHEETS[id], tab, rows: expRows.length, profit: 0, status: expRows.length ? 'ok' : 'skipped' });
          } else {
            const channel = /tik.?tok/i.test(tab) ? 'tiktok' : 'ebay';
            const parsed = parseValues(values, SHEETS[id], normSpecial(tab), channel, currencyOptionsFor(SHEETS[id]));
            raw.push(...parsed);
            loadAudit.push({ person: SHEETS[id], tab, rows: parsed.length, profit: r2(parsed.reduce((s, r) => s + r.profit, 0)), status: parsed.length ? 'ok' : 'skipped', channel });
          }
        } catch (e) {
          loadAudit.push({ person: SHEETS[id], tab, rows: 0, profit: 0, status: 'error', err: e.message, channel: 'ebay' });
        }
      });
    } catch (e) {
      tabErrors.push({ id, person: SHEETS[id], error: e.message });
    }
  }

  for (const src of TIKTOK_SOURCES) {
    await sleep(REQUEST_GAP_MS);
    try {
      const data = await googleFetch('tabs', { id: src.id });
      const tabs = (data.sheets || [])
        .filter(s => s.properties.sheetType === 'GRID' && /tik.?tok/i.test(s.properties.title))
        .map(s => s.properties.title);
      sourceCount += tabs.length;
      const valueRanges = tabs.length ? await googleBatchValues(src.id, tabs) : [];
      tabs.forEach((tab, idx) => {
        try {
          const parsed = parseValues(valueRanges[idx]?.values || [], src.person, normSpecial(tab), 'tiktok', currencyOptionsFor(src.person));
          raw.push(...parsed);
          loadAudit.push({ person: src.person, tab: `TikTok / ${tab}`, rows: parsed.length, profit: r2(parsed.reduce((s, r) => s + r.profit, 0)), status: parsed.length ? 'ok' : 'skipped', channel: 'tiktok' });
        } catch (e) {
          loadAudit.push({ person: src.person, tab: `TikTok / ${tab}`, rows: 0, profit: 0, status: 'error', err: e.message, channel: 'tiktok' });
        }
      });
    } catch (e) {
      tabErrors.push({ id: src.id, person: src.person, sourceType: 'tiktok', error: e.message });
    }
  }

  for (const src of WALMART_SOURCES) {
    await sleep(REQUEST_GAP_MS);
    try {
      const tabs = src.tab
        ? [src.tab]
        : ((await googleFetch('tabs', { id: src.id })).sheets || [])
            .filter(s => s.properties.sheetType === 'GRID')
            .map(s => s.properties.title)
            .filter(tab => !SKIP_SOURCE_TABS.test(tab) && !SKIP_DATA_TABS.test(tab));
      sourceCount += tabs.length;
      const valueRanges = tabs.length ? await googleBatchValues(src.id, tabs) : [];
      tabs.forEach((tab, idx) => {
        try {
          const parsed = parseValues(valueRanges[idx]?.values || [], src.person, normSpecial(tab), 'walmart', currencyOptionsFor(src.person));
          raw.push(...parsed);
          loadAudit.push({ person: src.person, tab: `Walmart / ${tab}`, rows: parsed.length, profit: r2(parsed.reduce((s, r) => s + r.profit, 0)), status: parsed.length ? 'ok' : 'skipped', channel: 'walmart' });
        } catch (e) {
          loadAudit.push({ person: src.person, tab: `Walmart / ${tab}`, rows: 0, profit: 0, status: 'error', err: e.message, channel: 'walmart' });
        }
      });
    } catch (e) {
      tabErrors.push({ id: src.id, person: src.person, sourceType: 'walmart', error: e.message });
    }
  }

  for (const src of AMAZON_FBM_SOURCES) {
    await sleep(REQUEST_GAP_MS);
    sourceCount += 1;
    try {
      const data = await googleFetch('values', { id: src.id, tab: src.tab });
      const parsed = parseAmazonFbmValues(data.values || [], src.person);
      raw.push(...parsed);
      loadAudit.push({ person: src.person, tab: `Amazon FBM / ${src.tab}`, rows: parsed.length, profit: r2(parsed.reduce((s, r) => s + r.profit, 0)), status: parsed.length ? 'ok' : 'skipped', channel: 'amazon_fbm' });
    } catch (e) {
      loadAudit.push({ person: src.person, tab: `Amazon FBM / ${src.tab}`, rows: 0, profit: 0, status: 'error', err: e.message, channel: 'amazon_fbm' });
    }
  }

  const timestampSources = [
    ...ids.map(id => ({ id, label: SHEETS[id], type: 'ebay' })),
    ...AMAZON_FBM_SOURCES.map(src => ({ id: src.id, label: 'Amazon FBM', type: 'amazon_fbm' })),
    ...TIKTOK_SOURCES.map(src => ({ id: src.id, label: `TikTok ${src.person}`, type: 'tiktok' })),
    ...WALMART_SOURCES.map(src => ({ id: src.id, label: `Walmart ${src.person}`, type: 'walmart' })),
  ];
  for (const src of timestampSources) {
    await sleep(REQUEST_GAP_MS);
    await safeMeta(src, storeCreated, sheetModified, sheetStatus);
  }

  return {
    version: 'seller-os-cache-v1',
    generatedAt: new Date().toISOString(),
    raw,
    expenses,
    storeCreated,
    sheetModified,
    sheetStatus,
    loadAudit,
    tabErrors,
    sourceCount,
    rowCount: raw.length,
    errorCount: loadAudit.filter(a => a.status === 'error').length + tabErrors.length,
  };
}

async function ensureSnapshotTable(sql) {
  await sql`
    create table if not exists dashboard_snapshots (
      key text primary key,
      payload jsonb not null,
      generated_at timestamptz not null default now(),
      source_count integer not null default 0,
      row_count integer not null default 0,
      error_count integer not null default 0,
      updated_at timestamptz not null default now()
    )
  `;
}

module.exports = async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!hasDb()) {
    res.status(503).json({ error: 'DATABASE_URL is not configured' });
    return;
  }
  if (!googleKey()) {
    res.status(503).json({ error: 'GOOGLE_API_KEY is not configured' });
    return;
  }

  try {
    const snapshot = await buildSnapshot();
    const sql = getSql();
    await ensureSnapshotTable(sql);
    await sql`
      insert into dashboard_snapshots (key, payload, generated_at, source_count, row_count, error_count, updated_at)
      values (${SNAPSHOT_KEY}, ${snapshot}, ${snapshot.generatedAt}, ${snapshot.sourceCount}, ${snapshot.rowCount}, ${snapshot.errorCount}, now())
      on conflict (key) do update set
        payload = excluded.payload,
        generated_at = excluded.generated_at,
        source_count = excluded.source_count,
        row_count = excluded.row_count,
        error_count = excluded.error_count,
        updated_at = now()
    `;
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, key: SNAPSHOT_KEY, generatedAt: snapshot.generatedAt, rowCount: snapshot.rowCount, sourceCount: snapshot.sourceCount, errorCount: snapshot.errorCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
