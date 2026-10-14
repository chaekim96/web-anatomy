// Builds the static parts of the site from data.js. No dependencies.
//   node scripts/build.mjs
// Writes: terms/<id>.html (one page per term), terms/index.html (A–Z),
// the server-rendered term list inside index.html, and sitemap.xml.
// Run it after editing data.js, then commit everything it changed.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
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
const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();

/* ── lastmod ─────────────────────────────────────────────
   Hand-written pages: date of the last commit touching their sources,
   or today if those files have uncommitted changes.
   Term pages: today when the term's content (or the page template) changes,
   remembered in scripts/lastmod.json so unrelated edits don't bump them. */
const git = (...a) => { try { return execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return ""; } };
const gitDate = files => git("status", "--porcelain", "--", ...files) ? today : (git("log", "-1", "--format=%cs", "--", ...files) || today);

const TEMPLATE_VERSION = 1; // bump when the term page markup changes meaningfully
const LM_FILE = "scripts/lastmod.json";
const lm = existsSync(p(LM_FILE)) ? JSON.parse(readFileSync(p(LM_FILE), "utf8")) : {};
const nextLm = {};
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
  <link rel="canonical" href="${url}">
  <meta name="twitter:card" content="summary">
  <meta name="theme-color" content="#f7f7f5" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#121212" media="(prefers-color-scheme: dark)">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/style.css">
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
write("index.html", idx
  .replace(new RegExp(`${reEsc(START)}[\\s\\S]*?${reEsc(END)}`), () => `${START}\n${TERMS.map(staticCard).join("\n")}\n        ${END}`)
  .replace(/<span id="term-total">\d*<\/span>/, `<span id="term-total">${TERMS.length}</span>`));

/* ── 4 · sitemap ─────────────────────────────────────── */
writeFileSync(p(LM_FILE), JSON.stringify(nextLm, null, 2) + "\n");
const urls = [
  // Content files only: a CSS tweak doesn't change what a page says.
  ["/", gitDate(["index.html", "app.js", "data.js"])],
  ["/basics", gitDate(["basics.html"])],
  ["/terms", indexDate],
  ...TERMS.map(t => [`/terms/${t.id}`, nextLm[t.id].date])
];
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, d]) => `  <url><loc>${SITE}${u}</loc><lastmod>${d}</lastmod></url>`).join("\n")}
</urlset>
`);
console.log(`Built ${TERMS.length} term pages, ${urls.length} sitemap URLs.`);
