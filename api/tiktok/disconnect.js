const { clearCookie, json } = require('./_lib');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }
  clearCookie(res, 'seller_os_tiktok');
  json(res, 200, { ok: true, connected: false });
};
