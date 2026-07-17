// Cloudflare Pages Function — lives at /api/gemini-proxy
// Proxies to Google's Gemini API (generativelanguage.googleapis.com).
//
// Tries a chain of model aliases in order — Flash-Lite first (smaller
// model, far fewer apps default to it, so it usually has real free-tier
// headroom left even when full Flash is congested), then full Flash as a
// fallback. Using aliases instead of hardcoded versions avoids breaking
// every time Google retires an old model.
//
// Grounds every extraction in a live Google Search (in addition to whatever
// page/PDF text the client sends) so the model can verify against real,
// current sources — e.g. an issuer's own press release — instead of relying
// solely on one page's text, which is what caused wrong-series mix-ups on
// pages listing many series at once. Combining Search grounding with
// structured JSON output only works on Gemini 3-series models, which is
// what both aliases above resolve to as of when this was written.
//
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
    tools: [{ google_search: {} }],
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
          data.candidates[0].content.parts
            ? data.candidates[0].content.parts.filter(p => !p.thought).map(p => p.text || '').join('')
            : '';
        const groundingChunks = data.candidates && data.candidates[0] && data.candidates[0].groundingMetadata &&
          data.candidates[0].groundingMetadata.groundingChunks || [];
        const sources = groundingChunks
          .map(c => c.web && c.web.uri ? { uri: c.web.uri, title: c.web.title || c.web.uri } : null)
          .filter(Boolean);
        return new Response(JSON.stringify({ text: candidateText, modelUsed: model, sources }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      lastText = text; lastStatus = upstream.status;
      if (!isTransient(upstream.status, text)) {
        // Non-transient failure (bad request, invalid key, etc.) — no point trying the next model.
        // If the failure looks like the tools+JSON combo being rejected on this model, retry
        // once without grounding rather than giving up outright.
        if (/tool|function calling.*unsupported|INVALID_ARGUMENT/i.test(text)) {
          try {
            const fallbackBody = { contents: body.contents, generationConfig: body.generationConfig };
            const retryResp = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
                body: JSON.stringify(fallbackBody)
              }
            );
            const retryText = await retryResp.text();
            if (retryResp.ok) {
              const data = JSON.parse(retryText);
              const candidateText = data.candidates && data.candidates[0] && data.candidates[0].content &&
                data.candidates[0].content.parts
                  ? data.candidates[0].content.parts.filter(p => !p.thought).map(p => p.text || '').join('')
                  : '';
              return new Response(JSON.stringify({ text: candidateText, modelUsed: model, sources: [], groundingUnavailable: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          } catch (e) { /* fall through to returning the original error below */ }
        }
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
