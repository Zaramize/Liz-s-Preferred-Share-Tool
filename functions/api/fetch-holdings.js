// functions/api/fetch-holdings.js
const ALLOWED_HOSTS = ['stockanalysis.com'];

export async function onRequestGet({ request }) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');
  if (!targetUrl) return jsonResponse({ error: 'Missing "url" query parameter.' }, 400);

  let parsed;
  try { parsed = new URL(targetUrl); }
  catch (e) { return jsonResponse({ error: 'Invalid URL.' }, 400); }

  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return jsonResponse({ error: `Host "${parsed.hostname}" is not on the allowlist.` }, 403);
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });
    if (!upstream.ok) return jsonResponse({ error: `Upstream returned HTTP ${upstream.status}` }, 502);
    const html = await upstream.text();
    return jsonResponse({ html });
  } catch (e) {
    return jsonResponse({ error: 'Fetch failed: ' + e.message }, 502);
  }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
