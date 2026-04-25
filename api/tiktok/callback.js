const {
  STATE_COOKIE,
  clearCookie,
  encryptJson,
  getRedirectUri,
  html,
  readCookies,
  setCookie,
} = require('./_lib');

async function exchangeOAuthCode(code, req) {
  const tokenUrl = process.env.TIKTOK_TOKEN_URL || 'https://open.tiktokapis.com/v2/oauth/token/';
  const style = process.env.TIKTOK_TOKEN_STYLE || 'oauth_v2';

  if (style === 'shop_legacy') {
    const r = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_key: process.env.TIKTOK_CLIENT_KEY,
        app_secret: process.env.TIKTOK_CLIENT_SECRET,
        grant_type: 'authorized_code',
        auth_code: code,
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error_description || data.message || `TikTok token error HTTP ${r.status}`);
    return data;
  }

  const body = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY,
    client_secret: process.env.TIKTOK_CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: getRedirectUri(req),
  });

  const r = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error_description || data.error || `TikTok token error HTTP ${r.status}`);
  return data;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { code, state, error, error_description } = req.query;
  if (error) {
    html(res, 400, `<!doctype html><title>TikTok connection failed</title><body style="font-family:system-ui;background:#0b1020;color:#e5e7eb;padding:32px"><h1>TikTok connection cancelled</h1><p>${error_description || error}</p><p><a style="color:#67e8f9" href="/">Back to Seller OS</a></p></body>`);
    return;
  }

  const cookies = readCookies(req);
  if (!code || !state || !cookies[STATE_COOKIE] || cookies[STATE_COOKIE] !== state) {
    html(res, 400, `<!doctype html><title>TikTok connection failed</title><body style="font-family:system-ui;background:#0b1020;color:#e5e7eb;padding:32px"><h1>TikTok connection failed</h1><p>The OAuth state did not match. Please try connecting again.</p><p><a style="color:#67e8f9" href="/">Back to Seller OS</a></p></body>`);
    return;
  }

  try {
    const tokenBundle = await exchangeOAuthCode(code, req);
    const connectedAt = new Date().toISOString();
    const encrypted = encryptJson({ ...tokenBundle, connectedAt });
    setCookie(res, 'seller_os_tiktok', encrypted, { maxAge: 60 * 60 * 24 * 30 });
    clearCookie(res, STATE_COOKIE);
    html(res, 200, `<!doctype html>
      <title>TikTok Shop connected</title>
      <body style="font-family:system-ui;background:#0b1020;color:#e5e7eb;padding:32px">
        <h1>TikTok Shop connected</h1>
        <p>Seller OS can now use the approved read-only scopes for this browser session.</p>
        <p><a style="color:#67e8f9" href="/">Back to Seller OS</a></p>
        <script>setTimeout(() => location.href = '/', 1200)</script>
      </body>`);
  } catch (e) {
    html(res, 502, `<!doctype html><title>TikTok connection failed</title><body style="font-family:system-ui;background:#0b1020;color:#e5e7eb;padding:32px"><h1>TikTok token exchange failed</h1><p>${String(e.message || e)}</p><p><a style="color:#67e8f9" href="/">Back to Seller OS</a></p></body>`);
  }
};
