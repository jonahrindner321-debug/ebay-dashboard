// api/sheets.js — Vercel serverless function
// Proxies Google Sheets / Drive API calls so the API key never touches the browser.
// Set GOOGLE_API_KEY in your Vercel project environment variables.
//
// Query params:
//   type  = tabs | values | drive | meta
//   id    = Google Sheet / Drive file ID
//   tab   = tab name (required for type=values only)

module.exports = async function handler(req, res) {
  // Only allow GET
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const key = process.env.GOOGLE_API_KEY;
  if (!key) {
    // Let the browser know to fall back to its own key
    res.status(503).json({ error: 'GOOGLE_API_KEY not configured on server — falling back to client key' });
    return;
  }

  const { type, id, tab } = req.query;

  if (!id) {
    res.status(400).json({ error: 'Missing required param: id' });
    return;
  }

  let googleUrl;
  if (type === 'tabs') {
    googleUrl = `https://sheets.googleapis.com/v4/spreadsheets/${id}?key=${key}&fields=sheets.properties(title,sheetType)`;
  } else if (type === 'values') {
    if (!tab) { res.status(400).json({ error: 'Missing required param: tab' }); return; }
    googleUrl = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(tab)}!A:Z?key=${key}`;
  } else if (type === 'drive') {
    googleUrl = `https://www.googleapis.com/drive/v3/files/${id}?key=${key}&fields=createdTime`;
  } else if (type === 'meta') {
    googleUrl = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/_meta!A1?key=${key}`;
  } else {
    res.status(400).json({ error: 'Unknown type. Use: tabs | values | drive | meta' });
    return;
  }

  try {
    const r = await fetch(googleUrl);
    const data = await r.json();
    if (r.ok) {
      // Cache at edge for 30s, serve stale for up to 2min while revalidating
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
    }
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
