const { clearCookie, json } = require('./_lib');
const { getSql, hasDb } = require('../_lib/db');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }
  clearCookie(res, 'seller_os_tiktok');
  if (hasDb() && req.query.connectionId) {
    const sql = getSql();
    await sql`
      update platform_connections
      set status = 'disconnected', updated_at = now()
      where id = ${req.query.connectionId} and platform = 'tiktok'
    `;
  }
  json(res, 200, { ok: true, connected: false });
};
