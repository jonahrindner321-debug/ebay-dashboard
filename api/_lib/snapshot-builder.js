const { AMAZON_FBM_SOURCES, SHEETS, TIKTOK_SOURCES, WALMART_SOURCES, currencyOptionsFor } = require('./seller-config');
const { normSpecial, parseAmazonFbmValues, parseExpenseTab, parseValues, r2 } = require('./seller-parse');
const { batchGetValues, getSpreadsheetSheets, getValues, sheetRange } = require('./google-sheets');

const REQUEST_GAP_MS = Number(process.env.SELLER_OS_GOOGLE_GAP_MS || 1100);
const SKIP_SOURCE_TABS = /^(?:_meta)$/i;
const SKIP_DATA_TABS = /expense|gift|giftcard|template|summary|overview|instruction/i;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function sourceActivityLabel(src, prefix) {
  return src.activityLabel || `${prefix} ${src.person}`;
}

function sourceReadEnv(env = process.env) {
  return {
    ...env,
    GOOGLE_SERVICE_ACCOUNT_JSON: '',
    SELLER_OS_GOOGLE_SERVICE_ACCOUNT_JSON: '',
    GOOGLE_SERVICE_ACCOUNT_EMAIL: '',
    GOOGLE_CLIENT_EMAIL: '',
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: '',
    GOOGLE_PRIVATE_KEY: '',
  };
}

async function getTabs(id, env) {
  const data = await getSpreadsheetSheets(id, { env });
  return (data.sheets || [])
    .filter(sheet => sheet.properties?.sheetType === 'GRID')
    .map(sheet => sheet.properties.title);
}

async function batchTabValues(id, tabs, env) {
  if (!tabs.length) return [];
  const valueRanges = await batchGetValues(id, tabs.map(tab => sheetRange(tab, 'A:AZ')), { env });
  return valueRanges.valueRanges || [];
}

async function readMetaTimestamp(id, env) {
  const candidates = ['_meta', '_Meta'];
  let lastError = null;
  for (const tab of candidates) {
    try {
      const meta = await getValues(id, sheetRange(tab, 'A1'), { env });
      const value = meta.values && meta.values[0] && meta.values[0][0];
      return { hasMeta: true, value: value || null };
    } catch (e) {
      lastError = e;
    }
  }
  return { hasMeta: false, value: null, error: lastError?.message };
}

function pushExpenseRows(expenses, expRows) {
  expRows.forEach(e => {
    if (!expenses[e.person]) expenses[e.person] = {};
    expenses[e.person][e.monthKey] = r2((expenses[e.person][e.monthKey] || 0) + e.amount);
  });
}

async function buildEbaySources({ raw, expenses, loadAudit, tabErrors, env }) {
  let sourceCount = 0;
  for (const id of Object.keys(SHEETS)) {
    await sleep(REQUEST_GAP_MS);
    const person = SHEETS[id];
    try {
      const tabs = (await getTabs(id, env)).filter(tab => !/^_meta$/i.test(tab));
      sourceCount += tabs.length;
      const valueRanges = await batchTabValues(id, tabs, env);
      tabs.forEach((tab, idx) => {
        const values = valueRanges[idx]?.values || [];
        const isExp = /^expenses?$/i.test(String(tab || '').trim());
        try {
          if (isExp) {
            const expRows = parseExpenseTab(values, person, currencyOptionsFor(person));
            pushExpenseRows(expenses, expRows);
            loadAudit.push({ person, tab, rows: expRows.length, profit: 0, status: expRows.length ? 'ok' : 'skipped' });
            return;
          }
          const channel = /tik.?tok/i.test(tab) ? 'tiktok' : 'ebay';
          const parsed = parseValues(values, person, normSpecial(tab), channel, currencyOptionsFor(person));
          raw.push(...parsed);
          loadAudit.push({
            person,
            tab,
            rows: parsed.length,
            profit: r2(parsed.reduce((sum, record) => sum + record.profit, 0)),
            status: parsed.length ? 'ok' : 'skipped',
            channel,
          });
        } catch (e) {
          loadAudit.push({ person, tab, rows: 0, profit: 0, status: 'error', err: e.message, channel: 'ebay' });
        }
      });
    } catch (e) {
      tabErrors.push({ id, person, sourceType: 'ebay', error: e.message });
    }
  }
  return sourceCount;
}

async function buildTikTokSources({ raw, loadAudit, tabErrors, env }) {
  let sourceCount = 0;
  for (const src of TIKTOK_SOURCES) {
    await sleep(REQUEST_GAP_MS);
    try {
      const tabs = (await getTabs(src.id, env)).filter(tab => /tik.?tok/i.test(tab));
      sourceCount += tabs.length;
      const valueRanges = await batchTabValues(src.id, tabs, env);
      tabs.forEach((tab, idx) => {
        try {
          const parsed = parseValues(valueRanges[idx]?.values || [], src.person, normSpecial(tab), 'tiktok', currencyOptionsFor(src.person));
          raw.push(...parsed);
          loadAudit.push({
            person: src.person,
            tab: `TikTok / ${tab}`,
            rows: parsed.length,
            profit: r2(parsed.reduce((sum, record) => sum + record.profit, 0)),
            status: parsed.length ? 'ok' : 'skipped',
            channel: 'tiktok',
          });
        } catch (e) {
          loadAudit.push({ person: src.person, tab: `TikTok / ${tab}`, rows: 0, profit: 0, status: 'error', err: e.message, channel: 'tiktok' });
        }
      });
    } catch (e) {
      tabErrors.push({ id: src.id, person: src.person, sourceType: 'tiktok', error: e.message });
    }
  }
  return sourceCount;
}

async function buildWalmartSources({ raw, loadAudit, tabErrors, env }) {
  let sourceCount = 0;
  for (const src of WALMART_SOURCES) {
    await sleep(REQUEST_GAP_MS);
    try {
      const tabs = src.tab
        ? [src.tab]
        : (await getTabs(src.id, env)).filter(tab => !SKIP_SOURCE_TABS.test(tab) && !SKIP_DATA_TABS.test(tab));
      sourceCount += tabs.length;
      const valueRanges = await batchTabValues(src.id, tabs, env);
      tabs.forEach((tab, idx) => {
        try {
          const parsed = src.parser === 'order_sheet'
            ? parseAmazonFbmValues(valueRanges[idx]?.values || [], src.person, {
                channel: 'walmart',
                platform: 'walmart',
                source: 'Walmart Seller Order Sheet',
              })
            : parseValues(valueRanges[idx]?.values || [], src.person, normSpecial(tab), 'walmart', currencyOptionsFor(src.person));
          raw.push(...parsed);
          loadAudit.push({
            person: src.person,
            tab: `Walmart / ${tab}`,
            rows: parsed.length,
            profit: r2(parsed.reduce((sum, record) => sum + record.profit, 0)),
            status: parsed.length ? 'ok' : 'skipped',
            channel: 'walmart',
          });
        } catch (e) {
          loadAudit.push({ person: src.person, tab: `Walmart / ${tab}`, rows: 0, profit: 0, status: 'error', err: e.message, channel: 'walmart' });
        }
      });
    } catch (e) {
      tabErrors.push({ id: src.id, person: src.person, sourceType: 'walmart', error: e.message });
    }
  }
  return sourceCount;
}

async function buildAmazonFbmSources({ raw, loadAudit, env }) {
  let sourceCount = 0;
  for (const src of AMAZON_FBM_SOURCES) {
    await sleep(REQUEST_GAP_MS);
    sourceCount += 1;
    try {
      const data = await getValues(src.id, sheetRange(src.tab, 'A:AZ'), { env });
      const parsed = parseAmazonFbmValues(data.values || [], src.person, {
        channel: 'amazon_fbm',
        platform: 'amazon',
        source: 'Amazon Seller Central Order Sheet',
      });
      raw.push(...parsed);
      loadAudit.push({
        person: src.person,
        tab: `Amazon / ${src.tab}`,
        rows: parsed.length,
        profit: r2(parsed.reduce((sum, record) => sum + record.profit, 0)),
        status: parsed.length ? 'ok' : 'skipped',
        channel: 'amazon_fbm',
      });
    } catch (e) {
      loadAudit.push({ person: src.person, tab: `Amazon / ${src.tab}`, rows: 0, profit: 0, status: 'error', err: e.message, channel: 'amazon_fbm' });
    }
  }
  return sourceCount;
}

async function buildTimestampStatus({ sheetModified, sheetStatus, env }) {
  const sources = [
    ...Object.keys(SHEETS).map(id => ({ id, label: SHEETS[id], type: 'ebay' })),
    ...AMAZON_FBM_SOURCES.map(src => ({ id: src.id, label: sourceActivityLabel(src, 'Amazon'), type: 'amazon_fbm' })),
    ...TIKTOK_SOURCES.map(src => ({ id: src.id, label: `TikTok ${src.person}`, type: 'tiktok' })),
    ...WALMART_SOURCES.map(src => ({ id: src.id, label: sourceActivityLabel(src, 'Walmart'), type: 'walmart' })),
  ];

  for (const src of sources) {
    await sleep(REQUEST_GAP_MS);
    try {
      const meta = await readMetaTimestamp(src.id, env);
      if (meta.value) sheetModified[src.label] = meta.value;
      sheetStatus[src.label] = {
        state: meta.value ? 'ok' : 'missing',
        checkedAt: Date.now(),
        type: src.type,
        error: meta.hasMeta ? undefined : (meta.error || 'No _meta tab found'),
      };
    } catch (e) {
      sheetStatus[src.label] = {
        state: 'missing',
        checkedAt: Date.now(),
        type: src.type,
        error: e.message,
      };
    }
  }
}

async function buildSnapshot({ env = process.env } = {}) {
  const readEnv = sourceReadEnv(env);
  const raw = [];
  const expenses = {};
  const loadAudit = [];
  const storeCreated = {};
  const sheetModified = {};
  const sheetStatus = {};
  const tabErrors = [];

  let sourceCount = 0;
  sourceCount += await buildEbaySources({ raw, expenses, loadAudit, tabErrors, env: readEnv });
  sourceCount += await buildTikTokSources({ raw, loadAudit, tabErrors, env: readEnv });
  sourceCount += await buildWalmartSources({ raw, loadAudit, tabErrors, env: readEnv });
  sourceCount += await buildAmazonFbmSources({ raw, loadAudit, env: readEnv });
  await buildTimestampStatus({ sheetModified, sheetStatus, env: readEnv });

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
    errorCount: loadAudit.filter(item => item.status === 'error').length + tabErrors.length,
  };
}

module.exports = {
  buildSnapshot,
  sourceReadEnv,
};
