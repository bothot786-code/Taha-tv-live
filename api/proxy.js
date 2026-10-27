module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const raw = req.query.url;
  if (!raw) {
    return res.status(400).send('url required');
  }

  const input = Array.isArray(raw) ? raw[0] : raw;

  let target;
  try {
    target = new URL(input);
  } catch {
    return res.status(400).send('invalid url');
  }

  if (!/^https?:$/.test(target.protocol)) {
    return res.status(400).send('only http/https allowed');
  }

  try {
    const upstream = await fetch(target.href, {
      redirect: 'follow',
      headers: {
        'user-agent':
          req.headers['user-agent'] ||
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        accept: '*/*',
        referer: target.origin + '/',
      },
    });

    const contentType = upstream.headers.get('content-type') || '';
    const isM3U8 =
      /mpegurl|m3u8/i.test(contentType) ||
      /\.m3u8($|\?)/i.test(target.href);

    res.status(upstream.status);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');

    if (isM3U8) {
      const text = await upstream.text();
      const base = target.href;

      const rewritten = text
        .split(/\r?\n/)
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed) return line;

          if (trimmed.startsWith('#')) {
            return line.replace(/URI="([^"]+)"/g, (match, uri) => {
              try {
                const abs = new URL(uri, base).href;
                return `URI="/api/proxy?url=${encodeURIComponent(abs)}"`;
              } catch {
                return match;
              }
            });
          }

          try {
            const abs = new URL(trimmed, base).href;
            return `/api/proxy?url=${encodeURIComponent(abs)}`;
          } catch {
            return line;
          }
        })
        .join('\n');

      res.setHeader('content-type', 'application/vnd.apple.mpegurl; charset=utf-8');
      return res.send(rewritten);
    }

    res.setHeader('content-type', contentType || 'application/octet-stream');
    const buffer = Buffer.from(await upstream.arrayBuffer());
    return res.send(buffer);
  } catch (err) {
    return res.status(502).send(`Proxy error: ${err.message}`);
  }
};
