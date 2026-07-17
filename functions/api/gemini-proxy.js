// Cloudflare Pages Function — lives at /api/gemini-proxy
// Proxies to Google's Gemini API (generativelanguage.googleapis.com).
// Uses Gemini 2.5 Flash, which has a genuine free tier (rate-limited, no
// credit card) as long as billing is never enabled on the Google Cloud
// project the key belongs to. The key lives only here (server-side env
// var), never in the browser.
//
// Get a free key at https://aistudio.google.com/apikey and set it in
// Cloudflare Pages: Project > Settings > Environment variables ->
// GEMINI_API_KEY (set for both Production and Preview).

const MODEL = 'gemini-2.5-flash';

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

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body)
      }
    );
    const text = await upstream.text();
    if (!upstream.ok) {
      return new Response(text, {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    const data = JSON.parse(text);
    const candidateText = data.candidates && data.candidates[0] && data.candidates[0].content &&
      data.candidates[0].content.parts ? data.candidates[0].content.parts.map(p => p.text || '').join('') : '';
    return new Response(JSON.stringify({ text: candidateText }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Upstream request to Gemini API failed', detail: String(err) }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
