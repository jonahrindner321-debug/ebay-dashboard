module.exports = async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    ok: true,
    disabled: true,
    rowCount: 0,
    sourceCount: 0,
    errorCount: 0,
    generatedAt: new Date().toISOString(),
    message: 'Legacy Neon sync is disabled. Use scripts/sync-seller-os-snapshot.cjs and workflow-templates/sync-seller-os-snapshot.yml for the free Sheets snapshot worker.',
  });
};
