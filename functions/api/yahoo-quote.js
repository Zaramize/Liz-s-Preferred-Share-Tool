// Cloudflare Pages Function — lives at /api/yahoo-quote
// Proxies Yahoo Finance chart/quote requests server-side to avoid browser CORS blocks.

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const symbol = url.searchParams.get('symbol');
  if (!symbol) {
    return new Response(JSON.stringify({ error: 'missing symbol query param' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const upstream = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol),
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PreferredShareTracker/1.0)' } }
    );
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Upstream request to Yahoo Finance failed', detail: String(err) }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
