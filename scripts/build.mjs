// Builds the static parts of the site from data.js. No dependencies.
//   node scripts/build.mjs
// Writes: terms/<id>.html (one page per term), terms/index.html (A–Z),
// the server-rendered term list and term count inside index.html,
// fingerprinted asset links (style.css?v=…) in every page, and sitemap.xml.
// Run it after editing any page, data.js, app.js or style.css, then commit
// everything it changed.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";

const ROOT = new URL("..", import.meta.url).pathname;
const SITE = "https://webanatomy.vercel.app";
const p = f => ROOT + f;

const ctx = { window: {} };
vm.runInNewContext(readFileSync(p("data.js"), "utf8"), ctx);
const { LAYERS, TERMS, JOURNEY } = ctx.window;
const byId = Object.fromEntries(TERMS.map(t => [t.id, t]));
const layerOf = Object.fromEntries(LAYERS.map(l => [l.id, l]));

for (const t of TERMS) {
  if (!/^[a-z0-9-]+$/.test(t.id)) throw new Error(`Bad term id: ${t.id}`);
  for (const r of t.related || []) if (!byId[r]) console.warn(`  ${t.id}: related "${r}" does not exist`);
}

const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const write = (f, s) => {
  const old = existsSync(p(f)) ? readFileSync(p(f), "utf8") : null;
  if (old !== s) { writeFileSync(p(f), s); console.log(`  wrote ${f}`); }
};
/* ── asset fingerprints ──────────────────────────────
   vercel.json caches style.css, app.js and data.js for a year, so every page
   links them as file?v=<hash>; a changed file gets a new URL. */
const V = Object.fromEntries(["style.css", "app.js", "data.js"].map(f =>
  [f, createHash("sha1").update(readFileSync(p(f))).digest("hex").slice(0, 10)]));
const versionLinks = html => html
  .replace(/(href|src)="\/?(style\.css|app\.js|data\.js)(\?v=[0-9a-f]+)?"/g, (_, a, f) => `${a}="/${f}?v=${V[f]}"`)
  .replace(/href="\/?favicon\.svg"/g, 'href="/favicon.svg"');
const unversioned = html => html.replace(/\?v=[0-9a-f]+"/g, '"');

const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();

/* ── lastmod ─────────────────────────────────────────────
   A page's date becomes today only when its content changes, remembered as a
   hash in scripts/lastmod.json so unrelated edits don't bump it.
   Term pages hash the term (and the template version); hand-written pages hash
   their HTML with ?v= fingerprints stripped. */

const TEMPLATE_VERSION = 1; // bump when the term page markup changes meaningfully
const LM_FILE = "scripts/lastmod.json";
const lm = existsSync(p(LM_FILE)) ? JSON.parse(readFileSync(p(LM_FILE), "utf8")) : {};
const nextLm = {};
// Hand-written pages: date changes only when their content (ignoring ?v= fingerprints) does.
const OLD_SITEMAP = existsSync(p("sitemap.xml")) ? readFileSync(p("sitemap.xml"), "utf8") : "";
const pageDate = (key, path, ...texts) => {
  const hash = createHash("sha1").update(JSON.stringify(texts)).digest("hex").slice(0, 12);
  if (lm[key]?.hash === hash) return (nextLm[key] = lm[key]).date;
  const seeded = !lm[key] && OLD_SITEMAP.match(new RegExp(`<loc>${reEsc(SITE + path)}</loc><lastmod>([^<]+)`))?.[1];
  return (nextLm[key] = { hash, date: seeded || today }).date;
};
for (const t of TERMS) {
  const hash = createHash("sha1").update(JSON.stringify([TEMPLATE_VERSION, t])).digest("hex").slice(0, 12);
  nextLm[t.id] = lm[t.id]?.hash === hash ? lm[t.id] : { hash, date: today };
}

/* ── shared chrome ───────────────────────────────────── */
const head = ({ title, desc, url, type = "article", ld }) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:type" content="${type}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${SITE}/og.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Anatomy of a Website: how a website works, from the DNS lookup to the AI answer.">
  <link rel="canonical" href="${url}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="theme-color" content="#f7f7f5" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#121212" media="(prefers-color-scheme: dark)">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="stylesheet" href="/style.css?v=${V["style.css"]}">
  <script type="application/ld+json">
${JSON.stringify(ld, null, 2).replace(/</g, "\\u003c").replace(/^/gm, "  ")}
  </script>
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>

  <header class="top">
    <nav class="wrap nav" aria-label="Sections">
      <a class="brand" href="/">Anatomy<span>of a website</span></a>
      <div class="nav-links">
        <a href="/#journey">Journey</a>
        <a href="/#layers">Layers</a>
        <a href="/terms">All terms</a>
        <a href="/basics">Simple version</a>
      </div>
    </nav>
  </header>
`;
const foot = `
  <footer class="wrap foot">
    <p>Anatomy of a Website, an open, growing encyclopedia by <a href="https://chaekim-portfolio.vercel.app/">Chae Kim</a>. <a href="https://github.com/chaekim96/web-anatomy">Source on GitHub</a>.</p>
  </footer>
</body>
</html>
`;
const AUTHOR = { "@type": "Person", "name": "Chae Kim", "url": "https://chaekim-portfolio.vercel.app/" };
const SET = { "@type": "DefinedTermSet", "name": "Anatomy of a Website: Encyclopedia", "url": `${SITE}/terms` };
const chip = id => `<a class="chip" href="/terms/${id}"><span class="dot" style="background:var(--l-${byId[id].layer})"></span>${esc(byId[id].term)}</a>`;

/* ── 1 · one page per term ───────────────────────────── */
mkdirSync(p("terms"), { recursive: true });
const keep = new Set(["index.html"]);
for (const t of TERMS) {
  const L = layerOf[t.layer];
  const url = `${SITE}/terms/${t.id}`;
  const siblings = TERMS.filter(x => x.layer === t.layer && x.id !== t.id);
  const steps = JOURNEY.map((s, i) => [s, i]).filter(([s]) => s.terms.includes(t.id));
  const related = (t.related || []).filter(r => byId[r]);
  const html = head({
    title: `${t.term}: ${t.short.replace(/\.$/, "")} · Anatomy of a Website`,
    desc: `${t.short} ${t.body}`.slice(0, 300).replace(/\s+\S*$/, "") + "…",
    url,
    ld: {
      "@context": "https://schema.org", "@type": "DefinedTerm",
      "name": t.term, "description": t.short, "url": url,
      "inDefinedTermSet": SET, "author": AUTHOR, "dateModified": nextLm[t.id].date
    }
  }) + `
  <main id="main" class="wrap tp">
    <p class="tp-crumb"><a href="/terms">Encyclopedia</a> / <span style="color:var(--l-${t.layer})">${esc(L.name)}</span></p>
    <h1>${esc(t.term)}</h1>
    <p class="lede">${esc(t.short)}</p>
    <div class="tp-body" style="--c:var(--l-${t.layer})">
      <p>${esc(t.body)}</p>
${t.code ? `      <pre class="code"><code>${esc(t.code)}</code></pre>\n` : ""}    </div>
${related.length ? `    <h2>Related terms</h2>\n    <div class="chips">${related.map(chip).join(" ")}</div>\n` : ""}${steps.length ? `    <h2>Where it shows up in a page load</h2>
    <ol class="tp-steps">
${steps.map(([s, i]) => `      <li><b>Step ${i + 1}: ${esc(s.title)}.</b> ${esc(s.text)}</li>`).join("\n")}
    </ol>
    <p><a href="/#journey">Watch the full request journey →</a></p>
` : ""}    <h2>More in ${esc(L.name)}</h2>
    <p class="tp-layer">${esc(L.blurb)}</p>
    <div class="chips">${siblings.map(x => chip(x.id)).join(" ")}</div>
    <p class="tp-back"><a href="/#${t.id}">Open in the interactive encyclopedia →</a></p>
  </main>
` + foot;
  write(`terms/${t.id}.html`, html);
  keep.add(`${t.id}.html`);
}
for (const f of readdirSync(p("terms"))) if (!keep.has(f)) { unlinkSync(p(`terms/${f}`)); console.log(`  removed terms/${f}`); }

/* ── 2 · A–Z index of all terms ──────────────────────── */
const indexDate = Object.values(nextLm).map(x => x.date).sort().pop();
write("terms/index.html", head({
  title: `Encyclopedia: ${TERMS.length} web terms, explained simply · Anatomy of a Website`,
  desc: `Plain-English definitions of ${TERMS.length} terms that make up a website, from DNS and CDNs to canonical tags, structured data and GEO.`,
  url: `${SITE}/terms`, type: "website",
  ld: { "@context": "https://schema.org", ...SET, "author": AUTHOR,
    "hasDefinedTerm": TERMS.map(t => ({ "@type": "DefinedTerm", "name": t.term, "url": `${SITE}/terms/${t.id}` })) }
}) + `
  <main id="main" class="wrap tp">
    <p class="eyebrow">Encyclopedia</p>
    <h1>${TERMS.length} web terms, explained simply</h1>
    <p class="lede">Every part of a website, grouped by layer. Each term has a plain-English definition, how it works and a real snippet.</p>
${LAYERS.map(L => {
  const ts = TERMS.filter(t => t.layer === L.id);
  return ts.length ? `    <section class="tp-group" style="--c:var(--l-${L.id})">
      <h2>${esc(L.name)}</h2>
      <p class="tp-layer">${esc(L.blurb)}</p>
      <dl>
${ts.map(t => `        <dt><a href="/terms/${t.id}">${esc(t.term)}</a></dt><dd>${esc(t.short)}</dd>`).join("\n")}
      </dl>
    </section>` : "";
}).filter(Boolean).join("\n")}
  </main>
` + foot);

/* ── 3 · server-rendered term list in index.html ─────── */
// Same markup app.js builds, so crawlers and no-JS visitors get every definition.
// app.js replaces it with the interactive version on load.
const staticCard = t => `        <details class="term" id="${t.id}" style="--c:var(--l-${t.layer})">
          <summary><span class="t-name">${esc(t.term)}<span class="t-layer">${esc(layerOf[t.layer].name)}</span></span><span class="t-short">${esc(t.short)}</span></summary>
          <div class="t-body"><p>${esc(t.body)}</p>${t.code ? `<pre class="code"><code>${esc(t.code)}</code></pre>` : ""}<p class="t-link"><a href="/terms/${t.id}">Full page: ${esc(t.term)} →</a></p></div>
        </details>`;
const idx = readFileSync(p("index.html"), "utf8");
const START = "<!-- terms:start (generated by scripts/build.mjs) -->", END = "<!-- terms:end -->";
if (!idx.includes(START) || !idx.includes(END)) throw new Error("index.html is missing the terms markers");
const newIdx = versionLinks(idx
  .replace(new RegExp(`${reEsc(START)}[\\s\\S]*?${reEsc(END)}`), () => `${START}\n${TERMS.map(staticCard).join("\n")}\n        ${END}`)
  .replace(/<span id="term-total">\d*<\/span>/, `<span id="term-total">${TERMS.length}</span>`)
  .replace(/(<meta name="description" content="[^"]*?)\b\d+\+? terms/, `$1${TERMS.length} terms`));
write("index.html", newIdx);

/* ── 3b · other hand-written pages: versioned asset links ── */
const basics = versionLinks(readFileSync(p("basics.html"), "utf8"));
write("basics.html", basics);

/* ── 4 · sitemap ─────────────────────────────────────── */
const urls = [
  // Content only: a CSS or JS tweak (new ?v= fingerprint) doesn't change what a page says.
  ["/", pageDate("page:/", "/", unversioned(newIdx), readFileSync(p("data.js"), "utf8"))],
  ["/basics", pageDate("page:/basics", "/basics", unversioned(basics))],
  ["/terms", indexDate],
  ...TERMS.map(t => [`/terms/${t.id}`, nextLm[t.id].date])
];
writeFileSync(p(LM_FILE), JSON.stringify(nextLm, null, 2) + "\n");
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, d]) => `  <url><loc>${SITE}${u}</loc><lastmod>${d}</lastmod></url>`).join("\n")}
</urlset>
`);
console.log(`Built ${TERMS.length} term pages, ${urls.length} sitemap URLs.`);
