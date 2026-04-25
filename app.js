// ─── CONFIG ────────────────────────────────────────────────────────────────
const SHEETS = {
  '1_81VM_63ZT_p5LEGkvEU2MBxbc4RBWzmd_RKgXL_icA': 'Russell',
  '1k-GFkk-jFhnrD2v-qIEdV0zyy0kOpvbIZZ7NbppZTgQ': 'Johna',
  '1nuJojKqj9b_a2RSKn7huV6vTr_62E7707uw1wBh0XDA': 'Dolo LLC',
  '1xsMWqwL381VcGxH5_yhWx_SKixLd_ojievrfqamBB5M': 'John Slop',
  '1wH5s8qdr0-imdK623Tdtu-UgKvRMELD_3Gd7OS2tNmQ': 'Jacob',
  '1GpUdOGG-w2QdnTRMeYT-UTaLAMgdx8LRVmURfUJ_frQ': 'Armando',
  '159BFifTYnDNoyaXNuZ4vIzUo0gJSTCeKW0L40swiyLo': 'Austin',
  '1rrATZ5UBihrfmt0fQF55hVaaq-Ku-C6fYFm6C8kymHA': 'Jack R',
  '1ZoNmwDq6FK-R209uTsra2sPv33vAuc1pFD3NQPAGK2c': 'Delmor',
  '1UHUjPqORhDMX9McbJueVhpRkP7fc3FeOXOiaOWZwhuQ': 'Mariel',
};

const SKIP_TABS = /expense|gift|giftcard|template|summary|overview|instruction/i;

// Stores that have been offboarded/banned — excluded from all data and displays
const BANNED_STORES = new Set(['Paul']);

// ─── LISTING TRACKER ───────────────────────────────────────────────────────
const LISTING_TRACKER_ID   = '1P1k92F_RsQxSE_2qZloA99OiOBEDazch';
const LISTING_TRACKER_SUMMARY_GID = 1098129568;
const LISTING_TRACKER_DAILY_GID   = 2077321990;
// Map listing tracker store names → dashboard person names
const LISTING_NAME_MAP = {
  'Russ':         'Russell',
  'Jonah':        'Johna',
  'Dolo LLC':     'Dolo LLC',
  'Jacob':        'Jacob',
  'Armando':      'Armando',
  'Sloop':        'John Slop',
  'Austin':       'Austin',
  'Mariel':       'Mariel',
  'Huny (delmor)':'Delmor',
  'Jack':         'Jack R',
};
let LISTING_DATA = { summary: [], todayRow: null, dailyColNames: [] };
let CHANNEL_FILTER = 'all'; // 'all' | 'ebay' | 'tiktok'

// Store creation dates fetched from Drive API — populated on load
const STORE_CREATED = {}; // { person: 'YYYY-MM-DD' }
const SHEET_MODIFIED = {}; // { person: ISO datetime string }

// Expenses parsed from Expense tabs — populated on load
// Structure: { person: { 'YYYY-MM': totalAmount, ... } }
const EXPENSES = {};

// Convert month label "Mar 2026" → "2026-03"
function monthLabelToKey(label) {
  const MN = {Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'};
  const m = label.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const mo = MN[m[1]]; if (!mo) return null;
  return `${m[2]}-${mo}`;
}

// Get total expenses for a person across given month keys (or all if none given)
function getExpenses(person, monthKeys) {
  const pExp = EXPENSES[person] || {};
  if (!monthKeys) return r2(Object.values(pExp).reduce((s,v)=>s+v,0));
  return r2(monthKeys.reduce((s,k)=>s+(pExp[k]||0),0));
}

// Parse an expense tab — returns array of { person, monthKey, label, amount }
function parseExpenseTab(values, person) {
  const MO = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
  const result = [];
  for (const row of values) {
    if (!row || row.length < 2) continue;
    const label    = String(row[0] || '').trim();
    const amtRaw   = String(row[1] || '').trim();
    const monthRaw = String(row[2] || '').toLowerCase().trim().substring(0, 3);
    // Credential rows have no valid month in col C — they're automatically skipped here
    if (!label || !MO[monthRaw]) continue;
    if (label.toLowerCase().includes('total')) continue; // skip total/summary rows
    const amt = parseFloat(amtRaw.replace(/[$,\s]/g, ''));
    if (!isFinite(amt) || amt <= 0) continue;
    const mo = MO[monthRaw];
    const yr = (mo === 11 || mo === 12) ? 2025 : 2026;
    result.push({ person, monthKey: `${yr}-${String(mo).padStart(2,'0')}`, label, amount: r2(amt) });
  }
  return result;
}

const MONTH_ORDER = [
  'Nov 2025','Dec 2025','Dec/Jan 2026','Jan 2026',
  'Feb 2026','Mar 2026','Apr 2026','May 2026','Jun 2026',
  'Jul 2026','Aug 2026','Sep 2026','Oct 2026','Nov 2026','Dec 2026',
];

const COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f97316','#14b8a6','#3b82f6'];

// ─── PROFIT SPLIT CONFIG ───────────────────────────────────────────────────
// Owned stores → J&R keep 60% of profit
const OWNED_STORES = ['Russell', 'Johna', 'Dolo LLC'];
// Jacob → clean 50/50 split, no Danian cut
const JACOB_STORES = ['Jacob'];
// All others → owner 50% / Danian 30% / J&R 20%

function getSplit(person, profit) {
  if (OWNED_STORES.includes(person)) {
    // J&R own the store: J&R 60%, Danian 40%
    return { type: 'owned', storeOwner: 0, danian: r2(profit * 0.40), danianPct: 40, jr: r2(profit * 0.60), jrPct: 60 };
  } else if (JACOB_STORES.includes(person)) {
    // J&R get 60% but give Jacob 10% name fee → J&R net 50%, Jacob 10%, Danian 40%
    return { type: 'jacob', storeOwner: r2(profit * 0.10), danian: r2(profit * 0.40), danianPct: 40, jr: r2(profit * 0.50), jrPct: 50 };
  } else {
    // Partner stores: owner 50%, Danian 30%, J&R 20%
    return { type: 'partner', storeOwner: r2(profit * 0.50), danian: r2(profit * 0.30), danianPct: 30, jr: r2(profit * 0.20), jrPct: 20 };
  }
}

// ─── STATE ─────────────────────────────────────────────────────────────────
let RAW = [];
let CHARTS = {};
let sortCol = 'profit', sortDir = 'desc';
let API_KEY = 'AIzaSyB7URTxURLa4p7gPpgXCBGiHajWv9rXREw';
let totalJobs = 0, doneJobs = 0;
// Per-tab cache so failed tabs fall back to last good data instead of losing it
// Entries expire after 45 min — stale cache is worse than a fresh fetch
const TAB_CACHE_TTL = 45 * 60 * 1000;
let _tabDataCache = {};  // "person::tab" -> { records: [...], ts: timestamp }
let _expDataCache = {};  // "person::tab" -> { records: [...], ts: timestamp }
let activeTab = 'daily';
let lastChartData = [];
let firstLoad = true;

// ─── HELPERS ───────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
function fmt$(v) {
  if (!isFinite(v)) return '—';
  const a = Math.abs(v), s = v < 0 ? '-' : '';
  if (a >= 1000000) return s + '$' + (a / 1000000).toFixed(2) + 'M';
  if (a >= 1000)    return s + '$' + (a / 1000).toFixed(1) + 'k';
  return s + '$' + a.toFixed(2);
}
function fmtFull$(v) { if (!isFinite(v)) return '—'; const s = v<0?'-':''; return s+'$'+Math.abs(v).toFixed(2); }
function fmtP(v) { return isFinite(v) ? v.toFixed(1) + '%' : '—'; }
function fmtN(v) { return isFinite(v) ? v.toLocaleString() : '—'; }
function r2(v)   { return Math.round((v + Number.EPSILON) * 100) / 100; }
function monthIndex(m) { const i = MONTH_ORDER.indexOf(m); return i >= 0 ? i : 999; }

function setStatus(type, text) {
  const dot = $('s-dot'), tx = $('s-text');
  dot.className = 's-dot ' + type;
  tx.textContent = text;
}
function setProgress(done, total) {
  $('progress-fill').style.width = total > 0 ? (done / total * 100) + '%' : '0%';
}

function roiPill(r) {
  const c = r >= 30 ? 'green' : r >= 15 ? 'yellow' : 'red';
  return `<span class="pill ${c}">${fmtP(r)}</span>`;
}

// ─── COUNT-UP ANIMATION ────────────────────────────────────────────────────
function countUp(el, target, duration = 900, prefix = '$', decimals = 1) {
  if (!el) return;
  const start = 0, startTime = performance.now();
  const isNeg = target < 0;
  const abs = Math.abs(target);
  function tick(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const cur = abs * eased;
    let display;
    if (abs >= 1000000) display = (cur/1000000).toFixed(2) + 'M';
    else if (abs >= 1000) display = (cur/1000).toFixed(decimals) + 'k';
    else display = cur.toFixed(2);
    el.textContent = (isNeg ? '-' : '') + prefix + display;
    if (progress < 1) requestAnimationFrame(tick);
    else {
      el.textContent = prefix === '$' ? (isNeg?'-$':' $') + (abs>=1000000?(abs/1000000).toFixed(2)+'M':abs>=1000?(abs/1000).toFixed(decimals)+'k':abs.toFixed(2)) : target.toFixed(decimals) + (prefix === '%' ? '%' : '');
      if (prefix === '$') el.textContent = (isNeg?'-':'') + '$' + (abs>=1000000?(abs/1000000).toFixed(2)+'M':abs>=1000?(abs/1000).toFixed(1)+'k':abs.toFixed(2));
    }
  }
  requestAnimationFrame(tick);
}

// ─── TOAST ─────────────────────────────────────────────────────────────────
function showToast(msg, type = 'info', icon = '●') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
  $('toast-container').appendChild(el);
  setTimeout(() => el.style.opacity = '0', 3200);
  setTimeout(() => el.remove(), 3500);
}

// ─── LIVE CLOCK ────────────────────────────────────────────────────────────
function tickClock() {
  const now = new Date();
  $('live-clock').textContent = now.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
}
setInterval(tickClock, 1000);
tickClock();

// ─── SPARKLINE ─────────────────────────────────────────────────────────────
function drawSparkline(canvas, values, color) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth  || parseInt(canvas.getAttribute('width'))  || 80;
  const H = canvas.offsetHeight || parseInt(canvas.getAttribute('height')) || 32;
  canvas.width = W; canvas.height = H;
  ctx.clearRect(0, 0, W, H);

  const v = values.filter(x => isFinite(x));
  if (v.length < 2) return;

  const min = Math.min(...v), max = Math.max(...v);
  const range = max - min || 1;
  const pad = 3;
  const pts = v.map((val, i) => ({
    x: (i / (v.length - 1)) * W,
    y: pad + (1 - (val - min) / range) * (H - pad * 2)
  }));

  const linePath = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const cpx = (pts[i-1].x + pts[i].x) / 2;
      ctx.bezierCurveTo(cpx, pts[i-1].y, cpx, pts[i].y, pts[i].x, pts[i].y);
    }
  };

  // Fill
  linePath();
  ctx.lineTo(pts[pts.length-1].x, H);
  ctx.lineTo(pts[0].x, H);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, color + '55');
  grad.addColorStop(1, color + '00');
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  linePath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // End dot
  const last = pts[pts.length - 1];
  ctx.beginPath();
  ctx.arc(last.x, last.y, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

// ─── GAUGE CANVAS ──────────────────────────────────────────────────────────
function drawGauge(canvas, pct, color) {
  if (!canvas) return;
  const W = 110, H = 70;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const cx = W / 2, cy = H - 8, r = 48;
  const startA = Math.PI, endA = 2 * Math.PI;

  // Track
  ctx.beginPath();
  ctx.arc(cx, cy, r, startA, endA);
  ctx.lineWidth = 10; ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.stroke();

  // Fill
  if (pct > 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, startA, startA + (pct / 100) * Math.PI);
    ctx.lineWidth = 10; ctx.lineCap = 'round';
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, color);
    g.addColorStop(1, '#06b6d4');
    ctx.strokeStyle = g;
    ctx.stroke();
  }
}

// ─── EXPORT CSV ────────────────────────────────────────────────────────────
function exportCSV() {
  const d = filtered();
  if (!d.length) { showToast('No data to export', 'error', '⚠️'); return; }
  const cols = ['person','month','date','price','cost','fee','profit','roi'];
  const rows = [cols.join(',')];
  d.forEach(r => rows.push(cols.map(c => {
    const v = r[c] ?? '';
    return typeof v === 'string' && v.includes(',') ? `"${v}"` : v;
  }).join(',')));
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ebay-ops-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  showToast('CSV exported!', 'success', '✅');
}

// ─── CHART TAB SWITCH ──────────────────────────────────────────────────────
function switchTab(tab) {
  if (tab === activeTab) return;
  activeTab = tab;
  document.querySelectorAll('.chart-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.chart-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tab));
  if (lastChartData.length) renderChartsForTab(lastChartData, tab);
}

// ─── DATE PARSING ──────────────────────────────────────────────────────────
function parseDate(raw) {
  if (raw === null || raw === undefined) return null;
  const num = parseFloat(raw);
  if (!isNaN(num) && num > 40000 && num < 55000) {
    const dt = new Date(Math.round((num - 25569) * 86400 * 1000));
    if (!isNaN(dt.getTime())) {
      const y = dt.getUTCFullYear(), mo = String(dt.getUTCMonth()+1).padStart(2,'0'), d = String(dt.getUTCDate()).padStart(2,'0');
      return `${y}-${mo}-${d}`;
    }
  }
  const s = String(raw).trim();
  if (!s || s === '0') return null;
  const MO = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) { const yr = m[3].length===2?'20'+m[3]:m[3]; return `${yr}-${String(m[1]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`; }
  m = s.match(/^(\d{1,2})[-\/\s]([A-Za-z]{3,})[-\/\s](\d{2,4})$/);
  if (m) { const mo = MO[m[2].toLowerCase().substring(0,3)]; if (mo) { const yr=m[3].length===2?'20'+m[3]:m[3]; return `${yr}-${String(mo).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`; } }
  m = s.match(/^([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{2,4})$/);
  if (m) { const mo = MO[m[1].toLowerCase().substring(0,3)]; if (mo) { const yr=m[3].length===2?'20'+m[3]:m[3]; return `${yr}-${String(mo).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`; } }
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return `${m[3]}-${String(m[1]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`;
  try {
    const dt = new Date(s);
    if (!isNaN(dt.getTime())) {
      const y=dt.getFullYear(), mo=String(dt.getMonth()+1).padStart(2,'0'), d=String(dt.getDate()).padStart(2,'0');
      if (y >= 2020 && y <= 2035) return `${y}-${mo}-${d}`;
    }
  } catch(e) {}
  return null;
}

function fmtDayLabel(dateStr) {
  const dt = new Date(dateStr + 'T00:00:00');
  const mos = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return mos[dt.getMonth()] + ' ' + dt.getDate();
}

// ─── DAILY AGGREGATION ─────────────────────────────────────────────────────
function getDailyData(data) {
  const byDate = {};
  data.filter(r => r.date).forEach(r => {
    if (!byDate[r.date]) byDate[r.date] = { date: r.date, revenue: 0, profit: 0, cost: 0, fee: 0, sales: 0 };
    byDate[r.date].revenue = r2(byDate[r.date].revenue + r.price);
    byDate[r.date].profit  = r2(byDate[r.date].profit  + r.profit);
    byDate[r.date].cost    = r2(byDate[r.date].cost    + r.cost);
    byDate[r.date].fee     = r2(byDate[r.date].fee     + r.fee);
    byDate[r.date].sales++;
  });
  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
}

// ─── PERIOD COMPARISON ─────────────────────────────────────────────────────
function renderComparison(data) {
  const el = $('comp-strip');
  const allMonths = [...new Set(data.map(r => r.month))]
    .filter(m => !m.includes('/'))
    .sort((a, b) => monthIndex(a) - monthIndex(b));
  if (allMonths.length < 1) { el.style.display = 'none'; return; }
  const show = allMonths.slice(-3);
  const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const today = new Date();
  const thisMonthLabel = `${MN[today.getMonth()]} ${today.getFullYear()}`;
  const calc = rows => ({
    profit:  r2(rows.reduce((s,r)=>s+r.profit,0)),
    revenue: r2(rows.reduce((s,r)=>s+r.price,0)),
    sales:   rows.length,
    margin:  rows.length ? r2(rows.reduce((s,r)=>s+r.profit,0)/Math.max(rows.reduce((s,r)=>s+r.price,0),.01)*100) : 0,
  });
  const pct = (cur,prev) => prev===0?null:r2((cur-prev)/Math.abs(prev)*100);
  const fmtD = d => {
    if (d===null) return '<span class="d-neu">—</span>';
    return `<span class="${d>=0?'d-up':'d-down'}">${d>=0?'▲':'▼'} ${Math.abs(d).toFixed(1)}%</span>`;
  };
  const months = show.map(m => ({ label: m, data: calc(data.filter(r=>r.month===m)) }));
  const prev = months.length >= 2 ? months[months.length-2] : null;
  el.style.display = 'flex';
  el.innerHTML = months.map((mo, i) => {
    const isNewest = i === months.length-1;
    const isPartial = isNewest && mo.label === thisMonthLabel;
    const deltas = isNewest && prev ? prev.data : null;
    return `<div class="card comp-card${isNewest?' curr':''}">
      <div class="comp-period">${mo.label}
        ${isNewest ? '<span class="curr-badge">Current</span>' : ''}
        ${isPartial ? '<span class="partial-badge">In Progress</span>' : ''}
      </div>
      <div class="comp-rows">
        <div class="comp-row"><span class="comp-lbl">Profit</span><div class="comp-r"><span class="comp-val profit">${fmt$(mo.data.profit)}</span>${deltas?fmtD(pct(mo.data.profit,deltas.profit)):''}</div></div>
        <div class="comp-row"><span class="comp-lbl">Margin</span><div class="comp-r"><span class="comp-val">${fmtP(mo.data.margin)}</span>${deltas?fmtD(pct(mo.data.margin,deltas.margin)):''}</div></div>
        <div class="comp-row"><span class="comp-lbl">Revenue</span><div class="comp-r"><span class="comp-val">${fmt$(mo.data.revenue)}</span>${deltas?fmtD(pct(mo.data.revenue,deltas.revenue)):''}</div></div>
        <div class="comp-row"><span class="comp-lbl">Sales</span><div class="comp-r"><span class="comp-val">${fmtN(mo.data.sales)}</span>${deltas?fmtD(pct(mo.data.sales,deltas.sales)):''}</div></div>
      </div>
    </div>`;
  }).join('');
}

// ─── MONTHLY PROJECTION ────────────────────────────────────────────────────
function calcProjection(data) {
  const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const today = new Date();
  const todayLabel = `${MN[today.getMonth()]} ${today.getFullYear()}`;
  const months = [...new Set(data.map(r=>r.month))].filter(m=>!m.includes('/')).sort((a,b)=>monthIndex(a)-monthIndex(b));
  if (!months.length) return null;
  const curMonth = months.includes(todayLabel) ? todayLabel : months[months.length-1];
  const isCurrentMonth = curMonth === todayLabel;
  const rows = data.filter(r=>r.month===curMonth && r.date);
  if (!rows.length) return null;
  const [mName, mYear] = curMonth.split(' ');
  const monthNum = MN.indexOf(mName) + 1, year = parseInt(mYear, 10);
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  let daysElapsed;
  if (isCurrentMonth) {
    daysElapsed = today.getDate();
  } else {
    const dates = [...new Set(rows.map(r=>r.date))].sort();
    daysElapsed = new Date(dates[dates.length-1]+'T00:00:00').getDate();
  }
  const rev = r2(rows.reduce((s,r)=>s+r.price,0));
  const profit = r2(rows.reduce((s,r)=>s+r.profit,0));
  const sales = rows.length;
  return {
    month: curMonth, isCurrentMonth, daysInMonth, daysElapsed,
    progressPct: r2(Math.min(daysElapsed/daysInMonth*100,100)),
    rev, profit, sales,
    projectedRev:    isCurrentMonth ? r2(rev/daysElapsed*daysInMonth) : rev,
    projectedProfit: isCurrentMonth ? r2(profit/daysElapsed*daysInMonth) : profit,
    projectedSales:  isCurrentMonth ? Math.round(sales/daysElapsed*daysInMonth) : sales,
    dailyRevRate:    r2(rev/daysElapsed),
    dailyProfitRate: r2(profit/daysElapsed),
  };
}

// ─── MONTH NORMALISATION ───────────────────────────────────────────────────
function normMonth(title) {
  const t = title.replace(/\(.*\)/g,'').trim();
  const m = {JAN:'Jan',FEB:'Feb',MAR:'Mar',MARC:'Mar',MARCH:'Mar',APR:'Apr',APRIL:'Apr',MAY:'May',JUN:'Jun',JUNE:'Jun',JUL:'Jul',JULY:'Jul',AUG:'Aug',SEPT:'Sep',SEP:'Sep',OCT:'Oct',NOV:'Nov',DEC:'Dec'};
  const match = t.match(/^([A-Za-z]+)[\-_](\d{2,4})$/);
  if (!match) return title;
  const mon = m[match[1].toUpperCase().substring(0,4)] || m[match[1].toUpperCase().substring(0,3)] || match[1];
  let yr = match[2]; if (yr.length===2) yr='20'+yr;
  return mon+' '+yr;
}
function normSpecial(title) {
  const m = title.match(/^([A-Za-z]+)\+([A-Za-z]+)[\-_](\d{2,4})/);
  if (m) { const yr=m[3].length===2?'20'+m[3]:m[3]; return m[1].substring(0,3)+'/'+m[2].substring(0,3)+' '+yr; }
  return normMonth(title);
}

// ─── API KEY ───────────────────────────────────────────────────────────────
function saveApiKey() {
  const key = $('api-key-input').value.trim();
  if (!key) { alert('Please enter an API key.'); return; }
  localStorage.setItem('gsheets_api_key', key);
  API_KEY = key;
  $('setup-overlay').style.display = 'none';
  loadAll();
}
function changeKey() { $('api-key-input').value = API_KEY; $('setup-overlay').style.display = 'flex'; }
function checkApiKey() {
  const k = localStorage.getItem('gsheets_api_key');
  if (k) API_KEY = k; // allow override via setup screen, but default is hardcoded
  $('setup-overlay').style.display = 'none';
  return true;
}

// ─── FETCH ─────────────────────────────────────────────────────────────────
async function apiFetch(url, retry = 4) {
  for (let attempt = 0; attempt < retry; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res.json();
    if (res.status === 429 && attempt < retry - 1) {
      // Rate limited — exponential backoff: 1.5s, 3s, 4.5s, 6s
      await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    throw new Error('HTTP ' + res.status);
  }
}

// ─── PROXY FETCH ────────────────────────────────────────────────────────────
// Tries /api/sheets (server holds the key — key never touches the browser).
// Auto-falls back to direct Google API + local API_KEY if:
//   • proxy not deployed (404)
//   • GOOGLE_API_KEY env var not set on server (503)
//   • any unexpected network error
// This means the dashboard works identically in local dev and on Vercel,
// and a bad deploy of the proxy never takes down the dashboard.
let _proxyOk = null; // null=untested, true=working, false=use direct

async function googleFetch(type, params) {
  if (_proxyOk === false) return _googleDirect(type, params);
  try {
    const qs = new URLSearchParams({ type, ...params }).toString();
    const res = await fetch(`/api/sheets?${qs}`);
    // 404 = proxy not deployed, 503 = env var not set → fall back silently
    if (res.status === 404 || res.status === 405 || res.status === 503) {
      _proxyOk = false;
      return _googleDirect(type, params);
    }
    if (res.status === 429) throw new Error('HTTP 429');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    _proxyOk = true;
    return res.json();
  } catch(e) {
    // Network error or unexpected failure on first attempt → fall back to direct
    if (_proxyOk === null) { _proxyOk = false; return _googleDirect(type, params); }
    throw e;
  }
}

async function _googleDirect(type, { id, tab }) {
  let url;
  if (type === 'tabs')   url = `https://sheets.googleapis.com/v4/spreadsheets/${id}?key=${API_KEY}&fields=sheets.properties(title,sheetType)`;
  if (type === 'values') url = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(tab)}!A:Z?key=${API_KEY}`;
  if (type === 'drive')  url = `https://www.googleapis.com/drive/v3/files/${id}?key=${API_KEY}&fields=createdTime`;
  if (type === 'meta')   url = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/_meta!A1?key=${API_KEY}`;
  return apiFetch(url);
}

async function getDataTabs(id) {
  const data = await googleFetch('tabs', { id });
  // No blacklist — let parseValues detect valid data tabs by looking for DATE+PRICE headers.
  // Any tab without proper headers returns 0 rows automatically, so new/renamed tabs never break anything.
  return (data.sheets||[]).filter(s=>s.properties.sheetType==='GRID').map(s=>s.properties.title);
}
async function getTabValues(id, tab) {
  const data = await googleFetch('values', { id, tab });
  return data.values || [];
}

// ─── TIKTOK SHOP CONNECTOR ────────────────────────────────────────────────
async function refreshTikTokStatus() {
  const btn = $('tiktok-connect-btn');
  if (!btn) return;
  try {
    const res = await fetch('/api/tiktok/status');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const status = await res.json();
    if (!status.configured) {
      btn.textContent = '⟡ TikTok Setup';
      btn.title = `Missing: ${(status.missing || []).join(', ')}`;
      btn.style.color = 'var(--amber)';
      btn.style.borderColor = 'rgba(251,191,36,.45)';
      return;
    }
    if (status.connected) {
      btn.textContent = '⟡ TikTok Linked';
      btn.title = 'TikTok Shop connected read-only';
      btn.style.color = '#34d399';
      btn.style.borderColor = 'rgba(52,211,153,.45)';
      return;
    }
    btn.textContent = '⟡ Link TikTok';
    btn.title = 'Connect TikTok Shop read-only';
    btn.style.color = '#ff6b9d';
    btn.style.borderColor = 'rgba(255,45,85,.4)';
  } catch (e) {
    btn.textContent = '⟡ Link TikTok';
    btn.title = 'TikTok connector not available locally yet';
  }
}

async function connectTikTokShop() {
  try {
    const res = await fetch('/api/tiktok/status');
    if (res.ok) {
      const status = await res.json();
      if (!status.configured) {
        showToast(`TikTok setup needed: ${(status.missing || []).join(', ')}`, 'error', '⟡');
      }
    }
  } catch (e) { /* local static server has no API routes */ }
  window.location.href = '/api/tiktok/connect';
}

// ─── PARSE VALUES ──────────────────────────────────────────────────────────
function parseValues(values, person, monthLabel, channel = 'ebay') {
  const rows = [];
  if (!values || values.length < 2) return rows;
  let headerIdx = -1, colMap = {};
  for (let i = 0; i < Math.min(6, values.length); i++) {
    const row = values[i].map(c=>String(c||'').toUpperCase().trim());
    if ((row.includes('DATE') || row.includes('PROFIT')) && (row.includes('PRICE') || row.includes('PROFIT'))) {
      headerIdx = i;
      row.forEach((h,idx) => {
        if      (h==='DATE')       colMap.date   = idx;
        else if (h==='PRICE')      colMap.price  = idx;
        else if (h==='COST')       colMap.cost   = idx;
        else if (h.includes('FEE'))colMap.fee    = idx;
        else if (h==='PAYOUTS')    colMap.pay    = idx;
        else if (h==='PROFIT')     colMap.profit = idx;
        else if (h==='ROI')        colMap.roi    = idx;
      });
      break;
    }
  }
  // Skip tab only if we couldn't find any recognizable header at all
  if (headerIdx < 0 || (colMap.price === undefined && colMap.profit === undefined)) return rows;
  const n = v => { const f = parseFloat(v); return isFinite(f) ? f : 0; };
  for (let i = headerIdx+1; i < values.length; i++) {
    const row = values[i];
    const price  = n(row[colMap.price]);
    const profit = n(row[colMap.profit]);
    const cost_check = n(row[colMap.cost]);
    const fee_check  = n(row[colMap.fee]);
    // only skip rows that have absolutely no numeric data at all
    if (!price && !profit && !cost_check && !fee_check) continue;
    const cost   = n(row[colMap.cost]);
    const fee    = n(row[colMap.fee]);
    let roi      = n(row[colMap.roi]);
    if (roi !== 0 && Math.abs(roi) <= 2) roi = roi * 100;
    const dateRaw = colMap.date !== undefined ? row[colMap.date] : null;
    const dateStr = parseDate(dateRaw);
    rows.push({ person, month: monthLabel, channel, date: dateStr, _dateRaw: dateRaw,
      price: r2(price), cost: r2(cost), fee: r2(Math.abs(fee)), profit: r2(profit), roi: r2(roi) });
  }
  return rows;
}

// ─── INTRO / TRANSITION ANIMATIONS ────────────────────────────────────────
let _introDismissed = false;
let _introReadyAt   = Date.now() + 1400; // minimum display time

function dismissIntro() {
  if (_introDismissed) return;
  const now = Date.now();
  const delay = Math.max(0, _introReadyAt - now);
  setTimeout(() => {
    const ov = $('intro-overlay');
    if (!ov || _introDismissed) return;
    _introDismissed = true;
    ov.classList.add('out');
    setTimeout(() => { ov.style.display = 'none'; }, 700);
  }, delay);
}

function animateChannelSwitch(ch) {
  const colors = { tiktok: 'rgba(255,45,85,.13)', ebay: 'rgba(99,102,241,.13)', all: 'rgba(139,92,246,.11)' };
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;inset:0;z-index:9990;pointer-events:none;background:${colors[ch]||colors.all};animation:channelFlash .55s ease forwards`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 600);
}

// Safety: dismiss intro after 5s max even if data never loads
setTimeout(() => { _introReadyAt = 0; dismissIntro(); }, 5000);

// ─── MAIN LOAD ─────────────────────────────────────────────────────────────
async function loadAll() {
  if (!API_KEY) { checkApiKey(); return; }
  setStatus('loading', 'Loading…');
  const ri = $('ri'); ri.className = 'spin'; ri.textContent = '↻';
  RAW = []; doneJobs = 0;
  // Clear accumulated state so refreshes don't double-count
  // (cache keeps last-good data; we rebuild from scratch then fill gaps from cache)
  Object.keys(EXPENSES).forEach(k => delete EXPENSES[k]);
  Object.keys(STORE_CREATED).forEach(k => delete STORE_CREATED[k]);
  Object.keys(SHEET_MODIFIED).forEach(k => delete SHEET_MODIFIED[k]);

  const ids = Object.keys(SHEETS);
  let allSources = [], tabErrors = [];

  // Fetch tab lists with stagger to avoid 429 rate limiting — 400ms between each sheet
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const tabLists = [];
  for (let i = 0; i < ids.length; i++) {
    if (i > 0) await delay(400);
    const list = await getDataTabs(ids[i]).catch(e => { tabErrors.push({id: ids[i], e: e.message}); return []; });
    tabLists.push(list);
  }
  ids.forEach((id,i)=>tabLists[i].forEach(tab=>allSources.push({id,person:SHEETS[id],tab})));

  // Fetch sheet creation dates from Drive API (fire and forget — non-blocking)
  Promise.all(ids.map(async id => {
    try {
      const data = await googleFetch('drive', { id });
      if (data.createdTime) {
        STORE_CREATED[SHEETS[id]] = data.createdTime.substring(0, 10); // YYYY-MM-DD
      }
    } catch(e) { /* ignore — creation date is optional info */ }
  }));

  // Fetch last-edit timestamps from _meta!A1 — staggered to avoid 429
  (async () => {
    for (let i = 0; i < ids.length; i++) {
      if (i > 0) await delay(400);
      try {
        const data = await googleFetch('meta', { id: ids[i] });
        const val = data.values && data.values[0] && data.values[0][0];
        if (val) SHEET_MODIFIED[SHEETS[ids[i]]] = val;
      } catch(e) { /* _meta tab not yet created */ }
    }
    renderSheetActivity();
  })();

  // Load listing tracker (fire and forget)
  loadListingTracker();

  if (!allSources.length) {
    const msg = tabErrors.length ? 'API error: '+tabErrors[0].e : 'No tabs — check sheet sharing';
    setStatus('error', msg);
    $('tbody').innerHTML = `<tr><td colspan="9" style="text-align:center;padding:28px;color:var(--rose)">❌ ${msg}</td></tr>`;
    ri.className=''; return;
  }

  totalJobs = allSources.length;
  setProgress(0, totalJobs);
  setStatus('loading', `Fetching 0 / ${totalJobs}…`);

  const loadAudit = []; // track per-tab results

  // Fetch tab data in batches of 3 with 500ms gap — smaller batches reduce 429s
  const BATCH = 3;
  for (let i = 0; i < allSources.length; i += BATCH) {
    const batch = allSources.slice(i, i + BATCH);
    await Promise.all(batch.map(async src => {
      const cacheKey = `${src.person}::${src.tab}`;
      const isExp = /^expenses?$/i.test(src.tab.trim());
      try {
        const values = await getTabValues(src.id, src.tab);

        if (isExp) {
          const expRows = parseExpenseTab(values, src.person);
          _expDataCache[cacheKey] = { records: expRows, ts: Date.now() };
          expRows.forEach(e => {
            if (!EXPENSES[e.person]) EXPENSES[e.person] = {};
            EXPENSES[e.person][e.monthKey] = r2((EXPENSES[e.person][e.monthKey] || 0) + e.amount);
          });
          loadAudit.push({ person: src.person, tab: src.tab, rows: expRows.length, profit: 0, status: expRows.length > 0 ? 'ok' : 'skipped' });
        } else {
          const channel = /tik.?tok/i.test(src.tab) ? 'tiktok' : 'ebay';
          const parsed = parseValues(values, src.person, normSpecial(src.tab), channel);
          _tabDataCache[cacheKey] = { records: parsed, ts: Date.now() };
          RAW.push(...parsed);
          const tabProfit = parsed.reduce((s,r)=>s+r.profit,0);
          loadAudit.push({ person: src.person, tab: src.tab, rows: parsed.length, profit: tabProfit, status: parsed.length > 0 ? 'ok' : 'skipped' });
        }
      } catch(e) {
        // Failed — fall back to cached data only if within TTL
        const now = Date.now();
        const tabCached = !isExp && _tabDataCache[cacheKey] && (now - _tabDataCache[cacheKey].ts) < TAB_CACHE_TTL;
        const expCached = isExp  && _expDataCache[cacheKey] && (now - _expDataCache[cacheKey].ts) < TAB_CACHE_TTL;
        if (tabCached) {
          RAW.push(..._tabDataCache[cacheKey].records);
          const cachedProfit = _tabDataCache[cacheKey].records.reduce((s,r)=>s+r.profit,0);
          const ageMin = Math.round((now - _tabDataCache[cacheKey].ts) / 60000);
          loadAudit.push({ person: src.person, tab: src.tab, rows: _tabDataCache[cacheKey].records.length, profit: cachedProfit, status: 'cached', err: `${e.message} (cache ${ageMin}m old)` });
        } else if (expCached) {
          _expDataCache[cacheKey].records.forEach(e => {
            if (!EXPENSES[e.person]) EXPENSES[e.person] = {};
            EXPENSES[e.person][e.monthKey] = r2((EXPENSES[e.person][e.monthKey] || 0) + e.amount);
          });
          const ageMin = Math.round((now - _expDataCache[cacheKey].ts) / 60000);
          loadAudit.push({ person: src.person, tab: src.tab, rows: _expDataCache[cacheKey].records.length, profit: 0, status: 'cached', err: `${e.message} (cache ${ageMin}m old)` });
        } else {
          loadAudit.push({ person: src.person, tab: src.tab, rows: 0, profit: 0, status: 'error', err: e.message + ((_tabDataCache[cacheKey] || _expDataCache[cacheKey]) ? ' (cache expired)' : '') });
        }
      } finally {
        doneJobs++;
        setProgress(doneJobs, totalJobs);
        setStatus('loading', `Fetching ${doneJobs} / ${totalJobs}…`);
      }
    }));
    if (i + BATCH < allSources.length) await delay(500); // 500ms gap between batches
  }
  window._loadAudit = loadAudit; // expose for audit modal

  ri.className=''; ri.textContent='↻';
  const now = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  $('last-upd').textContent = 'Updated ' + now;

  if (RAW.length) {
    setStatus('live', '● LIVE');
    populateFilters();
    renderAllTimeBanner();
    try { applyFilters(); } catch(e) { console.error('applyFilters error:', e); }
    updateChannelSwitcherVisibility();
    setTimeout(updateChannelSwitcherVisibility, 1000);
    $('audit-btn').style.display = '';
    try { renderGrowthPage(); } catch(e) { console.error('renderGrowthPage error:', e); }
    maybeOpenClientFromUrl();
    if (firstLoad) { showToast(`Loaded ${RAW.length.toLocaleString()} records`, 'success', '✅'); firstLoad = false; }
    else showToast('Data refreshed', 'info', '🔄');
  } else {
    setStatus('error', 'No data — check API key / permissions');
    showToast('No data found', 'error', '⚠️');
  }
  dismissIntro();
}

// ─── FILTERS ───────────────────────────────────────────────────────────────
function populateFilters() {
  const persons = [...new Set(RAW.map(r=>r.person))].sort();
  const months  = [...new Set(RAW.map(r=>r.month))].filter(m => monthIndex(m) < 900).sort((a,b)=>monthIndex(a)-monthIndex(b));
  const pSel = $('filter-person'), mSel = $('filter-month');
  const pv = pSel.value, mv = mSel.value;
  pSel.innerHTML = '<option value="all">All Accounts</option>' + persons.map(p=>`<option value="${p}">${p}</option>`).join('');
  mSel.innerHTML = '<option value="all">All Months</option>'   + months.map(m=>`<option value="${m}">${m}</option>`).join('');
  if (persons.includes(pv)) pSel.value = pv;
  if (months.includes(mv))  mSel.value = mv;
  // Populate H2H dropdowns if they exist (section may have been removed)
  const h2hA = $('h2h-a'), h2hB = $('h2h-b');
  if (h2hA && h2hB) {
    const va = h2hA.value, vb = h2hB.value;
    const opts = persons.map(p=>`<option value="${p}">${p}</option>`).join('');
    h2hA.innerHTML = '<option value="">— Pick Account A —</option>' + opts;
    h2hB.innerHTML = '<option value="">— Pick Account B —</option>' + opts;
    if (persons.includes(va)) h2hA.value = va;
    if (persons.includes(vb)) h2hB.value = vb;
  }
}
function filtered() {
  const p = $('filter-person').value, m = $('filter-month').value;
  const df = ($('filter-date-from')?.value) || '';
  const dt = ($('filter-date-to')?.value)   || '';
  return RAW.filter(r =>
    (p==='all' || r.person===p) &&
    (m==='all' || r.month===m)  &&
    (!df || !r.date || r.date >= df) &&
    (!dt || !r.date || r.date <= dt) &&
    (CHANNEL_FILTER === 'all' || (CHANNEL_FILTER === 'tiktok' ? r.channel === 'tiktok' : r.channel !== 'tiktok'))
  );
}
function clearDates() {
  $('filter-date-from').value = '';
  $('filter-date-to').value   = '';
  applyFilters();
}
function applyFilters() {
  const d = filtered();
  renderSplitSummary(d);
  renderGoalTracker(d);
  renderKPIs(d);
  renderRecords(d);
  renderProjection(d);
  renderComparison(d);
  renderCharts(d);
  renderHeatmap(d);
  renderMomentum(d);
  renderDOWChart(d);
  renderLeaderboard(d);
  renderHealthScores(d);
  renderH2H();

  renderSuggestions(d);
  renderTable(d);
  checkMilestones(r2(d.reduce((s,r)=>s+r.profit,0)));
  // Re-render Growth tab so month filter affects efficiency/profit views there too
  if (LISTING_DATA.summary && LISTING_DATA.summary.length) { try { renderGrowthPage(); } catch(e) { console.error('renderGrowthPage error:', e); } }
}

// ─── PROFIT SPLIT SUMMARY ─────────────────────────────────────────────────
function renderSplitSummary(data) {
  const section = $('split-section'), grid = $('split-grid');
  const persons = [...new Set(data.map(r => r.person))];
  if (!persons.length) { section.style.display = 'none'; return; }

  let totalJR = 0, totalDanian = 0, totalOwners = 0;
  const byPerson = [];

  persons.forEach(p => {
    const pr     = data.filter(r => r.person === p);
    const profit = r2(pr.reduce((s, r) => s + r.profit, 0));
    const split  = getSplit(p, profit);
    totalJR     = r2(totalJR     + split.jr);
    totalDanian = r2(totalDanian + split.danian);
    totalOwners = r2(totalOwners + split.storeOwner);
    byPerson.push({ p, profit, split });
  });

  // ── Projected takes for the current month ──
  const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const today = new Date();
  const thisMonthLabel = `${MN[today.getMonth()]} ${today.getFullYear()}`;
  const todayIso = today.toISOString().split('T')[0];
  const thisMonthData = data.filter(r => r.month === thisMonthLabel && r.date);
  let projJR = null, projDanian = null, projOwners = null;

  if (thisMonthData.length > 0) {
    const completedDates = [...new Set(thisMonthData.map(r => r.date))].sort().filter(d => d < todayIso);
    const lastCompleted  = completedDates.length ? completedDates[completedDates.length - 1] : null;
    if (lastCompleted) {
      const daysElapsed  = new Date(lastCompleted + 'T00:00:00').getDate();
      const daysInMonth  = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      if (daysElapsed > 0 && daysElapsed < daysInMonth) {
        const factor = daysInMonth / daysElapsed;
        let mJR = 0, mDanian = 0, mOwners = 0;
        [...new Set(thisMonthData.map(r => r.person))].forEach(p => {
          const profit = r2(thisMonthData.filter(r => r.person === p).reduce((s, r) => s + r.profit, 0));
          const split  = getSplit(p, profit);
          mJR     = r2(mJR     + split.jr);
          mDanian = r2(mDanian + split.danian);
          mOwners = r2(mOwners + split.storeOwner);
        });
        projJR     = r2(mJR     * factor);
        projDanian = r2(mDanian * factor);
        projOwners = r2(mOwners * factor);
      }
    }
  }

  const projHtml = (val, color) => val !== null
    ? `<div class="split-proj">
        <span class="split-proj-lbl">📈 Projected ${thisMonthLabel}</span>
        <span class="split-proj-val" style="color:${color}">${fmt$(val)}</span>
       </div>` : '';

  const tagLabel = { owned: 'Owner', jacob: '50/50', partner: 'Partner' };
  const tagClass = { owned: 'owned', jacob: 'jacob', partner: 'partner' };
  const ownerPctLabel = x => x.split.type === 'jacob' ? '10% (fee)' : '50%';

  const jrRows = byPerson
    .filter(x => x.split.jr > 0).sort((a, b) => b.split.jr - a.split.jr)
    .map(x => `<div class="split-row">
      <span class="split-row-lbl">${x.p}</span>
      <span class="split-row-right">
        <span class="split-tag ${tagClass[x.split.type]}">${tagLabel[x.split.type]}</span>
        <span class="split-row-v" style="color:var(--emerald)">${fmt$(x.split.jr)}</span>
        <span style="font-size:10px;color:var(--muted)">${x.split.jrPct}%</span>
      </span></div>`).join('');

  const danianRows = byPerson
    .filter(x => x.split.danian > 0).sort((a, b) => b.split.danian - a.split.danian)
    .map(x => `<div class="split-row">
      <span class="split-row-lbl">${x.p}</span>
      <span class="split-row-right">
        <span class="split-tag ${tagClass[x.split.type]}">${tagLabel[x.split.type]}</span>
        <span class="split-row-v" style="color:#818cf8">${fmt$(x.split.danian)}</span>
        <span style="font-size:10px;color:var(--muted)">${x.split.danianPct}%</span>
      </span></div>`).join('');

  const ownerRows = byPerson
    .filter(x => x.split.storeOwner > 0).sort((a, b) => b.split.storeOwner - a.split.storeOwner)
    .map(x => {
      return `<div class="split-row">
        <span class="split-row-lbl">${x.p}${x.split.type === 'jacob' ? ' <span style="color:var(--muted);font-size:10px">(name fee)</span>' : ''}</span>
        <span class="split-row-right">
          <span class="split-row-v" style="color:var(--yellow)">${fmt$(x.split.storeOwner)}</span>
          <span style="font-size:10px;color:var(--muted)">${ownerPctLabel(x)}</span>
        </span>
      </div>`;
    }).join('');

  section.style.display = 'block';
  grid.innerHTML = `
    <div class="card split-card">
      <div class="split-top" style="background:linear-gradient(90deg,#10b981,#34d399)"></div>
      <div class="split-label">🤝 Our Take — Jonah &amp; Russ</div>
      <div class="split-val jr">${fmt$(totalJR)}</div>
      <div class="split-sub">Across ${byPerson.filter(x=>x.split.jr>0).length} accounts</div>
      ${projHtml(projJR, 'var(--emerald)')}
      <div class="split-rows">${jrRows || '<span style="color:var(--muted);font-size:11px">No data</span>'}</div>
    </div>
    <div class="card split-card">
      <div class="split-top" style="background:linear-gradient(90deg,#6366f1,#8b5cf6)"></div>
      <div class="split-label">⚙️ Operators Take — Danian</div>
      <div class="split-val danian">${fmt$(totalDanian)}</div>
      <div class="split-sub">From ${byPerson.filter(x=>x.split.danian>0).length} accounts</div>
      ${projHtml(projDanian, '#818cf8')}
      <div class="split-rows">${danianRows || '<span style="color:var(--muted);font-size:11px">No data</span>'}</div>
    </div>
    <div class="card split-card">
      <div class="split-top" style="background:linear-gradient(90deg,#f59e0b,#fbbf24)"></div>
      <div class="split-label">🏪 Store Owners Take</div>
      <div class="split-val owners">${fmt$(totalOwners)}</div>
      <div class="split-sub">Paid to ${byPerson.filter(x=>x.split.storeOwner>0).length} store owners</div>
      ${projHtml(projOwners, 'var(--yellow)')}
      <div class="split-rows">${ownerRows || '<span style="color:var(--muted);font-size:11px">No partner stores in selection</span>'}</div>
    </div>`;
}

// ─── KPIs ──────────────────────────────────────────────────────────────────
function renderKPIs(data) {
  const rev    = data.reduce((s,r)=>s+r.price,  0);
  const profit = data.reduce((s,r)=>s+r.profit, 0);
  const fee    = data.reduce((s,r)=>s+r.fee,    0);
  const cost   = data.reduce((s,r)=>s+r.cost,   0);
  const roi    = cost > 0 ? profit / cost * 100 : 0;
  const margin = rev  > 0 ? profit / rev  * 100 : 0;

  const dd = getDailyData(data);
  const dCount = dd.length || 1;
  const avgDailyProfit = r2(profit / dCount);
  const avgDailyRev    = r2(rev    / dCount);

  const todayIso = new Date().toISOString().split('T')[0];
  const allDates = [...new Set(data.filter(r=>r.date).map(r=>r.date))].sort();
  const completedDates = allDates.filter(d=>d<todayIso);
  const hasTodayData = allDates.includes(todayIso);
  const latestDate = completedDates.length ? completedDates[completedDates.length-1] : (hasTodayData?todayIso:null);
  const isInProgress = !completedDates.length && hasTodayData;
  const latestRows  = latestDate ? data.filter(r=>r.date===latestDate) : [];
  const todayProfit = r2(latestRows.reduce((s,r)=>s+r.profit,0));
  const todayRev    = r2(latestRows.reduce((s,r)=>s+r.price,0));
  const latestLabel = latestDate ? fmtDayLabel(latestDate) : null;

  // Month-over-month delta for profit — exclude non-standard labels like "Dec/Jan 2025" (index 999)
  const months = [...new Set(data.map(r=>r.month))].filter(m => monthIndex(m) < 900).sort((a,b)=>monthIndex(a)-monthIndex(b));
  let momDelta = null;
  if (months.length >= 2) {
    const curP  = r2(data.filter(r=>r.month===months[months.length-1]).reduce((s,r)=>s+r.profit,0));
    const prevP = r2(data.filter(r=>r.month===months[months.length-2]).reduce((s,r)=>s+r.profit,0));
    if (prevP !== 0) momDelta = r2((curP-prevP)/Math.abs(prevP)*100);
  }

  const last30 = dd.slice(-30);
  const profitSpark = last30.map(d=>d.profit);
  const revSpark    = last30.map(d=>d.revenue);
  const salesSpark  = last30.map(d=>d.sales);
  const feeSpark    = last30.map(d=>d.fee);
  const roiSpark    = last30.map(d=>d.revenue>0?(d.profit/d.revenue*100):0);

  const kpiSub = latestRows.length > 0
    ? (isInProgress ? `${latestLabel} · in progress · ${fmt$(todayRev)}` : `${latestLabel} · ${latestRows.length} sales · ${fmt$(todayRev)}`)
    : 'No data yet';

  const deltaHtml = momDelta !== null
    ? `<div class="kpi-delta ${momDelta>=0?'up':'down'}">${momDelta>=0?'↑':'↓'} ${Math.abs(momDelta).toFixed(1)}% MoM</div>`
    : '';

  $('kpi-grid').innerHTML = `
    <div class="card kpi-card">
      <div class="kpi-top-bar" style="background:linear-gradient(90deg,#10b981,#34d399)"></div>
      <div class="kpi-label">💰 Total Profit</div>
      <div class="kpi-body">
        <div class="kpi-left">
          <div class="kpi-val ${profit>=0?'profit':'loss'}" id="kv-profit">${fmt$(profit)}</div>
          <div class="kpi-sub">${fmtP(margin)} margin · ${fmtN(data.length)} sales</div>
          ${deltaHtml}
        </div>
        <canvas class="kpi-sparkline-wrap" id="sp-profit" width="80" height="32"></canvas>
      </div>
    </div>
    <div class="card kpi-card">
      <div class="kpi-top-bar" style="background:linear-gradient(90deg,#10b981,#06b6d4)"></div>
      <div class="kpi-label">📊 Avg Daily Profit</div>
      <div class="kpi-body">
        <div class="kpi-left">
          <div class="kpi-val profit" id="kv-adp">${fmt$(avgDailyProfit)}</div>
          <div class="kpi-sub">across ${fmtN(dd.length)} active days</div>
        </div>
        <canvas class="kpi-sparkline-wrap" id="sp-adp" width="80" height="32"></canvas>
      </div>
    </div>
    <div class="card kpi-card">
      <div class="kpi-top-bar" style="background:linear-gradient(90deg,#06b6d4,#6366f1)"></div>
      <div class="kpi-label">⚡ Latest Day${isInProgress?' ✦':''}</div>
      <div class="kpi-body">
        <div class="kpi-left">
          <div class="kpi-val ${todayProfit>0?'profit':todayProfit<0?'loss':''}" id="kv-today">${latestRows.length>0?fmt$(todayProfit):'—'}</div>
          <div class="kpi-sub">${kpiSub}</div>
        </div>
        <canvas class="kpi-sparkline-wrap" id="sp-today" width="80" height="32"></canvas>
      </div>
    </div>
    <div class="card kpi-card">
      <div class="kpi-top-bar" style="background:linear-gradient(90deg,#ef4444,#f87171)"></div>
      <div class="kpi-label" id="fee-label">🏷️ eBay Fees</div>
      <div class="kpi-body">
        <div class="kpi-left">
          <div class="kpi-val" id="kv-fee">${fmt$(fee)}</div>
          <div class="kpi-sub">${fmtP(rev>0?fee/rev*100:0)} of revenue</div>
        </div>
        <canvas class="kpi-sparkline-wrap" id="sp-fee" width="80" height="32"></canvas>
      </div>
    </div>`;

  setTimeout(() => {
    drawSparkline($('sp-profit'), profitSpark,  '#10b981');
    drawSparkline($('sp-adp'),    profitSpark,  '#10b981');
    drawSparkline($('sp-today'),  salesSpark,   '#06b6d4');
    drawSparkline($('sp-fee'),    feeSpark,     '#ef4444');
    // Animated count-up on KPI values
    countUp($('kv-profit'), profit, 1000);
    countUp($('kv-adp'),    avgDailyProfit, 900);
    if (latestRows.length > 0) countUp($('kv-today'), todayProfit, 800);
    countUp($('kv-fee'), fee, 900);
  }, 60);
}

// ─── PROJECTION ────────────────────────────────────────────────────────────
function renderProjection(data) {
  const wrap = $('proj-wrap');
  const p = calcProjection(data);
  if (!p) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  const isLive = p.isCurrentMonth;

  wrap.innerHTML = `<div class="card proj-card fade-in">
    <div class="proj-hdr">
      <div>
        <div class="proj-title">${isLive?'📈':'✅'} ${p.month} — ${isLive?'Live Projection':'Final Results'}</div>
        <div class="proj-sub">${isLive
          ? `Day ${p.daysElapsed} of ${p.daysInMonth} · ${fmt$(p.dailyRevRate)}/day rev · ${fmt$(p.dailyProfitRate)}/day profit`
          : `Month complete · ${fmtN(p.sales)} total sales · ${fmt$(p.dailyRevRate)}/day avg`
        }</div>
      </div>
    </div>
    <div class="proj-body">
      <div class="gauge-wrap">
        <canvas id="gauge-canvas" width="110" height="70"></canvas>
        <div class="gauge-label">
          <div class="gauge-pct">${p.progressPct}%</div>
          <div class="gauge-sub">${isLive?'of month':'complete'}</div>
        </div>
      </div>
      <div class="proj-stats">
        <div class="proj-stat">
          <div class="proj-stat-label">${isLive?'Revenue So Far':'Total Revenue'}</div>
          <div class="proj-stat-val">${fmt$(p.rev)}</div>
          <div class="proj-stat-sub">${fmtN(p.sales)} sales</div>
        </div>
        ${isLive ? `<div class="proj-arrow">→</div>
        <div class="proj-stat">
          <div class="proj-stat-label">Projected EOMonth Rev</div>
          <div class="proj-stat-val">${fmt$(p.projectedRev)}</div>
          <div class="proj-stat-sub">~${fmtN(p.projectedSales)} sales est.</div>
        </div>
        <div style="width:1px;background:rgba(255,255,255,.07);align-self:stretch"></div>` : ''}
        <div class="proj-stat">
          <div class="proj-stat-label">${isLive?'Profit So Far':'Total Profit'}</div>
          <div class="proj-stat-val profit">${fmt$(p.profit)}</div>
          <div class="proj-stat-sub">${fmtP(p.rev>0?p.profit/p.rev*100:0)} margin</div>
        </div>
        ${isLive ? `<div class="proj-arrow">→</div>
        <div class="proj-stat">
          <div class="proj-stat-label">Projected EOMonth Profit</div>
          <div class="proj-stat-val profit">${fmt$(p.projectedProfit)}</div>
          <div class="proj-stat-sub">${fmt$(p.dailyProfitRate)}/day run rate</div>
        </div>` : ''}
      </div>
    </div>
  </div>`;

  setTimeout(() => drawGauge($('gauge-canvas'), p.progressPct, '#6366f1'), 60);
}

// ─── CHARTS ────────────────────────────────────────────────────────────────
Chart.defaults.color       = '#64748b';
Chart.defaults.borderColor = '#1e2d42';

function mkChart(id, cfg) {
  if (CHARTS[id]) { CHARTS[id].destroy(); delete CHARTS[id]; }
  const el = $(id); if (!el) return;
  CHARTS[id] = new Chart(el.getContext('2d'), cfg);
}

function renderCharts(data) {
  lastChartData = data;
  renderChartsForTab(data, activeTab);
}

function renderChartsForTab(data, tab) {
  if (tab === 'daily')    renderDailyCharts(data);
  else if (tab === 'monthly')  renderMonthlyCharts(data);
  else if (tab === 'accounts') renderAccountCharts(data);
}

function renderDailyCharts(data) {
  const dd = getDailyData(data).slice(-90);
  const labels = dd.map(x=>fmtDayLabel(x.date));

  mkChart('chart-daily', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { type:'bar',  label:'Profit',  data: dd.map(x=>x.profit),
          backgroundColor:'rgba(16,185,129,.2)', borderColor:'#10b981', borderWidth:1, borderRadius:3, order:2 },
        { type:'line', label:'Revenue', data: dd.map(x=>x.revenue),
          borderColor:'#6366f1', backgroundColor:'transparent',
          tension:.3, borderWidth:2, pointRadius: dd.length>45?0:2, pointHoverRadius:5, order:1 }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{position:'top',labels:{usePointStyle:true,padding:16}},
        tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${fmt$(c.parsed.y)}`}}
      },
      scales:{
        x:{grid:{display:false},ticks:{maxTicksLimit:18,font:{size:10}}},
        y:{beginAtZero:true,ticks:{callback:v=>fmt$(v)},grid:{color:'rgba(255,255,255,.04)'}}
      }
    }
  });

  mkChart('chart-sales-per-day', {
    type:'bar',
    data:{labels,datasets:[{label:'Sales',data:dd.map(x=>x.sales),
      backgroundColor:'rgba(139,92,246,.2)',borderColor:'#8b5cf6',borderWidth:1,borderRadius:3}]},
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>` ${c.parsed.y} sales`}}},
      scales:{x:{grid:{display:false},ticks:{maxTicksLimit:18,font:{size:10}}},y:{beginAtZero:true,ticks:{stepSize:1},grid:{color:'rgba(255,255,255,.04)'}}}
    }
  });

  // 7-day rolling average profit
  const rollingLabels = [], rollingData = [];
  for (let i = 6; i < dd.length; i++) {
    const window7 = dd.slice(i-6, i+1);
    rollingLabels.push(fmtDayLabel(dd[i].date));
    rollingData.push(r2(window7.reduce((s,d)=>s+d.profit,0)/7));
  }
  mkChart('chart-rolling', {
    type:'line',
    data:{labels:rollingLabels,datasets:[{label:'7-Day Avg Profit',data:rollingData,
      borderColor:'#06b6d4',backgroundColor:'rgba(6,182,212,.08)',
      tension:.4,borderWidth:2,fill:true,pointRadius:0,pointHoverRadius:5}]},
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>` ${fmt$(c.parsed.y)}`}}},
      scales:{x:{grid:{display:false},ticks:{maxTicksLimit:18,font:{size:10}}},y:{beginAtZero:true,ticks:{callback:v=>fmt$(v)},grid:{color:'rgba(255,255,255,.04)'}}}
    }
  });
}

function renderMonthlyCharts(data) {
  const MoM = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const todayMoM = `${MoM[new Date().getMonth()]} ${new Date().getFullYear()}`;
  const todayDayMoM = new Date().getDate();
  const momMonths = [...new Set(data.map(r=>r.month))].filter(m=>!m.includes('/')).sort((a,b)=>monthIndex(a)-monthIndex(b)).slice(-5);
  const momColors = ['#475569','#64748b','#8b5cf6','#6366f1','#10b981'];
  const dayNums = Array.from({length:31},(_,i)=>i+1);

  const momDatasets = momMonths.map((month, mi) => {
    const mRows = data.filter(r=>r.month===month&&r.date);
    const byDay = {};
    mRows.forEach(r => { const d = new Date(r.date+'T00:00:00').getDate(); byDay[d] = r2((byDay[d]||0)+r.profit); });
    const daysWithData = Object.keys(byDay).map(Number);
    const maxDay = month===todayMoM ? todayDayMoM : (daysWithData.length?Math.max(...daysWithData):0);
    let cum = 0;
    const cumData = dayNums.map(d => {
      if (d > maxDay) return null;
      cum = r2(cum + (byDay[d]||0));
      return cum;
    });
    const isCurrent = month === todayMoM;
    const color = momColors[mi % momColors.length];
    return { label:month, data:cumData, borderColor:color, backgroundColor:'transparent',
      borderWidth:isCurrent?2.5:1.5, borderDash:isCurrent?[]:[4,3],
      pointRadius:0, pointHoverRadius:5, tension:.3, spanGaps:false };
  });

  mkChart('chart-monthly-trend', {
    type:'line',
    data:{labels:dayNums,datasets:momDatasets},
    options:{
      responsive:true,maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{position:'top',labels:{usePointStyle:true,padding:14,font:{size:11}}},
        tooltip:{callbacks:{title:items=>`Day ${items[0].label} of month`,label:c=>c.parsed.y!==null?` ${c.dataset.label}: ${fmt$(c.parsed.y)}`:null}}
      },
      scales:{
        x:{title:{display:true,text:'Day of month',font:{size:10},color:'#64748b'},grid:{display:false},ticks:{font:{size:10},maxTicksLimit:16}},
        y:{beginAtZero:true,ticks:{callback:v=>fmt$(v)},grid:{color:'rgba(255,255,255,.04)'}}
      }
    }
  });
}

function renderAccountCharts(data) {
  const persons = [...new Set(data.map(r=>r.person))];

  // Profit by person
  const pProfit = persons.map(p=>r2(data.filter(r=>r.person===p).reduce((s,r)=>s+r.profit,0)));
  const ps = persons.map((p,i)=>({p,v:pProfit[i]})).sort((a,b)=>b.v-a.v);
  mkChart('chart-profit-person',{type:'bar',data:{labels:ps.map(x=>x.p),datasets:[{label:'Profit',data:ps.map(x=>x.v),backgroundColor:ps.map((_,i)=>COLORS[i%COLORS.length]+'33'),borderColor:ps.map((_,i)=>COLORS[i%COLORS.length]),borderWidth:1,borderRadius:5}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>` ${fmt$(c.parsed.x)}`}}},scales:{x:{beginAtZero:true,ticks:{callback:v=>fmt$(v)},grid:{color:'rgba(255,255,255,.04)'}},y:{grid:{display:false}}}}});

  // ROI by person
  const rois = persons.map(p=>{const pr=data.filter(r=>r.person===p),c=pr.reduce((s,r)=>s+r.cost,0),pf=pr.reduce((s,r)=>s+r.profit,0);return c>0?r2(pf/c*100):0;});
  const rs = persons.map((p,i)=>({p,v:rois[i]})).sort((a,b)=>b.v-a.v);
  mkChart('chart-roi',{type:'bar',data:{labels:rs.map(x=>x.p),datasets:[{label:'ROI %',data:rs.map(x=>x.v),backgroundColor:rs.map(x=>x.v>=30?'rgba(16,185,129,.2)':x.v>=15?'rgba(245,158,11,.2)':'rgba(239,68,68,.2)'),borderColor:rs.map(x=>x.v>=30?'#10b981':x.v>=15?'#f59e0b':'#ef4444'),borderWidth:1,borderRadius:5}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>` ${fmtP(c.parsed.x)}`}}},scales:{x:{beginAtZero:true,ticks:{callback:v=>v+'%'},grid:{color:'rgba(255,255,255,.04)'}},y:{grid:{display:false}}}}});

  // Volume by person
  const vols = persons.map(p=>data.filter(r=>r.person===p).length);
  const vs = persons.map((p,i)=>({p,v:vols[i]})).sort((a,b)=>b.v-a.v);
  mkChart('chart-volume',{type:'bar',data:{labels:vs.map(x=>x.p),datasets:[{label:'Sales',data:vs.map(x=>x.v),backgroundColor:vs.map((_,i)=>COLORS[i%COLORS.length]+'33'),borderColor:vs.map((_,i)=>COLORS[i%COLORS.length]),borderWidth:1,borderRadius:5}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false}},y:{beginAtZero:true,grid:{color:'rgba(255,255,255,.04)'}}}}});

  // Revenue by person
  const pRev = persons.map(p=>r2(data.filter(r=>r.person===p).reduce((s,r)=>s+r.price,0)));
  const prs  = persons.map((p,i)=>({p,v:pRev[i]})).sort((a,b)=>b.v-a.v);
  mkChart('chart-revenue-person',{type:'bar',data:{labels:prs.map(x=>x.p),datasets:[{label:'Revenue',data:prs.map(x=>x.v),backgroundColor:prs.map((_,i)=>COLORS[i%COLORS.length]+'33'),borderColor:prs.map((_,i)=>COLORS[i%COLORS.length]),borderWidth:1,borderRadius:5}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>` ${fmt$(c.parsed.y)}`}}},scales:{x:{grid:{display:false}},y:{beginAtZero:true,ticks:{callback:v=>fmt$(v)},grid:{color:'rgba(255,255,255,.04)'}}}}});
}

// ─── LEADERBOARD ───────────────────────────────────────────────────────────
function renderLeaderboard(data) {
  const el = $('lb-section');
  const persons = [...new Set(data.map(r=>r.person))];
  if (!persons.length) { el.style.display='none'; return; }

  let rankings = persons.map(p => {
    const pr = data.filter(r=>r.person===p);
    const profit  = r2(pr.reduce((s,r)=>s+r.profit,0));
    const revenue = r2(pr.reduce((s,r)=>s+r.price,0));
    const cost    = r2(pr.reduce((s,r)=>s+r.cost,0));
    const sales   = pr.length;
    const roi     = cost > 0 ? r2(profit/cost*100) : 0;
    return {p, profit, revenue, sales, roi};
  }).sort((a,b)=>b.profit-a.profit);

  el.style.display = 'block';
  const maxProfit = Math.max(...rankings.map(r=>r.profit), 1);

  // Podium — arrange as 2nd, 1st, 3rd
  const top3 = rankings.slice(0,3);
  const podiumOrder = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3.length === 2 ? [top3[1], top3[0]] : [top3[0]];
  const podiumClass = top3.length >= 3 ? ['p2','p1','p3'] : top3.length === 2 ? ['p2','p1'] : ['p1'];
  const podiumEmoji = top3.length >= 3 ? ['🥈','🥇','🥉'] : top3.length === 2 ? ['🥈','🥇'] : ['🥇'];
  const podiumIdx   = top3.length >= 3 ? [1,0,2] : top3.length === 2 ? [1,0] : [0];

  $('podium-row').innerHTML = podiumOrder.map((r,i) => `
    <div class="podium-item ${podiumClass[i]}">
      <div class="podium-profit">${fmt$(r.profit)}</div>
      <div class="podium-name">${r.p}</div>
      <div class="podium-block">${podiumEmoji[i]}</div>
    </div>`).join('');

  // Full ranked list
  $('lb-list').innerHTML = rankings.map((r,i) => {
    const rankCls = i===0?'gold':i===1?'silver':i===2?'bronze':'';
    const pct = Math.max(0, Math.min(100, r.profit / maxProfit * 100));
    const barColor = COLORS[i % COLORS.length];
    return `<div class="lb-row">
      <div class="lb-rank ${rankCls}">${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</div>
      <div class="lb-name">${r.p}</div>
      <div class="lb-bar-wrap">
        <div class="lb-bar-bg"><div class="lb-bar-fill" style="width:${pct}%;background:${barColor}"></div></div>
      </div>
      <div class="lb-profit">${fmt$(r.profit)}</div>
      <div class="lb-roi">${fmtP(r.roi)}</div>
      <div class="lb-sales">${fmtN(r.sales)} sales</div>
    </div>`;
  }).join('');
}

// ─── TABLE ─────────────────────────────────────────────────────────────────
function renderTable(data) {
  const search = ($('tbl-search').value || '').toLowerCase();
  const persons = [...new Set(data.map(r=>r.person))].filter(p=>!search||p.toLowerCase().includes(search));

  let rows = persons.map(p => {
    const pr     = data.filter(r=>r.person===p);
    const rev    = r2(pr.reduce((s,r)=>s+r.price,0));
    const profit = r2(pr.reduce((s,r)=>s+r.profit,0));
    const cost   = r2(pr.reduce((s,r)=>s+r.cost,0));
    const fee    = r2(pr.reduce((s,r)=>s+r.fee,0));
    const sales  = pr.length;
    const roi    = cost > 0 ? r2(profit/cost*100) : 0;
    const split  = getSplit(p, profit);
    const inactive = getInactiveDays(pr);
    return { person:p, revenue:rev, profit, cost, fee, sales, roi,
      avg_sale:   sales>0?r2(rev/sales):0,
      avg_profit: sales>0?r2(profit/sales):0,
      owner_take: split.storeOwner, danian_take: split.danian, jr_take: split.jr,
      _split: split, inactive };
  });

  rows.sort((a,b) => {
    const av=a[sortCol], bv=b[sortCol];
    return typeof av==='string' ? (sortDir==='asc'?av.localeCompare(bv):bv.localeCompare(av)) : (sortDir==='asc'?av-bv:bv-av);
  });
  rows.forEach((r,i)=>r.rank=i+1);

  // Update sort indicators
  ['person','revenue','profit','roi','fee','sales','avg_sale','avg_profit','owner_take','danian_take','jr_take'].forEach(col => {
    const el = $('sh-'+col);
    if (!el) return;
    el.textContent = sortCol===col ? (sortDir==='asc'?' ↑':' ↓') : '';
    const th = el.parentElement;
    if (th) th.classList.toggle('active-sort', sortCol===col);
  });

  const tb = $('tbody');
  if (!rows.length) {
    tb.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:28px;color:var(--muted)">No data for selected filters</td></tr>`;
    return;
  }
  tb.innerHTML = rows.map(r => {
    let rankHtml;
    if      (r.rank===1) rankHtml = `<span class="rank-badge rb-1">🥇</span>`;
    else if (r.rank===2) rankHtml = `<span class="rank-badge rb-2">🥈</span>`;
    else if (r.rank===3) rankHtml = `<span class="rank-badge rb-3">🥉</span>`;
    else                 rankHtml = `<span style="color:var(--muted);font-size:12px;font-weight:700">${r.rank}</span>`;
    return `<tr>
      <td>${rankHtml}</td>
      <td><strong>${r.person}</strong>${r.inactive !== null && r.inactive >= 5 ? `<span style="color:var(--rose);font-size:9px;margin-left:5px;font-weight:700">⚠️${r.inactive}d</span>` : ''}</td>
      <td><strong style="color:${r.profit>=0?'var(--emerald)':'var(--rose)'}">${fmt$(r.profit)}</strong></td>
      <td style="color:var(--muted)">${fmt$(r.fee)}</td>
      <td>${fmtN(r.sales)}</td>
      <td>${fmt$(r.avg_sale)}</td>
      <td style="color:${r.avg_profit>=0?'var(--emerald)':'var(--rose)'}">${fmt$(r.avg_profit)}</td>
      <td style="color:var(--yellow)">${r._split.storeOwner > 0 ? fmt$(r._split.storeOwner) : '<span style="color:var(--muted)">— owner</span>'}</td>
      <td style="color:#818cf8">${r._split.danian > 0 ? fmt$(r._split.danian) : '<span style="color:var(--muted)">—</span>'}</td>
      <td style="color:var(--emerald);font-weight:800">${fmt$(r._split.jr)} <span style="font-size:10px;font-weight:400;color:var(--muted)">(${r._split.jrPct}%)</span></td>
      <td><button class="note-btn ${NOTES[r.person]?'has-note':''}" onclick="openNotes('${r.person.replace(/'/g,"\\'")}')">  ${NOTES[r.person]?'📝':'+'}</button></td>
    </tr>`;
  }).join('');
}

function sortBy(col) {
  sortDir = (sortCol===col && sortDir==='desc') ? 'asc' : 'desc';
  sortCol = col;
  renderTable(filtered());
}

// ─── NOTES ─────────────────────────────────────────────────────────────────
let NOTES = JSON.parse(localStorage.getItem('ebay_notes') || '{}');
let _notesPerson = null;

function openNotes(person) {
  _notesPerson = person;
  $('notes-modal-title').textContent = `📝 Notes — ${person}`;
  $('notes-textarea').value = NOTES[person] || '';
  openModal('notes-modal');
}
function saveNote() {
  if (!_notesPerson) return;
  const v = $('notes-textarea').value.trim();
  if (v) NOTES[_notesPerson] = v; else delete NOTES[_notesPerson];
  localStorage.setItem('ebay_notes', JSON.stringify(NOTES));
  closeModal('notes-modal');
  renderTable(filtered());
  showToast('Note saved!', 'success', '📝');
}

// ─── MODALS ─────────────────────────────────────────────────────────────────
function openModal(id)  { const el=$(id); if(el){el.classList.add('open'); document.body.style.overflow='hidden';} }
function closeModal(id) { const el=$(id); if(el){el.classList.remove('open'); document.body.style.overflow='';} }
document.addEventListener('click', e => { if(e.target.classList.contains('modal-overlay')) closeModal(e.target.id); });

// ─── PAYOUT CALCULATOR ──────────────────────────────────────────────────────
function openPayoutCalc() {
  $('calc-profit-input').value = '';
  $('calc-result').innerHTML = '<p style="color:var(--muted);font-size:12px;text-align:center;padding:8px 0">Enter a profit amount above ↑</p>';
  openModal('calc-modal');
}
function updateCalc() {
  const profit = parseFloat($('calc-profit-input').value) || 0;
  const type   = $('calc-type').value;
  let jr, jrPct, danian, danianPct, owner, ownerPct, ownerLbl;
  if (type === 'owned')  { jr=r2(profit*.60);jrPct=60;danian=r2(profit*.40);danianPct=40;owner=0;ownerPct=0;ownerLbl='J&R own this store'; }
  else if (type==='jacob'){ jr=r2(profit*.50);jrPct=50;danian=r2(profit*.40);danianPct=40;owner=r2(profit*.10);ownerPct=10;ownerLbl='Jacob (name fee)'; }
  else                   { jr=r2(profit*.20);jrPct=20;danian=r2(profit*.30);danianPct=30;owner=r2(profit*.50);ownerPct=50;ownerLbl='Store Owner'; }
  const row = (lbl, val, color) => `<div class="calc-row"><span class="calc-lbl">${lbl}</span><span style="color:${color};font-weight:700">${fmtFull$(val)}</span></div>`;
  $('calc-result').innerHTML = `
    ${row('Total Profit', profit, 'var(--text)')}
    ${row(`J&R Take (${jrPct}%)`, jr, 'var(--emerald)')}
    ${row(`Danian (${danianPct}%)`, danian, '#818cf8')}
    ${owner > 0 ? row(`${ownerLbl} (${ownerPct}%)`, owner, 'var(--yellow)') : `<div class="calc-row"><span class="calc-lbl">${ownerLbl}</span><span style="color:var(--muted)">—</span></div>`}
    ${row('J&R + Danian Total', r2(jr+danian), 'var(--cyan)')}
  `;
}

// ─── PAYOUT REPORT ───────────────────────────────────────────────────────────
function openPayoutReport() {
  const data = filtered();
  if (!data.length) { showToast('No data to generate report', 'error', '⚠️'); return; }
  const persons = [...new Set(data.map(r=>r.person))];
  const dateStr = new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
  const pf = $('filter-person').value, mf = $('filter-month').value;
  let allJR=0, allDanian=0, allOwners=0;
  const rows = persons.map(p => {
    const pr = data.filter(r=>r.person===p);
    const profit = r2(pr.reduce((s,r)=>s+r.profit,0));
    const split  = getSplit(p, profit);
    allJR     = r2(allJR     + split.jr);
    allDanian = r2(allDanian + split.danian);
    allOwners = r2(allOwners + split.storeOwner);
    return {p, profit, split};
  });
  const mkRow = (lbl, val, color) => `<div class="report-row"><span>${lbl}</span><span style="color:${color};font-weight:700">${fmtFull$(val)}</span></div>`;
  const ownerRows = rows.filter(x=>x.split.storeOwner>0);
  $('report-content').innerHTML = `
    <div style="font-size:11px;color:var(--muted);margin-bottom:18px">Generated ${dateStr} · ${pf==='all'?'All Accounts':pf} · ${mf==='all'?'All Months':mf}</div>
    <div class="report-sec"><h4>💸 Jonah &amp; Russ — Our Take</h4>
      ${rows.map(x=>`<div class="report-row"><span>${x.p} <span style="color:var(--muted);font-size:10px">(${x.split.jrPct}%)</span></span><span style="color:var(--emerald);font-weight:700">${fmtFull$(x.split.jr)}</span></div>`).join('')}
      <div class="report-total"><span>Total J&amp;R Take</span><span style="color:var(--emerald)">${fmtFull$(allJR)}</span></div></div>
    <div class="report-sec"><h4>⚙️ Danian — Operator Take</h4>
      ${rows.filter(x=>x.split.danian>0).map(x=>`<div class="report-row"><span>${x.p} <span style="color:var(--muted);font-size:10px">(${x.split.danianPct}%)</span></span><span style="color:#818cf8;font-weight:700">${fmtFull$(x.split.danian)}</span></div>`).join('')}
      <div class="report-total"><span>Total Danian Take</span><span style="color:#818cf8">${fmtFull$(allDanian)}</span></div></div>
    ${ownerRows.length?`<div class="report-sec"><h4>🏪 Store Owners</h4>
      ${ownerRows.map(x=>`<div class="report-row"><span>${x.p} <span style="color:var(--muted);font-size:10px">(${x.split.type==='jacob'?'10% name fee':'50%'})</span></span><span style="color:var(--yellow);font-weight:700">${fmtFull$(x.split.storeOwner)}</span></div>`).join('')}
      <div class="report-total"><span>Total Owner Payouts</span><span style="color:var(--yellow)">${fmtFull$(allOwners)}</span></div></div>`:''}
    <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:14px;margin-top:8px">
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:8px"><span style="color:var(--muted)">Total Gross Profit</span><span style="font-weight:800">${fmtFull$(r2(allJR+allDanian+allOwners))}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:var(--muted)">J&amp;R + Danian Combined</span><span style="font-weight:800;color:var(--cyan)">${fmtFull$(r2(allJR+allDanian))}</span></div>
    </div>`;
  openModal('report-modal');
}

// ─── GOAL TRACKER ────────────────────────────────────────────────────────────
let GOAL = parseFloat(localStorage.getItem('ebay_goal') || '0') || 0;
function setGoal() {
  const v = parseFloat($('goal-input-field').value) || 0;
  GOAL = v; localStorage.setItem('ebay_goal', v);
  renderGoalTracker(filtered());
  showToast(v>0?`Goal set to ${fmt$(v)}!`:'Goal cleared', 'info', '🎯');
}
function renderGoalTracker(data) {
  const section=$('goal-section'), card=$('goal-card');
  if (!data.length) { section.style.display='none'; return; }
  const MN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const today=new Date(), thisMonthLabel=`${MN[today.getMonth()]} ${today.getFullYear()}`;
  const monthData = data.filter(r=>r.month===thisMonthLabel);
  const profit    = r2(monthData.reduce((s,r)=>s+r.profit,0));
  const pct       = GOAL>0 ? Math.min(r2(profit/GOAL*100),100) : 0;
  const over      = GOAL>0 && profit>=GOAL;
  const remaining = GOAL>0 ? r2(GOAL-profit) : 0;
  const daysInMonth = new Date(today.getFullYear(),today.getMonth()+1,0).getDate();
  const daysLeft    = daysInMonth - today.getDate();
  const dailyNeeded = daysLeft>0 && remaining>0 ? r2(remaining/daysLeft) : 0;
  section.style.display = 'block';
  card.innerHTML = `
    <div class="goal-hdr">
      <div><div style="font-size:13px;font-weight:800">🎯 ${thisMonthLabel} Goal</div>
        ${GOAL>0?`<div style="font-size:11px;color:var(--muted);margin-top:2px">Target: ${fmt$(GOAL)}</div>`:''}
      </div>
      <div class="goal-input-row">
        <input type="number" class="goal-input" id="goal-input-field" placeholder="Monthly target…" value="${GOAL||''}" step="100" />
        <button class="goal-set-btn" onclick="setGoal()">Set</button>
      </div>
    </div>
    ${GOAL>0?`<div class="goal-body">
      <div class="goal-progress-wrap">
        <div class="goal-bar-bg"><div class="goal-bar-fill${over?' over':''}" style="width:${pct}%"></div></div>
        <div class="goal-bar-labels"><span>${fmt$(profit)} earned</span><span style="font-weight:800">${pct.toFixed(1)}%${over?' 🎉':''}</span><span>${fmt$(GOAL)}</span></div>
        ${over
          ? `<div class="goal-msg" style="color:var(--emerald);font-weight:700;margin-top:8px">🎉 CRUSHED IT! You're ${fmt$(r2(profit-GOAL))} over target!</div>`
          : daysLeft>0
            ? `<div class="goal-msg" style="margin-top:6px">Need <strong style="color:var(--yellow)">${fmt$(dailyNeeded)}/day</strong> for ${daysLeft} remaining day${daysLeft!==1?'s':''}</div>`
            : `<div class="goal-msg" style="margin-top:6px;color:var(--muted)">Month ended · ${fmt$(remaining>0?-remaining:r2(profit-GOAL))} vs target</div>`}
      </div>
      <div class="goal-stats">
        <div class="goal-stat"><div class="goal-stat-val ${over?'hit':'need'}">${fmt$(over?r2(profit-GOAL):remaining)}</div><div class="goal-stat-lbl">${over?'over goal':'to go'}</div></div>
        <div class="goal-stat"><div class="goal-stat-val" style="color:var(--cyan)">${daysLeft}</div><div class="goal-stat-lbl">days left</div></div>
      </div></div>`
    : `<div style="font-size:12px;color:var(--muted)">Set a monthly profit target to track your progress toward it.</div>`}`;
}

// ─── ACTIVITY HEATMAP ────────────────────────────────────────────────────────
function renderHeatmap(data) {
  const section=$('heatmap-section'), container=$('heatmap-container');
  if (!section || !container) return;
  const withDates = data.filter(r=>r.date);
  if (!withDates.length) { section.style.display='none'; return; }
  const byDate={};
  withDates.forEach(r=>{ byDate[r.date]=r2((byDate[r.date]||0)+r.profit); });
  const today=new Date();
  const endDate=new Date(today);
  endDate.setDate(endDate.getDate()+(6-endDate.getDay()));
  const startDate=new Date(endDate);
  startDate.setDate(startDate.getDate()-7*17+1);
  startDate.setDate(startDate.getDate()-startDate.getDay());
  const weeks=[];
  const cur=new Date(startDate);
  while(cur<=endDate){
    const wk=[];
    for(let d=0;d<7;d++){
      const ds=cur.toISOString().split('T')[0];
      wk.push({date:ds,profit:byDate[ds]??null,isToday:ds===today.toISOString().split('T')[0]});
      cur.setDate(cur.getDate()+1);
    }
    weeks.push(wk);
  }
  const profits=Object.values(byDate).filter(v=>v>0);
  const maxP=profits.length?Math.max(...profits):1;
  const getColor=p=>{
    if(p===null||p===0) return 'rgba(255,255,255,0.04)';
    if(p<0) return 'rgba(239,68,68,0.45)';
    const i=Math.min(p/maxP,1);
    return `rgba(${Math.round(16+(6-16)*i)},${Math.round(185+(182-185)*i)},${Math.round(129+(212-129)*i)},${0.18+i*0.72})`;
  };
  const MOS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DAYS=['S','M','T','W','T','F','S'];
  let html=`<div style="display:flex;flex-direction:column;gap:2px;min-width:max-content">`;
  // Month label row
  html+=`<div style="display:flex;gap:2px;padding-left:28px;margin-bottom:3px">`;
  let lastMon='';
  weeks.forEach(wk=>{
    const dt=new Date(wk[0].date+'T00:00:00');
    const lbl=(dt.getDate()<=7||wk===weeks[0])?MOS[dt.getMonth()]:'';
    if(lbl&&lbl!==lastMon){lastMon=lbl;}else if(lbl===lastMon){/* no repeat */}
    html+=`<div style="width:14px;font-size:9px;color:var(--muted);overflow:visible;white-space:nowrap">${lbl!==''&&lbl!==lastMon?lbl:lbl===lastMon&&dt.getDate()<=7?lbl:''}</div>`;
  });
  html+='</div>';
  for(let d=0;d<7;d++){
    html+=`<div style="display:flex;gap:2px;align-items:center">`;
    html+=`<div style="width:24px;font-size:9px;color:var(--muted);text-align:right;margin-right:4px;flex-shrink:0">${[1,3,5].includes(d)?DAYS[d]:''}</div>`;
    html+=`<div style="display:flex;gap:2px">`;
    weeks.forEach(wk=>{
      const day=wk[d];
      const col=getColor(day.profit);
      const tip=day.profit!==null?`${day.date}: ${day.profit>=0?'+':''}${fmtFull$(day.profit)}`:day.date;
      const outline=day.isToday?';outline:2px solid rgba(99,102,241,.7);outline-offset:1px':'';
      html+=`<div class="heatmap-cell" style="background:${col}${outline}" title="${tip}"></div>`;
    });
    html+=`</div></div>`;
  }
  html+='</div>';
  const legend=[0,.25,.5,.75,1].map(i=>`<div style="width:14px;height:14px;border-radius:3px;background:${i===0?'rgba(255,255,255,0.04)':`rgba(16,185,129,${0.18+i*0.72})`}"></div>`).join('');
  container.innerHTML=html;
  $('heatmap-legend').innerHTML=legend;
  section.style.display='block';
}

// ─── 7-DAY MOMENTUM ──────────────────────────────────────────────────────────
function renderMomentum(data) {
  const section=$('mom-section'), grid=$('mom-grid');
  if (!section || !grid) return;
  const dd=getDailyData(data);
  if(dd.length<8){section.style.display='none';return;}
  const last7=dd.slice(-7), prior7=dd.slice(-14,-7);
  if(!prior7.length){section.style.display='none';return;}
  const sum7 =arr=>r2(arr.reduce((s,d)=>s+d.profit,0));
  const sumR  =arr=>r2(arr.reduce((s,d)=>s+d.revenue,0));
  const sumS  =arr=>arr.reduce((s,d)=>s+d.sales,0);
  const l7p=sum7(last7),p7p=sum7(prior7);
  const l7r=sumR(last7),p7r=sumR(prior7);
  const l7s=sumS(last7),p7s=sumS(prior7);
  const momPct=(c,p)=>p===0?null:r2((c-p)/Math.abs(p)*100);
  const profitMom=momPct(l7p,p7p), revMom=momPct(l7r,p7r), salesMom=momPct(l7s,p7s);
  const mkCard=(label,cur,prev,pct,fmtFn,icon)=>{
    const cls=pct===null?'neutral':pct>=0?'up':'down';
    const arrow=pct===null?'—':pct>=0?'▲':'▼';
    const col=pct===null?'var(--muted)':pct>=0?'var(--emerald)':'var(--rose)';
    return `<div class="card mom-card" style="animation:fadeUp .4s ease both">
      <div class="mom-label">${label}</div>
      <div class="mom-val ${cls}">${pct!==null?`${arrow} ${Math.abs(pct).toFixed(1)}%`:'—'}</div>
      <div class="mom-sub"><span style="color:${col};font-weight:700">${fmtFn(cur)}</span> <span style="color:var(--muted)">vs ${fmtFn(prev)}</span></div>
      <div class="mom-icon">${icon}</div></div>`;
  };
  const best=last7.reduce((a,b)=>b.profit>a.profit?b:a,last7[0]);
  section.style.display='block';
  grid.innerHTML=`
    ${mkCard('⚡ 7-Day Profit',l7p,p7p,profitMom,fmt$,profitMom!==null&&profitMom>=0?'📈':'📉')}
    ${mkCard('💵 7-Day Revenue',l7r,p7r,revMom,fmt$,'💰')}
    ${mkCard('🛒 7-Day Sales',l7s,p7s,salesMom,fmtN,'📦')}
    <div class="card mom-card" style="animation:fadeUp .4s ease .12s both">
      <div class="mom-label">🏅 Best Day (Last 7)</div>
      <div class="mom-val" style="color:var(--yellow);font-size:18px">${fmt$(best.profit)}</div>
      <div class="mom-sub">${fmtDayLabel(best.date)} · ${best.sales} sales</div>
      <div class="mom-icon">🌟</div></div>`;
}

// ─── RECORDS ─────────────────────────────────────────────────────────────────
function renderRecords(data) {
  const section=$('records-section'), grid=$('records-grid');
  const titleEl = $('records-title');
  if (titleEl) titleEl.textContent = CHANNEL_FILTER === 'tiktok' ? '🏅 TikTok Records'
                                   : CHANNEL_FILTER === 'ebay'   ? '🏅 eBay Records'
                                   : '🏅 All-Time Records';
  const dd=getDailyData(data);
  if(!dd.length){section.style.display='none';return;}
  const bestDay=dd.reduce((a,b)=>b.profit>a.profit?b:a,dd[0]);
  let bestWeek=null, bestWeekEnd=null;
  for(let i=6;i<dd.length;i++){
    const ws=r2(dd.slice(i-6,i+1).reduce((s,d)=>s+d.profit,0));
    if(bestWeek===null||ws>bestWeek){bestWeek=ws;bestWeekEnd=dd[i].date;}
  }
  const months=[...new Set(data.map(r=>r.month))];
  let bestMonth=null, bestMonthP=null;
  months.forEach(m=>{
    const mp=r2(data.filter(r=>r.month===m).reduce((s,r)=>s+r.profit,0));
    if(bestMonthP===null||mp>bestMonthP){bestMonthP=mp;bestMonth=m;}
  });
  const persons=[...new Set(data.map(r=>r.person))];
  let bestAcc=null, bestAccP=null;
  persons.forEach(p=>{
    const pp=r2(data.filter(r=>r.person===p).reduce((s,r)=>s+r.profit,0));
    if(bestAccP===null||pp>bestAccP){bestAccP=pp;bestAcc=p;}
  });
  const mkCard=(label,val,sub,icon,delay)=>`
    <div class="card record-card" style="animation:fadeUp .5s ease ${delay}s both">
      <div class="record-top"></div>
      <div class="record-label">${label}</div>
      <div class="record-val">${val}</div>
      <div class="record-sub">${sub}</div>
      <div class="record-icon">${icon}</div></div>`;
  section.style.display='block';
  grid.innerHTML=`
    ${mkCard('🥇 Best Single Day',fmt$(bestDay.profit),`${fmtDayLabel(bestDay.date)} · ${bestDay.sales} sales`,'📆',.0)}
    ${mkCard('📆 Best Week',bestWeek!==null?fmt$(bestWeek):'—',bestWeekEnd?`Week ending ${fmtDayLabel(bestWeekEnd)}`:'—','🗓️',.06)}
    ${mkCard('🏆 Best Month',bestMonthP!==null?fmt$(bestMonthP):'—',bestMonth||'—','🏅',.12)}
    ${mkCard('⭐ Top Account',bestAccP!==null?fmt$(bestAccP):'—',bestAcc||'—','👑',.18)}`;
}

// ─── ACCOUNT HEALTH ──────────────────────────────────────────────────────────
function getInactiveDays(personData) {
  const dates=personData.filter(r=>r.date).map(r=>r.date).sort();
  if(!dates.length) return null;
  const last=dates[dates.length-1];
  const today=new Date().toISOString().split('T')[0];
  return Math.floor((new Date(today+'T00:00:00')-new Date(last+'T00:00:00'))/(864e5));
}
function calcHealthScore(pData, allData) {
  if(!pData.length) return {score:0,grade:'D',roi:0,activeDays:0,profitableDays:0,totalDaysSinceStart:0,firstDate:null};
  const dd=getDailyData(pData);
  const cost=pData.reduce((s,r)=>s+r.cost,0);
  const profit=pData.reduce((s,r)=>s+r.profit,0);
  const roi=cost>0?profit/cost*100:0;
  const roiScore=Math.min(40,Math.max(0,roi*0.4));
  // Use account's own first sale date as its start — accounts started at different times
  const acctDates=pData.filter(r=>r.date).map(r=>r.date).sort();
  const firstDate=acctDates.length?acctDates[0]:null;
  const eligibleDates=firstDate
    ? [...new Set(allData.filter(r=>r.date&&r.date>=firstDate).map(r=>r.date))]
    : [];
  const actPct=eligibleDates.length>0?dd.length/eligibleDates.length:0;
  const actScore=actPct*30;
  const profitDays=dd.filter(d=>d.profit>0).length;
  const consScore=dd.length>0?(profitDays/dd.length)*30:0;
  const total=Math.round(roiScore+actScore+consScore);
  return {score:total,grade:total>=80?'A':total>=60?'B':total>=40?'C':'D',roi:r2(roi),activeDays:dd.length,profitableDays:profitDays,totalDaysSinceStart:eligibleDates.length,firstDate};
}
function renderHealthScores(data) {
  const section=$('health-section'), grid=$('health-grid');
  const persons=[...new Set(data.map(r=>r.person))];
  if(!persons.length){section.style.display='none';return;}
  const health=persons.map(p=>{
    const pd=data.filter(r=>r.person===p);
    return {p, score:calcHealthScore(pd,data), inactive:getInactiveDays(pd)};
  }).sort((a,b)=>b.score.score-a.score.score);
  section.style.display='block';
  grid.innerHTML=health.map(({p,score,inactive},i)=>{
    const ia=inactive!==null&&inactive>=5;
    // Score component breakdowns (max 40/30/30) — activity denominator is days since THIS account's first sale
    const roiScore  = Math.min(40, Math.max(0, score.roi * 0.4));
    const actScore  = score.totalDaysSinceStart>0 ? (score.activeDays/score.totalDaysSinceStart)*30 : 0;
    const consScore = score.activeDays>0 ? (score.profitableDays/score.activeDays)*30 : 0;
    const gradeDesc = score.grade==='A' ? 'Top performer — strong ROI & consistency'
                    : score.grade==='B' ? 'Solid performer — room to improve'
                    : score.grade==='C' ? 'Below average — needs attention'
                    : 'Struggling — low ROI or activity';
    const roiPct  = Math.round(roiScore/40*100);
    const actPct  = Math.round(actScore/30*100);
    const consPct = Math.round(consScore/30*100);
    const barColor = (pct) => pct>=70?'var(--emerald)':pct>=40?'var(--yellow)':'var(--rose)';
    const startLabel = score.firstDate ? `Since ${fmtDayLabel(score.firstDate)}` : '';

    // Store creation date + days to first sale (informational only)
    const createdDate = STORE_CREATED[p] || null;
    let storeAgeLabel = '', daysToFirstSaleLabel = '';
    if (createdDate) {
      const created = new Date(createdDate + 'T00:00:00');
      const now = new Date();
      const storeAgeDays = Math.floor((now - created) / 86400000);
      const storeAgeMonths = (storeAgeDays / 30.44).toFixed(1);
      storeAgeLabel = storeAgeDays < 60
        ? `${storeAgeDays} days old`
        : `${storeAgeMonths} months old`;
      if (score.firstDate) {
        const firstSale = new Date(score.firstDate + 'T00:00:00');
        const daysToFirst = Math.round((firstSale - created) / 86400000);
        daysToFirstSaleLabel = daysToFirst <= 0
          ? '🔥 Sold on day 1!'
          : `⏱️ ${daysToFirst} day${daysToFirst===1?'':'s'} to first sale`;
      }
    }

    const tip = `<div class="health-tip">
      <div class="ht-grade-row">
        <div class="ht-grade-big ${score.grade}">${score.grade}</div>
        <div><div class="ht-grade-label">${score.score}/100 points</div><div class="ht-grade-desc">${gradeDesc}</div></div>
      </div>
      <div class="ht-section-label">Score Breakdown</div>
      <div class="ht-row"><span class="ht-lbl">📈 ROI</span><span class="ht-val">${fmtP(score.roi)}</span></div>
      <div class="ht-bar-wrap"><div class="ht-bar-fill" style="width:${roiPct}%;background:${barColor(roiPct)}"></div></div>
      <div class="ht-row"><span class="ht-lbl">📅 Activity</span><span class="ht-val">${score.activeDays} / ${score.totalDaysSinceStart} days</span></div>
      <div class="ht-bar-wrap"><div class="ht-bar-fill" style="width:${actPct}%;background:${barColor(actPct)}"></div></div>
      <div class="ht-row"><span class="ht-lbl">✅ Profitable Days</span><span class="ht-val">${score.profitableDays} / ${score.activeDays}</span></div>
      <div class="ht-bar-wrap" style="margin-bottom:4px"><div class="ht-bar-fill" style="width:${consPct}%;background:${barColor(consPct)}"></div></div>
      ${createdDate || startLabel ? `<div style="margin-top:10px;border-top:1px solid rgba(255,255,255,.08);padding-top:8px">` : ''}
      ${createdDate ? `<div style="font-size:10px;color:var(--muted);margin-bottom:3px">🗓 Store created: <b style="color:var(--text2)">${fmtDayLabel(createdDate)}</b> &nbsp;·&nbsp; ${storeAgeLabel}</div>` : ''}
      ${daysToFirstSaleLabel ? `<div style="font-size:10px;color:var(--cyan);margin-bottom:3px">${daysToFirstSaleLabel}</div>` : ''}
      ${startLabel ? `<div style="font-size:10px;color:var(--muted)">📦 First sale: <b style="color:var(--text2)">${fmtDayLabel(score.firstDate)}</b></div>` : ''}
      ${createdDate || startLabel ? `</div>` : ''}
      ${ia ? `<div style="margin-top:4px;font-size:10px;color:var(--rose);font-weight:700">⚠️ Inactive ${inactive} days</div>` : ''}
    </div>`;
    return `<div class="card health-card" style="animation:fadeUp .4s ease ${i*.05}s both">
      ${ia?`<div class="health-inactive">⚠️ ${inactive}d</div>`:''}
      <div class="health-grade ${score.grade}">${score.grade}</div>
      <div class="health-name">${p}</div>
      <div class="health-score">${score.score}/100</div>
      ${tip}
    </div>`;
  }).join('');
}


// ─── DAY-OF-WEEK CHART ───────────────────────────────────────────────────────
function renderDOWChart(data) {
  const section=$('dow-section');
  if (!section) return;
  const dd=getDailyData(data);
  if(!dd.length){section.style.display='none';return;}
  const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const sums=[0,0,0,0,0,0,0], counts=[0,0,0,0,0,0,0];
  dd.forEach(d=>{
    const dow=new Date(d.date+'T00:00:00').getDay();
    sums[dow]=r2(sums[dow]+d.profit); counts[dow]++;
  });
  const avgs=sums.map((s,i)=>counts[i]>0?r2(s/counts[i]):0);
  section.style.display='block';
  mkChart('chart-dow',{
    type:'bar',
    data:{labels:days,datasets:[{label:'Avg Profit',data:avgs,
      backgroundColor:avgs.map(v=>v>=0?'rgba(16,185,129,.25)':'rgba(239,68,68,.25)'),
      borderColor:avgs.map(v=>v>=0?'#10b981':'#ef4444'),
      borderWidth:1,borderRadius:8}]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>` Avg: ${fmt$(c.parsed.y)} (${counts[c.dataIndex]} days)`}}},
      scales:{x:{grid:{display:false}},y:{beginAtZero:true,ticks:{callback:v=>fmt$(v)},grid:{color:'rgba(255,255,255,.04)'}}}}
  });
}

// ─── ALL-TIME BANNER ─────────────────────────────────────────────────────────
function renderAllTimeBanner() {
  const banner=$('alltime-banner');
  if(!RAW.length){banner.style.display='none';return;}
  // Filter by active channel
  const data = CHANNEL_FILTER === 'tiktok' ? RAW.filter(r=>r.channel==='tiktok')
             : CHANNEL_FILTER === 'ebay'   ? RAW.filter(r=>r.channel!=='tiktok')
             : RAW;
  if(!data.length){banner.style.display='none';return;}
  const allProfit=r2(data.reduce((s,r)=>s+r.profit,0));
  const allDates=[...new Set(data.filter(r=>r.date).map(r=>r.date))];
  const months=[...new Set(data.map(r=>r.month))];
  let allJR=0;
  const persons=[...new Set(data.map(r=>r.person))];
  persons.forEach(p=>{
    const profit=r2(data.filter(r=>r.person===p).reduce((s,r)=>s+r.profit,0));
    allJR=r2(allJR+getSplit(p,profit).jr);
  });
  // Update label based on channel
  const bannerLabel = banner.querySelector('.alltime-label');
  if (bannerLabel) bannerLabel.textContent = CHANNEL_FILTER === 'tiktok' ? '🏆 TikTok Total Profit'
                                           : CHANNEL_FILTER === 'ebay'   ? '🏆 eBay Total Profit'
                                           : '🏆 All-Time Total Profit';
  banner.style.display='flex';
  $('alltime-val').className  = 'alltime-val shimmer-val';
  $('alltime-val').textContent   = fmt$(allProfit);
  window._ALLTIME_PROFIT = allProfit;
  $('alltime-sales').textContent = fmtN(data.length);
  $('alltime-days').textContent  = fmtN(allDates.length);
  $('alltime-jr').textContent    = fmt$(allJR);
  $('alltime-meta').textContent  = `${months.length} months tracked`;
  countUp($('alltime-val'), allProfit, 1200);
}

// ─── CONFETTI / MILESTONES ───────────────────────────────────────────────────
const MILESTONES=[5000,10000,25000,50000,100000];
let celebrated=new Set(JSON.parse(localStorage.getItem('ebay_milestones')||'[]'));
function checkMilestones(total) {
  MILESTONES.forEach(m=>{
    if(total>=m && !celebrated.has(m)){
      celebrated.add(m);
      localStorage.setItem('ebay_milestones',JSON.stringify([...celebrated]));
      launchConfetti();
      showToast(`🎊 ${fmt$(m)} milestone reached!`,'success','🎉');
    }
  });
}
function launchConfetti() {
  const box=$('confetti-box');
  const cols=['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#fbbf24','#ec4899'];
  for(let i=0;i<90;i++){
    const p=document.createElement('div');
    p.className='cp';
    const size=6+Math.random()*8;
    p.style.cssText=`left:${Math.random()*100}%;top:-20px;
      background:${cols[Math.floor(Math.random()*cols.length)]};
      width:${size}px;height:${size}px;
      border-radius:${Math.random()>.5?'50%':'2px'};
      animation:cfall ${2.5+Math.random()*1.5}s linear ${Math.random()*1.5}s forwards;`;
    box.appendChild(p);
    setTimeout(()=>p.remove(),5000);
  }
  // Rain dollar bills during party mode
  if (document.body.classList.contains('party')) {
    for(let i=0;i<18;i++){
      const b=document.createElement('div');
      b.className='bill';
      b.textContent=['💵','💸','🤑','💰'][Math.floor(Math.random()*4)];
      b.style.cssText=`left:${Math.random()*100}%;top:-40px;animation-duration:${2.8+Math.random()*2}s;animation-delay:${Math.random()*1.2}s;`;
      document.body.appendChild(b);
      setTimeout(()=>b.remove(),6000);
    }
  }
}

// ─── SUGGESTIONS ─────────────────────────────────────────────────────────────
function renderSuggestions(data) {
  const section = $('suggest-section'), grid = $('suggest-grid');
  if (!data.length) { section.style.display = 'none'; return; }

  const insights = [];
  const persons = [...new Set(data.map(r => r.person))];
  const personStats = persons.map(p => {
    const pr     = data.filter(r => r.person === p);
    const profit = r2(pr.reduce((s,r) => s+r.profit, 0));
    const cost   = r2(pr.reduce((s,r) => s+r.cost,   0));
    const price  = r2(pr.reduce((s,r) => s+r.price,  0));
    const roi    = cost  > 0 ? r2(profit/cost*100)  : 0;
    const margin = price > 0 ? r2(profit/price*100) : 0;
    const inactive = getInactiveDays(pr);
    return { p, profit, cost, price, roi, margin, inactive, sales: pr.length };
  });

  // Best ROI account
  const sorted = [...personStats].sort((a,b) => b.roi - a.roi);
  const topRoi = sorted[0];
  if (topRoi && topRoi.roi > 15 && topRoi.sales >= 3) {
    insights.push({ type:'opportunity', icon:'📈', title:`${topRoi.p} has your best ROI`,
      body:`This account returns the most profit per dollar spent on inventory. Consider increasing sourcing budget here.`,
      metric:`${fmtP(topRoi.roi)} ROI` });
  }

  // Inactive warnings
  personStats.filter(s => s.inactive !== null && s.inactive >= 7).forEach(s => {
    insights.push({ type:'warning', icon:'⚠️', title:`${s.p} hasn't sold in ${s.inactive} days`,
      body:`No sales recorded recently. Worth checking inventory levels, listing status, or account health.`,
      metric:`${s.inactive} days since last sale` });
  });

  // Best day of week
  const dd = getDailyData(data);
  const dowTotals = {}, dowCounts = {};
  dd.forEach(d => {
    const dow = new Date(d.date+'T00:00:00').getDay();
    dowTotals[dow] = r2((dowTotals[dow]||0) + d.profit);
    dowCounts[dow] = (dowCounts[dow]||0) + 1;
  });
  let bestDow = -1, bestDowAvg = -Infinity;
  for (let i = 0; i < 7; i++) {
    if (dowCounts[i] > 1) {
      const avg = r2(dowTotals[i] / dowCounts[i]);
      if (avg > bestDowAvg) { bestDowAvg = avg; bestDow = i; }
    }
  }
  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  if (bestDow >= 0 && bestDowAvg > 0) {
    insights.push({ type:'trend', icon:'📅', title:`${dayNames[bestDow]} is your strongest day`,
      body:`Your average profit on ${dayNames[bestDow]}s beats every other day of the week. Front-load your listings and sourcing runs on this day.`,
      metric:`Avg ${fmt$(bestDowAvg)} profit` });
  }

  // Month over month — exclude non-standard labels (index 999) so "Dec/Jan 2025" doesn't poison last/prev
  const months = [...new Set(data.map(r => r.month))].filter(m => monthIndex(m) < 900).sort((a,b) => monthIndex(a)-monthIndex(b));
  if (months.length >= 2) {
    const lastM  = months[months.length-1], prevM = months[months.length-2];
    const lastMp = r2(data.filter(r=>r.month===lastM).reduce((s,r)=>s+r.profit,0));
    const prevMp = r2(data.filter(r=>r.month===prevM).reduce((s,r)=>s+r.profit,0));
    if (prevMp !== 0) {
      const pct = r2((lastMp-prevMp)/Math.abs(prevMp)*100);
      if (pct < -10) insights.push({ type:'warning', icon:'📉', title:`${lastM} is trailing ${prevM}`,
        body:`Profit is down vs last month. Check if any accounts have slowed, prices have dropped, or fees have increased.`,
        metric:`${pct.toFixed(1)}% vs prior month` });
      else if (pct > 10) insights.push({ type:'opportunity', icon:'🚀', title:`${lastM} is beating ${prevM}`,
        body:`You're running ahead of last month's pace. Keep momentum going — this is a good time to scale.`,
        metric:`+${pct.toFixed(1)}% vs prior month` });
    }
  }

  // Thin margin warning
  personStats.filter(s => s.margin < 10 && s.sales >= 5).forEach(s => {
    insights.push({ type:'warning', icon:'💸', title:`${s.p} has very thin margins`,
      body:`Less than 10% margin means fees and sourcing costs are consuming most of the revenue. Review pricing strategy or find cheaper inventory.`,
      metric:`${fmtP(s.margin)} margin` });
  });

  // Top profit contributor
  if (persons.length > 1) {
    const totalProfit = r2(data.reduce((s,r)=>s+r.profit,0));
    const top = personStats.reduce((a,b) => b.profit > a.profit ? b : a, personStats[0]);
    if (totalProfit > 0) {
      const share = r2(top.profit/totalProfit*100);
      insights.push({ type:'info', icon:'🏆', title:`${top.p} drives ${share.toFixed(0)}% of profits`,
        body:`This is your highest-grossing account in the current period. ${share >= 60 ? 'Heavy concentration — consider growing other accounts to balance risk.' : 'Good contributor alongside your other accounts.'}`,
        metric:`${fmt$(top.profit)} of ${fmt$(totalProfit)} total` });
    }
  }

  // Consistent earner (high profitable day ratio)
  const dd2 = getDailyData(data);
  const profitDaysByPerson = persons.map(p => {
    const pr = data.filter(r => r.person === p);
    const pdd = getDailyData(pr);
    const profDays = pdd.filter(d => d.profit > 0).length;
    return { p, pct: pdd.length ? r2(profDays/pdd.length*100) : 0, days: pdd.length };
  }).filter(x => x.days >= 5 && x.pct >= 85);
  if (profitDaysByPerson.length) {
    const best = profitDaysByPerson.sort((a,b)=>b.pct-a.pct)[0];
    insights.push({ type:'opportunity', icon:'🎯', title:`${best.p} is remarkably consistent`,
      body:`This account has a profitable day ${best.pct.toFixed(0)}% of the time it's active — that's elite consistency. Reliable and low-risk.`,
      metric:`${best.pct.toFixed(0)}% profitable days` });
  }


  if (!insights.length) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  grid.innerHTML = insights.map((ins, i) => `
    <div class="card suggest-card ${ins.type}" style="animation:fadeUp .35s ease ${i*.05}s both">
      <div class="suggest-type">${ins.icon} ${ins.type}</div>
      <div class="suggest-title">${ins.title}</div>
      <div class="suggest-body">${ins.body}</div>
      <div class="suggest-metric">${ins.metric}</div>
    </div>`).join('');
}

// ─── EXPENSES SECTION ─────────────────────────────────────────────────────────
function renderExpenses() {}

// ─── SHEET ACTIVITY ───────────────────────────────────────────────────────────
function renderSheetActivity() {
  const section = $('sheet-activity-section'), grid = $('sheet-activity-grid');
  const entries = Object.keys(SHEET_MODIFIED);
  if (!entries.length) { section.style.display = 'none'; return; }

  const now = Date.now();
  const cards = entries.map(person => {
    const modTime = new Date(SHEET_MODIFIED[person]).getTime();
    const hoursAgo = (now - modTime) / 3600000;
    let color, dot, label;
    if (hoursAgo < 12) {
      color = 'var(--green)'; dot = '🟢';
      label = hoursAgo < 1 ? 'Just now' : `${Math.floor(hoursAgo)}h ago`;
    } else if (hoursAgo < 24) {
      color = 'var(--yellow)'; dot = '🟡';
      label = `${Math.floor(hoursAgo)}h ago`;
    } else {
      color = 'var(--rose)'; dot = '🔴';
      const days = Math.floor(hoursAgo / 24);
      label = `${days}d ago`;
    }
    return { person, hoursAgo, color, dot, label };
  }).sort((a, b) => b.hoursAgo - a.hoursAgo); // worst first

  const overdue = cards.filter(c => c.hoursAgo >= 12).length;
  $('sheet-activity-sub').textContent = overdue > 0 ? `${overdue} account${overdue>1?'s':''} overdue` : 'All sheets up to date';

  grid.innerHTML = cards.map(c => `
    <div class="card" style="padding:14px 16px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-weight:700;font-size:13px">${c.person}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">Last updated</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:15px;font-weight:800;color:${c.color}">${c.label}</div>
        <div style="font-size:13px">${c.dot}</div>
      </div>
    </div>`).join('');

  section.style.display = 'block';
}

// ─── LISTING TRACKER ──────────────────────────────────────────────────────────
const LISTING_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
let _listingCacheTime = 0;

async function loadListingTracker(force = false) {
  // Serve from cache if fresh enough
  const now = Date.now();
  if (!force && _listingCacheTime && (now - _listingCacheTime) < LISTING_CACHE_TTL && LISTING_DATA.summary.length) {
    renderListingTracker();
    renderGrowthPage();
    return;
  }
  try {
    // Sheet is xlsx format — use CSV export URLs instead of Sheets API
    function parseCSV(text) {
      return text.trim().split('\n').map(line => {
        const fields = []; let cur = ''; let inQ = false;
        for (let i = 0; i < line.length; i++) {
          if (line[i] === '"') inQ = !inQ;
          else if (line[i] === ',' && !inQ) { fields.push(cur.trim()); cur = ''; }
          else cur += line[i];
        }
        fields.push(cur.trim());
        return fields;
      });
    }
    const base = `https://docs.google.com/spreadsheets/d/${LISTING_TRACKER_ID}/export?format=csv`;
    const [sumRes, dayRes] = await Promise.all([
      fetch(`${base}&gid=${LISTING_TRACKER_SUMMARY_GID}`),
      fetch(`${base}&gid=${LISTING_TRACKER_DAILY_GID}`)
    ]);
    if (!sumRes.ok || !dayRes.ok) throw new Error('CSV fetch failed');
    const [sumText, dayText] = await Promise.all([sumRes.text(), dayRes.text()]);

    // Parse summary (row 0 = header)
    const sumRows = parseCSV(sumText);
    const summary = [];
    for (let i = 1; i < sumRows.length; i++) {
      const r = sumRows[i];
      if (!r[0] || /^total|^system|^monthly|^month/i.test(r[0].trim())) continue;
      if (!parseInt(r[2])) continue; // skip rows with no current listing count (headers, labels)
      if (BANNED_STORES.has(r[0].trim())) continue; // skip offboarded stores
      summary.push({ store: r[0].trim(), operator: r[1]||'', current: parseInt(r[2])||0, target: parseInt(r[3])||5000, remaining: parseInt(r[4])||0, dailyGoal: parseInt(r[5])||40 });
    }

    // Parse daily — find today's row
    const dayRows = parseCSV(dayText);
    // Sheet has title/empty rows before real headers — find the row starting with "Date"
    let _hdrIdx = 0;
    for (let i = 0; i < Math.min(dayRows.length, 6); i++) {
      if (dayRows[i][0]?.trim() === 'Date') { _hdrIdx = i; break; }
    }
    const dailyColNames = dayRows[_hdrIdx].map(c => c.trim()); // trim \r and whitespace
    const _dataStart = _hdrIdx + 1;
    const today = new Date();
    const todayStrPad   = `${String(today.getMonth()+1).padStart(2,'0')}/${String(today.getDate()).padStart(2,'0')}`;
    const todayStrShort = `${today.getMonth()+1}/${today.getDate()}`;
    const todayRow = dayRows.slice(_dataStart).find(r => r[0]?.trim() === todayStrPad || r[0]?.trim() === todayStrShort) || null;

    // Parse ALL daily rows for history (skip DAILY TARGET row and empty rows)
    const dailyHistory = []; // [{ dateStr, date, counts:{storeName:n} }]
    for (let i = _dataStart; i < dayRows.length; i++) {
      const r = dayRows[i];
      const r0 = r[0]?.trim() || '';
      if (!r0 || r0.toUpperCase().includes('TARGET') || r0 === 'Date') continue;
      const parts = r0.split('/');
      if (parts.length < 2) continue;
      const mm = parseInt(parts[0]), dd = parseInt(parts[1]);
      if (isNaN(mm) || isNaN(dd)) continue;
      const yr = (mm >= 1 && mm <= 12) ? (mm < 9 ? 2026 : 2025) : 2026;
      const dateObj = new Date(yr, mm-1, dd);
      const counts = {};
      for (let c = 2; c < dailyColNames.length; c++) {
        const name = dailyColNames[c];
        if (!name || name === 'Daily Total' || name === 'Notes') continue;
        if (BANNED_STORES.has(name)) continue; // skip offboarded stores
        const v = r[c];
        if (v !== undefined && v !== '') counts[name] = parseInt(v) || 0;
      }
      if (Object.keys(counts).length > 0)
        dailyHistory.push({ dateStr: r0, date: dateObj, counts });
    }

    LISTING_DATA = { summary, todayRow, dailyColNames, dailyHistory };
    _listingCacheTime = Date.now();
    renderListingTracker();
    renderGrowthPage();
  } catch(e) { console.warn('Listing tracker load failed:', e); }
}

function renderListingTracker() {
  const section = $('listing-tracker-section');
  if (!section) return;
  const { summary, todayRow, dailyColNames } = LISTING_DATA;
  if (!summary.length) { section.style.display = 'none'; return; }

  // Build today's counts keyed by tracker store name
  const todayCounts = {};
  if (todayRow && dailyColNames.length) {
    for (let i = 2; i < dailyColNames.length; i++) {
      const name = dailyColNames[i];
      if (!name || name === 'Daily Total' || name === 'Notes') continue;
      const v = todayRow[i];
      if (v !== undefined && v !== '') todayCounts[name] = parseInt(v) || 0;
    }
  }

  const totalToday = Object.values(todayCounts).reduce((s,v)=>s+v, 0);
  const totalGoal  = summary.reduce((s,r)=>s+(r.dailyGoal||40), 0);
  const pctToday   = totalGoal > 0 ? Math.round(totalToday / totalGoal * 100) : 0;
  const logged     = Object.keys(todayCounts).length;
  const notLogged  = summary.length - logged;

  // Summary bar
  $('listing-tracker-summary').innerHTML = `
    <div class="card" style="padding:16px 20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div>
          <div style="font-size:28px;font-weight:800;line-height:1">${totalToday.toLocaleString()} <span style="font-size:14px;font-weight:500;color:var(--muted)">/ ${totalGoal} today</span></div>
          <div style="font-size:12px;color:var(--muted);margin-top:4px">${logged} of ${summary.length} accounts logged · ${notLogged > 0 ? `<span style="color:var(--amber)">${notLogged} not yet</span>` : '<span style="color:var(--green)">all in ✓</span>'}</div>
        </div>
        <div style="font-size:32px;font-weight:900;color:${pctToday >= 100 ? 'var(--green)' : pctToday >= 60 ? 'var(--amber)' : 'var(--muted)'}">${pctToday}%</div>
      </div>
      <div style="background:var(--glass);border-radius:6px;height:8px;overflow:hidden">
        <div style="width:${Math.min(100,pctToday)}%;height:100%;background:linear-gradient(90deg,var(--indigo),var(--violet));border-radius:6px;transition:width .8s ease"></div>
      </div>
    </div>`;

  // Per-store cards
  $('listing-tracker-grid').innerHTML = summary.map(row => {
    const todayCount  = todayCounts[row.store];
    const hasData     = todayCount !== undefined;
    const hitGoal     = hasData && todayCount >= row.dailyGoal;
    const pct         = Math.min(100, Math.round(row.current / row.target * 100));
    const daysLeft    = row.dailyGoal > 0 ? Math.ceil(row.remaining / row.dailyGoal) : '—';
    const countColor  = hitGoal ? 'var(--green)' : hasData ? 'var(--amber)' : 'var(--muted)';
    return `
      <div class="card" style="padding:16px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
          <div>
            <div style="font-weight:700;font-size:13px">${row.store}</div>
            <div style="font-size:11px;color:var(--muted)">${row.operator}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:22px;font-weight:800;color:${countColor};line-height:1">${hasData ? todayCount : '—'}</div>
            <div style="font-size:10px;color:var(--muted)">${hasData ? (hitGoal ? '✅ goal hit' : `goal: ${row.dailyGoal}`) : 'not logged'}</div>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-bottom:5px">
          <span>${row.current.toLocaleString()} total</span><span>${pct}%</span>
        </div>
        <div style="background:var(--glass);border-radius:4px;height:5px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:var(--indigo);border-radius:4px"></div>
        </div>
        <div style="font-size:10px;color:var(--muted);margin-top:6px">~${daysLeft} days to ${row.target.toLocaleString()} target</div>
      </div>`;
  }).join('');

  $('listing-tracker-sub').textContent = `${totalToday} added today · ${summary.reduce((s,r)=>s+r.current,0).toLocaleString()} total listings`;
  section.style.display = 'block';
}

// ─── PAGE SWITCHER ────────────────────────────────────────────────────────────
let _growthCharts = {};
function switchPage(page) {
  const ops = document.querySelector('main.container');
  const growth = $('growth-page');
  const btnOps = $('page-btn-ops'), btnGrowth = $('page-btn-growth');
  if (page === 'growth') {
    ops.style.display = 'none'; growth.style.display = 'block';
    btnOps.classList.remove('active'); btnGrowth.classList.add('active');
    renderGrowthPage();
  } else {
    growth.style.display = 'none'; ops.style.display = 'block';
    btnGrowth.classList.remove('active'); btnOps.classList.add('active');
  }
}

// ─── GROWTH PAGE RENDERER ────────────────────────────────────────────────────
function arrMedian(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a,b)=>a-b);
  const m = Math.floor(s.length/2);
  return s.length%2 ? s[m] : (s[m-1]+s[m])/2;
}

// Shared personData for calculators
let _growthPersonData = {};

// ─── MONTHLY LISTING SNAPSHOT ─────────────────────────────────────────────────
// Saves each store's listing count once per month so we can track listings→profit lag
function saveMonthlyListingSnapshot() {
  const now   = new Date();
  const key   = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const { summary, dailyHistory = [] } = LISTING_DATA;
  if (!summary || !summary.length) return;

  // Migrate: if snapshots were saved without _version (old format used s.current = total listings
  // including pre-tracker inventory), wipe them so they re-save with only tracked additions.
  let store = JSON.parse(localStorage.getItem('ebay_listing_snapshots') || '{}');
  if (store._version !== 2) {
    store = { _version: 2 };
  }

  if (store[key]) return; // already saved this month with correct data
  store[key] = {};
  summary.forEach(s => {
    // Sum only the daily additions recorded by the tracker — excludes pre-existing inventory
    store[key][s.store] = dailyHistory.reduce((sum, d) => sum + (d.counts[s.store] || 0), 0);
  });
  localStorage.setItem('ebay_listing_snapshots', JSON.stringify(store));
}

function getMonthlyListingSnapshots() {
  return JSON.parse(localStorage.getItem('ebay_listing_snapshots') || '{}');
}

function setChannelFilter(ch) {
  animateChannelSwitch(ch);
  CHANNEL_FILTER = ch;
  document.body.classList.toggle('tiktok-mode', ch === 'tiktok');
  const logoIcon = document.querySelector('.logo-icon');
  const logoSub  = document.querySelector('.logo-sub');
  if (logoIcon) logoIcon.textContent = ch === 'tiktok' ? '⟡' : '📦';
  if (logoSub)  logoSub.textContent  = ch === 'tiktok' ? 'TikTok Sales' : ch === 'ebay' ? 'eBay Only' : 'Operations Dashboard';
  // Update header channel switcher buttons
  ['all','ebay','tiktok'].forEach(c => {
    const btn = $('ch-'+c);
    if (!btn) return;
    const active = c === ch;
    btn.style.background = active ? (c === 'tiktok' ? '#ff2d55' : 'var(--indigo)') : 'transparent';
    btn.style.color = active ? '#fff' : (c === 'tiktok' ? '#ff6b9d' : 'var(--muted)');
  });
  // Update growth tab channel toggle buttons
  ['all','ebay','tiktok'].forEach(c => {
    const btn = $('ch-btn-'+c);
    if (!btn) return;
    const active = c === ch;
    btn.style.background = active ? (c === 'tiktok' ? '#ff6b9d' : 'var(--indigo)') : 'var(--glass)';
    btn.style.color = active ? '#fff' : (c === 'tiktok' ? '#ff6b9d' : 'var(--text2)');
  });
  // Swap "eBay Fees" label based on channel
  const feeLabel  = $('fee-label');
  const feeLabelP = $('fee-label-placeholder');
  const feeTxt = ch === 'tiktok' ? '🏷️ TikTok Fees' : ch === 'ebay' ? '🏷️ eBay Fees' : '🏷️ Platform Fees';
  if (feeLabel)  feeLabel.textContent  = feeTxt;
  if (feeLabelP) feeLabelP.textContent = feeTxt.replace('🏷️ ','');
  // Hide Growth tab in TikTok mode — listing metrics don't apply to TikTok
  const growthBtn = $('page-btn-growth');
  if (growthBtn) growthBtn.style.display = ch === 'tiktok' ? 'none' : '';
  // If on Growth page and switching to TikTok, snap back to Ops
  if (ch === 'tiktok') { try { switchPage('ops'); } catch(e) {} }
  try { applyFilters(); } catch(e) {}
  try { renderAllTimeBanner(); } catch(e) { console.error('renderAllTimeBanner error:', e); }
  try { renderGrowthPage(); } catch(e) { console.error('renderGrowthPage error:', e); }
}

function updateChannelSwitcherVisibility() {
  const hasTiktok = RAW.some(r => r.channel === 'tiktok');
  const sw = $('channel-switcher');
  if (sw) sw.style.display = hasTiktok ? 'flex' : 'none';
}

function renderGrowthPage() {
  const { summary, todayRow, dailyColNames, dailyHistory = [] } = LISTING_DATA;
  saveMonthlyListingSnapshot();

  // Pre-compute today's hist entry so all stores use the same source
  const _todayD = new Date();
  const _todayS1 = `${String(_todayD.getMonth()+1).padStart(2,'0')}/${String(_todayD.getDate()).padStart(2,'0')}`;
  const _todayS2 = `${_todayD.getMonth()+1}/${_todayD.getDate()}`;
  const _todayHist = dailyHistory.find(d => d.dateStr === _todayS1 || d.dateStr === _todayS2);

  // Update last-fetched timestamp
  const _luEl = $('listing-last-updated');
  if (_luEl && _listingCacheTime) {
    const _ago = Math.round((Date.now() - _listingCacheTime) / 1000);
    _luEl.textContent = `Last synced ${_ago < 60 ? 'just now' : Math.round(_ago/60)+'m ago'} · ${summary.length} stores · ${dailyHistory.length} day${dailyHistory.length!==1?'s':''} of history`;
  }

  if (!summary.length) {
    $('growth-kpis').innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:48px;color:var(--muted)">
      <div style="font-size:36px;margin-bottom:12px">📦</div>
      <div style="font-size:15px;font-weight:600;margin-bottom:8px">Loading listing data…</div>
      <div style="font-size:12px">Fetching from the listing tracker sheet. If this persists, click Refresh.</div>
      <button class="btn btn-primary" style="margin-top:16px" onclick="loadListingTracker(true)">↻ Load Now</button>
    </div>`;
    return;
  }

  // ════════════════════════════════════════════════════════
  // BUILD MASTER DATA TABLE — one object per store
  // ════════════════════════════════════════════════════════
  const sortedHistDesc = [...dailyHistory].sort((a,b) => b.date - a.date);

  // Respect the global month filter — when a specific month is selected, show that month's efficiency
  const _growthMonthFilter = ($('filter-month') && $('filter-month').value !== 'all') ? $('filter-month').value : null;

  const pd = {}; // personData keyed by tracker store name
  summary.forEach(s => {
    const dashName = LISTING_NAME_MAP[s.store] || s.store;
    const allRecs    = RAW.filter(r => r.person === dashName);
    const tiktokRecs = allRecs.filter(r => r.channel === 'tiktok');
    const ebayRecs   = allRecs.filter(r => r.channel !== 'tiktok');
    const recs       = CHANNEL_FILTER === 'tiktok' ? tiktokRecs : CHANNEL_FILTER === 'ebay' ? ebayRecs : allRecs;

    // Profit / revenue / sales totals (always all-time for reference)
    const totalProfit  = r2(recs.reduce((sum,r) => sum + r.profit, 0));
    const totalRevenue = r2(recs.reduce((sum,r) => sum + r.revenue, 0));
    const totalSales   = recs.reduce((sum,r) => sum + (r.sales || 1), 0);
    const avgSale      = totalSales > 0 ? r2(totalProfit / totalSales) : 0;

    // Monthly breakdown
    const byMonth = {};
    recs.forEach(r => { if (r.month) byMonth[r.month] = r2((byMonth[r.month]||0) + r.profit); });
    const mKeys = Object.keys(byMonth).filter(m => monthIndex(m) < 900).sort((a,b) => monthIndex(a) - monthIndex(b));
    const lastMo = mKeys[mKeys.length-1], prevMo = mKeys[mKeys.length-2];
    const lastMoP = lastMo ? byMonth[lastMo] : 0;
    const prevMoP = prevMo ? byMonth[prevMo] : 0;
    const momPct  = prevMoP > 0 ? r2((lastMoP - prevMoP) / prevMoP * 100) : null;
    const momDelta = r2(lastMoP - prevMoP);

    // Listing streak (consecutive days with ≥1 listing)
    let streak = 0;
    for (const d of sortedHistDesc) {
      if ((d.counts[s.store]||0) > 0) streak++; else break;
    }

    // Velocity from history
    const histForStore = dailyHistory.reduce((sum,d) => sum + (d.counts[s.store]||0), 0);
    const avgDailyList = dailyHistory.length > 0 ? histForStore / dailyHistory.length : s.dailyGoal;

    // Today's count — use dailyHistory entry for consistency (skips header cols / Daily Total)
    let todayN = null;
    if (_todayHist) {
      const v = _todayHist.counts[s.store];
      if (v !== undefined) todayN = v;
    }
    if (todayN === null && todayRow && dailyColNames.length) {
      const idx = dailyColNames.indexOf(s.store);
      if (idx >= 0 && todayRow[idx] !== undefined && todayRow[idx] !== '')
        todayN = parseInt(todayRow[idx]) || 0;
    }

    // Rolling 30-day and 30-60-day profit windows — computed first, used for stable efficiency ranking
    const _now = new Date();
    const _cut30 = new Date(_now); _cut30.setDate(_now.getDate() - 30);
    const _cut60 = new Date(_now); _cut60.setDate(_now.getDate() - 60);
    const rolling30P        = r2(recs.filter(r => r.date && new Date(r.date+'T00:00:00') >= _cut30).reduce((s,r) => s+r.profit, 0));
    const rolling30PrevP    = r2(recs.filter(r => { const d=new Date(r.date+'T00:00:00'); return r.date && d>=_cut60 && d<_cut30; }).reduce((s,r) => s+r.profit, 0));
    const rolling30Tiktok   = r2(tiktokRecs.filter(r => r.date && new Date(r.date+'T00:00:00') >= _cut30).reduce((s,r) => s+r.profit, 0));
    const rolling30Ebay     = r2(ebayRecs.filter(r => r.date && new Date(r.date+'T00:00:00') >= _cut30).reduce((s,r) => s+r.profit, 0));

    // Order analytics — from actual transaction data
    const totalGross      = r2(recs.reduce((s,r) => s+(r.price||0), 0));
    const avgSalePrice    = totalSales > 0 ? r2(totalGross / totalSales) : 0;
    const avgProfitPerSale = totalSales > 0 ? r2(totalProfit / totalSales) : 0;
    const marginPct       = totalGross > 0 ? r2(totalProfit / totalGross * 100) : 0;
    const sellThrough     = s.current > 0 && totalSales > 0 ? r2(totalSales / s.current) : 0;

    // Days since last sale
    const _lastSaleTs = recs.reduce((mx,r) => { const d=r.date?new Date(r.date+'T00:00:00').getTime():0; return d>mx?d:mx; }, 0);
    const daysSinceLastSale = _lastSaleTs > 0 ? Math.floor((_now - _lastSaleTs) / 86400000) : null;

    // Listing consistency — % of last 14 days where store hit its daily goal
    const _last14 = dailyHistory.filter(d => (_now - d.date) / 86400000 <= 14);
    const consistencyDays = _last14.filter(d => (d.counts[s.store]||0) >= s.dailyGoal).length;
    const consistencyPct  = _last14.length > 0 ? Math.round(consistencyDays / _last14.length * 100) : null;

    // Actual listing pace (last 14 days avg) — separate from goal-based pace
    const _last14Total = _last14.reduce((sum,d) => sum + (d.counts[s.store]||0), 0);
    const actualPace14 = _last14.length > 0 ? r2(_last14Total / _last14.length) : null;

    // Last 7-day avg for momentum detection
    const _last7 = dailyHistory.filter(d => (_now - d.date) / 86400000 <= 7);
    const _last7Total = _last7.reduce((sum,d) => sum + (d.counts[s.store]||0), 0);
    const last7Avg = _last7.length > 0 ? r2(_last7Total / _last7.length) : null;
    // Momentum: last7 vs last14 avg — >1 accelerating, <1 slowing
    const momentum = (last7Avg !== null && actualPace14 > 0) ? r2(last7Avg / actualPace14) : 1;

    // Weekly pacing — are they on track for the week?
    const weekActual   = _last7.reduce((sum,d) => sum + (d.counts[s.store]||0), 0);

    // Rolling 30d transaction counts (for per-sale trend)
    const roll30Sales     = recs.filter(r => r.date && new Date(r.date+'T00:00:00') >= _cut30).length;
    const roll30PrevSales = recs.filter(r => { const d=new Date(r.date+'T00:00:00'); return r.date && d>=_cut60 && d<_cut30; }).length;
    const roll30AvgProfit     = roll30Sales > 0 ? r2(rolling30P / roll30Sales) : 0;
    const roll30PrevAvgProfit = roll30PrevSales > 0 ? r2(rolling30PrevP / roll30PrevSales) : 0;
    // Margin trend: profit/sale improving or compressing?
    const marginTrendPct = roll30PrevAvgProfit > 0 ? r2((roll30AvgProfit - roll30PrevAvgProfit) / roll30PrevAvgProfit * 100) : null;

    // Efficiency — Scale Intelligence always uses rolling 30d (avoids partial-month noise)
    // Month filter still respected for projection math via viewProfit
    const profitPer1k   = s.current > 0 && rolling30P > 0 ? r2(rolling30P / s.current * 1000)
                        : s.current > 0 && totalProfit > 0 ? r2(totalProfit / s.current * 1000) : 0;
    const viewProfit    = _growthMonthFilter ? (byMonth[_growthMonthFilter] || 0) : totalProfit;
    const profitPerList = s.current > 0 && viewProfit > 0 ? viewProfit / s.current : 0;

    // 90-day projection from NEW listings added (goal pace)
    const effDaily = dailyHistory.length >= 7 ? avgDailyList : s.dailyGoal;
    const proj30   = r2(effDaily * 30 * profitPerList);
    const proj60   = r2(effDaily * 60 * profitPerList);
    const proj90   = r2(effDaily * 90 * profitPerList);
    const daysToTgt = s.dailyGoal > 0 ? Math.ceil(s.remaining / s.dailyGoal) : null;

    pd[s.store] = {
      ...s, dashName, recs, totalProfit, totalRevenue, totalSales, avgSale,
      byMonth, mKeys, lastMo, prevMo, lastMoP, prevMoP, momPct, momDelta,
      streak, avgDailyList, histForStore, todayN,
      profitPer1k, profitPerList, proj30, proj60, proj90, effDaily, daysToTgt,
      rolling30P, rolling30PrevP, rolling30Tiktok, rolling30Ebay,
      totalGross, avgSalePrice, avgProfitPerSale, marginPct, sellThrough,
      daysSinceLastSale, consistencyPct, actualPace14,
      last7Avg, momentum, weekActual,
      roll30Sales, roll30PrevSales, roll30AvgProfit, roll30PrevAvgProfit, marginTrendPct
    };
  });

  _growthPersonData = pd; // expose for calculators

  const all        = Object.values(pd);

  // Global MoM: pin ALL stores to the same two comparison months (exclude non-standard month labels)
  const _allMoArr = [...new Set(all.flatMap(p => p.mKeys))].filter(m => m && monthIndex(m) < 900).sort((a,b) => monthIndex(a) - monthIndex(b));
  const gLastMo = _allMoArr[_allMoArr.length-1] || null;
  const gPrevMo = _allMoArr[_allMoArr.length-2] || null;
  all.forEach(p => {
    p.gLastMoP  = gLastMo ? (p.byMonth[gLastMo] || 0) : 0;
    p.gPrevMoP  = gPrevMo ? (p.byMonth[gPrevMo] || 0) : 0;
    p.gMomPct   = (gPrevMo && p.gPrevMoP > 0) ? r2((p.gLastMoP - p.gPrevMoP) / p.gPrevMoP * 100) : null;
    p.gMomDelta = r2(p.gLastMoP - p.gPrevMoP);

    // Rolling 30-day MoM (30d vs prior 30d) — not skewed by partial months
    p.roll30MomPct = p.rolling30PrevP > 0 ? r2((p.rolling30P - p.rolling30PrevP) / p.rolling30PrevP * 100) : null;

    // Rate basis: rolling 30d profit (full window, never partial-month noise)
    // Falls back to last calendar month only if rolling window has no data yet
    const recentMoProfit = p.rolling30P > 0 ? p.rolling30P : (p.gLastMoP || p.gPrevMoP || 0);
    p.recentMoLabel  = p.rolling30P > 0 ? 'Last 30d' : ((p.gLastMoP > 0 && gLastMo) ? gLastMo : (gPrevMo || ''));
    p.recentMoProfit = recentMoProfit;
    p.profitPerListMo   = p.current > 0 && recentMoProfit > 0 ? recentMoProfit / p.current : 0;
    p.proj30mo = r2(p.effDaily * 30 * p.profitPerListMo);
    p.proj60mo = r2(p.effDaily * 60 * p.profitPerListMo);
    p.proj90mo = r2(p.effDaily * 90 * p.profitPerListMo);

    // Actual-pace projections — uses real 14-day listing avg instead of goal
    const _ap = p.actualPace14 !== null ? p.actualPace14 : p.effDaily;
    p.proj30actual = p.profitPerListMo > 0 ? r2(_ap * 30 * p.profitPerListMo) : null;
    p.proj60actual = p.profitPerListMo > 0 ? r2(_ap * 60 * p.profitPerListMo) : null;
    p.proj90actual = p.profitPerListMo > 0 ? r2(_ap * 90 * p.profitPerListMo) : null;

    // Momentum-adjusted projection — pace × momentum factor (flags sandbagging / acceleration)
    const _momPace = _ap * (p.momentum || 1);
    p.proj90momentum = p.profitPerListMo > 0 ? r2(_momPace * 90 * p.profitPerListMo) : null;

    // J&R take-home from this store's rolling 30d profit
    const _split = getSplit(p.dashName, p.rolling30P);
    p.jrShare30d = _split.jr || 0;
  });

  const totalList  = all.reduce((s,p) => s + p.current, 0);
  const totalTgt   = all.reduce((s,p) => s + p.target, 0);
  const totalProf  = all.reduce((s,p) => s + p.totalProfit, 0);
  const proj90All  = all.reduce((s,p) => s + (p.proj90mo || p.proj90), 0);
  const avgPer1k   = totalList > 0 && totalProf > 0 ? r2(totalProf / totalList * 1000) : 0;
  const totalToday = all.reduce((s,p) => s + (p.todayN || 0), 0);
  const jrTotal30d = r2(all.reduce((s,p) => s + p.jrShare30d, 0));
  const totalGoal  = summary.reduce((s,r) => s + (r.dailyGoal || 40), 0);

  const totalTiktok30d = r2(all.reduce((s,p) => s + (p.rolling30Tiktok || 0), 0));
  const totalEbay30d   = r2(all.reduce((s,p) => s + (p.rolling30Ebay   || 0), 0));

  const byEff      = [...all].filter(p => p.current > 0).sort((a,b) => b.profitPer1k - a.profitPer1k);
  const growingCnt  = all.filter(p => p.roll30MomPct !== null && p.roll30MomPct > 0).length;
  const momCnt      = all.filter(p => p.roll30MomPct !== null).length;
  const noMomCnt    = all.length - momCnt;

  // ════════════════════════════════════════════════════════
  // HERO KPIs
  // ════════════════════════════════════════════════════════
  $('growth-kpis').innerHTML = `
    <div class="growth-kpi-card">
      <div class="growth-kpi-label">Total Listings</div>
      <div class="growth-kpi-val" style="color:var(--indigo)">${totalList.toLocaleString()}</div>
      <div class="growth-kpi-sub">${Math.round(totalList/totalTgt*100)}% of ${totalTgt.toLocaleString()} combined target</div>
    </div>
    <div class="growth-kpi-card">
      <div class="growth-kpi-label">Added Today</div>
      <div class="growth-kpi-val" style="color:var(--green)">${totalToday}</div>
      <div class="growth-kpi-sub">${totalGoal > 0 ? Math.round(totalToday/totalGoal*100)+'% of '+totalGoal+' network daily goal' : 'no goal set'}</div>
    </div>
    <div class="growth-kpi-card">
      <div class="growth-kpi-label">Avg Profit / 1k Listings</div>
      <div class="growth-kpi-val" style="color:var(--violet)">${avgPer1k > 0 ? fmt$(avgPer1k) : '—'}</div>
      <div class="growth-kpi-sub">Best: ${byEff[0] ? byEff[0].store+' '+fmt$(byEff[0].profitPer1k) : '—'}</div>
    </div>
    <div class="growth-kpi-card">
      <div class="growth-kpi-label">Growing MoM (profit)</div>
      <div class="growth-kpi-val" style="color:var(--cyan)">${growingCnt}/${all.length}</div>
      <div class="growth-kpi-sub">${noMomCnt > 0 ? `${growingCnt} growing · ${noMomCnt} no prior month data` : 'accounts growing vs last month'}</div>
    </div>
    <div class="growth-kpi-card">
      <div class="growth-kpi-label">Extra Monthly Profit (90d adds)</div>
      <div class="growth-kpi-val" style="color:var(--emerald)">${proj90All > 0 ? fmt$(proj90All) : '—'}</div>
      <div class="growth-kpi-sub">extra profit/mo from listings added over next 90 days · last 30d rate</div>
    </div>
    <div class="growth-kpi-card">
      <div class="growth-kpi-label">J&R Take-Home (Last 30d)</div>
      <div class="growth-kpi-val" style="color:var(--green)">${jrTotal30d > 0 ? fmt$(jrTotal30d) : '—'}</div>
      <div class="growth-kpi-sub">J&R share across all stores · rolling 30d profit</div>
    </div>
    <div class="growth-kpi-card">
      <div class="growth-kpi-label">Network Momentum</div>
      <div class="growth-kpi-val" style="color:${all.filter(p=>p.momentum>1.1).length >= all.length*0.5?'var(--green)':all.filter(p=>p.momentum<0.7).length > all.length*0.4?'var(--red)':'var(--amber)'}">${all.filter(p=>p.momentum>1.1).length} accelerating</div>
      <div class="growth-kpi-sub">${all.filter(p=>p.momentum<0.7).length} slowing · ${all.filter(p=>p.momentum>=0.7&&p.momentum<=1.1).length} steady · based on 7d vs 14d pace</div>
    </div>
    ${totalTiktok30d > 0 ? `<div class="growth-kpi-card" style="border-color:#ff6b9d44">
      <div class="growth-kpi-label" style="color:#ff6b9d">⟡ TikTok Revenue (30d)</div>
      <div class="growth-kpi-val" style="color:#ff6b9d">${fmt$(totalTiktok30d)}</div>
      <div class="growth-kpi-sub">eBay: ${fmt$(totalEbay30d)} · TikTok: ${fmt$(totalTiktok30d)} · combined: ${fmt$(r2(totalTiktok30d+totalEbay30d))}</div>
    </div>` : ''}`;

  // Show/hide channel toggle based on whether TikTok data exists in RAW
  const hasTiktokData = RAW.some(r => r.channel === 'tiktok');
  const toggleRow = $('channel-toggle-row');
  if (toggleRow) {
    toggleRow.style.display = hasTiktokData ? 'flex' : 'none';
    // Sync button active states to current filter
    ['all','ebay','tiktok'].forEach(c => {
      const btn = $('ch-btn-'+c);
      if (!btn) return;
      const active = c === CHANNEL_FILTER;
      btn.style.background = active ? (c === 'tiktok' ? '#ff6b9d' : 'var(--indigo)') : 'var(--glass)';
      btn.style.color = active ? '#fff' : (c === 'tiktok' ? '#ff6b9d' : 'var(--text2)');
    });
  }

  // ════════════════════════════════════════════════════════
  // SCALE INTELLIGENCE — who to bet on
  // ════════════════════════════════════════════════════════
  // Update Scale Intelligence subtitle to show which period efficiency is based on
  const _effLabel = 'last 30d';
  const _effSubEl = document.querySelector('#growth-efficiency-list')?.closest('.growth-section')?.querySelector('.section-hdr span:last-child');
  if (_effSubEl) _effSubEl.textContent = `profit per 1,000 listings · last 30d · who to bet on`;

  const maxEff = byEff.length ? byEff[0].profitPer1k : 1;
  $('growth-efficiency-list').innerHTML = byEff.length === 0
    ? `<p style="color:var(--muted);font-size:12px;padding:16px 0">Profit data loads from your ops sheets after refreshing.</p>`
    : byEff.map((p, i) => {
        const bar    = maxEff > 0 ? p.profitPer1k / maxEff * 100 : 0;
        const medals = ['🥇','🥈','🥉'];
        const medal  = i < 3 ? medals[i] : `${i+1}.`;
        const barC   = i===0?'var(--green)': p.profitPer1k>=avgPer1k?'var(--indigo)':'var(--muted)';
        const tag    = p.profitPer1k >= avgPer1k*1.4 ? '<span style="background:rgba(16,185,129,.15);color:var(--green);font-size:9px;padding:1px 5px;border-radius:4px;margin-left:4px">🚀 scale</span>'
                     : p.profitPer1k > 0 && p.profitPer1k <= avgPer1k*0.5 ? '<span style="background:rgba(239,68,68,.1);color:var(--red);font-size:9px;padding:1px 5px;border-radius:4px;margin-left:4px">⚠️ review</span>' : '';
        const momT   = p.roll30MomPct !== null ? `<span style="font-size:10px;color:${p.roll30MomPct>=0?'var(--green)':'var(--red)'}">${p.roll30MomPct>=0?'↑':'↓'}${Math.abs(p.roll30MomPct).toFixed(0)}% profit (30d)</span>` : '';
        return `<div style="padding:10px 0;border-bottom:1px solid var(--card-border)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:15px;min-width:22px">${medal}</span>
              <span style="font-weight:700;font-size:13px">${p.store}</span>
              <span style="font-size:10px;color:var(--muted)">${p.operator}</span>
              ${tag}
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              ${momT}
              <span style="font-size:14px;font-weight:800;color:${barC}">${p.profitPer1k>0?fmt$(p.profitPer1k):'—'}<span style="font-size:9px;font-weight:400;color:var(--muted)">/1k ${_effLabel}</span></span>
            </div>
          </div>
          <div style="background:var(--glass);border-radius:3px;height:4px;overflow:hidden">
            <div style="width:${bar}%;height:100%;background:${barC};border-radius:3px"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-top:3px">
            <span>${p.current.toLocaleString()} listings · ${p.totalProfit>0?fmt$(p.totalProfit)+' all-time profit':'no profit data yet'}</span>
            <span>${p.totalSales>0?p.totalSales+' sales':''}</span>
          </div>
          ${(p.avgSalePrice>0||p.marginPct>0||p.sellThrough>0||p.daysSinceLastSale!==null||p.consistencyPct!==null) ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:5px;font-size:9px">
            ${p.avgSalePrice>0?`<span style="color:var(--muted)">avg sale ${fmt$(p.avgSalePrice)}</span>`:''}
            ${p.marginPct>0?`<span style="color:${p.marginPct>=20?'var(--green)':p.marginPct>=10?'var(--amber)':'var(--red)'}">${p.marginPct.toFixed(0)}% margin</span>`:''}
            ${p.avgProfitPerSale>0?`<span style="color:var(--muted)">${fmt$(p.avgProfitPerSale)}/sale</span>`:''}
            ${p.sellThrough>0?`<span style="color:${p.sellThrough>=0.5?'var(--green)':p.sellThrough>=0.2?'var(--indigo)':'var(--muted)'}">${(p.sellThrough*100).toFixed(0)}% sell-through</span>`:''}
            ${p.daysSinceLastSale!==null?`<span style="color:${p.daysSinceLastSale>7?'var(--red)':p.daysSinceLastSale>3?'var(--amber)':'var(--green)'}">${p.daysSinceLastSale}d since sale</span>`:''}
            ${p.consistencyPct!==null?`<span style="color:${p.consistencyPct>=70?'var(--green)':p.consistencyPct>=40?'var(--amber)':'var(--red)'}">${p.consistencyPct}% active days (14d)</span>`:''}
            ${p.marginTrendPct!==null?`<span style="color:${p.marginTrendPct>=0?'var(--green)':'var(--red)'}">${p.marginTrendPct>=0?'↑':'↓'}margin/sale</span>`:''}
          </div>` : ''}
        </div>`;
      }).join('');

  // ════════════════════════════════════════════════════════
  // GROWTH MATRIX — listing count vs efficiency (div-based)
  // ════════════════════════════════════════════════════════
  const matrixEl = $('growth-matrix');
  if (matrixEl && byEff.length > 0) {
    const xs = byEff.map(p=>p.current), ys = byEff.map(p=>p.profitPer1k);
    const minX=Math.min(...xs), maxX=Math.max(...xs)||1;
    const minY=Math.min(...ys), maxY=Math.max(...ys)||1;
    const rX=maxX-minX||1, rY=maxY-minY||1;
    matrixEl.innerHTML = `
      <div style="position:absolute;inset:0;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr">
        <div style="border-right:1px dashed rgba(255,255,255,.1);border-bottom:1px dashed rgba(255,255,255,.1);background:rgba(16,185,129,.05);display:flex;align-items:flex-start;padding:6px">
          <span style="font-size:9px;color:var(--green);opacity:.8">💎 Hidden Gems<br><span style="opacity:.6">low listings, high efficiency<br>→ add more listings ASAP</span></span>
        </div>
        <div style="border-bottom:1px dashed rgba(255,255,255,.1);background:rgba(99,102,241,.07);display:flex;align-items:flex-start;padding:6px;justify-content:flex-end">
          <span style="font-size:9px;color:var(--indigo);opacity:.8;text-align:right">⭐ Stars<br><span style="opacity:.6">high listings, high efficiency<br>→ keep pushing</span></span>
        </div>
        <div style="border-right:1px dashed rgba(255,255,255,.1);background:rgba(100,116,139,.03);display:flex;align-items:flex-end;padding:6px">
          <span style="font-size:9px;color:var(--muted);opacity:.8">🌱 Build Up<br><span style="opacity:.6">early stage<br>→ coach &amp; support</span></span>
        </div>
        <div style="background:rgba(239,68,68,.04);display:flex;align-items:flex-end;padding:6px;justify-content:flex-end">
          <span style="font-size:9px;color:var(--red);opacity:.8;text-align:right">⚠️ Review<br><span style="opacity:.6">high listings, low return<br>→ investigate</span></span>
        </div>
      </div>
      <div style="position:absolute;left:6px;top:50%;transform:translateY(-50%);font-size:9px;color:var(--muted);writing-mode:vertical-rl;text-orientation:mixed;opacity:.5">Profit / 1k listings ↑</div>
      ${byEff.map((p,i) => {
        const xPct = rX > 0 ? ((p.current - minX) / rX * 76 + 12) : 50;
        const yPct = rY > 0 ? ((1 - (p.profitPer1k - minY) / rY) * 76 + 10) : 50;
        const clr  = COLORS[i % COLORS.length];
        return `<div title="${p.store}: ${p.current.toLocaleString()} listings · ${fmt$(p.profitPer1k)}/1k" style="position:absolute;left:${xPct}%;top:${yPct}%;transform:translate(-50%,-50%);z-index:2">
          <div style="width:30px;height:30px;border-radius:50%;background:${clr}cc;border:2px solid ${clr};display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:800;color:#fff;cursor:default">${p.store.substring(0,3).toUpperCase()}</div>
          <div style="position:absolute;top:32px;left:50%;transform:translateX(-50%);font-size:8px;color:var(--text2);white-space:nowrap;background:var(--bg2);padding:1px 4px;border-radius:3px;border:1px solid var(--card-border)">${p.store}</div>
        </div>`;
      }).join('')}`;
  }

  // ════════════════════════════════════════════════════════
  // 90-DAY PROJECTIONS
  // ════════════════════════════════════════════════════════
  $('growth-proj-sub').textContent = proj90All > 0 ? `${fmt$(proj90All)} monthly profit uplift from new listings at 90d · based on last 30d rate` : 'Load ops data to see projections';
  const byProj = [...all].sort((a,b) => (b.proj90actual||b.proj90mo||0) - (a.proj90actual||a.proj90mo||0));
  $('growth-proj-grid').innerHTML = byProj.map(p => {
    const hasMonthly = p.profitPerListMo > 0;
    const hasAllTime = p.profitPerList > 0;
    const goalPace   = p.effDaily;
    const actualPace = p.actualPace14 !== null ? p.actualPace14 : goalPace;
    const momLabel   = p.momentum > 1.3 ? '↑ accelerating' : p.momentum < 0.7 ? '↓ slowing' : '→ steady';
    const paceNote   = p.actualPace14 !== null
      ? `${actualPace.toFixed(1)}/day actual (14d avg) · ${momLabel} · goal: ${goalPace.toFixed(1)}/day`
      : `${goalPace.toFixed(1)}/day goal pace (no history yet)`;
    const paceColor  = p.momentum > 1.3 ? 'var(--green)' : p.momentum < 0.7 ? 'var(--red)' : p.actualPace14 !== null && p.actualPace14 >= goalPace * 0.85 ? 'var(--cyan)' : 'var(--amber)';
    // Order quality intel
    const intelBits = [];
    if (p.avgSalePrice > 0)      intelBits.push(`avg sale ${fmt$(p.avgSalePrice)}`);
    if (p.marginPct > 0)         intelBits.push(`${p.marginPct.toFixed(0)}% margin`);
    if (p.avgProfitPerSale > 0)  intelBits.push(`${fmt$(p.avgProfitPerSale)}/sale`);
    if (p.daysSinceLastSale !== null) {
      const dsl = p.daysSinceLastSale;
      const dslColor = dsl > 7 ? 'var(--red)' : dsl > 3 ? 'var(--amber)' : 'var(--green)';
      intelBits.push(`<span style="color:${dslColor}">${dsl}d since last sale</span>`);
    }
    if (p.consistencyPct !== null) {
      const cColor = p.consistencyPct >= 70 ? 'var(--green)' : p.consistencyPct >= 40 ? 'var(--amber)' : 'var(--red)';
      const cLabel = p.consistencyPct >= 70 ? 'listing most days' : p.consistencyPct >= 40 ? 'listing some days' : 'listing infrequently';
      intelBits.push(`<span style="color:${cColor}">${p.consistencyPct}% active (14d) — ${cLabel}</span>`);
    }
    if (p.momentum < 0.7) {
      intelBits.push(`<span style="color:var(--red)">↓ pace dropping (7d below 14d avg)</span>`);
    } else if (p.momentum > 1.3) {
      intelBits.push(`<span style="color:var(--green)">↑ pace picking up</span>`);
    }
    if (p.marginTrendPct !== null && Math.abs(p.marginTrendPct) >= 10) {
      intelBits.push(`<span style="color:${p.marginTrendPct>=0?'var(--green)':'var(--red)'}">${p.marginTrendPct>=0?'↑':'↓'}${Math.abs(p.marginTrendPct).toFixed(0)}% margin/sale (30d)</span>`);
    }
    return `<div class="card" style="padding:16px">
      <div style="font-weight:700;font-size:13px;margin-bottom:2px">${p.store}</div>
      <div style="font-size:10px;margin-bottom:4px"><span style="color:${paceColor}">${paceNote}</span></div>
      ${hasMonthly ? `<div style="font-size:9px;color:var(--muted);margin-bottom:6px;padding:5px 7px;background:var(--glass);border-radius:5px;line-height:1.7">
        <strong style="color:var(--text2)">${p.recentMoLabel} profit:</strong> ${fmt$(p.recentMoProfit)} ÷ ${p.current.toLocaleString()} listings = <strong style="color:var(--indigo)">${fmt$(p.profitPerListMo)}/listing/mo</strong>
        ${CHANNEL_FILTER === 'all' && p.rolling30Tiktok > 0 ? `<br><span style="color:#ff6b9d">⟡ TikTok</span> <strong style="color:#ff6b9d">${fmt$(p.rolling30Tiktok)}</strong> · <span style="color:var(--cyan)">eBay</span> <strong style="color:var(--cyan)">${fmt$(p.rolling30Ebay)}</strong> <span style="opacity:.5">(last 30d)</span>` : ''}
      </div>` : (!hasAllTime ? `<div style="font-size:9px;color:var(--muted);margin-bottom:6px;padding:5px 7px;background:var(--glass);border-radius:5px">No profit data yet — projections unavailable</div>` : '')}
      ${intelBits.length ? `<div style="font-size:9px;color:var(--muted);margin-bottom:8px;display:flex;flex-wrap:wrap;gap:6px">${intelBits.join('<span style="opacity:.4">·</span>')}</div>` : ''}
      <div style="font-size:9px;color:var(--muted);margin-bottom:2px;opacity:.6">if you keep listing at current pace →</div>
      <div style="display:flex;justify-content:space-between;font-size:11px;padding:4px 0;border-bottom:1px solid var(--card-border)">
        <span style="color:var(--muted)">+30 days of listings</span><span style="font-weight:600;color:var(--cyan)">${p.proj30actual>0?'+'+fmt$(p.proj30actual)+'/mo':hasMonthly&&p.proj30mo>0?'+'+fmt$(p.proj30mo)+'/mo':'—'}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;padding:4px 0;border-bottom:1px solid var(--card-border)">
        <span style="color:var(--muted)">+60 days of listings</span><span style="font-weight:600;color:var(--violet)">${p.proj60actual>0?'+'+fmt$(p.proj60actual)+'/mo':hasMonthly&&p.proj60mo>0?'+'+fmt$(p.proj60mo)+'/mo':'—'}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:13px;padding:6px 0">
        <span style="color:var(--muted)">+90 days of listings</span><span style="font-weight:800;color:var(--green)">${p.proj90actual>0?'+'+fmt$(p.proj90actual)+'/mo':hasMonthly&&p.proj90mo>0?'+'+fmt$(p.proj90mo)+'/mo':'—'}</span>
      </div>
      ${hasMonthly ? (() => {
        const sp90 = getSplit(p.dashName, p.proj90actual||p.proj90mo||0);
        return `<div style="padding:7px;background:rgba(16,185,129,.06);border-radius:6px;margin-top:4px">
          <div style="font-size:9px;color:var(--muted);margin-bottom:5px">90-day projection split</div>
          <div style="display:flex;gap:10px;font-size:10px;flex-wrap:wrap">
            ${sp90.storeOwner>0?`<span><span style="color:var(--muted)">Client </span><span style="font-weight:700;color:var(--yellow)">${fmt$(sp90.storeOwner)}/mo</span></span>`:''}
            <span><span style="color:var(--muted)">Danian </span><span style="font-weight:700;color:#818cf8">${fmt$(sp90.danian)}/mo</span></span>
            <span><span style="color:var(--muted)">J&R </span><span style="font-weight:700;color:var(--green)">${fmt$(sp90.jr)}/mo</span></span>
          </div>
        </div>`;
      })() : ''}
      ${hasMonthly?`<div style="font-size:9px;color:var(--muted);border-top:1px solid var(--card-border);padding-top:6px;margin-top:6px;opacity:.7">extra profit/mo from those newly added listings · based on ${p.recentMoLabel} rate</div>`:''}
      ${p.actualPace14 > 0 && p.remaining > 0 ? `<div style="font-size:10px;color:var(--muted);margin-top:4px">~${Math.ceil(p.remaining/p.actualPace14)} days to ${p.target.toLocaleString()} target at current pace</div>` : ''}
    </div>`;
  }).join('');

  // ════════════════════════════════════════════════════════
  // MONTH-OVER-MONTH TREND
  // ════════════════════════════════════════════════════════
  // MoM uses rolling 30d windows — immune to partial-month distortion
  const withMom = all.filter(p=>p.roll30MomPct!==null).sort((a,b)=>(b.roll30MomPct||0)-(a.roll30MomPct||0));
  const noMom   = all.filter(p=>p.roll30MomPct===null);
  const growCnt = withMom.filter(p=>p.roll30MomPct>0).length;
  const decCnt  = withMom.filter(p=>p.roll30MomPct<=0).length;
  $('growth-mom-sub').textContent = `last 30d vs prior 30d · ${growCnt} growing · ${decCnt} declining · ${noMom.length} no data`;
  $('growth-mom-grid').innerHTML = [...withMom, ...noMom].map(p => {
    const has  = p.roll30MomPct !== null;
    const up   = has && p.roll30MomPct > 0;
    const clr  = has ? (up?'var(--green)':'var(--red)') : 'var(--muted)';
    const icon = has ? (up?'↑':'↓') : '—';
    const delta = has ? r2(p.rolling30P - p.rolling30PrevP) : 0;
    const noData = p.recs.length === 0;
    return `<div class="card" style="padding:14px 16px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-weight:700;font-size:13px">${p.store}</div>
        <div style="font-size:10px;color:var(--muted);margin-top:2px">${has ? fmt$(p.rolling30PrevP)+' → '+fmt$(p.rolling30P)+' (30d profit)' : 'Not enough data'}</div>
        ${has?`<div style="font-size:10px;color:${clr};margin-top:2px">${up?'+':''}${fmt$(delta)}</div>`:''}
        ${noData ? `<div style="font-size:9px;color:var(--amber);margin-top:2px">⚠ 0 transactions loaded — try refreshing</div>` : `<div style="font-size:9px;color:var(--muted);margin-top:1px">${p.recs.length} sales transactions loaded (all-time)</div>`}
      </div>
      <div style="font-size:24px;font-weight:900;color:${clr}">${has?icon+Math.abs(p.roll30MomPct).toFixed(0)+'%':icon}</div>
    </div>`;
  }).join('');

  // ════════════════════════════════════════════════════════
  // OPERATOR INTELLIGENCE
  // ════════════════════════════════════════════════════════
  const ops = {};
  summary.forEach(s => {
    const op = s.operator || 'Unassigned';
    if (!ops[op]) ops[op] = { stores:[], totalList:0, totalProfit:0, rolling30:0, effs:[], momGrow:0, momTotal:0, consistScores:[] };
    const p = pd[s.store];
    ops[op].stores.push(s.store);
    ops[op].totalList    += s.current;
    ops[op].totalProfit  += p.totalProfit;
    ops[op].rolling30    += p.rolling30P;
    if (p.profitPer1k > 0) ops[op].effs.push(p.profitPer1k);
    if (p.roll30MomPct !== null) { ops[op].momTotal++; if (p.roll30MomPct > 0) ops[op].momGrow++; }
    if (p.consistencyPct !== null) ops[op].consistScores.push(p.consistencyPct);
  });
  const opList = Object.entries(ops).sort((a,b)=>b[1].rolling30-a[1].rolling30);
  $('growth-operator-grid').innerHTML = opList.map(([op, data]) => {
    const avgEff = data.effs.length ? r2(data.effs.reduce((s,v)=>s+v,0)/data.effs.length) : 0;
    const bestStore = data.stores.reduce((best, s) => (pd[s].profitPer1k > (pd[best]?.profitPer1k||0)) ? s : best, data.stores[0]);
    const avgConsist = data.consistScores.length ? Math.round(data.consistScores.reduce((s,v)=>s+v,0)/data.consistScores.length) : null;
    const consistColor = avgConsist===null?'var(--muted)':avgConsist>=70?'var(--green)':avgConsist>=40?'var(--amber)':'var(--red)';
    const jrOp = r2(data.stores.reduce((s,st) => s + (pd[st]?.jrShare30d||0), 0));
    return `<div class="card" style="padding:16px">
      <div style="font-weight:700;font-size:14px;margin-bottom:2px">${op}</div>
      <div style="font-size:10px;color:var(--muted);margin-bottom:12px">${data.stores.join(' · ')}</div>
      <div style="display:flex;justify-content:space-between;font-size:12px;padding:5px 0;border-bottom:1px solid var(--card-border)"><span style="color:var(--muted)">Stores managed</span><span style="font-weight:600">${data.stores.length}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:12px;padding:5px 0;border-bottom:1px solid var(--card-border)"><span style="color:var(--muted)">Total listings</span><span style="font-weight:600">${data.totalList.toLocaleString()}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:12px;padding:5px 0;border-bottom:1px solid var(--card-border)"><span style="color:var(--muted)">All-time profit</span><span style="font-weight:600;color:var(--green)">${data.totalProfit>0?fmt$(data.totalProfit):'—'}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:12px;padding:5px 0;border-bottom:1px solid var(--card-border)"><span style="color:var(--muted)">Last 30d profit (stores)</span><span style="font-weight:600;color:var(--green)">${data.rolling30>0?fmt$(data.rolling30):'—'}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:12px;padding:5px 0;border-bottom:1px solid var(--card-border)"><span style="color:var(--muted)">Avg profit/1k listings (30d)</span><span style="font-weight:600;color:var(--violet)">${avgEff>0?fmt$(avgEff):'—'}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:12px;padding:5px 0;border-bottom:1px solid var(--card-border)"><span style="color:var(--muted)">Active listing days (14d)</span><span style="font-weight:600;color:${consistColor}">${avgConsist!==null?avgConsist+'% of days':'—'}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:12px;padding:5px 0;border-bottom:1px solid var(--card-border)"><span style="color:var(--muted)">Momentum (7d vs 14d)</span><span style="font-weight:600;color:${(() => { const accel = data.stores.filter(s=>pd[s]?.momentum>1.1).length; return accel >= data.stores.length*0.6 ? 'var(--green)' : accel > 0 ? 'var(--amber)' : 'var(--red)'; })()}">${data.stores.filter(s=>pd[s]?.momentum>1.1).length}/${data.stores.length} accelerating</span></div>
      <div style="display:flex;justify-content:space-between;font-size:12px;padding:5px 0;border-bottom:1px solid var(--card-border)"><span style="color:var(--muted)">Profit trend (30d)</span><span style="font-weight:600">${data.momTotal>0?data.momGrow+'/'+data.momTotal+' growing':'—'}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:12px;padding:5px 0;border-bottom:1px solid var(--card-border)"><span style="color:var(--muted)">Best profit/1k account</span><span style="font-weight:600;color:var(--cyan)">${bestStore||'—'}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:12px;padding:5px 0"><span style="color:var(--muted)">J&R share (last 30d)</span><span style="font-weight:600;color:var(--emerald)">${jrOp>0?fmt$(jrOp):'—'}</span></div>
    </div>`;
  }).join('');

  // ════════════════════════════════════════════════════════
  // NETWORK AT FULL SCALE
  // ════════════════════════════════════════════════════════
  const netTotalTarget  = all.reduce((s,p) => s + p.target, 0);
  const netCurrentList  = all.reduce((s,p) => s + p.current, 0);
  const netPct          = Math.round(netCurrentList / netTotalTarget * 100);
  // Monthly profit now (using monthly rate × current listings)
  const netMonthlyNow   = r2(all.reduce((s,p) => s + (p.profitPerListMo > 0 ? p.current * p.profitPerListMo : 0), 0));
  // Monthly profit at full target (target listings × monthly rate per store)
  const netMonthlyFullScale = r2(all.reduce((s,p) => s + (p.profitPerListMo > 0 ? p.target * p.profitPerListMo : 0), 0));
  const netUplift       = r2(netMonthlyFullScale - netMonthlyNow);
  // Network split take-homes (all three parties)
  const jrNetNow        = r2(all.reduce((s,p) => s + (p.profitPerListMo > 0 ? getSplit(p.dashName, p.current * p.profitPerListMo).jr : 0), 0));
  const jrNetAtScale    = r2(all.reduce((s,p) => s + (p.profitPerListMo > 0 ? getSplit(p.dashName, p.target * p.profitPerListMo).jr : 0), 0));
  const danianNetNow    = r2(all.reduce((s,p) => s + (p.profitPerListMo > 0 ? getSplit(p.dashName, p.current * p.profitPerListMo).danian : 0), 0));
  const danianNetScale  = r2(all.reduce((s,p) => s + (p.profitPerListMo > 0 ? getSplit(p.dashName, p.target * p.profitPerListMo).danian : 0), 0));
  const clientNetNow    = r2(all.reduce((s,p) => s + (p.profitPerListMo > 0 ? getSplit(p.dashName, p.current * p.profitPerListMo).storeOwner : 0), 0));
  const clientNetScale  = r2(all.reduce((s,p) => s + (p.profitPerListMo > 0 ? getSplit(p.dashName, p.target * p.profitPerListMo).storeOwner : 0), 0));
  // Days until each store hits target at current pace
  const storeETAs = all.map(p => {
    const remaining = Math.max(0, p.target - p.current);
    return { store: p.store, remaining, days: p.effDaily > 0 ? Math.ceil(remaining / p.effDaily) : null };
  });
  const maxETA    = storeETAs.reduce((mx,s) => (s.days !== null && (mx === null || s.days > mx)) ? s.days : mx, null);
  const critPath  = storeETAs.find(s => s.days === maxETA);

  $('growth-network-sub').textContent = netMonthlyFullScale > 0
    ? `${netPct}% to full scale · ${fmt$(netMonthlyNow)}/mo now → ${fmt$(netMonthlyFullScale)}/mo at target`
    : `${netPct}% to full scale · load ops data for profit projections`;

  $('growth-network-hero').innerHTML = `
    <div class="card" style="padding:20px;background:linear-gradient(135deg,rgba(99,102,241,.12),rgba(139,92,246,.08));border:1px solid rgba(99,102,241,.2)">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:20px;margin-bottom:16px">
        <div>
          <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Network Progress</div>
          <div style="font-size:28px;font-weight:900;color:var(--indigo)">${netPct}%</div>
          <div style="font-size:11px;color:var(--muted)">${netCurrentList.toLocaleString()} / ${netTotalTarget.toLocaleString()} listings</div>
          <div style="background:rgba(255,255,255,.08);border-radius:4px;height:5px;overflow:hidden;margin-top:6px"><div style="height:100%;border-radius:4px;background:linear-gradient(90deg,var(--indigo),var(--violet));width:${netPct}%"></div></div>
        </div>
        <div>
          <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Monthly Profit Now</div>
          <div style="font-size:28px;font-weight:900;color:var(--green)">${netMonthlyNow > 0 ? fmt$(netMonthlyNow) : '—'}</div>
          <div style="font-size:11px;color:var(--muted)">across all active stores/mo</div>
        </div>
        <div>
          <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">At Full Scale (${netTotalTarget.toLocaleString()} listings)</div>
          <div style="font-size:28px;font-weight:900;color:var(--emerald)">${netMonthlyFullScale > 0 ? fmt$(netMonthlyFullScale) : '—'}</div>
          <div style="font-size:11px;color:var(--muted)">projected monthly profit/mo</div>
        </div>
        <div>
          <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Monthly Uplift Remaining</div>
          <div style="font-size:28px;font-weight:900;color:var(--violet)">${netUplift > 0 ? '+'+fmt$(netUplift) : '—'}</div>
          <div style="font-size:11px;color:var(--muted)">left to unlock at target pace</div>
        </div>
        ${maxETA !== null ? `<div>
          <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Full Network ETA</div>
          <div style="font-size:28px;font-weight:900;color:var(--amber)">~${maxETA}d</div>
          <div style="font-size:11px;color:var(--muted)">critical path: ${critPath?.store||'—'}</div>
        </div>` : ''}
      </div>
      ${jrNetNow > 0 ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.06)">
        <div style="font-size:10px;color:var(--muted);margin-bottom:8px;font-weight:600">NETWORK TAKE-HOME — ALL PARTIES</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px">
          ${clientNetNow>0?`<div style="padding:10px;background:rgba(251,191,36,.06);border:1px solid rgba(251,191,36,.15);border-radius:8px">
            <div style="font-size:9px;color:var(--muted);margin-bottom:3px">Clients (all) now</div>
            <div style="font-size:18px;font-weight:900;color:var(--yellow)">${fmt$(clientNetNow)}<span style="font-size:10px;font-weight:400">/mo</span></div>
          </div>`:''}
          <div style="padding:10px;background:rgba(129,140,248,.06);border:1px solid rgba(129,140,248,.15);border-radius:8px">
            <div style="font-size:9px;color:var(--muted);margin-bottom:3px">Danian now</div>
            <div style="font-size:18px;font-weight:900;color:#818cf8">${fmt$(danianNetNow)}<span style="font-size:10px;font-weight:400">/mo</span></div>
          </div>
          <div style="padding:10px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.2);border-radius:8px">
            <div style="font-size:9px;color:var(--muted);margin-bottom:3px">J&R now</div>
            <div style="font-size:18px;font-weight:900;color:var(--green)">${fmt$(jrNetNow)}<span style="font-size:10px;font-weight:400">/mo</span></div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
          ${clientNetScale>0?`<div style="padding:10px;background:rgba(251,191,36,.04);border:1px solid rgba(251,191,36,.1);border-radius:8px">
            <div style="font-size:9px;color:var(--muted);margin-bottom:3px">Clients @ ${netTotalTarget.toLocaleString()}</div>
            <div style="font-size:18px;font-weight:900;color:var(--yellow)">${fmt$(clientNetScale)}<span style="font-size:10px;font-weight:400">/mo</span></div>
          </div>`:''}
          <div style="padding:10px;background:rgba(129,140,248,.04);border:1px solid rgba(129,140,248,.1);border-radius:8px">
            <div style="font-size:9px;color:var(--muted);margin-bottom:3px">Danian @ ${netTotalTarget.toLocaleString()}</div>
            <div style="font-size:18px;font-weight:900;color:#818cf8">${fmt$(danianNetScale)}<span style="font-size:10px;font-weight:400">/mo</span></div>
          </div>
          <div style="padding:10px;background:rgba(16,185,129,.04);border:1px solid rgba(16,185,129,.12);border-radius:8px">
            <div style="font-size:9px;color:var(--muted);margin-bottom:3px">J&R @ ${netTotalTarget.toLocaleString()}</div>
            <div style="font-size:18px;font-weight:900;color:var(--emerald)">${fmt$(jrNetAtScale)}<span style="font-size:10px;font-weight:400">/mo</span></div>
          </div>
        </div>
      </div>` : ''}
      <div style="font-size:10px;color:var(--muted);border-top:1px solid rgba(255,255,255,.06);padding-top:10px;margin-top:12px">
        Based on last 30d monthly profit rate per listing · targets from your listing tracker sheet · <em>all profit figures are monthly</em>
      </div>
    </div>`;

  $('growth-network-grid').innerHTML = [...all].sort((a,b) => {
    const aDays = a.effDaily > 0 ? Math.ceil(Math.max(0,a.target-a.current)/a.effDaily) : 9999;
    const bDays = b.effDaily > 0 ? Math.ceil(Math.max(0,b.target-b.current)/b.effDaily) : 9999;
    return aDays - bDays; // closest to target first
  }).map(p => {
    const remaining   = Math.max(0, p.target - p.current);
    const pct         = Math.min(100, Math.round(p.current / p.target * 100));
    const daysLeft    = p.effDaily > 0 ? Math.ceil(remaining / p.effDaily) : null;
    const moNow       = r2(p.current * p.profitPerListMo);
    const moAtTarget  = r2(p.target * p.profitPerListMo);
    const moUplift    = r2(moAtTarget - moNow);
    const hasMo       = p.profitPerListMo > 0;
    const splitNow      = hasMo ? getSplit(p.dashName, moNow) : null;
    const splitAtTarget = hasMo ? getSplit(p.dashName, moAtTarget) : null;
    const jrNow         = splitNow?.jr || 0;
    const jrAtTarget    = splitAtTarget?.jr || 0;
    const barColor    = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--indigo)' : 'var(--muted)';
    return `<div class="card" style="padding:16px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
        <div>
          <div style="font-weight:700;font-size:14px">${p.store}</div>
          <div style="font-size:10px;color:var(--muted)">${p.operator}</div>
        </div>
        <div style="font-size:22px;font-weight:900;color:${barColor}">${pct}%</div>
      </div>
      <div style="background:var(--glass);border-radius:3px;height:5px;overflow:hidden;margin-bottom:10px">
        <div style="height:100%;border-radius:3px;background:${barColor};width:${pct}%;transition:width .8s"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px">
        <div style="padding:6px;background:var(--glass);border-radius:6px">
          <div style="color:var(--muted);font-size:9px;margin-bottom:2px">Current listings</div>
          <div style="font-weight:700">${p.current.toLocaleString()}</div>
        </div>
        <div style="padding:6px;background:var(--glass);border-radius:6px">
          <div style="color:var(--muted);font-size:9px;margin-bottom:2px">Target</div>
          <div style="font-weight:700">${p.target.toLocaleString()} <span style="font-size:9px;color:var(--muted)">(${remaining.toLocaleString()} left)</span></div>
        </div>
        <div style="padding:6px;background:var(--glass);border-radius:6px">
          <div style="color:var(--muted);font-size:9px;margin-bottom:2px">Monthly profit now</div>
          <div style="font-weight:700;color:var(--green)">${hasMo ? fmt$(moNow)+'/mo' : '—'}</div>
        </div>
        <div style="padding:6px;background:var(--glass);border-radius:6px">
          <div style="color:var(--muted);font-size:9px;margin-bottom:2px">At target</div>
          <div style="font-weight:700;color:var(--emerald)">${hasMo ? fmt$(moAtTarget)+'/mo' : '—'}</div>
        </div>
        ${hasMo ? `<div style="padding:6px;background:rgba(139,92,246,.1);border-radius:6px;grid-column:1/-1">
          <div style="color:var(--muted);font-size:9px;margin-bottom:2px">Monthly uplift when at target</div>
          <div style="font-weight:800;color:var(--violet)">+${fmt$(moUplift)}/mo</div>
        </div>
        <div style="padding:6px;background:rgba(16,185,129,.06);border-radius:6px;grid-column:1/-1">
          <div style="color:var(--muted);font-size:9px;margin-bottom:5px">Monthly split breakdown</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;font-size:10px">
            ${splitNow?.storeOwner>0?`<div><div style="color:var(--muted);font-size:8px">Client now</div><div style="font-weight:700;color:var(--yellow)">${fmt$(splitNow.storeOwner)}</div></div>`:''}
            <div><div style="color:var(--muted);font-size:8px">Danian now</div><div style="font-weight:700;color:#818cf8">${splitNow?fmt$(splitNow.danian):'—'}</div></div>
            <div><div style="color:var(--muted);font-size:8px">J&R now</div><div style="font-weight:700;color:var(--green)">${splitNow?fmt$(splitNow.jr):'—'}</div></div>
            ${splitAtTarget?.storeOwner>0?`<div><div style="color:var(--muted);font-size:8px">Client @ target</div><div style="font-weight:700;color:var(--yellow)">${fmt$(splitAtTarget.storeOwner)}</div></div>`:''}
            <div><div style="color:var(--muted);font-size:8px">Danian @ target</div><div style="font-weight:700;color:#818cf8">${splitAtTarget?fmt$(splitAtTarget.danian):'—'}</div></div>
            <div><div style="color:var(--muted);font-size:8px">J&R @ target</div><div style="font-weight:700;color:var(--emerald)">${splitAtTarget?fmt$(splitAtTarget.jr):'—'}</div></div>
          </div>
        </div>` : ''}
        <div style="padding:6px;background:var(--glass);border-radius:6px;grid-column:1/-1">
          <div style="color:var(--muted);font-size:9px;margin-bottom:2px">ETA at current pace (${p.effDaily.toFixed(0)}/day)</div>
          <div style="font-weight:700;color:var(--cyan)">${daysLeft !== null ? (daysLeft === 0 ? '✅ At target' : '~'+daysLeft+' days') : '—'}</div>
        </div>
      </div>
    </div>`;
  }).join('');

  // ════════════════════════════════════════════════════════
  // SCALE CALCULATORS — populate dropdowns
  // ════════════════════════════════════════════════════════
  const selOpts = summary.map(s=>`<option value="${s.store}">${s.store}</option>`).join('');
  ['calc-account-sel','calc-profit-account'].forEach(id => {
    const el = $(id); if (el) { el.innerHTML = selOpts; }
  });
  updateScaleCalc();
  updateProfitCalc();

  // ════════════════════════════════════════════════════════
  // TODAY'S ACTIVITY CHART
  // ════════════════════════════════════════════════════════
  const storeNames  = summary.map(r=>r.store);
  const todayCounts = storeNames.map(name => pd[name]?.todayN || 0);
  const goalLine    = storeNames.map(() => 40);
  $('growth-today-sub').textContent = `${totalToday} total · ${storeNames.filter((_,i)=>todayCounts[i]>0).length}/${storeNames.length} accounts logged`;
  if (_growthCharts.today) _growthCharts.today.destroy();
  const ctx1 = document.getElementById('chart-today-listings');
  if (ctx1) _growthCharts.today = new Chart(ctx1, {
    type:'bar',
    data:{ labels:storeNames, datasets:[
      { label:'Listings Added', data:todayCounts, backgroundColor:todayCounts.map(v=>v>=40?'rgba(16,185,129,.75)':v>0?'rgba(99,102,241,.75)':'rgba(100,116,139,.3)'), borderRadius:6 },
      { label:'Daily Goal (40)', data:goalLine, type:'line', borderColor:'rgba(251,191,36,.7)', borderWidth:2, borderDash:[4,4], pointRadius:0, fill:false }
    ]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{legend:{labels:{color:'var(--text2)',font:{size:11}}}},
      scales:{ x:{ticks:{color:'var(--text2)',font:{size:11}},grid:{color:'rgba(255,255,255,.04)'}}, y:{ticks:{color:'var(--text2)',font:{size:11}},grid:{color:'rgba(255,255,255,.06)'},beginAtZero:true} }
    }
  });

  // ════════════════════════════════════════════════════════
  // PROGRESS TO TARGET
  // ════════════════════════════════════════════════════════
  const byPct = [...summary].sort((a,b)=>(b.current/b.target)-(a.current/a.target));
  $('growth-progress-grid').innerHTML = byPct.map(r => {
    const pct = Math.min(100,Math.round(r.current/r.target*100));
    const pctC = pct>=80?'var(--green)':pct>=50?'var(--cyan)':'var(--indigo)';
    const days = r.dailyGoal>0 ? Math.ceil(r.remaining/r.dailyGoal) : '—';
    return `<div class="card" style="padding:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div><div style="font-weight:700;font-size:13px">${r.store}</div><div style="font-size:10px;color:var(--muted)">${r.operator}</div></div>
        <div style="font-size:24px;font-weight:800;color:${pctC}">${pct}%</div>
      </div>
      <div class="growth-progress-bar"><div class="growth-progress-fill" style="width:${pct}%"></div></div>
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-top:4px">
        <span>${r.current.toLocaleString()} / ${r.target.toLocaleString()} listings</span><span>~${days} days to target</span>
      </div>
    </div>`;
  }).join('');

  // ════════════════════════════════════════════════════════
  // DAILY VELOCITY CHART
  // ════════════════════════════════════════════════════════
  if (_growthCharts.velocity) _growthCharts.velocity.destroy();
  const velWrap = $('growth-velocity-wrap');
  if (dailyHistory.length === 0) {
    $('growth-velocity-sub').textContent = 'Collecting data — chart appears as team logs daily';
    if (velWrap) velWrap.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:220px;color:var(--muted);font-size:13px;flex-direction:column;gap:8px"><span style="font-size:32px">📊</span>Chart appears once daily listing data is logged</div>`;
  } else {
    $('growth-velocity-sub').textContent = `${dailyHistory.length} days tracked`;
    if (velWrap && !velWrap.querySelector('canvas')) velWrap.innerHTML = `<canvas id="chart-velocity"></canvas>`;
    const ctx2 = document.getElementById('chart-velocity');
    if (ctx2) _growthCharts.velocity = new Chart(ctx2, {
      type:'bar',
      data:{ labels:dailyHistory.map(d=>d.dateStr), datasets:[
        { label:'Total Added', data:dailyHistory.map(d=>Object.values(d.counts).reduce((s,v)=>s+v,0)), backgroundColor:'rgba(99,102,241,.6)', borderColor:'rgba(99,102,241,1)', borderWidth:1, borderRadius:4 }
      ]},
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{legend:{labels:{color:'var(--text2)',font:{size:11}}}},
        scales:{ x:{ticks:{color:'var(--text2)',font:{size:10}},grid:{display:false}}, y:{ticks:{color:'var(--text2)',font:{size:11}},grid:{color:'rgba(255,255,255,.05)'},beginAtZero:true} }
      }
    });
  }

  // ════════════════════════════════════════════════════════
  // PER-ACCOUNT INTELLIGENCE CARDS
  // ════════════════════════════════════════════════════════
  if (!$('growth-account-grid')) { /* section removed */ } else $('growth-account-grid').innerHTML = all.map(p => {
    const pct  = Math.min(100,Math.round(p.current/p.target*100));
    const todC = p.todayN===null?'var(--muted)':p.todayN>=40?'var(--green)':'var(--amber)';
    const velAvg = dailyHistory.length > 0 ? (p.histForStore/dailyHistory.length).toFixed(1) : '—';
    const effRank = byEff.findIndex(b=>b.store===p.store)+1;
    const momBadge = p.roll30MomPct!==null ? `<span style="font-size:9px;padding:1px 5px;border-radius:4px;background:${p.roll30MomPct>=0?'rgba(16,185,129,.15)':'rgba(239,68,68,.1)'};color:${p.roll30MomPct>=0?'var(--green)':'var(--red)'};">${p.roll30MomPct>=0?'↑':'↓'}${Math.abs(p.roll30MomPct).toFixed(0)}% profit (30d)</span>` : '';
    return `<div class="growth-account-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
        <div>
          <div class="growth-account-name">${p.store} ${momBadge}</div>
          <div class="growth-account-op">${p.operator}</div>
        </div>
        ${effRank>0?`<div style="font-size:10px;color:var(--muted);text-align:right">#${effRank} efficiency</div>`:''}
      </div>
      <div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-bottom:4px"><span>${p.current.toLocaleString()} listings</span><span>${pct}% to target</span></div>
        <div class="growth-progress-bar"><div class="growth-progress-fill" style="width:${pct}%"></div></div>
      </div>
      <div class="growth-stat-row"><span class="growth-stat-label">Listings added today</span><span class="growth-stat-val" style="color:${todC}">${p.todayN===null?'—':p.todayN} ${p.todayN!==null&&p.todayN>=40?'✅':''}</span></div>
      <div class="growth-stat-row"><span class="growth-stat-label">Avg listings/day</span><span class="growth-stat-val">${velAvg}</span></div>
      <div class="growth-stat-row"><span class="growth-stat-label">Listing streak</span><span class="growth-stat-val">${p.streak>0?'🔥 '+p.streak+'d':'—'}</span></div>
      <div class="growth-stat-row"><span class="growth-stat-label">Days to listing target</span><span class="growth-stat-val">${p.daysToTgt?'~'+p.daysToTgt+'d':'—'}</span></div>
      <div class="growth-stat-row"><span class="growth-stat-label">All-time profit</span><span class="growth-stat-val" style="color:var(--green)">${p.totalProfit>0?fmt$(p.totalProfit):'—'}</span></div>
      <div class="growth-stat-row"><span class="growth-stat-label">Avg profit/sale</span><span class="growth-stat-val">${p.avgSale>0?fmt$(p.avgSale):'—'}</span></div>
      <div class="growth-stat-row"><span class="growth-stat-label">Profit/1k listings (${_effLabel})</span><span class="growth-stat-val" style="color:var(--violet)">${p.profitPer1k>0?fmt$(p.profitPer1k):'—'}</span></div>
      <div class="growth-stat-row"><span class="growth-stat-label">Extra profit/mo (90d adds)</span><span class="growth-stat-val" style="color:var(--cyan)">${p.proj90mo>0?'+'+fmt$(p.proj90mo)+'/mo':p.proj90>0?'+'+fmt$(p.proj90)+'/mo':'—'}</span></div>
    </div>`;
  }).join('');

  // ════════════════════════════════════════════════════════
  // LISTING → PROFIT IMPACT (per store, rolling windows)
  // ════════════════════════════════════════════════════════
  const _snapshots = getMonthlyListingSnapshots();
  const _snapKeys  = Object.keys(_snapshots).sort();
  $('growth-corr-sub').textContent = `${dailyHistory.length} days of listing data · ${_snapKeys.length} monthly snapshot${_snapKeys.length!==1?'s':''} saved`;

  // For each store: listings added last 7d, last 14d, last 30d vs profit in same windows
  const corrCards = summary.map(s => {
    const p = pd[s.store];
    if (!p) return null;
    const recs = p.recs;
    const _now = new Date();

    const cut7  = new Date(_now); cut7.setDate(_now.getDate()-7);
    const cut14 = new Date(_now); cut14.setDate(_now.getDate()-14);
    const cut30 = new Date(_now); cut30.setDate(_now.getDate()-30);

    const list7  = dailyHistory.filter(d=>d.date>=cut7).reduce((s,d)=>s+(d.counts[s.store]||0),0);
    const list14 = dailyHistory.filter(d=>d.date>=cut14).reduce((s,d)=>s+(d.counts[s.store]||0),0);
    const list30 = dailyHistory.filter(d=>d.date>=cut30).reduce((s,d)=>s+(d.counts[s.store]||0),0);

    // Fix: use s.store not s inside reduce
    const _l7  = dailyHistory.filter(d=>(_now-d.date)/86400000<=7).reduce((sum,d)=>sum+(d.counts[s.store]||0),0);
    const _l14 = dailyHistory.filter(d=>(_now-d.date)/86400000<=14).reduce((sum,d)=>sum+(d.counts[s.store]||0),0);
    const _l30 = dailyHistory.filter(d=>(_now-d.date)/86400000<=30).reduce((sum,d)=>sum+(d.counts[s.store]||0),0);

    const _p7  = r2(recs.filter(r=>r.date&&new Date(r.date+'T00:00:00')>=cut7).reduce((s,r)=>s+r.profit,0));
    const _p14 = r2(recs.filter(r=>r.date&&new Date(r.date+'T00:00:00')>=cut14).reduce((s,r)=>s+r.profit,0));
    const _p30 = p.rolling30P;

    // Implied $/listing in each window (how much profit each listed item is generating now)
    const imp7  = _l7>0  && _p7>0  ? r2(_p7/_l7)   : null;
    const imp14 = _l14>0 && _p14>0 ? r2(_p14/_l14) : null;
    const imp30 = _l30>0 && _p30>0 ? r2(_p30/_l30) : null;

    // Trend: is implied $/listing improving or falling?
    const trend = (imp7!==null && imp30!==null) ? r2((imp7-imp30)/imp30*100) : null;
    const trendColor = trend===null?'var(--muted)':trend>=10?'var(--green)':trend>=-10?'var(--amber)':'var(--red)';
    const trendLabel = trend===null?'—':trend>=0?`↑${trend.toFixed(0)}% efficiency`:`↓${Math.abs(trend).toFixed(0)}% efficiency`;

    // Color the best implied rate
    const maxImp = Math.max(imp7||0, imp14||0, imp30||0);

    return { store:s.store, _l7, _l14, _l30, _p7, _p14, _p30, imp7, imp14, imp30, trend, trendColor, trendLabel, maxImp, p };
  }).filter(Boolean);

  $('growth-corr-section').innerHTML = `
    <div style="font-size:11px;color:var(--muted);margin-bottom:12px;padding:10px 14px;background:var(--glass);border-radius:8px;line-height:1.7">
      <strong style="color:var(--text2)">How to read this:</strong> Each window shows listings added vs profit earned in that same period.
      <strong style="color:var(--indigo)">$/listing</strong> = how much profit each listed item is generating right now.
      Trend compares your 7-day efficiency to your 30-day baseline — rising means your recent listings are paying off faster.
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px">
      ${corrCards.map(c => {
        const hasData = c._l7>0 || c._l14>0 || c._l30>0;
        const rows = [
          { label:'Last 7 days',  listings:c._l7,  profit:c._p7,  imp:c.imp7  },
          { label:'Last 14 days', listings:c._l14, profit:c._p14, imp:c.imp14 },
          { label:'Last 30 days', listings:c._l30, profit:c._p30, imp:c.imp30 },
        ];
        return `<div class="card" style="padding:16px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
            <div>
              <div style="font-weight:700;font-size:13px">${c.store}</div>
              <div style="font-size:10px;color:var(--muted)">${c.p.operator}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:11px;font-weight:700;color:${c.trendColor}">${c.trendLabel}</div>
              <div style="font-size:9px;color:var(--muted)">7d vs 30d efficiency</div>
            </div>
          </div>
          ${!hasData ? `<div style="font-size:11px;color:var(--muted);text-align:center;padding:12px 0">No listing history yet</div>` : `
          <div style="display:grid;grid-template-columns:auto 1fr 1fr 1fr;gap:4px;font-size:10px">
            <div style="color:var(--muted);padding:3px 0"></div>
            <div style="color:var(--muted);text-align:center;padding:3px 0;font-weight:600">Listed</div>
            <div style="color:var(--muted);text-align:center;padding:3px 0;font-weight:600">Profit</div>
            <div style="color:var(--muted);text-align:center;padding:3px 0;font-weight:600">$/listing</div>
            ${rows.map(row => `
              <div style="color:var(--muted);padding:4px 0;font-size:9px">${row.label}</div>
              <div style="text-align:center;padding:4px 0;font-weight:600">${row.listings||'—'}</div>
              <div style="text-align:center;padding:4px 0;font-weight:600;color:var(--green)">${row.profit>0?fmt$(row.profit):'—'}</div>
              <div style="text-align:center;padding:4px 0;font-weight:700;color:${row.imp!==null&&row.imp===c.maxImp?'var(--indigo)':'var(--text2)'}">${row.imp!==null?fmt$(row.imp):'—'}</div>
            `).join('')}
          </div>`}
        </div>`;
      }).join('')}
    </div>
    ${_snapKeys.length > 0 ? `
    <div class="card" style="padding:16px;margin-top:12px">
      <div style="font-size:12px;font-weight:700;margin-bottom:4px">📸 Monthly Listing Snapshots</div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:12px">End-of-month listing counts saved locally — will be used to measure listings → profit lag as months accumulate</div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead>
            <tr>
              <th style="text-align:left;padding:5px 8px;color:var(--muted);border-bottom:1px solid var(--card-border)">Store</th>
              ${_snapKeys.map(k=>`<th style="text-align:right;padding:5px 8px;color:var(--muted);border-bottom:1px solid var(--card-border)">${k}</th>`).join('')}
              <th style="text-align:right;padding:5px 8px;color:var(--indigo);border-bottom:1px solid var(--card-border)">Now</th>
            </tr>
          </thead>
          <tbody>
            ${summary.map(s => {
              // Cumulative additions since tracker began — excludes pre-existing inventory
              const nowCount = dailyHistory.reduce((sum, d) => sum + (d.counts[s.store] || 0), 0);
              return `<tr>
                <td style="padding:5px 8px;font-weight:600;border-bottom:1px solid rgba(255,255,255,.04)">${s.store}</td>
                ${_snapKeys.map(k => {
                  const v = _snapshots[k]?.[s.store];
                  return `<td style="text-align:right;padding:5px 8px;color:var(--text2);border-bottom:1px solid rgba(255,255,255,.04)">${v!=null?v.toLocaleString():'—'}</td>`;
                }).join('')}
                <td style="text-align:right;padding:5px 8px;font-weight:700;color:var(--indigo);border-bottom:1px solid rgba(255,255,255,.04)">${nowCount.toLocaleString()}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div style="font-size:10px;color:var(--muted);margin-top:8px;opacity:.7">Snapshots saved in your browser's localStorage · one per month · builds automatically</div>
    </div>` : ''}
  `;
}

// ─── SCALE CALCULATORS ────────────────────────────────────────────────────────
function updateScaleCalc() {
  const store    = $('calc-account-sel')?.value;
  const targetL  = parseInt($('calc-target-listings')?.value) || 5000;
  const dailyR   = parseInt($('calc-daily-rate')?.value) || 40;
  const res      = $('scale-calc-result');
  if (!res || !store || !_growthPersonData[store]) return;
  const p = _growthPersonData[store];
  const newListings    = Math.max(0, targetL - p.current);
  const daysNeeded     = dailyR > 0 ? Math.ceil(newListings / dailyR) : null;
  const useMonthly     = p.profitPerListMo > 0;
  const rate           = useMonthly ? p.profitPerListMo : p.profitPerList;
  const rateLabel      = useMonthly ? `${fmt$(p.profitPer1k > 0 ? p.profitPerListMo * 1000 : 0)}/1k/mo (${p.recentMoLabel})` : `${fmt$(p.profitPer1k)}/1k all-time`;
  const extraPerMo     = r2(newListings * rate);
  const totalPerMo     = r2(targetL * rate);
  const splitExtra = rate > 0 ? getSplit(p.dashName, extraPerMo) : null;
  const splitTotal = rate > 0 ? getSplit(p.dashName, totalPerMo) : null;
  res.innerHTML = rate > 0 ? `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div><div style="color:var(--muted);font-size:10px">Current listings</div><div style="font-weight:700;font-size:16px">${p.current.toLocaleString()}</div></div>
      <div><div style="color:var(--muted);font-size:10px">Target listings</div><div style="font-weight:700;font-size:16px">${targetL.toLocaleString()}</div></div>
      <div><div style="color:var(--muted);font-size:10px">Listings to add</div><div style="font-weight:700;font-size:16px">${newListings.toLocaleString()}</div></div>
      <div><div style="color:var(--muted);font-size:10px">Days at ${dailyR}/day</div><div style="font-weight:700;font-size:16px;color:var(--cyan)">${daysNeeded !== null ? '~'+daysNeeded : '—'}</div></div>
      <div><div style="color:var(--muted);font-size:10px">Extra profit/mo from new listings</div><div style="font-weight:700;font-size:16px;color:var(--green)">+${fmt$(extraPerMo)}<span style="font-size:10px;font-weight:400;color:var(--muted)">/mo</span></div></div>
      <div><div style="color:var(--muted);font-size:10px">Total monthly profit at target</div><div style="font-weight:700;font-size:16px;color:var(--violet)">${fmt$(totalPerMo)}<span style="font-size:10px;font-weight:400;color:var(--muted)">/mo</span></div></div>
    </div>
    <div style="margin-top:10px;padding:10px;background:rgba(16,185,129,.06);border-radius:8px">
      <div style="font-size:10px;color:var(--muted);margin-bottom:8px;font-weight:600">Split breakdown — extra from new listings</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:11px">
        ${splitExtra?.storeOwner>0?`<div><div style="color:var(--muted);font-size:9px">Client</div><div style="font-weight:800;color:var(--yellow)">+${fmt$(splitExtra.storeOwner)}/mo</div></div>`:''}
        <div><div style="color:var(--muted);font-size:9px">Danian</div><div style="font-weight:800;color:#818cf8">+${fmt$(splitExtra?.danian||0)}/mo</div></div>
        <div><div style="color:var(--muted);font-size:9px">J&R</div><div style="font-weight:800;color:var(--green)">+${fmt$(splitExtra?.jr||0)}/mo</div></div>
      </div>
      <div style="font-size:10px;color:var(--muted);margin-top:8px;margin-bottom:5px;font-weight:600">At target (${targetL.toLocaleString()} listings)</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:11px">
        ${splitTotal?.storeOwner>0?`<div><div style="color:var(--muted);font-size:9px">Client</div><div style="font-weight:800;color:var(--yellow)">${fmt$(splitTotal.storeOwner)}/mo</div></div>`:''}
        <div><div style="color:var(--muted);font-size:9px">Danian</div><div style="font-weight:800;color:#818cf8">${fmt$(splitTotal?.danian||0)}/mo</div></div>
        <div><div style="color:var(--muted);font-size:9px">J&R</div><div style="font-weight:800;color:var(--emerald)">${fmt$(splitTotal?.jr||0)}/mo</div></div>
      </div>
    </div>
    <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--card-border);font-size:11px;color:var(--muted)">
      Rate: ${rateLabel} · ${p.totalSales} historical sales · <em>all figures are monthly profit estimates</em>
    </div>` : `<div style="color:var(--muted)">No profit data yet for ${store} — load ops data first</div>`;
}

function updateProfitCalc() {
  const store   = $('calc-profit-account')?.value;
  const targetP = parseFloat($('calc-target-profit')?.value) || 1000;
  const dailyR  = parseInt($('calc-profit-daily')?.value) || 40;
  const res     = $('profit-calc-result');
  if (!res || !store || !_growthPersonData[store]) return;
  const p = _growthPersonData[store];
  if (p.profitPer1k <= 0) {
    res.innerHTML = `<div style="color:var(--muted)">No profit data yet for ${store} — load ops data first</div>`;
    return;
  }
  const useMonthlyP   = p.profitPerListMo > 0;
  const rateP         = useMonthlyP ? p.profitPerListMo : p.profitPerList;
  const rateLabelP    = useMonthlyP ? `${fmt$(p.profitPerListMo)}/listing/mo (${p.recentMoLabel})` : `${fmt$(p.profitPerList)}/listing all-time`;
  const listingsNeeded    = Math.ceil(targetP / rateP);
  const newListingsNeeded = Math.max(0, listingsNeeded - p.current);
  const daysToGet         = dailyR > 0 ? Math.ceil(newListingsNeeded / dailyR) : null;
  const currentMonthlyP   = r2(p.current * rateP);
  const gapProfit         = r2(targetP - currentMonthlyP);
  res.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div><div style="color:var(--muted);font-size:10px">Listings needed for ${fmt$(targetP)}/mo</div><div style="font-weight:700;font-size:16px">${listingsNeeded.toLocaleString()}</div></div>
      <div><div style="color:var(--muted);font-size:10px">You already have</div><div style="font-weight:700;font-size:16px">${p.current.toLocaleString()}</div></div>
      <div><div style="color:var(--muted);font-size:10px">Still need to add</div><div style="font-weight:700;font-size:16px;color:var(--amber)">${newListingsNeeded.toLocaleString()}</div></div>
      <div><div style="color:var(--muted);font-size:10px">Time at ${dailyR}/day</div><div style="font-weight:700;font-size:16px;color:var(--cyan)">${daysToGet!==null?'~'+daysToGet+'d':'—'}</div></div>
      <div><div style="color:var(--muted);font-size:10px">Your current monthly profit</div><div style="font-weight:700;font-size:16px;color:var(--green)">${fmt$(currentMonthlyP)}<span style="font-size:10px;font-weight:400;color:var(--muted)">/mo</span></div></div>
      <div><div style="color:var(--muted);font-size:10px">Monthly gap to close</div><div style="font-weight:700;font-size:16px;color:var(--violet)">${gapProfit>0?fmt$(gapProfit)+'/mo':'Already there 🎉'}</div></div>
    </div>
    <div style="margin-top:10px;padding:10px;background:rgba(16,185,129,.06);border-radius:8px">
      <div style="font-size:10px;color:var(--muted);margin-bottom:8px;font-weight:600">Split — current listings</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:11px;margin-bottom:10px">
        ${getSplit(p.dashName,currentMonthlyP).storeOwner>0?`<div><div style="color:var(--muted);font-size:9px">Client</div><div style="font-weight:800;color:var(--yellow)">${fmt$(getSplit(p.dashName,currentMonthlyP).storeOwner)}/mo</div></div>`:''}
        <div><div style="color:var(--muted);font-size:9px">Danian</div><div style="font-weight:800;color:#818cf8">${fmt$(getSplit(p.dashName,currentMonthlyP).danian)}/mo</div></div>
        <div><div style="color:var(--muted);font-size:9px">J&R</div><div style="font-weight:800;color:var(--green)">${fmt$(getSplit(p.dashName,currentMonthlyP).jr)}/mo</div></div>
      </div>
      <div style="font-size:10px;color:var(--muted);margin-bottom:8px;font-weight:600">Split — at ${fmt$(targetP)}/mo goal</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:11px">
        ${getSplit(p.dashName,targetP).storeOwner>0?`<div><div style="color:var(--muted);font-size:9px">Client</div><div style="font-weight:800;color:var(--yellow)">${fmt$(getSplit(p.dashName,targetP).storeOwner)}/mo</div></div>`:''}
        <div><div style="color:var(--muted);font-size:9px">Danian</div><div style="font-weight:800;color:#818cf8">${fmt$(getSplit(p.dashName,targetP).danian)}/mo</div></div>
        <div><div style="color:var(--muted);font-size:9px">J&R</div><div style="font-weight:800;color:var(--emerald)">${fmt$(getSplit(p.dashName,targetP).jr)}/mo</div></div>
      </div>
    </div>
    <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--card-border);font-size:11px;color:var(--muted)">
      Rate: ${rateLabelP} · <em>all figures are monthly profit estimates</em>
    </div>`;
}

// ─── DATA GUIDE ───────────────────────────────────────────────────────────────
function toggleGuide() {
  $('guide-section').classList.toggle('open');
}

// ─── PARTY MODE ───────────────────────────────────────────────────────────────
let partyInterval = null;
let partyHypeInterval = null;
let partyShakeInterval = null;
let partyCursorHandler = null;
const HYPE_MSGS = [
  ['SHEESH 🔥','success'],['WE EAT 💰','success'],['MONEY PRINTER GO BRRR 🖨️','success'],
  ['LETS GOOO 🚀','success'],['STACK SZN 💎','success'],['BIG BAG ALERT 🧳','success'],
  ['PROFIT GODS ARE PLEASED 🙏','success'],['WE ARE SO BACK 📈','success'],
  ['DROPSHIP DRIP 💧','success'],['NO CAP WE WINNING 🏆','success'],
  ['JOHNA AND RUSS EATING 🍽️','success'],['ANOTHER ONE 🎤','success'],
];
let _hypeIdx = 0;
function triggerShake() {
  document.body.classList.add('party-shake');
  setTimeout(()=>document.body.classList.remove('party-shake'), 400);
}
function startCursorTrail() {
  const emojis = ['💵','✨','🤑','💸','⭐','💰','🔥'];
  partyCursorHandler = (e) => {
    if (!document.body.classList.contains('party')) return;
    const s = document.createElement('div');
    s.className = 'cursor-spark';
    s.textContent = emojis[Math.floor(Math.random()*emojis.length)];
    s.style.cssText = `left:${e.clientX - 8}px;top:${e.clientY - 8}px;`;
    document.body.appendChild(s);
    setTimeout(()=>s.remove(), 700);
  };
  document.addEventListener('mousemove', partyCursorHandler);
}
function stopCursorTrail() {
  if (partyCursorHandler) { document.removeEventListener('mousemove', partyCursorHandler); partyCursorHandler = null; }
}
function openAudit() {
  const audit = window._loadAudit || [];
  if (!audit.length) { showToast('No audit data — hit Refresh first', 'info', '⚠️'); return; }

  // group by person
  const byPerson = {};
  audit.forEach(a => {
    if (!byPerson[a.person]) byPerson[a.person] = [];
    byPerson[a.person].push(a);
  });

  const grandRows   = audit.reduce((s,a)=>s+a.rows, 0);
  const grandProfit = audit.reduce((s,a)=>s+a.profit, 0);
  const errors      = audit.filter(a=>a.status==='error');
  const cached      = audit.filter(a=>a.status==='cached');
  const skipped     = audit.filter(a=>a.status==='skipped');

  let html = `
    <div style="margin-bottom:16px;padding:14px;background:rgba(99,102,241,.1);border:1px solid rgba(99,102,241,.3);border-radius:12px">
      <div style="display:flex;gap:32px;flex-wrap:wrap;margin-bottom:14px">
        <div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em">Total Rows Loaded</div>
             <div style="font-size:24px;font-weight:800;color:var(--cyan)">${grandRows.toLocaleString()}</div></div>
        <div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em">Total Profit Loaded</div>
             <div style="font-size:24px;font-weight:800;color:var(--green)">$${grandProfit.toFixed(2)}</div></div>
        <div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em">Truly Failed</div>
             <div style="font-size:24px;font-weight:800;color:${errors.length?'var(--rose)':'var(--green)'}">${errors.length}</div></div>
        <div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em">Served from Cache</div>
             <div style="font-size:24px;font-weight:800;color:${cached.length?'var(--amber)':'var(--muted)'}">${cached.length}</div></div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;border-top:1px solid rgba(99,102,241,.2);padding-top:12px">
        <button onclick="closeModal('audit-modal'); _tabDataCache={}; _expDataCache={}; loadAll(); showToast('Cache cleared — reloading all data fresh','success','🗑️')"
          style="background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.4);color:var(--rose);padding:7px 14px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">
          🗑️ Clear Cache &amp; Force Reload
        </button>
        <button onclick="closeModal('audit-modal'); loadAll(); showToast('Reloading (using valid cache)','info','↻')"
          style="background:rgba(99,102,241,.12);border:1px solid rgba(99,102,241,.3);color:var(--indigo);padding:7px 14px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">
          ↻ Reload (keep cache)
        </button>
      </div>
    </div>`;

  if (cached.length) {
    html += `<div style="margin-bottom:14px;padding:12px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.3);border-radius:10px">
      <div style="font-weight:700;color:var(--amber);margin-bottom:6px">⚡ Rate-limited — served from cache (data is still loaded, just not fresh this cycle):</div>
      ${cached.map(e=>`<div style="font-size:12px;color:var(--text2);padding:2px 0">${e.person} → <b>${e.tab}</b> · ${e.rows} rows cached</div>`).join('')}
    </div>`;
  }

  if (errors.length) {
    html += `<div style="margin-bottom:14px;padding:12px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:10px">
      <div style="font-weight:700;color:var(--rose);margin-bottom:8px">❌ Truly failed — no cache available (first-time load or new tab):</div>
      ${errors.map(e=>`<div style="font-size:13px;color:var(--text2);padding:4px 0">${e.person} → <b>${e.tab}</b> — ${e.err||'unknown error'}</div>`).join('')}
    </div>`;
  }

  html += `<table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr style="color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.06em">
      <th style="text-align:left;padding:6px 8px">Account</th>
      <th style="text-align:left;padding:6px 8px">Tab</th>
      <th style="text-align:right;padding:6px 8px">Rows</th>
      <th style="text-align:right;padding:6px 8px">Profit</th>
      <th style="text-align:center;padding:6px 8px">Status</th>
    </tr></thead><tbody>`;

  Object.entries(byPerson).sort((a,b)=>a[0].localeCompare(b[0])).forEach(([person, tabs]) => {
    const pRows   = tabs.reduce((s,t)=>s+t.rows,0);
    const pProfit = tabs.reduce((s,t)=>s+t.profit,0);
    html += `<tr style="background:rgba(255,255,255,.04)">
      <td style="padding:8px;font-weight:700;color:var(--text)" colspan="2">${person}</td>
      <td style="padding:8px;text-align:right;color:var(--cyan)">${pRows}</td>
      <td style="padding:8px;text-align:right;color:var(--green)">$${pProfit.toFixed(2)}</td>
      <td></td></tr>`;
    tabs.forEach(t => {
      const ok = t.status === 'ok';
      html += `<tr style="border-top:1px solid rgba(255,255,255,.04)">
        <td style="padding:5px 8px;color:var(--muted)"></td>
        <td style="padding:5px 8px;color:var(--text2)">${t.tab}</td>
        <td style="padding:5px 8px;text-align:right;color:var(--muted)">${t.rows}</td>
        <td style="padding:5px 8px;text-align:right;color:var(--muted)">$${t.profit.toFixed(2)}</td>
        <td style="padding:5px 8px;text-align:center">${t.status==='ok'?'✅':t.status==='cached'?'⚡':t.status==='skipped'?'⏭️':'❌'}</td></tr>`;
    });
  });

  html += `</tbody></table>
    <div style="margin-top:12px;font-size:11px;color:var(--muted);text-align:center">
      Compare these numbers to your Excel files to spot missing data
    </div>`;

  $('audit-content').innerHTML = html;
  $('audit-modal').classList.add('open');
}

// ─── CLIENT VIEW ───────────────────────────────────────────────────────────
let _clientDeepLinkOpened = false;
let _clientOnlyMode = false; // true when opened via #client= deep link — blocks exit

function getClientStoreNames() {
  return Object.values(SHEETS).filter(name => !OWNED_STORES.includes(name));
}

function clientSlug(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function clientNameFromSlug(slug) {
  const normalized = String(slug || '').toLowerCase().replace(/^#?client=/, '');
  return getClientStoreNames().find(name => clientSlug(name) === normalized) || null;
}

function getClientLink(name) {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#client=${clientSlug(name)}`;
}

function escAttr(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function copyClientUrl(url, ev) {
  if (ev) ev.stopPropagation();
  const done = () => showToast('Client link copied', 'success', '🔗');
  const legacyCopy = () => {
    const ta = document.createElement('textarea');
    ta.value = url;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.setAttribute('readonly', '');
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch(e) { ok = false; }
    ta.remove();
    if (ok) done();
    return ok;
  };
  if (legacyCopy()) return;
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(done).catch(() => window.prompt('Copy this client link:', url));
  else window.prompt('Copy this client link:', url);
}

function copyClientLink(name, ev) {
  copyClientUrl(getClientLink(name), ev);
}

function getClientSlugFromUrl() {
  const hash = (window.location.hash || '').replace(/^#/, '');
  if (hash.startsWith('client=')) return new URLSearchParams(hash).get('client');
  return new URLSearchParams(window.location.search).get('client');
}

function maybeOpenClientFromUrl() {
  if (_clientDeepLinkOpened || !RAW.length) return;
  const slug = getClientSlugFromUrl();
  if (!slug) return;
  const name = clientNameFromSlug(slug);
  if (!name) {
    showToast('Client link did not match a loaded account', 'error', '👤');
    return;
  }
  _clientDeepLinkOpened = true;
  _clientOnlyMode = true;
  renderClientView(name, { preserveUrl: true, clientOnly: true });
}

function openClientView() {
  // Build list of client-facing stores (partner stores + Jacob name-fee stores)
  const clientStores = getClientStoreNames();
  if (!clientStores.length) { showToast('No partner stores loaded yet', 'info', '👤'); return; }

  const listEl = $('client-select-list');
  const _cvChFilter = r => CHANNEL_FILTER === 'all' || (CHANNEL_FILTER === 'tiktok' ? r.channel === 'tiktok' : r.channel !== 'tiktok');
  const _cvEarnLabel = CHANNEL_FILTER === 'tiktok' ? 'TikTok earnings' : CHANNEL_FILTER === 'ebay' ? 'eBay earnings' : 'All-time earnings';
  listEl.innerHTML = clientStores.map(name => {
    const isJacob  = JACOB_STORES.includes(name);
    const pct      = isJacob ? '10%' : '50%';
    const recs     = RAW.filter(r => r.person === name && _cvChFilter(r));
    const profit   = r2(recs.reduce((s,r) => s + r.profit, 0));
    const myShare  = isJacob ? r2(profit * 0.10) : r2(profit * 0.50);
    const displayName = name === 'John Slop' ? 'Sloop' : name;
    const link = getClientLink(name);
    return `<div style="display:flex;flex-direction:column;gap:8px;padding:12px;background:var(--card);border:1px solid var(--card-border);border-radius:12px">
      <button onclick="closeModal('client-select-modal');renderClientView(${JSON.stringify(name)})"
        style="width:100%;text-align:left;padding:4px 2px;background:transparent;border:none;cursor:pointer">
        <div style="font-weight:700;font-size:14px;color:var(--text)">${displayName}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">Your share: ${pct} · ${_cvEarnLabel}: <span style="color:var(--green);font-weight:700">${fmt$(myShare)}</span></div>
      </button>
      <div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px">
        <input readonly value="${escAttr(link)}" onclick="this.select()"
          style="min-width:0;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.08);border-radius:8px;color:var(--muted);font-size:11px;padding:8px;outline:none">
        <button onclick="copyClientUrl(this.dataset.url, event)" data-url="${escAttr(link)}"
          title="Copy client portal link"
          style="background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.3);color:var(--green);border-radius:8px;cursor:pointer;font-size:12px;font-weight:800;padding:0 12px">Copy</button>
      </div>
    </div>`;
  }).join('');

  $('client-select-modal').classList.add('open');
}

function renderClientView(personName, opts = {}) {
  const isJacob   = JACOB_STORES.includes(personName);
  const ownerPct  = isJacob ? 0.10 : 0.50;
  const ownerPctLabel = isJacob ? '10%' : '50%';
  const displayName   = personName === 'John Slop' ? 'Sloop' : personName;
  const isTikTokMode  = CHANNEL_FILTER === 'tiktok';
  const isEbayMode    = CHANNEL_FILTER === 'ebay';
  const cvChFilter    = r => CHANNEL_FILTER === 'all' || (isTikTokMode ? r.channel === 'tiktok' : r.channel !== 'tiktok');

  const recs         = RAW.filter(r => r.person === personName && cvChFilter(r));
  const allTimeProfit = r2(recs.reduce((s,r) => s + r.profit, 0));
  const myAllTime     = r2(allTimeProfit * ownerPct);

  // Monthly breakdown (my share)
  const byMonth = {};
  recs.forEach(r => { if (r.month && monthIndex(r.month) < 900) byMonth[r.month] = r2((byMonth[r.month]||0) + r.profit); });
  const mKeys = Object.keys(byMonth).filter(m => monthIndex(m) < 900).sort((a,b) => monthIndex(a)-monthIndex(b));
  const latestMo     = mKeys[mKeys.length-1] || null;
  const latestProfit = latestMo ? byMonth[latestMo] : 0;
  const myLatest     = r2(latestProfit * ownerPct);
  const prevMo       = mKeys[mKeys.length-2] || null;
  const prevProfit   = prevMo ? byMonth[prevMo] : 0;
  const myPrev       = r2(prevProfit * ownerPct);
  const momPct       = myPrev > 0 ? r2((myLatest - myPrev) / myPrev * 100) : null;

  // Listing tracker data for this store
  const listingKey    = Object.entries(LISTING_NAME_MAP).find(([,v]) => v === personName)?.[0] || personName;
  const storeSum      = LISTING_DATA.summary?.find(s => s.store === listingKey);
  const current       = storeSum?.current || 0;
  const target        = storeSum?.target  || 5000;
  const dailyGoal     = storeSum?.dailyGoal || 40;
  const pct           = Math.min(100, Math.round(current / target * 100));
  const pctColor      = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--cyan)' : 'var(--indigo)';

  // Today's listing count
  const pd = _growthPersonData?.[listingKey];
  const todayN = pd?.todayN ?? null;

  // Projected monthly earnings using rolling 30d rate
  const profitPerListMo = pd?.profitPerListMo || 0;
  const myProjAtTarget  = profitPerListMo > 0 ? r2(target * profitPerListMo * ownerPct) : null;
  const myProjNow       = profitPerListMo > 0 ? r2(current * profitPerListMo * ownerPct) : null;
  const rateLabel       = pd?.recentMoLabel || 'last 30d';

  const MN = {'Jan':'January','Feb':'February','Mar':'March','Apr':'April','May':'May','Jun':'June','Jul':'July','Aug':'August','Sep':'September','Oct':'October','Nov':'November','Dec':'December'};
  const latestLabel = latestMo ? (MN[latestMo.split(' ')[0]] || latestMo.split(' ')[0]) + ' ' + latestMo.split(' ')[1] : null;
  const latestRows = latestMo ? recs.filter(r => r.month === latestMo) : [];
  const prevRows   = prevMo ? recs.filter(r => r.month === prevMo) : [];
  const latestRev  = r2(latestRows.reduce((s,r) => s + r.price, 0));
  const prevRev    = r2(prevRows.reduce((s,r) => s + r.price, 0));
  const latestSales = latestRows.length;
  const prevSales   = prevRows.length;
  const latestMargin = latestRev > 0 ? r2(latestProfit / latestRev * 100) : 0;
  const avgSale = latestSales ? r2(latestRev / latestSales) : 0;
  const myDailyAvg = latestRows.length
    ? r2(myLatest / Math.max(1, new Set(latestRows.map(r => r.date).filter(Boolean)).size))
    : 0;
  const validDates = recs.map(r => r.date).filter(Boolean).sort();
  const lastDataDate = validDates[validDates.length - 1] || null;
  const lastDataLabel = lastDataDate ? new Date(lastDataDate + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'No dated sales yet';
  const revPct = prevRev > 0 ? r2((latestRev - prevRev) / prevRev * 100) : null;
  const salesPct = prevSales > 0 ? r2((latestSales - prevSales) / prevSales * 100) : null;
  const remainingListings = Math.max(0, target - current);
  const nextMilestone = current < 1000 ? 1000 : current < 2500 ? 2500 : current < 5000 ? 5000 : target * 2;
  const nextMilestoneLeft = Math.max(0, nextMilestone - current);
  const bestMonth = mKeys.map(m => ({ month: m, share: r2(byMonth[m] * ownerPct) })).sort((a,b) => b.share - a.share)[0] || null;
  const clientStatus = momPct === null
    ? 'Building baseline'
    : momPct >= 25 ? 'Strong momentum'
    : momPct >= 0 ? 'Trending up'
    : 'Building momentum';
  const clientStatusColor = momPct === null
    ? 'var(--cyan)'
    : momPct >= 0 ? 'var(--green)' : 'var(--cyan)';
  const focusItems = [
    momPct !== null && momPct >= 25
      ? `Momentum is strong: ${latestLabel || 'this month'} earnings are up ${Math.abs(momPct).toFixed(0)}% from ${prevMo}.`
      : momPct !== null && momPct >= 0
        ? `${latestLabel || 'This month'} is trending higher than ${prevMo}, with your share continuing to grow.`
        : `This store is still early in the month, with ${myAllTime > 0 ? fmt$(myAllTime) : 'earnings'} already built all-time.`,
    !isTikTokMode && remainingListings > 0
      ? `The store is at ${current.toLocaleString()} active listings, with a clear path toward the ${target.toLocaleString()} listing goal.`
      : `The listing goal is in great shape, which gives the store more room to compound earnings.`,
    latestMargin > 0
      ? `${latestLabel || 'The latest month'} has produced ${fmt$(latestRev)} in store revenue at a ${latestMargin.toFixed(1)}% margin.`
      : `Revenue and margin highlights will fill in as the newest month develops.`,
    bestMonth
      ? `Best month so far: ${bestMonth.month} at ${fmt$(bestMonth.share)} for your share.`
      : `The store is building its first performance baseline.`
  ];
  const kpiDelta = val => val === null ? '' : `<span style="font-size:11px;font-weight:800;color:${val>=0?'var(--green)':'var(--rose)'}">${val>=0?'↑':'↓'} ${Math.abs(val).toFixed(0)}%</span>`;

  // Scale calculator max
  const calcMax = Math.max(target * 2, current * 3, 10000);

  // Store globals for the interactive slider
  window._csOwnerPct = ownerPct;
  window._csProfitPerListMo = profitPerListMo;

  // Pre-compute channel-dependent labels and sections
  const cvHeaderIcon    = isTikTokMode ? '⟡' : '📦';
  const cvHeaderBg      = isTikTokMode ? 'linear-gradient(135deg,#ff2d55,#ff6b9d)' : 'linear-gradient(135deg,var(--green),var(--emerald))';
  const cvAllTimeLabel  = isTikTokMode ? 'TikTok Earnings' : isEbayMode ? 'eBay Earnings' : 'All-Time Earnings';
  const cvAllTimeSub    = isTikTokMode ? 'your TikTok total' : isEbayMode ? 'your eBay total' : 'your total since day one';
  const cvFeePlatform   = isTikTokMode ? 'TikTok fees' : 'eBay fees';

  // Listing sections are eBay-only — hide in TikTok mode
  const cvListingsHtml = isTikTokMode ? '' : `
        <!-- Listings Progress -->
        <div class="card" style="padding:20px">
          <div style="font-size:13px;font-weight:700;margin-bottom:16px">📦 Your Store Listings</div>
          <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:8px">
            <div>
              <div style="font-size:32px;font-weight:900;color:${pctColor}">${current.toLocaleString()}</div>
              <div style="font-size:11px;color:var(--muted)">active listings</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:20px;font-weight:700;color:var(--muted)">${target.toLocaleString()}</div>
              <div style="font-size:11px;color:var(--muted)">target</div>
            </div>
          </div>
          <div style="background:rgba(255,255,255,.08);border-radius:6px;height:10px;overflow:hidden;margin-bottom:8px">
            <div style="height:100%;border-radius:6px;background:linear-gradient(90deg,${pctColor},var(--emerald));width:${pct}%;transition:width 1s"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted)">
            <span>${pct}% to target</span>
            <span>${(target-current).toLocaleString()} listings to go</span>
          </div>
        </div>

        <!-- Goal Snapshot -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div class="card" style="padding:18px;text-align:center">
            <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Progress Unlocked</div>
            <div style="font-size:40px;font-weight:900;color:${pctColor}">${pct}%</div>
            <div style="font-size:11px;color:var(--muted);margin-top:4px">${current.toLocaleString()} of ${target.toLocaleString()} listings</div>
          </div>
          <div class="card" style="padding:18px;text-align:center">
            <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">At Target (${target.toLocaleString()} listings)</div>
            <div style="font-size:${myProjAtTarget?'28':'40'}px;font-weight:900;color:var(--emerald)">${myProjAtTarget ? fmt$(myProjAtTarget)+'/mo' : '—'}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:4px">your projected monthly earnings</div>
          </div>
        </div>`;

  const overlay = $('client-view-overlay');
  overlay.style.display = 'block';
  if (!opts.preserveUrl && window.history?.replaceState) {
    window.history.replaceState(null, '', `#client=${clientSlug(personName)}`);
  }

  $('client-view-content').innerHTML = `
    <div style="min-height:100vh;background:var(--bg);padding:0 0 60px">
      <!-- Header -->
      <div style="background:rgba(10,15,28,.92);backdrop-filter:blur(18px);border-bottom:1px solid var(--card-border);padding:14px 24px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;position:sticky;top:0;z-index:10">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:36px;height:36px;border-radius:10px;background:${cvHeaderBg};display:flex;align-items:center;justify-content:center;font-size:18px">${cvHeaderIcon}</div>
          <div>
            <div style="font-size:10px;color:var(--muted);font-weight:800;text-transform:uppercase;letter-spacing:.12em">Seller OS Client Portal</div>
            <div style="font-weight:900;font-size:17px">${displayName}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <button onclick="copyClientLink(${JSON.stringify(personName)}, event)" style="background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.3);color:var(--green);padding:8px 12px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700">🔗 Copy Link</button>
          ${opts && opts.clientOnly ? '' : '<button onclick="closeClientView()" style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:var(--rose);padding:8px 16px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700">✕ Exit</button>'}
        </div>
      </div>

      <!-- Expense Warning Banner -->
      <div style="background:rgba(251,191,36,.12);border-bottom:1px solid rgba(251,191,36,.3);padding:10px 24px;display:flex;align-items:center;gap:10px">
        <span style="font-size:16px">⚠️</span>
        <div style="font-size:12px;color:var(--amber);font-weight:600">Earnings shown are <u>before</u> shared expense deductions — VPS, AutoDS & Proxy costs are split evenly across all stores and will reduce your final payout.</div>
      </div>

      <div style="max-width:1040px;margin:0 auto;padding:24px 16px;display:flex;flex-direction:column;gap:20px">

        <!-- Client Hero -->
        <div class="card" style="overflow:hidden;border:1px solid rgba(16,185,129,.22);background:linear-gradient(135deg,rgba(16,185,129,.16),rgba(6,182,212,.08) 42%,rgba(139,92,246,.10))">
          <div style="padding:24px;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px;align-items:stretch">
            <div>
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px">
                <span style="font-size:11px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:var(--green);background:rgba(16,185,129,.12);border:1px solid rgba(16,185,129,.28);padding:5px 9px;border-radius:999px">${clientStatus}</span>
                <span style="font-size:11px;font-weight:800;color:var(--muted);background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);padding:5px 9px;border-radius:999px">${ownerPctLabel} profit share</span>
                <span style="font-size:11px;font-weight:800;color:var(--muted);background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);padding:5px 9px;border-radius:999px">Updated through ${lastDataLabel}</span>
              </div>
              <div style="font-size:13px;color:var(--muted);font-weight:700;margin-bottom:4px">Your current month take-home</div>
              <div style="font-size:clamp(42px,7vw,76px);line-height:.95;font-weight:1000;color:var(--green);letter-spacing:0">${myLatest > 0 ? fmt$(myLatest) : '—'}</div>
              <div style="margin-top:12px;font-size:15px;color:var(--text2);max-width:620px">
                ${latestLabel || 'This month'} is at <b style="color:var(--text)">${fmt$(latestProfit)}</b> store profit, which makes your share <b style="color:var(--green)">${myLatest > 0 ? fmt$(myLatest) : '—'}</b>${momPct !== null ? `, ${momPct >= 0 ? 'up' : 'down'} <b style="color:${momPct>=0?'var(--green)':'var(--rose)'}">${Math.abs(momPct).toFixed(0)}%</b> from ${prevMo}` : ''}.
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:10px">
              <div style="background:rgba(0,0,0,.16);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:14px">
                <div style="font-size:10px;color:var(--muted);font-weight:900;text-transform:uppercase;letter-spacing:.1em;margin-bottom:5px">Next Milestone</div>
                <div style="font-size:24px;font-weight:1000;color:var(--cyan)">${nextMilestone.toLocaleString()} listings</div>
                <div style="font-size:12px;color:var(--muted);margin-top:2px">${nextMilestoneLeft ? `${nextMilestoneLeft.toLocaleString()} listings away` : 'milestone reached'}</div>
              </div>
              <div style="background:rgba(0,0,0,.16);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:14px">
                <div style="font-size:10px;color:var(--muted);font-weight:900;text-transform:uppercase;letter-spacing:.1em;margin-bottom:5px">Best Month</div>
                <div style="font-size:24px;font-weight:1000;color:var(--violet)">${bestMonth ? fmt$(bestMonth.share) : '—'}</div>
                <div style="font-size:12px;color:var(--muted);margin-top:2px">${bestMonth ? bestMonth.month : 'No history yet'}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Earnings Hero -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:16px">
          <div class="card" style="padding:20px;background:linear-gradient(135deg,rgba(16,185,129,.15),rgba(52,211,153,.08));border:1px solid rgba(16,185,129,.25)">
            <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">${latestLabel || 'This Month'} Earnings</div>
            <div style="font-size:36px;font-weight:900;color:var(--green)">${myLatest > 0 ? fmt$(myLatest) : '—'}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:4px">your ${ownerPctLabel} of ${latestMo} store profit</div>
            ${momPct !== null ? `<div style="margin-top:8px;display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;background:${momPct>=0?'rgba(16,185,129,.15)':'rgba(239,68,68,.1)'};color:${momPct>=0?'var(--green)':'var(--rose)'}">
              ${momPct>=0?'↑':'↓'} ${Math.abs(momPct).toFixed(0)}% vs ${prevMo}
            </div>` : ''}
          </div>
          <div class="card" style="padding:20px">
            <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">${cvAllTimeLabel}</div>
            <div style="font-size:36px;font-weight:900;color:var(--cyan)">${myAllTime > 0 ? fmt$(myAllTime) : '—'}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:4px">${cvAllTimeSub}</div>
          </div>
          <div class="card" style="padding:20px">
            <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Sales This Month</div>
            <div style="font-size:36px;font-weight:900;color:var(--amber)">${latestSales.toLocaleString()}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:4px;display:flex;justify-content:space-between;gap:8px"><span>${fmt$(avgSale)} avg sale</span>${kpiDelta(salesPct)}</div>
          </div>
          <div class="card" style="padding:20px">
            <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Store Revenue</div>
            <div style="font-size:36px;font-weight:900;color:var(--indigo)">${latestRev > 0 ? fmt$(latestRev) : '—'}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:4px;display:flex;justify-content:space-between;gap:8px"><span>${latestMargin.toFixed(1)}% margin</span>${kpiDelta(revPct)}</div>
          </div>
          ${myProjNow !== null ? `<div class="card" style="padding:20px;background:linear-gradient(135deg,rgba(139,92,246,.1),rgba(99,102,241,.06));border:1px solid rgba(139,92,246,.2)">
            <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Projected Monthly</div>
            <div style="font-size:36px;font-weight:900;color:var(--violet)">${fmt$(myProjNow)}<span style="font-size:14px;font-weight:400">/mo</span></div>
            <div style="font-size:11px;color:var(--muted);margin-top:4px">at current ${current.toLocaleString()} listings · ${latestMo || 'recent'} rate</div>
          </div>` : ''}
        </div>

        <!-- Store Highlights -->
        <div class="card" style="padding:20px;border:1px solid rgba(6,182,212,.18);background:linear-gradient(135deg,rgba(6,182,212,.08),rgba(255,255,255,.03))">
          <div style="display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:14px">
            <div>
              <div style="font-size:13px;font-weight:900">Store Highlights</div>
              <div style="font-size:11px;color:var(--muted);margin-top:3px">simple wins from the latest store data</div>
            </div>
            <div style="font-size:12px;font-weight:900;color:${clientStatusColor};white-space:nowrap">${clientStatus}</div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px">
            ${focusItems.map(item => `<div style="padding:12px 13px;background:rgba(0,0,0,.14);border:1px solid rgba(255,255,255,.07);border-radius:8px;font-size:12px;line-height:1.45;color:var(--text2)">${item}</div>`).join('')}
          </div>
        </div>

        ${cvListingsHtml}

        <!-- Monthly Breakdown -->
        ${mKeys.length > 0 ? `<div class="card" style="padding:20px">
          <div style="font-size:13px;font-weight:700;margin-bottom:14px">📅 Monthly Earnings History</div>
          ${mKeys.slice().reverse().map(m => {
            const myShare = r2(byMonth[m] * ownerPct);
            const barPct  = myAllTime > 0 ? Math.round(myShare/myAllTime*100) : 0;
            const isLatest = m === latestMo;
            return `<div style="margin-bottom:12px">
              <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
                <span style="color:var(--muted)">${m}${isLatest?' <span style="color:var(--amber);font-size:10px">(in progress)</span>':''}</span>
                <span style="font-weight:700;color:var(--green)">${fmt$(myShare)}</span>
              </div>
              <div style="background:rgba(255,255,255,.06);border-radius:3px;height:5px;overflow:hidden">
                <div style="height:100%;border-radius:3px;background:var(--green);width:${barPct}%"></div>
              </div>
            </div>`;
          }).join('')}
        </div>` : ''}

        <!-- Scale Calculator -->
        ${profitPerListMo > 0 ? `<div class="card" style="padding:20px">
          <div style="font-size:13px;font-weight:700;margin-bottom:4px">🔢 Scale Calculator</div>
          <div style="font-size:11px;color:var(--muted);margin-bottom:16px">Drag to see your projected take-home at any listing count</div>
          <input type="range" id="scale-slider" min="${Math.max(1,current)}" max="${calcMax}" value="${current}" step="50"
            oninput="clientScaleCalc(this.value)"
            style="width:100%;accent-color:var(--violet);cursor:pointer;margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-size:11px;color:var(--muted);margin-bottom:2px">Listings</div>
              <div id="csc-count" style="font-size:16px;font-weight:800;color:var(--cyan)">${current.toLocaleString()} listings</div>
            </div>
            <div style="font-size:28px;color:var(--muted)">→</div>
            <div style="text-align:right">
              <div style="font-size:11px;color:var(--muted);margin-bottom:2px">Your monthly take-home</div>
              <div id="csc-result" style="font-size:28px;font-weight:900;color:var(--violet)">${myProjNow ? fmt$(myProjNow)+'/mo' : '—'}</div>
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-top:10px">
            <span>Current: ${current.toLocaleString()}</span>
            <span>Target: ${target.toLocaleString()}</span>
            <span>2× Target: ${(target*2).toLocaleString()}</span>
          </div>
        </div>` : ''}

        <!-- Payout Context -->
        <div class="card" style="padding:20px">
          <div style="font-size:13px;font-weight:900;margin-bottom:4px">Payout Context</div>
          <div style="font-size:11px;color:var(--muted);margin-bottom:14px">a quick breakdown of what the current month means before shared expenses</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px">
            <div style="padding:13px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:8px">
              <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Store Profit</div>
              <div style="font-size:22px;font-weight:900;color:var(--text)">${latestProfit > 0 ? fmt$(latestProfit) : '—'}</div>
            </div>
            <div style="padding:13px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:8px">
              <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Your Share</div>
              <div style="font-size:22px;font-weight:900;color:var(--green)">${myLatest > 0 ? fmt$(myLatest) : '—'}</div>
            </div>
            <div style="padding:13px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:8px">
              <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Daily Average</div>
              <div style="font-size:22px;font-weight:900;color:var(--cyan)">${myDailyAvg > 0 ? fmt$(myDailyAvg) : '—'}</div>
            </div>
            <div style="padding:13px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:8px">
              <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">After Expenses</div>
              <div style="font-size:22px;font-weight:900;color:var(--amber)">Pending</div>
            </div>
          </div>
        </div>

        <div style="text-align:center;font-size:11px;color:var(--muted);padding-top:8px">
          Data updates whenever the dashboard refreshes · your ${ownerPctLabel} share is calculated from store profit after ${cvFeePlatform}
        </div>
      </div>
    </div>`;
}

function closeClientView() {
  if (_clientOnlyMode) return;
  $('client-view-overlay').style.display = 'none';
  if ((window.location.hash || '').replace(/^#/, '').startsWith('client=') && window.history?.replaceState) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }
}

function clientScaleCalc(n) {
  n = parseInt(n, 10);
  const proj = r2(n * (window._csProfitPerListMo || 0) * (window._csOwnerPct || 0.5));
  const el = $('csc-result');
  if (el) el.textContent = proj > 0 ? fmt$(proj) + '/mo' : '—';
  const cnt = $('csc-count');
  if (cnt) cnt.textContent = n.toLocaleString() + ' listings';
}

const SECTION_RENAMES = {
  'PROFIT DISTRIBUTION':'WHO EATING 🍽️','STORE HEALTH':'STORE VIBES ✨',
  'MONTHLY GOAL TRACKER':'MONEY GOALS 💰','OPERATIONAL EXPENSES':'THE BILLS 😤',
  'INSIGHTS & SUGGESTIONS':'THE TEA ☕','HEAD-TO-HEAD':'WHO WINNING 👑',
  'DATA LOAD AUDIT':'RECEIPTS 🧾',
};
const NICKNAMES = {
  'Austin':'Big Austin 💪','Armando':'Mando 🤙','Russell':'Russ Money 💰',
  'Johna':'Johna Bucks 💸','Jacob':'Jake 🎯','John Slop':'Slop Dogg 🐕',
  'Jack R':'Jumpin Jack 🎸','Dolo LLC':'Dolo Empire 🏢','Mariel':'Mari 🌺',
  'Johna & Russ':'J&R 🤑','Danian':'Dan the Man 😎',
};
let partyClickHandler = null;
let partyEmojiInterval = null;
let _emojiSwapActive = false;

function applyPartyText() {
  // rename section titles
  document.querySelectorAll('.section-title').forEach(el => {
    const orig = el.dataset.origText || el.textContent.trim();
    el.dataset.origText = orig;
    const renamed = Object.entries(SECTION_RENAMES).find(([k]) => orig.toUpperCase().includes(k));
    if (renamed) el.textContent = renamed[1];
  });
  // rename logo sub
  const sub = document.querySelector('.logo-sub');
  if (sub && !sub.dataset.orig) { sub.dataset.orig = sub.textContent; sub.textContent = 'WE GETTING RICH DASHBOARD 🤑'; }
  // nicknames — find text nodes in profit split rows
  document.querySelectorAll('.split-row-name, .split-person, td').forEach(el => {
    if (el.children.length) return;
    const t = el.textContent.trim();
    if (NICKNAMES[t] && !el.dataset.origName) { el.dataset.origName = t; el.textContent = NICKNAMES[t]; }
  });
  // disco ball size based on profit
  const ball = $('disco-ball');
  if (ball && window._ALLTIME_PROFIT) {
    const sz = Math.min(120, 52 + Math.floor(window._ALLTIME_PROFIT / 200));
    ball.style.fontSize = sz + 'px';
  }
}

function revertPartyText() {
  document.querySelectorAll('.section-title').forEach(el => {
    if (el.dataset.origText) { el.textContent = el.dataset.origText; delete el.dataset.origText; }
  });
  const sub = document.querySelector('.logo-sub');
  if (sub && sub.dataset.orig) { sub.textContent = sub.dataset.orig; delete sub.dataset.orig; }
  document.querySelectorAll('[data-orig-name]').forEach(el => {
    el.textContent = el.dataset.origName; delete el.dataset.origName;
  });
  const ball = $('disco-ball');
  if (ball) ball.style.fontSize = '52px';
}

function emojiStackSwap() {
  if (_emojiSwapActive) return;
  _emojiSwapActive = true;
  const vals = [...document.querySelectorAll('.kpi-val, .alltime-val')].filter(el => el.textContent.includes('$') || el.textContent.includes('k'));
  const targets = vals.slice(0, 4);
  const originals = targets.map(el => el.textContent);
  targets.forEach(el => {
    const num = parseFloat(el.textContent.replace(/[$k,]/g,'')) * (el.textContent.includes('k') ? 1000 : 1);
    const count = Math.max(1, Math.min(10, Math.round(num / 500)));
    el.textContent = '💵'.repeat(count);
  });
  setTimeout(() => {
    targets.forEach((el, i) => el.textContent = originals[i]);
    _emojiSwapActive = false;
  }, 1800);
}

// ── Theme Switcher ──────────────────────────────────────────────────────────
const THEMES = ['dark','light','pastel'];
const THEME_ICONS = { dark:'🌙', light:'☀️', pastel:'🎨' };
const THEME_LABELS = { dark:'Dark', light:'Light', pastel:'Pastel' };

function cycleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
  applyTheme(next);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('ebay-dash-theme', theme);
  const btn = $('theme-btn');
  if (btn) btn.textContent = THEME_ICONS[theme] + ' ' + THEME_LABELS[theme];
  // Update orb visibility for light/pastel
  document.querySelectorAll('.orb').forEach(o => {
    o.style.opacity = theme === 'dark' ? '' : (theme === 'pastel' ? '.08' : '.04');
  });
}

(function initTheme() {
  const saved = localStorage.getItem('ebay-dash-theme') || 'dark';
  applyTheme(saved);
})();

function toggleParty() {
  const on = document.body.classList.toggle('party');
  const btn  = $('party-btn');
  const ball = $('disco-ball');
  if (on) {
    btn.textContent = '🪩 Party On!';
    btn.classList.add('btn-party-on');
    ball.style.display = 'block';
    // Stupid title + refresh button
    document.querySelector('.logo-text') && (document.querySelector('.logo-text').textContent = '💰 MONEY MODE 💰');
    const ri = $('ri'); if (ri) ri.parentElement.innerHTML = '🖨️ PRINTING MONEY';
    applyPartyText();
    launchConfetti();
    partyInterval      = setInterval(launchConfetti, 2200);
    partyShakeInterval = setInterval(triggerShake, 5500);
    partyEmojiInterval = setInterval(emojiStackSwap, 6000);
    _hypeIdx = 0;
    partyHypeInterval  = setInterval(()=>{
      const [msg, type] = HYPE_MSGS[_hypeIdx % HYPE_MSGS.length];
      showToast(msg, type, '🤑');
      _hypeIdx++;
    }, 4000);
    startCursorTrail();
    // Click boom handler
    partyClickHandler = (e) => {
      const boom = ['💵','💸','🤑','💰','✨','🔥','💎'];
      const el = document.createElement('div');
      el.className = 'click-boom';
      el.textContent = boom[Math.floor(Math.random()*boom.length)];
      el.style.cssText = `left:${e.clientX-14}px;top:${e.clientY-14}px;`;
      document.body.appendChild(el);
      setTimeout(()=>el.remove(), 600);
    };
    document.addEventListener('click', partyClickHandler);
    showToast('🪩 Party mode activated!', 'success', '🎉');
    // Six Flags / Vengaboys — hidden YouTube iframe
    let yt = document.getElementById('party-yt');
    if (!yt) {
      yt = document.createElement('iframe');
      yt.id = 'party-yt';
      yt.allow = 'autoplay';
      yt.style.cssText = 'position:fixed;width:0;height:0;opacity:0;pointer-events:none';
      document.body.appendChild(yt);
    }
    yt.src = 'https://www.youtube.com/embed/6Zbi0XmGtMw?autoplay=1&loop=1&playlist=6Zbi0XmGtMw&start=0';
  } else {
    btn.textContent = '🎉 Party';
    btn.classList.remove('btn-party-on');
    ball.style.display = 'none';
    document.querySelector('.logo-text') && (document.querySelector('.logo-text').textContent = 'Selling Dashboard');
    const refreshBtn = document.querySelector('.btn-primary');
    if (refreshBtn) refreshBtn.innerHTML = '<span id="ri">↻</span> Refresh';
    revertPartyText();
    clearInterval(partyInterval);      partyInterval = null;
    clearInterval(partyHypeInterval);  partyHypeInterval = null;
    clearInterval(partyShakeInterval); partyShakeInterval = null;
    clearInterval(partyEmojiInterval); partyEmojiInterval = null;
    stopCursorTrail();
    if (partyClickHandler) { document.removeEventListener('click', partyClickHandler); partyClickHandler = null; }
    const yt = document.getElementById('party-yt');
    if (yt) yt.src = '';
    showToast('Party mode off 😢', 'info', '🌙');
  }
}

// ─── DESTRUCTION MODE ─────────────────────────────────────────────────────────
let _dm = false, _dmCanvas, _dmCtx, _dmRaf, _dmShip, _dmBullets=[], _dmParticles=[], _dmKeys={}, _dmCardHP=new Map(), _dmScore=0, _dmKilled=0, _dmPlayerHP=3, _dmBossBullets=[], _dmBossShootTimer=0, _dmInvincible=0;
const _DM_SHIP=14, _DM_BSPD=9, _DM_FRIC=0.97, _DM_ROT=0.055, _DM_THRUST=0.18, _DM_COOLDOWN=10;

// ── Web Audio sound engine ──
function _dmAC() { if(!window.__dmAC) window.__dmAC=new AudioContext(); return window.__dmAC; }
function _dmPlayLaser() {
  try {
    const ac=_dmAC(), o=ac.createOscillator(), g=ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.type='square';
    o.frequency.setValueAtTime(900,ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(120,ac.currentTime+0.09);
    g.gain.setValueAtTime(0.18,ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,ac.currentTime+0.09);
    o.start(ac.currentTime); o.stop(ac.currentTime+0.09);
  } catch(e){}
}
function _dmPlayHit(boss=false) {
  try {
    const ac=_dmAC(), len=boss?0.25:0.12;
    const buf=ac.createBuffer(1,Math.floor(ac.sampleRate*len),ac.sampleRate);
    const d=buf.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,boss?1:2);
    const src=ac.createBufferSource(); src.buffer=buf;
    const f=ac.createBiquadFilter(); f.type='lowpass'; f.frequency.value=boss?200:600;
    const g=ac.createGain(); g.gain.setValueAtTime(boss?0.7:0.35,ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,ac.currentTime+len);
    src.connect(f); f.connect(g); g.connect(ac.destination); src.start();
  } catch(e){}
}
function _dmPlayExplosion() {
  try {
    const ac=_dmAC(), len=0.6;
    const buf=ac.createBuffer(1,Math.floor(ac.sampleRate*len),ac.sampleRate);
    const d=buf.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,1.2);
    const src=ac.createBufferSource(); src.buffer=buf;
    const f=ac.createBiquadFilter(); f.type='lowpass';
    f.frequency.setValueAtTime(500,ac.currentTime);
    f.frequency.exponentialRampToValueAtTime(40,ac.currentTime+len);
    const g=ac.createGain(); g.gain.setValueAtTime(1.1,ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,ac.currentTime+len);
    src.connect(f); f.connect(g); g.connect(ac.destination); src.start();
  } catch(e){}
}
function _dmPlayFanfare() {
  try {
    const ac=_dmAC();
    const notes=[523,659,784,1047,1319];
    notes.forEach((freq,i)=>{
      const o=ac.createOscillator(), g=ac.createGain();
      o.connect(g); g.connect(ac.destination);
      o.type='triangle'; o.frequency.value=freq;
      const t=ac.currentTime+i*0.13;
      g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(0.4,t+0.05);
      g.gain.exponentialRampToValueAtTime(0.001,t+0.3);
      o.start(t); o.stop(t+0.3);
    });
  } catch(e){}
}

function toggleDestroy() {
  if (_dm) _exitDM(); else _startDM();
}

function _startDM() {
  _dm=true; _dmScore=0; _dmKilled=0; _dmBullets=[]; _dmParticles=[]; _dmCardHP=new Map(); _dmBossBullets=[]; _dmBossShootTimer=80; _dmPlayerHP=3; _dmInvincible=0;
  // canvas
  _dmCanvas=document.createElement('canvas');
  _dmCanvas.id='dm-canvas';
  _dmCanvas.style.cssText='position:fixed;top:0;left:0;z-index:10000;pointer-events:none;';
  _dmCanvas.width=window.innerWidth; _dmCanvas.height=window.innerHeight;
  document.body.appendChild(_dmCanvas);
  _dmCtx=_dmCanvas.getContext('2d');
  // score HUD
  const hud=document.createElement('div'); hud.id='dm-hud';
  hud.style.cssText='position:fixed;top:70px;left:20px;z-index:10001;background:rgba(0,0,0,.85);border:1px solid #ef4444;border-radius:10px;padding:10px 16px;color:#ef4444;font-family:monospace;font-weight:700;font-size:13px;line-height:1.6;pointer-events:none;';
  hud.innerHTML='💥 DESTRUCTION MODE<br>KILLED: 0 cards<br>DESTROYED: $0';
  document.body.appendChild(hud);
  // instructions toast
  showToast('🚀 ARROWS to fly · SPACE to shoot · ESC to exit', 'error', '💥');
  // ship
  _dmShip={x:window.innerWidth/2,y:window.innerHeight/2,angle:-Math.PI/2,vx:0,vy:0,cooldown:0};
  // card HP — alltime bar = 3 hits, regular cards = 1
  document.querySelectorAll('.card').forEach(c=>{
    const hp=c.closest('#alltime-bar')?3:1;
    _dmCardHP.set(c,hp);
  });
  document.body.style.overflow='hidden';
  document.addEventListener('keydown',_dmKeyDown);
  document.addEventListener('keyup',_dmKeyUp);
  $('destroy-btn').textContent='🚪 Exit';
  $('destroy-btn').style.background='rgba(239,68,68,.15)';
  _dmLoop();
}

function _dmKeyDown(e){
  _dmKeys[e.code]=true;
  if(['Space','ArrowUp','ArrowDown'].includes(e.code)) e.preventDefault();
  if(e.code==='Escape') _exitDM();
}
function _dmKeyUp(e){ _dmKeys[e.code]=false; }

function _dmSpawnParticles(x,y,n,emojis){
  for(let i=0;i<n;i++) _dmParticles.push({x,y,vx:(Math.random()-.5)*9,vy:(Math.random()-.5)*9,life:1,decay:.022+Math.random()*.025,emoji:emojis[Math.floor(Math.random()*emojis.length)],size:14+Math.random()*14});
}

function _dmDestroyCard(card, bx, by){
  const r=card.getBoundingClientRect();
  const cx=r.left+r.width/2, cy=r.top+r.height/2;
  _dmSpawnParticles(cx,cy,24,['💥','💸','💵','🔥','⭐','💨','🤑']);
  // floating damage text
  const valEl=card.querySelector('.kpi-val,.alltime-val');
  const valTxt=valEl?valEl.textContent:'';
  const dmgEl=document.createElement('div');
  dmgEl.style.cssText=`position:fixed;left:${cx}px;top:${cy}px;z-index:10002;color:#ef4444;font-weight:900;font-size:20px;font-family:monospace;pointer-events:none;transform:translateX(-50%);transition:all 1.4s ease;white-space:nowrap;text-shadow:0 0 10px #ef4444;`;
  dmgEl.textContent=valTxt?`− ${valTxt} 💀`:'💀 DEAD';
  document.body.appendChild(dmgEl);
  setTimeout(()=>{dmgEl.style.transform='translateX(-50%) translateY(-90px)';dmgEl.style.opacity='0';},30);
  setTimeout(()=>dmgEl.remove(),1500);
  // card fly-off animation
  const dx=cx-window.innerWidth/2, dy=cy-window.innerHeight/2;
  card.style.transition='all .45s cubic-bezier(.4,0,.2,1)';
  card.style.transform=`translate(${dx*.6}px,${dy*.6}px) rotate(${(Math.random()-.5)*40}deg) scale(.1)`;
  card.style.opacity='0';
  setTimeout(()=>card.remove(),460);
  // score
  const nm=valTxt.match(/([\d.]+)k?/);
  if(nm){const n=parseFloat(nm[1])*(valTxt.includes('k')?1000:1);_dmScore+=Math.round(n);}
  _dmKilled++;
  const hud=$('dm-hud');
  if(hud) hud.innerHTML=`💥 DESTRUCTION MODE<br>KILLED: ${_dmKilled} cards<br>DESTROYED: $${_dmScore.toLocaleString()}`;
  // check win
  if(document.querySelectorAll('.card').length===0) setTimeout(_dmWin,600);
}

function _dmWin(){
  cancelAnimationFrame(_dmRaf);
  _dmPlayFanfare();
  const win=document.createElement('div');
  win.id='dm-win';
  win.style.cssText='position:fixed;inset:0;z-index:10003;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:20px;background:rgba(0,0,0,.92);';
  win.innerHTML=`<div style="font-size:80px">💀</div>
    <div style="color:#ef4444;font-size:36px;font-weight:900;font-family:monospace;text-align:center;text-shadow:0 0 20px #ef4444">YOU BROKE THE DASHBOARD</div>
    <div style="color:#fbbf24;font-size:20px;font-family:monospace">$${_dmScore.toLocaleString()} worth of profit data eliminated</div>
    <div style="color:#8b5cf6;font-size:14px">${_dmKilled} cards destroyed · no survivors</div>
    <button onclick="location.reload()" style="margin-top:12px;background:#ef4444;color:#fff;border:none;border-radius:10px;padding:14px 28px;font-size:18px;font-weight:700;cursor:pointer;font-family:monospace">🔄 REBUILD DASHBOARD</button>`;
  document.body.appendChild(win);
}

function _exitDM(){
  _dm=false;
  if(_dmRaf){cancelAnimationFrame(_dmRaf);_dmRaf=null;}
  document.removeEventListener('keydown',_dmKeyDown);
  document.removeEventListener('keyup',_dmKeyUp);
  document.body.style.overflow='';
  ['dm-canvas','dm-hud','dm-win'].forEach(id=>{const el=$(id);if(el)el.remove();});
  _dmBullets=[];_dmParticles=[];_dmBossBullets=[];
  const btn=$('destroy-btn');
  if(btn){btn.textContent='💥 Destroy';btn.style.background='';}
  showToast('Dashboard survived... for now 😤','info','🛡️');
}

function _dmLoop(){
  if(!_dm) return;
  const ctx=_dmCtx, W=_dmCanvas.width, H=_dmCanvas.height;
  ctx.clearRect(0,0,W,H);
  const s=_dmShip;
  // rotate + thrust
  if(_dmKeys['ArrowLeft']) s.angle-=_DM_ROT;
  if(_dmKeys['ArrowRight']) s.angle+=_DM_ROT;
  if(_dmKeys['ArrowUp']){s.vx+=Math.cos(s.angle)*_DM_THRUST;s.vy+=Math.sin(s.angle)*_DM_THRUST;}
  s.vx*=_DM_FRIC; s.vy*=_DM_FRIC;
  s.x=(s.x+s.vx+W)%W; s.y=(s.y+s.vy+H)%H;
  s.cooldown=Math.max(0,s.cooldown-1);
  if(_dmKeys['Space']&&s.cooldown===0){
    _dmBullets.push({x:s.x+Math.cos(s.angle)*_DM_SHIP,y:s.y+Math.sin(s.angle)*_DM_SHIP,vx:Math.cos(s.angle)*_DM_BSPD+s.vx,vy:Math.sin(s.angle)*_DM_BSPD+s.vy,life:70});
    s.cooldown=_DM_COOLDOWN;
    _dmPlayLaser();
  }
  if(_dmInvincible>0) _dmInvincible--;
  // ── Boss shoots back ──
  const bossCard=[..._dmCardHP.keys()].find(c=>c.closest&&c.closest('#alltime-bar')&&document.body.contains(c));
  if(bossCard){
    _dmBossShootTimer--;
    if(_dmBossShootTimer<=0){
      const br=bossCard.getBoundingClientRect();
      const bx=br.left+br.width/2, by=br.top+br.height/2;
      const ang=Math.atan2(s.y-by,s.x-bx)+(Math.random()-.5)*.4;
      _dmBossBullets.push({x:bx,y:by,vx:Math.cos(ang)*5,vy:Math.sin(ang)*5,life:120});
      _dmBossShootTimer=55+Math.floor(Math.random()*30);
      bossCard.style.boxShadow='0 0 30px #fbbf24';
      setTimeout(()=>bossCard.style.boxShadow='',150);
    }
  } else { _dmBossShootTimer=0; }
  // draw ship
  ctx.save(); ctx.translate(s.x,s.y); ctx.rotate(s.angle);
  ctx.strokeStyle='#6366f1'; ctx.lineWidth=2; ctx.shadowColor='#6366f1'; ctx.shadowBlur=12;
  ctx.beginPath(); ctx.moveTo(_DM_SHIP,0); ctx.lineTo(-_DM_SHIP*.7,-_DM_SHIP*.6); ctx.lineTo(-_DM_SHIP*.35,0); ctx.lineTo(-_DM_SHIP*.7,_DM_SHIP*.6); ctx.closePath();
  ctx.fillStyle='rgba(99,102,241,.25)'; ctx.fill(); ctx.stroke();
  if(_dmKeys['ArrowUp']){
    ctx.beginPath(); ctx.moveTo(-_DM_SHIP*.35,0); ctx.lineTo(-_DM_SHIP*1.3,(Math.random()-.5)*7);
    ctx.strokeStyle='#f59e0b'; ctx.shadowColor='#f59e0b'; ctx.lineWidth=2.5; ctx.stroke();
  }
  ctx.restore();
  // bullets
  _dmBullets=_dmBullets.filter(b=>b.life>0);
  _dmBullets.forEach(b=>{
    b.x+=b.vx; b.y+=b.vy; b.life--;
    b.x=(b.x+W)%W; b.y=(b.y+H)%H;
    ctx.beginPath(); ctx.arc(b.x,b.y,3.5,0,Math.PI*2);
    ctx.fillStyle='#ef4444'; ctx.shadowColor='#ef4444'; ctx.shadowBlur=10; ctx.fill();
    // collision
    _dmCardHP.forEach((hp,card)=>{
      if(!document.body.contains(card)){_dmCardHP.delete(card);return;}
      const r=card.getBoundingClientRect();
      if(b.x>r.left&&b.x<r.right&&b.y>r.top&&b.y<r.bottom){
        b.life=0;
        const newHp=hp-1; _dmCardHP.set(card,newHp);
        const isBoss=!!card.closest('#alltime-bar');
        if(newHp<=0){_dmCardHP.delete(card);_dmDestroyCard(card,b.x,b.y);_dmPlayExplosion();}
        else{
          _dmSpawnParticles(b.x,b.y,6,['💥','⚡','🔥']);
          card.style.transition='box-shadow .1s'; card.style.boxShadow=`0 0 24px ${isBoss?'#fbbf24':'#ef4444'}`;
          setTimeout(()=>card.style.boxShadow='',200);
          _dmPlayHit(isBoss);
        }
      }
    });
  });
  // ── Boss bullets ──
  _dmBossBullets=_dmBossBullets.filter(b=>b.life>0);
  _dmBossBullets.forEach(b=>{
    b.x+=b.vx; b.y+=b.vy; b.life--;
    ctx.beginPath(); ctx.arc(b.x,b.y,4,0,Math.PI*2);
    ctx.fillStyle='#fbbf24'; ctx.shadowColor='#fbbf24'; ctx.shadowBlur=12; ctx.fill();
    // hit player ship
    if(_dmInvincible===0){
      const dx=b.x-s.x, dy=b.y-s.y;
      if(Math.sqrt(dx*dx+dy*dy)<_DM_SHIP+4){
        b.life=0; _dmPlayerHP--; _dmInvincible=90;
        _dmPlayHit(false);
        _dmSpawnParticles(s.x,s.y,10,['💥','⚡','😵']);
        // flash ship red
        s._hit=20;
        // update HUD
        const hud=$('dm-hud');
        const hearts='❤️'.repeat(Math.max(0,_dmPlayerHP))+'🖤'.repeat(Math.max(0,3-_dmPlayerHP));
        if(hud) hud.innerHTML=`💥 DESTRUCTION MODE<br>KILLED: ${_dmKilled} cards<br>DESTROYED: $${_dmScore.toLocaleString()}<br>${hearts}`;
        if(_dmPlayerHP<=0){ showToast('💀 YOUR SHIP GOT REKT BY THE BOSS','error','😵'); _dmPlayerHP=3; }
      }
    }
  });
  // draw ship hit flash
  if(s._hit>0){ s._hit--; ctx.save(); ctx.translate(s.x,s.y); ctx.rotate(s.angle); ctx.fillStyle=`rgba(239,68,68,${s._hit/20*.5})`; ctx.beginPath(); ctx.arc(0,0,_DM_SHIP*1.5,0,Math.PI*2); ctx.fill(); ctx.restore(); }
  // ── Player HUD hearts ──
  ctx.font='18px serif'; ctx.globalAlpha=.9;
  for(let i=0;i<3;i++) ctx.fillText(i<_dmPlayerHP?'❤️':'🖤',W-36-i*24,32);
  ctx.globalAlpha=1;
  // particles
  _dmParticles=_dmParticles.filter(p=>p.life>0);
  _dmParticles.forEach(p=>{
    p.x+=p.vx; p.y+=p.vy; p.vy+=.12; p.life-=p.decay;
    ctx.save(); ctx.globalAlpha=Math.max(0,p.life); ctx.font=`${p.size}px serif`; ctx.fillText(p.emoji,p.x,p.y); ctx.restore();
  });
  _dmRaf=requestAnimationFrame(_dmLoop);
}

// ─── HEAD-TO-HEAD ─────────────────────────────────────────────────────────────
function renderH2H() {
  const section = $('h2h-section'), card = $('h2h-card');
  if (!section || !card) return;
  const data    = filtered();
  const persons = [...new Set(data.map(r => r.person))];
  if (!persons.length) { section.style.display = 'none'; return; }
  section.style.display = 'block';

  const nameA = $('h2h-a').value, nameB = $('h2h-b').value;
  if (!nameA || !nameB || nameA === nameB) {
    card.innerHTML = `<div class="h2h-empty">Select two different accounts above to compare them head-to-head ⚔️</div>`;
    return;
  }

  const stats = name => {
    const pr = data.filter(r => r.person === name);
    const rev    = r2(pr.reduce((s,r)=>s+r.price,0));
    const profit = r2(pr.reduce((s,r)=>s+r.profit,0));
    const cost   = r2(pr.reduce((s,r)=>s+r.cost,0));
    const fee    = r2(pr.reduce((s,r)=>s+r.fee,0));
    const sales  = pr.length;
    const roi    = cost>0 ? r2(profit/cost*100) : 0;
    const margin = rev>0  ? r2(profit/rev*100)  : 0;
    const dd     = getDailyData(pr);
    const avgDay = dd.length>0 ? r2(profit/dd.length) : 0;
    const avgSale= sales>0 ? r2(rev/sales) : 0;
    const hs     = calcHealthScore(pr, data);
    return { rev, profit, cost, fee, sales, roi, margin, avgDay, avgSale, health: hs.score, grade: hs.grade, days: dd.length };
  };

  const a = stats(nameA), b = stats(nameB);

  const metrics = [
    { label: 'Total Profit',   va: a.profit,  vb: b.profit,  fmt: fmt$,  higher: true  },
    { label: 'Total Revenue',  va: a.rev,     vb: b.rev,     fmt: fmt$,  higher: true  },
    { label: 'ROI',            va: a.roi,     vb: b.roi,     fmt: v=>fmtP(v), higher: true  },
    { label: 'Margin',         va: a.margin,  vb: b.margin,  fmt: v=>fmtP(v), higher: true  },
    { label: 'Total Sales',    va: a.sales,   vb: b.sales,   fmt: fmtN,  higher: true  },
    { label: 'Avg Daily',      va: a.avgDay,  vb: b.avgDay,  fmt: fmt$,  higher: true  },
    { label: 'Avg Sale',       va: a.avgSale, vb: b.avgSale, fmt: fmt$,  higher: true  },
    { label: 'Active Days',    va: a.days,    vb: b.days,    fmt: fmtN,  higher: true  },
    { label: 'Health Score',   va: a.health,  vb: b.health,  fmt: v=>v+'/100', higher: true },
  ];

  let winsA = 0, winsB = 0;
  metrics.forEach(m => {
    if      (m.va > m.vb) winsA++;
    else if (m.vb > m.va) winsB++;
  });

  const rows = metrics.map(m => {
    const tie = m.va === m.vb;
    const aWins = tie ? false : (m.higher ? m.va > m.vb : m.va < m.vb);
    const bWins = tie ? false : !aWins;
    const maxV  = Math.max(Math.abs(m.va), Math.abs(m.vb), 0.01);
    const barA  = Math.round(Math.abs(m.va) / maxV * 100);
    const barB  = Math.round(Math.abs(m.vb) / maxV * 100);
    return `
      <div class="h2h-row">
        <div class="h2h-val a ${aWins?'winner':tie?'':'loser'}">${m.fmt(m.va)}</div>
        <div class="h2h-metric">${m.label}</div>
        <div class="h2h-val b ${bWins?'winner':tie?'':'loser'}">${m.fmt(m.vb)}</div>
      </div>
      <div class="h2h-bars">
        <div style="display:flex;justify-content:flex-end"><div class="h2h-bar-a" style="width:${barA}%"></div></div>
        <div class="h2h-tie">${tie?'TIE':''}</div>
        <div><div class="h2h-bar-b" style="width:${barB}%"></div></div>
      </div>`;
  }).join('');

  const overallWinner = winsA > winsB ? nameA : winsB > winsA ? nameB : null;
  card.innerHTML = `
    <div class="h2h-header">
      <div>
        <div class="h2h-name a">${nameA}</div>
        <div class="h2h-wins a">${winsA}</div>
        <div class="h2h-score-badge">wins</div>
      </div>
      <div style="text-align:center">
        ${overallWinner ? `<div style="font-size:11px;color:var(--muted);margin-bottom:4px">Winner</div><div style="font-size:22px">🏆</div><div style="font-size:12px;font-weight:800;color:var(--yellow)">${overallWinner}</div>` : `<div style="font-size:22px">🤝</div><div style="font-size:11px;color:var(--muted)">Tied</div>`}
      </div>
      <div>
        <div class="h2h-name b">${nameB}</div>
        <div class="h2h-wins b">${winsB}</div>
        <div class="h2h-score-badge">wins</div>
      </div>
    </div>
    ${rows}`;
}

// ─── WEEKLY WRAP ──────────────────────────────────────────────────────────────
function openWeeklyWrap() {
  const content = $('wrap-content');
  if (!RAW.length) { showToast('Load data first', 'error', '⚠️'); return; }

  const chRAW = RAW.filter(r => CHANNEL_FILTER === 'all' || (CHANNEL_FILTER === 'tiktok' ? r.channel === 'tiktok' : r.channel !== 'tiktok'));

  // Determine last full week (Mon–Sun)
  const today = new Date();
  const dow = today.getDay(); // 0=Sun
  const lastSun  = new Date(today); lastSun.setDate(today.getDate() - dow);
  const lastMon  = new Date(lastSun); lastMon.setDate(lastSun.getDate() - 6);
  const prevMon  = new Date(lastMon); prevMon.setDate(lastMon.getDate() - 7);
  const prevSun  = new Date(lastSun); prevSun.setDate(lastSun.getDate() - 7);

  const fmt = d => d.toISOString().slice(0, 10);
  const inRange = (r, from, to) => r.date && r.date >= fmt(from) && r.date <= fmt(to);

  const thisWeek = chRAW.filter(r => inRange(r, lastMon, lastSun));
  const prevWeek = chRAW.filter(r => inRange(r, prevMon, prevSun));

  // If no last-week data, use the last 7 available days
  const dd = getDailyData(chRAW).slice(-7);
  const useData = thisWeek.length > 0 ? thisWeek : chRAW.filter(r => dd.some(d => d.date === r.date));
  const prevData = prevWeek.length > 0 ? prevWeek : getDailyData(chRAW).slice(-14, -7).reduce((acc, d) => {
    return acc.concat(chRAW.filter(r => r.date === d.date));
  }, []);

  const sumProfit  = arr => r2(arr.reduce((s,r)=>s+r.profit,0));
  const sumRev     = arr => r2(arr.reduce((s,r)=>s+r.price,0));
  const wProfit    = sumProfit(useData);
  const wRev       = sumRev(useData);
  const wSales     = useData.length;
  const pProfit    = sumProfit(prevData);
  const profitDelta = pProfit !== 0 ? r2((wProfit - pProfit) / Math.abs(pProfit) * 100) : null;

  // Best day this week
  const ddWeek = getDailyData(useData);
  const bestDay = ddWeek.length ? ddWeek.reduce((a,b)=>b.profit>a.profit?b:a,ddWeek[0]) : null;

  // MVP account
  const persons = [...new Set(useData.map(r=>r.person))];
  let mvp = null, mvpProfit = -Infinity;
  persons.forEach(p => {
    const pp = r2(useData.filter(r=>r.person===p).reduce((s,r)=>s+r.profit,0));
    if (pp > mvpProfit) { mvpProfit = pp; mvp = p; }
  });

  // Mini bar chart by day
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const dayMap = {};
  ddWeek.forEach(d => {
    const dow = (new Date(d.date+'T00:00:00').getDay() + 6) % 7; // Mon=0
    dayMap[dow] = r2((dayMap[dow]||0) + d.profit);
  });
  const maxDayP = Math.max(...Object.values(dayMap), 0.01);
  const dayBars = days.map((label, i) => {
    const val = dayMap[i] || 0;
    const h   = Math.max(2, Math.round(val / maxDayP * 46));
    const col = val >= 0 ? 'var(--emerald)' : 'var(--rose)';
    return `<div class="wrap-day-col">
      <div class="wrap-day-label">${label}</div>
      <div class="wrap-day-bar-wrap"><div class="wrap-day-bar" style="height:${h}px;background:${col}"></div></div>
      <div class="wrap-day-val" style="color:${col}">${val>=0?'+':''}${(val/1000).toFixed(1)}k</div>
    </div>`;
  }).join('');

  // Date range label
  const fmtShort = d => d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
  const weekLabel = thisWeek.length > 0
    ? `${fmtShort(lastMon)} – ${fmtShort(lastSun)}`
    : `Last ${ddWeek.length} active days`;

  // Delta badge
  const deltaBadge = profitDelta === null ? '' :
    `<div class="wrap-delta ${profitDelta>=0?'up':'down'}">${profitDelta>=0?'↑':'↓'} ${Math.abs(profitDelta).toFixed(1)}% vs prior week</div>`;

  content.innerHTML = `
    <div class="wrap-header">
      <div class="wrap-title">Weekly Recap 🎉</div>
      <div class="wrap-dates">${weekLabel}</div>
    </div>
    <div class="wrap-hero">
      <div class="wrap-hero-label">💰 Total Profit</div>
      <div class="wrap-hero-val">${fmt$(wProfit)}</div>
      <div class="wrap-hero-sub">${fmtN(wSales)} sales · ${fmt$(wRev)} revenue</div>
      ${deltaBadge}
    </div>
    <div class="wrap-stats">
      <div class="wrap-stat" style="animation-delay:.05s">
        <div class="wrap-stat-label">⚡ Best Day</div>
        <div class="wrap-stat-val">${bestDay ? fmt$(bestDay.profit) : '—'}</div>
        <div class="wrap-stat-sub">${bestDay ? fmtDayLabel(bestDay.date) + ' · ' + bestDay.sales + ' sales' : 'No data'}</div>
      </div>
      <div class="wrap-stat" style="animation-delay:.1s">
        <div class="wrap-stat-label">📊 Avg Daily</div>
        <div class="wrap-stat-val">${fmt$(ddWeek.length ? r2(wProfit/ddWeek.length) : 0)}</div>
        <div class="wrap-stat-sub">across ${ddWeek.length} active days</div>
      </div>
      <div class="wrap-stat" style="animation-delay:.15s">
        <div class="wrap-stat-label">🛒 Avg Sale</div>
        <div class="wrap-stat-val">${fmt$(wSales ? r2(wRev/wSales) : 0)}</div>
        <div class="wrap-stat-sub">${fmtN(wSales)} total transactions</div>
      </div>
      <div class="wrap-stat" style="animation-delay:.2s">
        <div class="wrap-stat-label">📈 Margin</div>
        <div class="wrap-stat-val">${fmtP(wRev > 0 ? r2(wProfit/wRev*100) : 0)}</div>
        <div class="wrap-stat-sub">${fmt$(wRev)} total revenue</div>
      </div>
    </div>
    ${mvp ? `<div class="wrap-mvp">
      <div class="wrap-mvp-label">👑 Account MVP</div>
      <div class="wrap-mvp-name">${mvp}</div>
      <div class="wrap-mvp-val">${fmt$(mvpProfit)} profit this week</div>
    </div>` : ''}
    <div style="margin-bottom:8px">
      <div class="section-title" style="margin-bottom:10px">📅 Day-by-Day</div>
      <div class="wrap-days">${dayBars}</div>
    </div>`;

  openModal('wrap-modal');
}

// ─── BOOT ──────────────────────────────────────────────────────────────────
setInterval(loadAll, 15 * 60 * 1000);
setInterval(() => loadListingTracker(), 15 * 60 * 1000);
// Load listing tracker immediately (no API key needed — public CSV export)
loadListingTracker();
refreshTikTokStatus();
if (checkApiKey()) loadAll();
