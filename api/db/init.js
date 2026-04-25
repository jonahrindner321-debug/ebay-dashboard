const fs = require('fs');
const path = require('path');
const { getSql, hasDb } = require('../_lib/db');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!process.env.DB_ADMIN_SECRET || req.headers['x-admin-secret'] !== process.env.DB_ADMIN_SECRET) {
    res.status(401).json({ error: 'Missing or invalid x-admin-secret' });
    return;
  }
  if (!hasDb()) {
    res.status(503).json({ error: 'DATABASE_URL is not configured' });
    return;
  }

  try {
    const sql = getSql();
    const schema = fs.readFileSync(path.join(process.cwd(), 'db/schema.sql'), 'utf8');
    await sql.query(schema);
    res.status(200).json({ ok: true, message: 'Seller OS database schema is ready' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
