// Cloudflare Pages Function — lives at /api/gemini-proxy
// Proxies to Google's Gemini API (generativelanguage.googleapis.com).
//
// Tries a chain of model aliases in order — Flash-Lite first (smaller
// model, far fewer apps default to it, so it usually has real free-tier
// headroom left even when full Flash is congested), then full Flash as a
// fallback. Using aliases instead of hardcoded versions avoids breaking
// every time Google retires an old model.
//
// NOTE: Grounding with Google Search was tried here and reverted — it draws
// from a separate quota that appears to be billing-only (not part of the
// genuine no-credit-card free tier), and exhausted almost immediately in
// testing. This proxy sends plain structured-JSON requests only, which use
// the real free tier (1,500 requests/day per model as of when this was
// written) — available as long as billing is never enabled on the Google
// Cloud project the key belongs to. The key lives only here (server-side
// env var), never in the browser.
//
// Get a free key at https://aistudio.google.com/apikey and set it in
// Cloudflare Pages: Project > Settings > Environment variables ->
// GEMINI_API_KEY (set for both Production and Preview).

const MODEL_CHAIN = ['gemini-flash-lite-latest', 'gemini-flash-latest'];

function isTransient(status, bodyText){
  return status === 503 || /overloaded|high demand|unavailable/i.test(bodyText || '');
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

  const contents = [];
  if (Array.isArray(payload.history)) {
    for (const turn of payload.history) {
      if (turn && turn.text && (turn.role === 'user' || turn.role === 'assistant')) {
        contents.push({ role: turn.role === 'assistant' ? 'model' : 'user', parts: [{ text: turn.text }] });
      }
    }
  }
  contents.push({ role: 'user', parts });

  const body = { contents };
  // Existing callers (term extraction) never set jsonMode, so this defaults
  // to true and behaves exactly as before. The new chat feature passes
  // jsonMode:false to get a plain conversational reply instead of forced JSON.
  if (payload.jsonMode !== false) {
    body.generationConfig = { responseMimeType: 'application/json' };
  }
  if (payload.systemInstruction) {
    body.systemInstruction = { parts: [{ text: payload.systemInstruction }] };
  }

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
        return new Response(JSON.stringify({ text: candidateText, modelUsed: model, sources: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      lastText = text; lastStatus = upstream.status;
      if (!isTransient(upstream.status, text)) {
        // Non-transient failure (bad request, invalid key, quota exhausted, etc.)
        // — no point trying the next model, quota exhaustion applies account-wide.
        return new Response(text, { status: upstream.status, headers: { 'Content-Type': 'application/json' } });
      }
      // Transient (server overloaded) — fall through and try the next model in the chain.
    } catch (err) {
      lastText = JSON.stringify({ error: { message: String(err) } });
      lastStatus = 502;
    }
  }
  // Every model in the chain failed with a transient error.
  return new Response(lastText, { status: lastStatus, headers: { 'Content-Type': 'application/json' } });
}
