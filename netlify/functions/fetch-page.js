// Fetches a page (an issuer's investor-relations page, a press release, etc.)
// server-side and returns plain text. Free — no AI, no paid API, just an
// HTML tag strip. Browsers can't reliably fetch arbitrary third-party sites
// due to CORS, so this runs on Netlify's side instead.

function stripHtml(html) {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|p|div|tr|li|h[1-6])[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
  return text;
}

exports.handler = async function (event) {
  const url = event.queryStringParameters && event.queryStringParameters.url;
  if (!url) {
    return { statusCode: 400, body: JSON.stringify({ error: 'missing url query param' }) };
  }
  let parsed;
  try {
    parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('bad protocol');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'invalid url' }) };
  }

  try {
    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PreferredShareTracker/1.0)' },
      redirect: 'follow'
    });
    if (!upstream.ok) {
      return { statusCode: upstream.status, body: JSON.stringify({ error: 'upstream returned ' + upstream.status }) };
    }
    const contentType = upstream.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return { statusCode: 415, body: JSON.stringify({ error: 'not an HTML page (content-type: ' + contentType + ') — PDFs should go through the PDF tab instead' }) };
    }
    const html = await upstream.text();
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const text = stripHtml(html).slice(0, 50000); // cap to keep the response reasonable
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, title: titleMatch ? titleMatch[1].trim() : null, text })
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Failed to fetch that page', detail: String(err) })
    };
  }
};
