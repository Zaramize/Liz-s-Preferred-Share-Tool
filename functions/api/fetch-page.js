// functions/api/fetch-holdings.js
//
// Server-side fetch for ETF/fund holdings pages (e.g. stockanalysis.com),
// used by the Ladder Comparator tab's "Fetch top holdings" button.
//
// Why this exists: free third-party CORS proxies (corsproxy.io, allorigins,
// etc.) restrict their free tier to sandbox origins (localhost, CodePen,
// GitHub.io) and return 403 for real production domains like this site's
// Cloudflare Pages URL. Fetching server-side, the same way fetch-page.js
// already does for issuer IR pages, sidesteps that entirely — Cloudflare's
// edge is making the request, not the visitor's browser, so there's no CORS
// or proxy-allowlist issue at all.
//
// Place this file at functions/api/fetch-holdings.js in the project (same
// directory as fetch-page.js) and Cloudflare Pages will wire it up to
// /api/fetch-holdings automatically — no extra config needed.

const ALLOWED_HOSTS = [
  'stockanalysis.com'
  // Add more fund-data sources here if you expand beyond stockanalysis.com
  // (e.g. 'ycharts.com'), keeping this as an explicit allowlist rather than
  // an open proxy, so this function can't be used to fetch arbitrary URLs.
];

export async function onRequestGet({ request }) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return jsonResponse({ error: 'Missing "url" query parameter.' }, 400);
  }

  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch (e) {
    return jsonResponse({ error: 'Invalid URL.' }, 400);
  }

  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return jsonResponse({
      error: `Host "${parsed.hostname}" is not on the allowlist for this function. ` +
             `Add it to ALLOWED_HOSTS in functions/api/fetch-holdings.js if you want to fetch from it.`
    }, 403);
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      headers: {
        // A normal browser UA — some fund-data sites block requests with no
        // UA or an obvious server/bot-style UA string.
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });

    if (!upstream.ok) {
      return jsonResponse({ error: `Upstream returned HTTP ${upstream.status}` }, 502);
    }

    const html = await upstream.text();
    return jsonResponse({ html });

  } catch (e) {
    return jsonResponse({ error: 'Fetch failed: ' + e.message }, 502);
  }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
