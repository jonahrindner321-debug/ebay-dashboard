const { readSnapshotFromSheet } = require('./_lib/google-sheets');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const result = await readSnapshotFromSheet();
    if (!result.configured) {
      res.status(404).json({
        ok: false,
        error: 'SNAPSHOT_NOT_CONFIGURED',
        reason: result.reason,
      });
      return;
    }

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=240');
    res.status(200).json({
      ok: true,
      generatedAt: result.generatedAt,
      bytes: result.bytes,
      chunks: result.chunks,
      snapshot: result.snapshot,
    });
  } catch (e) {
    res.status(502).json({
      ok: false,
      error: 'SNAPSHOT_READ_FAILED',
      message: e.message,
    });
  }
};
