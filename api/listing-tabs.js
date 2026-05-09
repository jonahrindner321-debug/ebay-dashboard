// api/listing-tabs.js — discovers daily listing tracker tabs from the workbook page.
// This keeps Growth from needing a code change every time a new month tab is added.

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const id = req.query.id;
  if (!id) {
    res.status(400).json({ error: 'Missing required param: id' });
    return;
  }

  try {
    const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/edit`;
    const r = await fetch(url, { redirect: 'follow' });
    if (!r.ok) {
      res.status(r.status).json({ error: `Google returned HTTP ${r.status}` });
      return;
    }
    const html = await r.text();
    const sheetRe = /\[21350203,"\[(\d+),0,\\"(\d+)\\",([\s\S]*?)\]"\]/g;
    const tabs = [];
    let m;
    while ((m = sheetRe.exec(html))) {
      const titleMatch = m[3].match(/\[0,0,\\"([^\\"]+)\\"\]/);
      const title = titleMatch ? titleMatch[1] : '';
      if (!title) continue;
      tabs.push({ index: Number(m[1]), gid: m[2], title });
    }

    const dailyTabs = tabs
      .filter(t => /^Daily Tracking/i.test(t.title))
      .sort((a, b) => a.index - b.index);

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
    res.status(200).json({
      tabs,
      dailyTabs,
      dailyGids: dailyTabs.map(t => t.gid),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
