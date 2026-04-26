const {
  STATE_COOKIE,
  clearCookie,
  encryptJson,
  encryptText,
  getRedirectUri,
  html,
  readCookies,
  setCookie,
  tokenExpiry,
} = require('./_lib');
const { ensureStore, hasDb, savePlatformConnection } = require('../_lib/db');

async function exchangeOAuthCode(code, req) {
  const style = process.env.TIKTOK_TOKEN_STYLE || 'oauth_v2';

  if (style === 'shop_v2') {
    const tokenUrl = new URL(process.env.TIKTOK_TOKEN_URL || 'https://auth.tiktok-shops.com/api/v2/token/get');
    tokenUrl.searchParams.set('app_key', process.env.TIKTOK_CLIENT_KEY);
    tokenUrl.searchParams.set('app_secret', process.env.TIKTOK_CLIENT_SECRET);
    tokenUrl.searchParams.set('auth_code', code);
    tokenUrl.searchParams.set('grant_type', 'authorized_code');

    const r = await fetch(tokenUrl);
    const data = await r.json().catch(() => ({}));
    const codeValue = data.code ?? data.message_code;
    if (!r.ok || (codeValue && Number(codeValue) !== 0)) {
      throw new Error(data.message || data.msg || data.error_description || `TikTok Shop token error HTTP ${r.status}`);
    }
    return data;
  }

  const tokenUrl = process.env.TIKTOK_TOKEN_URL || 'https://open.tiktokapis.com/v2/oauth/token/';
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
  let statePayload = null;
  try { statePayload = JSON.parse(cookies[STATE_COOKIE] || '{}'); }
  catch (e) { statePayload = { state: cookies[STATE_COOKIE] }; }

  if (!code || !state || !statePayload.state || statePayload.state !== state) {
    html(res, 400, `<!doctype html><title>TikTok connection failed</title><body style="font-family:system-ui;background:#0b1020;color:#e5e7eb;padding:32px"><h1>TikTok connection failed</h1><p>The OAuth state did not match. Please try connecting again.</p><p><a style="color:#67e8f9" href="/">Back to Seller OS</a></p></body>`);
    return;
  }

  try {
    const tokenBundle = await exchangeOAuthCode(code, req);
    const connectedAt = new Date().toISOString();
    let storage = 'encrypted_http_only_cookie';
    let connectionId = null;

    if (hasDb()) {
      const store = await ensureStore({
        storeSlug: statePayload.storeSlug,
        storeName: statePayload.storeName,
        clientSlug: statePayload.clientSlug,
        clientName: statePayload.clientName,
      });
      const accessToken = tokenBundle.access_token || tokenBundle.data?.access_token;
      const refreshToken = tokenBundle.refresh_token || tokenBundle.data?.refresh_token;
      const externalAccountId =
        tokenBundle.open_id ||
        tokenBundle.data?.open_id ||
        tokenBundle.shop_id ||
        tokenBundle.data?.shop_id ||
        tokenBundle.seller_id ||
        tokenBundle.data?.seller_id ||
        store.slug;
      const externalAccountName =
        tokenBundle.seller_name ||
        tokenBundle.data?.seller_name ||
        tokenBundle.shop_name ||
        tokenBundle.data?.shop_name ||
        store.name;
      const accessExpiresIn = tokenBundle.expires_in || tokenBundle.data?.expires_in;
      const refreshExpiresIn = tokenBundle.refresh_expires_in || tokenBundle.data?.refresh_expires_in;
      const accessExpiresAt = tokenBundle.access_token_expire_in || tokenBundle.data?.access_token_expire_in;
      const refreshExpiresAt = tokenBundle.refresh_token_expire_in || tokenBundle.data?.refresh_token_expire_in;
      connectionId = await savePlatformConnection({
        storeId: store.id,
        platform: 'tiktok',
        externalAccountId,
        externalAccountName,
        scopes: String(process.env.TIKTOK_SCOPES || '').split(/[,\s]+/).filter(Boolean),
        encryptedAccessToken: encryptText(accessToken || JSON.stringify(tokenBundle)),
        encryptedRefreshToken: encryptText(refreshToken),
        accessTokenExpiresAt: tokenExpiry(accessExpiresAt, { relative: false }) || tokenExpiry(accessExpiresIn),
        refreshTokenExpiresAt: tokenExpiry(refreshExpiresAt, { relative: false }) || tokenExpiry(refreshExpiresIn),
        tokenPayload: { connectedAt, tokenStyle: process.env.TIKTOK_TOKEN_STYLE || 'oauth_v2' },
      });
      storage = 'database';
    }

    const encrypted = encryptJson({ ...tokenBundle, connectedAt });
    setCookie(res, 'seller_os_tiktok', encrypted, { maxAge: 60 * 60 * 24 * 30 });
    clearCookie(res, STATE_COOKIE);
    html(res, 200, `<!doctype html>
      <title>TikTok Shop connected</title>
      <body style="font-family:system-ui;background:#0b1020;color:#e5e7eb;padding:32px">
        <h1>TikTok Shop connected</h1>
        <p>Seller OS can now use the approved read-only scopes.</p>
        <p>Storage: ${storage}${connectionId ? ` · Connection ${connectionId}` : ''}</p>
        <p><a style="color:#67e8f9" href="/">Back to Seller OS</a></p>
        <script>setTimeout(() => location.href = '/', 1200)</script>
      </body>`);
  } catch (e) {
    html(res, 502, `<!doctype html><title>TikTok connection failed</title><body style="font-family:system-ui;background:#0b1020;color:#e5e7eb;padding:32px"><h1>TikTok token exchange failed</h1><p>${String(e.message || e)}</p><p><a style="color:#67e8f9" href="/">Back to Seller OS</a></p></body>`);
  }
};
