const { getTokenBundle, json, missingConfig } = require('./_lib');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }

  const missing = missingConfig();
  const token = getTokenBundle(req);
  json(res, 200, {
    configured: missing.length === 0,
    missing,
    connected: Boolean(token && (token.access_token || token.data?.access_token)),
    connectedAt: token?.connectedAt || null,
    readOnly: true,
    scopes: process.env.TIKTOK_SCOPES || 'user.info.basic',
    storage: 'encrypted_http_only_cookie',
  });
};
