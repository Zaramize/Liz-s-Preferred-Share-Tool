# Free version — what's different from the paid one

Zero *required* cost. One optional AI feature uses a real, genuinely-free
API key you get yourself (no credit card) — everything else needs nothing.

## Issuer / IR page lookup + optional AI parsing (this update)
- "Look up issuer (IR page)" tab: pick a known issuer (auto-fills its IR
  URL) or paste any URL. Fetches it server-side via `fetch-page.js` (avoids
  browser CORS problems) and shows the plain text.
- Same for the PDF tab: pdf.js extracts text client-side, free, no key.
- Both tabs get two ways to fill the form from that text:
  1. **"Use pattern guesses in Manual entry →"** — the free regex-based
     guessing from before (ticker/rate/spread/date patterns). Always
     available, no setup required.
  2. **"✨ Parse with AI (free, needs Gemini key)"** — sends the text to
     Google's Gemini 2.5 Flash for real structured extraction (issuer,
     series name, type, par, rate, spread, both reset dates, cumulative
     flag, conversion terms) — much better quality than regex, closer to
     what the paid Claude version did.

## Setting up the free Gemini key (optional, ~2 minutes)
1. Go to https://aistudio.google.com/apikey and sign in with a Google
   account. No credit card required.
2. Create an API key.
3. In Netlify: **Site settings → Environment variables**, add
   `GEMINI_API_KEY` = the key you just created.
4. Redeploy (env var changes need a new deploy to take effect).

**Do not enable billing** on the Google Cloud project tied to that key —
the moment you do, the free tier disappears and every call becomes
billable. Leave it as a free/unbilled project.

Free tier limits (subject to Google changing them): roughly 10 requests/min,
250 requests/day on Gemini 2.5 Flash — miles more than you'd hit clicking
"Parse with AI" a few times per holding. If you ever do hit the limit, the
button will show an error; wait a minute and retry, or fall back to pattern
guesses / manual entry.

**Privacy note:** on the free tier, Google may use your prompts/responses to
improve their products (that's the tradeoff for it being free). Fine for
public IR-page text; worth knowing since it differs from how the paid
Claude version handled things.

If you skip this setup entirely, the app still works exactly as before —
the AI button will just show a "GEMINI_API_KEY is not set" error, and
pattern guesses / manual entry still work.

## Everything else, unchanged
- Yahoo Finance price refresh (`yahoo-quote.js`)
- Bank of Canada Valet API reference rates
- Manual entry
- Import from `extractor.py` JSON output
- All yield math, localStorage watchlist, auto-refresh toggle

**Curated issuer list** is still small (Enbridge, RBC) — edit the
`KNOWN_ISSUERS` array in `index.html` to add more; the "Find IR page on
Google" button covers anything not in the list.

## Deploy
Push to GitHub, connect in Netlify. `netlify.toml` picks up all three
functions (`yahoo-quote.js`, `fetch-page.js`, `gemini-proxy.js`)
automatically. Only `GEMINI_API_KEY` is optional/needed, and only if you
want the AI-parse button.
