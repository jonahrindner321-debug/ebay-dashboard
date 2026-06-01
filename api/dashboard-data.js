const { getSql, hasDb } = require('./_lib/db');

const SNAPSHOT_KEY = 'seller-os-main';

async function ensureSnapshotTable(sql) {
  await sql`
    create table if not exists dashboard_snapshots (
      key text primary key,
      payload jsonb not null,
      generated_at timestamptz not null default now(),
      source_count integer not null default 0,
      row_count integer not null default 0,
      error_count integer not null default 0,
      updated_at timestamptz not null default now()
    )
  `;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!hasDb()) {
    res.status(503).json({ error: 'DATABASE_URL is not configured' });
    return;
  }

  try {
    const sql = getSql();
    await ensureSnapshotTable(sql);
    const rows = await sql`
      select key, payload, generated_at, row_count, source_count, error_count
      from dashboard_snapshots
      where key = ${SNAPSHOT_KEY}
      limit 1
    `;
    if (!rows.length) {
      res.status(404).json({ error: 'Dashboard snapshot has not been synced yet' });
      return;
    }
    res.setHeader('Cache-Control', 's-maxage=20, stale-while-revalidate=300');
    res.status(200).json({
      ok: true,
      key: rows[0].key,
      generatedAt: rows[0].generated_at,
      rowCount: rows[0].row_count,
      sourceCount: rows[0].source_count,
      errorCount: rows[0].error_count,
      payload: rows[0].payload,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
