function r2(v) {
  return Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100;
}

function parseMoney(v) {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  if (!s || s === '-' || s === '—') return 0;
  const negative = /^\(.*\)$/.test(s) || /^-/.test(s) || /-\s*[^\d]*\d/.test(s);
  const f = parseFloat(s.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(f)) return 0;
  return negative ? -f : f;
}

function monthKeyFromLabel(label) {
  const m = String(label || '').match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const mo = MONTH_NAME_MAP[m[1].toLowerCase().slice(0, 3)];
  return mo ? `${m[2]}-${String(mo).padStart(2, '0')}` : null;
}

function monthKeyForRecord(record) {
  if (record.date && /^\d{4}-\d{2}-\d{2}$/.test(record.date)) return record.date.slice(0, 7);
  return monthKeyFromLabel(record.month);
}

function resolveFxRate(options, record) {
  const sourceCurrency = options.sourceCurrency || options.currency || 'USD';
  if (sourceCurrency === 'USD') return { sourceCurrency, fxRate: 1, fxMonthKey: null };
  const rates = options.fxRatesToUsd || options.monthlyRates || {};
  const fxMonthKey = monthKeyForRecord(record);
  const fxRate = Number(
    rates[fxMonthKey] ??
    rates.default ??
    options.fxRate ??
    1
  );
  return { sourceCurrency, fxRate: Number.isFinite(fxRate) ? fxRate : 1, fxMonthKey };
}

function normalizeMoneyRecord(record, options = {}) {
  const { sourceCurrency, fxRate, fxMonthKey } = resolveFxRate(options, record);
  record.currency = 'USD';
  record.sourceCurrency = sourceCurrency;
  if (sourceCurrency === 'USD' || !Number.isFinite(fxRate) || fxRate === 1) return record;

  ['price', 'cost', 'fee', 'profit'].forEach(field => {
    const nativeValue = Number(record[field] || 0);
    record[`${field}Native`] = r2(nativeValue);
    record[field] = r2(nativeValue * fxRate);
  });
  record.fxRate = fxRate;
  record.fxMonthKey = fxMonthKey;
  return record;
}

function normalizeExpenseRecord(record, options = {}) {
  const { sourceCurrency, fxRate, fxMonthKey } = resolveFxRate(options, {
    month: record.monthKey ? null : record.month,
    date: record.monthKey ? `${record.monthKey}-01` : record.date,
  });
  record.currency = 'USD';
  record.sourceCurrency = sourceCurrency;
  if (sourceCurrency === 'USD' || !Number.isFinite(fxRate) || fxRate === 1) return record;

  record.amountNative = r2(record.amount);
  record.amount = r2(record.amount * fxRate);
  record.fxRate = fxRate;
  record.fxMonthKey = fxMonthKey || record.monthKey || null;
  return record;
}

const MONTH_NAME_MAP = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function parseDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().substring(0, 10);
  }
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const mo = MONTH_NAME_MAP[m[1].toLowerCase()];
    if (mo) return `${m[3]}-${String(mo).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().substring(0, 10);
}

function monthLabelFromDate(dateStr, fallback = 'Unknown') {
  if (!dateStr) return fallback;
  const d = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return fallback;
  return `${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

function normSpecial(tab) {
  const s = String(tab || '').replace(/_/g, ' ');
  const m = s.match(/([A-Za-z]+)\s*(\d{4}|\d{2})/);
  if (!m) return s.trim();
  const mo = m[1].slice(0, 3);
  const yr = m[2].length === 2 ? `20${m[2]}` : m[2];
  return `${mo[0].toUpperCase()}${mo.slice(1).toLowerCase()} ${yr}`;
}

function parseValues(values, person, monthLabel, channel = 'ebay', options = {}) {
  const rows = [];
  if (!values || values.length < 2) return rows;
  let headerIdx = -1;
  const colMap = {};
  for (let i = 0; i < Math.min(6, values.length); i++) {
    const row = (values[i] || []).map(c => String(c || '').toUpperCase().trim());
    if ((row.includes('DATE') || row.includes('PROFIT')) && (row.includes('PRICE') || row.includes('PROFIT'))) {
      headerIdx = i;
      row.forEach((h, idx) => {
        if (h === 'DATE') colMap.date = idx;
        else if (h === 'PRICE') colMap.price = idx;
        else if (h === 'COST') colMap.cost = idx;
        else if (h.includes('FEE')) colMap.fee = idx;
        else if (h === 'PAYOUTS') colMap.pay = idx;
        else if (h === 'PROFIT') colMap.profit = idx;
        else if (h === 'ROI') colMap.roi = idx;
      });
      break;
    }
  }
  if (headerIdx < 0 || (colMap.price === undefined && colMap.profit === undefined)) return rows;
  for (let i = headerIdx + 1; i < values.length; i++) {
    const row = values[i] || [];
    const price = parseMoney(row[colMap.price]);
    const profit = parseMoney(row[colMap.profit]);
    const cost = parseMoney(row[colMap.cost]);
    const fee = parseMoney(row[colMap.fee]);
    if (!price && !profit && !cost && !fee) continue;
    let roi = parseMoney(row[colMap.roi]);
    if (roi !== 0 && Math.abs(roi) <= 2) roi *= 100;
    const dateRaw = colMap.date !== undefined ? row[colMap.date] : null;
    rows.push(normalizeMoneyRecord({
      person,
      month: monthLabel,
      channel,
      date: parseDate(dateRaw),
      _dateRaw: dateRaw,
      price: r2(price),
      cost: r2(cost),
      fee: r2(Math.abs(fee)),
      profit: r2(profit),
      roi: r2(roi),
    }, options));
  }
  return rows;
}

function parseExpenseTab(values, person, options = {}) {
  const result = [];
  for (const row of values || []) {
    if (!row || row.length < 2) continue;
    const label = String(row[0] || '').trim();
    const amt = parseMoney(row[1]);
    const monthRaw = String(row[2] || '').toLowerCase().trim().substring(0, 3);
    const mo = MONTH_NAME_MAP[monthRaw];
    if (!label || !mo || !amt || label.toLowerCase().includes('total')) continue;
    const yr = (mo === 11 || mo === 12) ? 2025 : 2026;
    result.push(normalizeExpenseRecord({ person, monthKey: `${yr}-${String(mo).padStart(2, '0')}`, label, amount: r2(Math.abs(amt)) }, options));
  }
  return result;
}

function parseAmazonFbmValues(values, person = 'Johna', options = {}) {
  const rows = [];
  if (!values || values.length < 2) return rows;
  let headerIdx = -1;
  const colMap = {};
  const channel = options.channel || 'amazon_fbm';
  const platform = options.platform || (channel === 'walmart' ? 'walmart' : 'amazon');
  const source = options.source || (platform === 'walmart' ? 'Walmart Seller Order Sheet' : 'Amazon Seller Central Order Sheet');
  const fallbackMonth = options.fallbackMonthLabel || monthLabelFromDate(new Date().toISOString().substring(0, 10), 'Unknown');
  const feeDisplayName = platform === 'walmart' ? 'walmartFee' : 'amazonFee';
  const norm = h => String(h || '').toUpperCase().replace(/\s+/g, ' ').trim();
  for (let i = 0; i < Math.min(12, values.length); i++) {
    const header = (values[i] || []).map(norm);
    const looksLikeOrderSheet = header.includes('SELLER ORDER ID') || header.includes('SALE PRICE') || header.includes('AMAZON FEE') || header.includes('AMAZONFEE') || header.includes('WALMART FEE') || header.includes('PROFIT');
    const hasDateColumn = header.includes('DATE') || header[0] === '';
    if (hasDateColumn && looksLikeOrderSheet) {
      headerIdx = i;
      header.forEach((h, idx) => {
        if (h === 'DATE' || (idx === 0 && !h && colMap.date === undefined)) colMap.date = idx;
        else if (h === 'SELLER ORDER ID') colMap.orderId = idx;
        else if (h === 'PO NUMBER') colMap.poNumber = idx;
        else if (h === 'URL') colMap.url = idx;
        else if (h === 'SKU') colMap.sku = idx;
        else if (h === 'PRODUCT NAME') colMap.product = idx;
        else if (h === 'BUYER ORDER ID') colMap.buyerOrderId = idx;
        else if (h === 'BUYING ORDER ID') colMap.buyerMail = idx;
        else if (h === 'BUYER ORDER MAIL' || h === 'BUYER ORDER EMAIL') colMap.buyerMail = idx;
        else if (h === 'BUYER ORDER NUMBER' || h === 'BUYING ORDER NUMBER') colMap.buyerOrderNumber = idx;
        else if (h === 'TRACKING') colMap.tracking = idx;
        else if (h === 'CARRIER') colMap.carrier = idx;
        else if (h === 'CARD ENDING') colMap.cardEnding = idx;
        else if (h === 'SHORT CODE') colMap.shortCode = idx;
        else if (h === 'STATUS') colMap.status = idx;
        else if (h === 'ADDRESS' || h === 'TO (ADDRESS 1)' || h === 'TO ADDRESS 1') colMap.address = idx;
        else if (h === 'QTY') colMap.qty = idx;
        else if (h === 'SALE PRICE') colMap.price = idx;
        else if (h === 'AMAZON FEE' || h === 'AMAZONFEE' || h === 'WALMART FEE' || h === 'PLATFORM FEE') colMap.platformFee = idx;
        else if (h === 'TOTAL RATE') colMap.payout = idx;
        else if (h.includes('LABEL')) colMap.label = idx;
        else if (h.includes('PREP')) colMap.prep = idx;
        else if (h === 'SHIP' || h === 'SHIPPING' || h.includes('SHIPPING COST')) colMap.ship = idx;
        else if (h === 'UNIT COST' && colMap.unitCost === undefined) colMap.unitCost = idx;
        else if (h === 'TOTAL COST' && colMap.totalCost === undefined) colMap.totalCost = idx;
        else if (h === 'PROFIT') colMap.profit = idx;
        else if (h === 'ROI') colMap.roi = idx;
        else if (h === 'TAX') colMap.tax = idx;
      });
      break;
    }
  }
  if (headerIdx < 0 || (colMap.price === undefined && colMap.profit === undefined)) return rows;
  for (let i = headerIdx + 1; i < values.length; i++) {
    const row = values[i] || [];
    const dateRaw = colMap.date !== undefined ? row[colMap.date] : null;
    const dateStr = parseDate(dateRaw);
    const orderId = String(row[colMap.orderId] || '').trim();
    const poNumber = String(row[colMap.poNumber] || '').trim();
    const price = parseMoney(row[colMap.price]);
    const platformFee = Math.abs(parseMoney(row[colMap.platformFee]));
    const qty = Math.max(1, Math.round(parseMoney(row[colMap.qty])) || 1);
    const label = Math.abs(parseMoney(row[colMap.label]));
    const prep = Math.abs(parseMoney(row[colMap.prep]));
    const ship = Math.abs(parseMoney(row[colMap.ship]));
    const unitCost = Math.abs(parseMoney(row[colMap.unitCost]));
    const totalCost = Math.abs(parseMoney(row[colMap.totalCost])) || r2(unitCost * qty + label + prep + ship);
    const profit = parseMoney(row[colMap.profit]);
    const status = String(row[colMap.status] || '').trim();
    const url = String(row[colMap.url] || '').trim();
    const trackingRaw = String(row[colMap.tracking] || '').trim();
    const tracking = /^tracking\s*#?$/i.test(trackingRaw) ? '' : trackingRaw;
    const carrier = String(row[colMap.carrier] || '').trim();
    const buyerMail = String(row[colMap.buyerMail] || '').trim();
    const buyerOrderId = String(row[colMap.buyerOrderId] || '').trim();
    const buyerOrderNumber = String(row[colMap.buyerOrderNumber] || '').trim();
    const cardEnding = String(row[colMap.cardEnding] || '').trim();
    const shortCode = String(row[colMap.shortCode] || '').trim();
    const address = String(row[colMap.address] || '').trim();
    const hasData = Boolean(dateStr || orderId || poNumber || status || price || platformFee || totalCost || profit);
    if (!hasData || (!dateStr && !orderId && !poNumber && !status && !price && !profit)) continue;
    const hasRealUrl = Boolean(url && !/sellercentral\.amazon\.com\/orders-v3\/order\/?$/i.test(url));
    const hasRowIdentity = Boolean(dateStr || orderId || poNumber || buyerOrderId || buyerMail || buyerOrderNumber || hasRealUrl || tracking || carrier || cardEnding || shortCode || address || status);
    if (!hasRowIdentity) continue;
    let roi = parseMoney(row[colMap.roi]);
    if (roi !== 0 && Math.abs(roi) <= 2) roi *= 100;
    const payout = parseMoney(row[colMap.payout]);
    const record = {
      person,
      month: monthLabelFromDate(dateStr, fallbackMonth),
      channel,
      platform,
      source,
      date: dateStr,
      _dateRaw: dateRaw,
      orderId,
      poNumber,
      sku: String(row[colMap.sku] || '').trim(),
      product: String(row[colMap.product] || '').trim(),
      url,
      buyerMail,
      buyerOrderId,
      buyerOrderNumber,
      tracking,
      carrier,
      cardEnding,
      shortCode,
      address,
      status,
      sales: qty,
      price: r2(price),
      cost: r2(totalCost),
      fee: r2(platformFee),
      tax: r2(Math.abs(parseMoney(row[colMap.tax]))),
      payout: r2(payout),
      platformPayout: r2(payout || Math.max(0, price - platformFee)),
      label: r2(label),
      prep: r2(prep),
      ship: r2(ship),
      unitCost: r2(unitCost),
      unitCostTotal: r2(unitCost * qty),
      profit: r2(profit),
      roi: r2(roi),
    };
    record[feeDisplayName] = r2(platformFee);
    if (platform === 'amazon') record.amazonPayout = record.platformPayout;
    if (platform === 'walmart') record.walmartPayout = record.platformPayout;
    rows.push(record);
  }
  return rows;
}

module.exports = {
  normSpecial,
  normalizeMoneyRecord,
  parseAmazonFbmValues,
  parseExpenseTab,
  parseValues,
  r2,
};
