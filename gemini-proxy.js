// Proxies to Google's Gemini API (generativelanguage.googleapis.com).
// Uses Gemini 2.5 Flash, which has a genuine free tier (rate-limited, no
// credit card) as long as billing is never enabled on the Google Cloud
// project the key belongs to. The key lives only here (server-side env
// var), never in the browser.
//
// Get a free key at https://aistudio.google.com/apikey and set it in
// Netlify: Site settings -> Environment variables -> GEMINI_API_KEY.

const MODEL = 'gemini-2.5-flash';

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'GEMINI_API_KEY is not set in Netlify environment variables. Get a free key at https://aistudio.google.com/apikey' })
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'invalid JSON body' }) };
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
      return { statusCode: upstream.status, headers: { 'Content-Type': 'application/json' }, body: text };
    }
    const data = JSON.parse(text);
    const candidateText = data.candidates && data.candidates[0] && data.candidates[0].content &&
      data.candidates[0].content.parts ? data.candidates[0].content.parts.map(p => p.text || '').join('') : '';
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: candidateText })
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Upstream request to Gemini API failed', detail: String(err) })
    };
  }
};
