// Cloudflare Pages Function — lives at /api/fetch-page
// Fetches a page (issuer IR page, press release, etc.) server-side and
// returns plain text. Free — no AI, no paid API, just an HTML tag strip.

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

export async function onRequestGet(context) {
  const reqUrl = new URL(context.request.url);
  const targetUrl = reqUrl.searchParams.get('url');
  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'missing url query param' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let parsed;
  try {
    parsed = new URL(targetUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('bad protocol');
  } catch (e) {
    return new Response(JSON.stringify({ error: 'invalid url' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const upstream = await fetch(targetUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PreferredShareTracker/1.0)' },
      redirect: 'follow'
    });
    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: 'upstream returned ' + upstream.status }), {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    const contentType = upstream.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return new Response(JSON.stringify({ error: 'not an HTML page (content-type: ' + contentType + ') — PDFs should go through the PDF tab instead' }), {
        status: 415,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    const html = await upstream.text();
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const text = stripHtml(html).slice(0, 50000);
    return new Response(JSON.stringify({ url: targetUrl, title: titleMatch ? titleMatch[1].trim() : null, text }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to fetch that page', detail: String(err) }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
