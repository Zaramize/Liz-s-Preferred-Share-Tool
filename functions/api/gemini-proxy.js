// Cloudflare Pages Function — lives at /api/gemini-proxy
// Proxies to Google's Gemini API (generativelanguage.googleapis.com).
// Uses Gemini's "flash-latest" alias, which Google points at whatever their
// current fast/free-tier-eligible Flash model is. Using the alias instead
// of a hardcoded version (e.g. gemini-2.5-flash) avoids breaking every time
// Google retires an old model version — the free tier (rate-limited, no
// credit card) is available as long as billing is never enabled on the
// Google Cloud project the key belongs to. The key lives only here
// (server-side env var), never in the browser.
//
// Get a free key at https://aistudio.google.com/apikey and set it in
// Cloudflare Pages: Project > Settings > Environment variables ->
// GEMINI_API_KEY (set for both Production and Preview).

// Cloudflare Pages Function — lives at /api/gemini-proxy
// Proxies to Google's Gemini API (generativelanguage.googleapis.com).
// Tries a chain of model aliases in order — Flash-Lite first (smaller model,
// far fewer apps default to it, so it's usually much less congested on the
// free tier), then full Flash as a fallback. Using aliases instead of
// hardcoded versions avoids breaking every time Google retires an old model.
// The free tier (rate-limited, no credit card) is available as long as
// billing is never enabled on the Google Cloud project the key belongs to.
// The key lives only here (server-side env var), never in the browser.
//
// Get a free key at https://aistudio.google.com/apikey and set it in
// Cloudflare Pages: Project > Settings > Environment variables ->
// GEMINI_API_KEY (set for both Production and Preview).

const MODEL_CHAIN = ['gemini-flash-lite-latest', 'gemini-flash-latest'];

function isTransient(status, bodyText){
  return status === 503 || status === 429 || /overloaded|high demand|unavailable/i.test(bodyText || '');
}

export async function onRequestPost(context) {
  const apiKey = context.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'GEMINI_API_KEY is not set in Cloudflare Pages environment variables. Get a free key at https://aistudio.google.com/apikey' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let payload;
  try {
    payload = await context.request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const parts = [{ text: payload.prompt || '' }];
  if (payload.inlineData && payload.inlineData.mimeType && payload.inlineData.data) {
    parts.push({ inlineData: { mimeType: payload.inlineData.mimeType, data: payload.inlineData.data } });
  }

  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { responseMimeType: 'application/json' }
  };

  let lastText = '', lastStatus = 502;
  for (const model of MODEL_CHAIN) {
    try {
      const upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify(body)
        }
      );
      const text = await upstream.text();
      if (upstream.ok) {
        const data = JSON.parse(text);
        const candidateText = data.candidates && data.candidates[0] && data.candidates[0].content &&
          data.candidates[0].content.parts ? data.candidates[0].content.parts.map(p => p.text || '').join('') : '';
        return new Response(JSON.stringify({ text: candidateText, modelUsed: model }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      lastText = text; lastStatus = upstream.status;
      if (!isTransient(upstream.status, text)) {
        // Non-transient failure (bad request, invalid key, etc.) — no point trying the next model.
        return new Response(text, { status: upstream.status, headers: { 'Content-Type': 'application/json' } });
      }
      // Transient (overloaded/rate-limited) — fall through and try the next model in the chain.
    } catch (err) {
      lastText = JSON.stringify({ error: { message: String(err) } });
      lastStatus = 502;
    }
  }
  // Every model in the chain failed with a transient error.
  return new Response(lastText, { status: lastStatus, headers: { 'Content-Type': 'application/json' } });
}
