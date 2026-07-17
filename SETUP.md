# Cloudflare Pages setup

This is the Cloudflare Pages version of the tracker — same app, functions
rewritten from Netlify's format to Cloudflare's.

## Repo structure

Push this exact structure to GitHub:

```
your-repo/
├── index.html
├── SETUP.md
└── functions/
    └── api/
        ├── yahoo-quote.js
        ├── fetch-page.js
        └── gemini-proxy.js
```

No config file is required — Cloudflare Pages auto-detects the `functions/`
folder and maps each file to a route: `functions/api/yahoo-quote.js` becomes
`/api/yahoo-quote`, etc. `index.html` in the repo root is served as the site.

## Connect the repo

1. In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**
2. Pick this repo
3. Build settings: leave **Build command** blank and **Build output
   directory** as `/` (this is a static site with no build step — Cloudflare
   just needs to serve the files as-is)
4. Deploy

## Set the Gemini key (optional — only needed for the "Parse with AI" buttons)

1. Get a free key at https://aistudio.google.com/apikey (no credit card)
2. In your Pages project: **Settings → Environment variables**
3. Add `GEMINI_API_KEY` — set it for **both Production and Preview**
   (Cloudflare Pages doesn't share variables between them automatically)
4. Redeploy (env var changes need a new deploy, same as Netlify did)

**Do not enable billing** on the Google Cloud project tied to that key, or
the Gemini free tier disappears and calls become billable.

Everything else about the app — Yahoo price refresh, Bank of Canada
reference rates, manual entry, PDF reading, pattern guesses, localStorage
watchlist — works identically to the Netlify version. Only the three
function files and the URLs `index.html` calls them at changed.

## Free tier limits (Cloudflare Pages)

- 500 builds/month
- Unlimited bandwidth
- Functions: 100,000 requests/day (shared with Cloudflare Workers free quota)
- No credit card required, no expiring trial credits

For a personal tool refreshed a handful of times a day, none of these are
realistic to hit.
