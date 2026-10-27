export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const raw = req.query.url;
  if (!raw) return res.status(400).send('url required');

  const input = Array.isArray(raw) ? raw[0] : raw;
  let target;
  try { target = new URL(input); } catch { return res.status(400).send('invalid url'); }
  if (!/^https?:$/.test(target.protocol)) return res.status(400).send('only http/https allowed');

  try {
    const upstream = await fetch(target.href, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Referer': target.origin + '/'
      },
    });

    if (!upstream.ok) return res.status(upstream.status).send(`Upstream error: ${upstream.status}`);

    const contentType = upstream.headers.get('content-type') || '';
    const isM3U8 = /mpegurl|m3u8/i.test(contentType) || /\.m3u8($|\?)/i.test(target.href);

    res.setHeader('Cache-Control', 'no-store');
    res.status(upstream.status);

    if (isM3U8) {
      let text = await upstream.text();
      const base = target.href;
      text = text.split(/\r?\n/).map(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;
        try {
          const abs = new URL(trimmed, base).href;
          return `/api/proxy?url=${encodeURIComponent(abs)}`;
        } catch { return line; }
      }).join('\n');
      res.setHeader('content-type', 'application/vnd.apple.mpegurl; charset=utf-8');
      return res.send(text);
    }

    res.setHeader('content-type', contentType || 'application/octet-stream');
    return res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (err) {
    return res.status(502).send(`Proxy error: ${err.message}`);
  }
}
