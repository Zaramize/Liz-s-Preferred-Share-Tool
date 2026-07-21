// Cloudflare Pages Function — lives at /api/tsx-symbols
// Fetches TSX's public listed-symbol directory server-side (to dodge browser
// CORS blocks) and parses it into { ticker, name, exchange } rows. This file
// lists every TSX/TSXV-listed security, including every outstanding preferred
// series per issuer (e.g. ENB.PF.A, ENB.PR.B, ...) — free, no AI, no key.
// Cached at the edge for a few hours since it only updates periodically.

const SOURCE_URL = 'https://www.tsx.com/files/trading/moc-eligible-stocks.txt';

export async function onRequestGet(context) {
  try {
    const upstream = await fetch(SOURCE_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PreferredShareTracker/1.0)' }
    });
    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: 'upstream returned ' + upstream.status }), {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    const raw = await upstream.text();
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    const symbols = [];
    for (const line of lines) {
      // Rows are tab-separated: TICKER \t NAME \t EXCHANGE
      const parts = line.split('\t').map(p => p.trim()).filter(Boolean);
      if (parts.length < 2) continue;
      const [ticker, name, exchange] = parts;
      // Skip the "As of <date>" header line and anything that isn't a real ticker
      if (!/^[A-Z0-9.]+$/.test(ticker)) continue;
      symbols.push({ ticker, name, exchange: exchange || null });
    }
    if (!symbols.length) {
      return new Response(JSON.stringify({ error: 'parsed zero symbols — source format may have changed' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({
      symbols,
      count: symbols.length,
      source: SOURCE_URL,
      fetchedAt: new Date().toISOString()
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // Edge-cache for 6h — this directory doesn't change intraday, and it
        // saves re-fetching/re-parsing a multi-thousand-line file on every user.
        'Cache-Control': 'public, max-age=21600'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to fetch TSX symbol directory', detail: String(err) }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
