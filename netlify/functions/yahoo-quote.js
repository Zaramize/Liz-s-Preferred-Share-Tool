// Proxies Yahoo Finance chart/quote requests server-side.
// Browsers frequently get blocked by CORS hitting Yahoo directly from a
// third-party origin; fetching from a serverless function avoids that.

exports.handler = async function (event) {
  const symbol = event.queryStringParameters && event.queryStringParameters.symbol;
  if (!symbol) {
    return { statusCode: 400, body: JSON.stringify({ error: 'missing symbol query param' }) };
  }

  try {
    const upstream = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol),
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PreferredShareTracker/1.0)' } }
    );
    const text = await upstream.text();
    return {
      statusCode: upstream.status,
      headers: { 'Content-Type': 'application/json' },
      body: text
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Upstream request to Yahoo Finance failed', detail: String(err) })
    };
  }
};
