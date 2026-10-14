# Anatomy of a Website

**Live:** https://webanatomy.vercel.app

An illustrated, growing encyclopedia of how a website works, from the DNS lookup to the pixels, and from the `<head>` tag to search results and AI answers.

**The idea:** SEO and GEO start with the website. If the foundation is weak, no keyword strategy or AI optimization can fix it.

## What's inside

1. **The journey of a request**: an animated diagram that follows one page load through DNS, TLS, the CDN edge, the origin and the database, back to the browser, plus the crawlers that make the same trip.
2. **The layers**: the stack of a website (network, hosting, backend, HTML, CSS, JS, assets, SEO/GEO, quality, workflow), split into what visitors see and what only machines read.
3. **One head, three audiences**: an example `<head>` linked line by line to the search result, the social card and the AI answer it produces.
4. **Encyclopedia**: 64 terms, each with a plain-English definition, how it works, a real snippet and related terms. It's searchable and filterable, every entry can be deep-linked (`#canonical`), and every term has its own static page ([/terms/canonical](https://webanatomy.vercel.app/terms/canonical), A–Z at [/terms](https://webanatomy.vercel.app/terms)).

**Simple version** ([/basics](https://webanatomy.vercel.app/basics)): the website explained as a restaurant, what happens when you visit, how Google and AI find you, and a history of the web from 1969 to AI search.

## Run it

No build step. Open `index.html`, or serve the folder:

```
python3 -m http.server 8000
```

## Build

The site has no build step to *run* it, but the static parts come from `data.js`. After editing it:

```
node scripts/build.mjs
```

This regenerates `terms/<id>.html` (one page per term), `terms/index.html`, the server-rendered term list inside `index.html` (so crawlers and no-JS visitors get every definition), and `sitemap.xml`. Term `lastmod` dates only change when that term's content changes (tracked in `scripts/lastmod.json`). Commit everything it writes.

## Add an entry

All content lives in [`data.js`](data.js). Add an object to `TERMS`:

```js
{ id: "hsts", layer: "quality", term: "HSTS",
  short: "One line.", body: "A few sentences.", code: "optional snippet",
  related: ["https-tls"] }
```

Then run `node scripts/build.mjs`.
