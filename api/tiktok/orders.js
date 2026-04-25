const { getTokenBundle, json } = require('./_lib');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }

  const token = getTokenBundle(req);
  if (!token) {
    json(res, 401, { error: 'TikTok Shop is not connected' });
    return;
  }

  json(res, 501, {
    error: 'TikTok orders fetch is not wired yet',
    next: 'Configure approved TikTok Shop order endpoint, shop ID, and request signing after app approval.',
    normalizedShape: {
      platform: 'tiktok',
      storeId: 'shop_id',
      orderId: 'order_id',
      date: 'paid_at',
      revenue: 'payment.total_amount',
      fees: 'settlement fees when available',
      profit: 'computed after costs/fees are available',
    },
  });
};
