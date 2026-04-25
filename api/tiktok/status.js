const { getTokenBundle, json, missingConfig } = require('./_lib');
const { getConnections, hasDb } = require('../_lib/db');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }

  const missing = missingConfig();
  const token = getTokenBundle(req);
  let connections = [];
  if (hasDb()) {
    try { connections = await getConnections('tiktok'); }
    catch (e) { /* schema may not be initialized yet */ }
  }
  json(res, 200, {
    configured: missing.length === 0,
    missing,
    connected: connections.length > 0 || Boolean(token && (token.access_token || token.data?.access_token)),
    connectedAt: token?.connectedAt || null,
    readOnly: true,
    scopes: process.env.TIKTOK_SCOPES || 'user.info.basic',
    storage: hasDb() ? 'database' : 'encrypted_http_only_cookie',
    databaseConfigured: hasDb(),
    connections: connections.map(c => ({
      id: c.id,
      storeId: c.store_id,
      storeSlug: c.store_slug,
      storeName: c.store_name,
      clientSlug: c.client_slug,
      clientName: c.client_name,
      externalAccountId: c.external_account_id,
      externalAccountName: c.external_account_name,
      status: c.status,
      connectedAt: c.connected_at,
    })),
  });
};
