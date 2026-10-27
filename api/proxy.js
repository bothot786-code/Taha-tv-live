module.exports = async function handler(req, res) {
  // CORS ہیڈرز
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
    // براؤزر جیسا User-Agent بھیجیں تاکہ رسائی بلاک نہ ہو
    const upstream = await fetch(target.href, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': target.origin + '/'
      },
    });

    if (!upstream.ok) {
      return res.status(upstream.status).send(`Upstream error: ${upstream.status} ${upstream.statusText}`);
    }

    const contentType = upstream.headers.get('content-type') || '';
    const isM3U8 = /mpegurl|m3u8/i.test(contentType) || /\.m3u8($|\?)/i.test(target.href);

    res.status(upstream.status);
    res.setHeader('Cache-Control', 'no-store');

    if (isM3U8) {
      let text = await upstream.text();
      const base = target.href;
      
      // اگر M3U8 ہے تو اس کے اندر موجود لنکس کو بھی پروکسی کے ذریعے موڑ دیں
      text = text.split(/\r?\n/).map(line => {
        const trimmed = line.trim();
        if (!trimmed) return line;
        if (trimmed.startsWith('#')) return line; // کمنٹ لائنز کو چھوڑ دیں
        try {
          const abs = new URL(trimmed, base).href;
          return `/api/proxy?url=${encodeURIComponent(abs)}`;
        } catch { return line; }
      }).join('\n');

      res.setHeader('content-type', 'application/vnd.apple.mpegurl; charset=utf-8');
      return res.send(text);
    }

    // دیگر فائلز (جیسے .ts ویڈیو سیگمنٹس) کے لیے
    res.setHeader('content-type', contentType || 'application/octet-stream');
    const buffer = Buffer.from(await upstream.arrayBuffer());
    return res.send(buffer);

  } catch (err) {
    return res.status(502).send(`Proxy error: ${err.message}`);
  }
};
