// Renders a 1200x630 link-preview card per term into og/<id>.png, in the same look as og.png.
//   node scripts/build-cards.mjs            (all terms)
//   node scripts/build-cards.mjs dns cdn    (only these)
// Needs Google Chrome (headless) and network access for the Poppins and JetBrains Mono web fonts.
// Rerun after editing a term's name or short line, then run scripts/build.mjs, which links each card.

import { readFileSync, writeFileSync, mkdirSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import vm from "node:vm";

const run = promisify(execFile);
const ROOT = new URL("..", import.meta.url).pathname;
const p = f => ROOT + f;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const ctx = { window: {} };
vm.runInNewContext(readFileSync(p("data.js"), "utf8"), ctx);
const { LAYERS, TERMS } = ctx.window;
const layerOf = Object.fromEntries(LAYERS.map(l => [l.id, l]));
const css = readFileSync(p("style.css"), "utf8");
const hue = id => css.match(new RegExp(`--l-${id}:\\s*(#[0-9a-fA-F]{6})`))[1];
const mark = readFileSync(p("favicon.svg"), "utf8").replace(/^<\?xml[^>]*\?>\s*/, "");
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const CARD = (t, L) => `<!DOCTYPE html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=block">
<style>
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
  body { background: #f9f9f7; font-family: Poppins, system-ui, sans-serif; color: #111110; -webkit-font-smoothing: antialiased; position: relative; }
  .mark { position: absolute; left: 80px; top: 72px; width: 150px; height: 150px; }
  .mark svg { width: 100%; height: 100%; display: block; }
  .head { position: absolute; left: 266px; top: 72px; width: 854px; height: 150px; display: flex; flex-direction: column; justify-content: center; }
  .label { font-size: 20px; font-weight: 600; letter-spacing: .16em; text-transform: uppercase; color: ${hue(t.layer)}; margin-bottom: 2px; }
  h1 { margin: 0; font-size: 88px; line-height: 1.12; font-weight: 600; letter-spacing: -.035em; white-space: nowrap; align-self: flex-start; }
  .desc { position: absolute; left: 80px; top: 300px; width: 1040px; height: 180px; font-size: 40px; line-height: 1.3; color: #3a3a38; }
  .foot { position: absolute; left: 80px; right: 80px; bottom: 62px; display: flex; justify-content: space-between; align-items: center; }
  .by { font-size: 20px; font-weight: 500; letter-spacing: .14em; text-transform: uppercase; color: #6b6b66; display: flex; align-items: center; gap: 14px; }
  .by i { width: 14px; height: 14px; background: #c63d2f; display: block; }
  .url { font: 500 20px "JetBrains Mono", ui-monospace, monospace; color: #6b6b66; }
  .bar { position: absolute; left: 0; right: 0; bottom: 0; height: 12px; background: ${hue(t.layer)}; }
</style></head><body>
<div class="mark">${mark}</div>
<div class="head"><div class="label">${esc(L.name)}</div><h1 id="t">${esc(t.term)}</h1></div>
<div class="desc" id="d">${esc(t.short)}</div>
<div class="foot"><span class="by"><i></i>A Chae Kim build</span><span class="url">webanatomy.vercel.app/terms/${t.id}</span></div>
<div class="bar"></div>
<script>
  // long names and definitions shrink to fit instead of wrapping into each other
  function fit() {
    var t = document.getElementById('t'), s = 88;
    while (t.scrollWidth > 850 && s > 40) { s -= 2; t.style.fontSize = s + 'px'; }
    var d = document.getElementById('d'), z = 40;
    while (d.scrollHeight > 180 && z > 26) { z -= 1; d.style.fontSize = z + 'px'; }
  }
  document.fonts.ready.then(fit);
</script></body></html>`;

const only = new Set(process.argv.slice(2));
const todo = TERMS.filter(t => !only.size || only.has(t.id));
mkdirSync(p("og"), { recursive: true });
const tmp = mkdtempSync(tmpdir() + "/wa-cards-");

async function shoot(t) {
  const src = `${tmp}/${t.id}.html`;
  writeFileSync(src, CARD(t, layerOf[t.layer]));
  await run(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
    "--window-size=1200,630", `--screenshot=${p(`og/${t.id}.png`)}`, "--virtual-time-budget=8000",
    `--user-data-dir=${tmp}/profile-${t.id}`, "file://" + src], { timeout: 60000 });
  console.log("  wrote og/" + t.id + ".png");
}

// a few Chrome instances at a time
const queue = [...todo];
await Promise.all(Array.from({ length: 4 }, async () => { for (let t; (t = queue.shift());) await shoot(t); }));
rmSync(tmp, { recursive: true, force: true });
console.log(`Rendered ${todo.length} cards.`);
