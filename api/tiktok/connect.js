const crypto = require('crypto');
const { STATE_COOKIE, getRedirectUri, html, missingConfig, setCookie } = require('./_lib');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const missing = missingConfig();
  if (missing.length) {
    html(res, 503, `<!doctype html>
      <title>TikTok Shop setup needed</title>
      <body style="font-family:system-ui;background:#0b1020;color:#e5e7eb;padding:32px">
        <h1>TikTok Shop is not configured yet</h1>
        <p>Add these Vercel environment variables first:</p>
        <pre style="background:#111827;padding:16px;border-radius:8px">${missing.join('\n')}</pre>
        <p>After that, this button will redirect to TikTok's authorization screen.</p>
      </body>`);
    return;
  }

  const state = crypto.randomBytes(24).toString('base64url');
  const storeSlug = req.query.store || req.query.storeSlug || 'unassigned-tiktok-store';
  const storeName = req.query.storeName || req.query.store || 'Unassigned TikTok Store';
  const clientSlug = req.query.client || req.query.clientSlug || storeSlug;
  const clientName = req.query.clientName || req.query.storeName || storeName;
  const style = process.env.TIKTOK_TOKEN_STYLE || 'oauth_v2';
  const authUrl = new URL(
    process.env.TIKTOK_AUTH_URL ||
    (style.startsWith('shop') ? 'https://auth.tiktok-shops.com/api/v2/token/authorize' : 'https://www.tiktok.com/v2/auth/authorize/')
  );

  if (style.startsWith('shop')) {
    authUrl.searchParams.set('app_key', process.env.TIKTOK_CLIENT_KEY);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('redirect_uri', getRedirectUri(req));
  } else {
    authUrl.searchParams.set('client_key', process.env.TIKTOK_CLIENT_KEY);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', process.env.TIKTOK_SCOPES || 'user.info.basic');
    authUrl.searchParams.set('redirect_uri', getRedirectUri(req));
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('disable_auto_auth', '1');
  }

  setCookie(res, STATE_COOKIE, JSON.stringify({ state, storeSlug, storeName, clientSlug, clientName }), { maxAge: 10 * 60 });
  res.writeHead(302, { Location: authUrl.toString() });
  res.end();
};
