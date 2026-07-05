module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  res.status(410).json({
    error: 'Server database cache is disabled. Seller OS loads live Google Sheets data directly.',
  });
};
