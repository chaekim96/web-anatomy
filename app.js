(() => {
  const LAYERS = window.LAYERS, TERMS = window.TERMS, JOURNEY = window.JOURNEY;
  const byId = Object.fromEntries(TERMS.map(t => [t.id, t]));
  const layerOf = Object.fromEntries(LAYERS.map(l => [l.id, l]));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = s => document.querySelector(s);
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const k of kids) n.append(k);
    return n;
  };
  const svgEl = (tag, attrs = {}) => {
    const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  const termChip = id => el("button", { class: "chip", type: "button", onclick: () => openTerm(id) },
    el("span", { class: "dot", style: `background:var(--l-${byId[id].layer})` }), byId[id].term);

  /* ── 1 · Journey diagram ─────────────────────────────── */
  const NODES = {
    browser: ["Browser", "you"],
    dns: ["DNS resolver", "name → IP"],
    edge: ["CDN edge", "nearest copy"],
    origin: ["Origin", "server / function"],
    db: ["Database", "stored data"],
    crawler: ["Crawler", "Googlebot · AI bots"]
  };
  const LAYOUTS = {
    wide: { w: 960, h: 330, nw: 136, nh: 58, pos: {
      browser: [90, 165], dns: [300, 62], edge: [490, 165], origin: [690, 165], db: [875, 165], crawler: [300, 270] } },
    tall: { w: 360, h: 420, nw: 128, nh: 54, pos: {
      browser: [92, 50], dns: [272, 50], edge: [92, 160], crawler: [272, 160], origin: [92, 265], db: [92, 370] } }
  };
  const WIRES = [["browser", "dns"], ["browser", "edge"], ["crawler", "edge"], ["edge", "origin"], ["origin", "db"]];
  const svg = $("#journey-svg");
  let layout, step = 0, timer = null;

  function drawDiagram() {
    const L = window.innerWidth < 640 ? LAYOUTS.tall : LAYOUTS.wide;
    if (L === layout) return;
    layout = L;
    svg.setAttribute("viewBox", `0 0 ${L.w} ${L.h}`);
    [...svg.querySelectorAll(":scope > :not(title)")].forEach(n => n.remove());
    for (const [a, b] of WIRES) {
      const [x1, y1] = L.pos[a], [x2, y2] = L.pos[b];
      svg.append(svgEl("line", { class: "wire", "data-w": `${a}-${b}`, x1, y1, x2, y2 }));
    }
    for (const [id, [label, sub]] of Object.entries(NODES)) {
      const [x, y] = L.pos[id];
      const g = svgEl("g", { class: "node", "data-n": id });
      g.append(svgEl("rect", { x: x - L.nw / 2, y: y - L.nh / 2, width: L.nw, height: L.nh, rx: 12 }));
      const t1 = svgEl("text", { class: "n-label", x, y: y - 3, "text-anchor": "middle" }); t1.textContent = label;
      const t2 = svgEl("text", { class: "n-sub", x, y: y + 15, "text-anchor": "middle" }); t2.textContent = sub;
      g.append(t1, t2); svg.append(g);
    }
    const p = svgEl("g", { id: "packet" });
    p.append(svgEl("circle", { class: "packet-ring", r: 13 }), svgEl("circle", { class: "packet", r: 7 }));
    svg.append(p);
    render(false);
  }

  function render(animate = true) {
    const s = JOURNEY[step];
    $("#j-title").textContent = s.title;
    $("#j-text").textContent = s.text;
    $("#j-count").textContent = `${step + 1} / ${JOURNEY.length}`;
    $("#j-terms").replaceChildren(...s.terms.map(termChip));
    document.querySelectorAll("#j-steps button").forEach((b, i) =>
      i === step ? b.setAttribute("aria-current", "step") : b.removeAttribute("aria-current"));

    svg.querySelectorAll(".node").forEach(n => n.classList.toggle("on", s.at.includes(n.dataset.n)));
    const hops = s.move.slice(1).map((b, i) => [s.move[i], b]);
    svg.querySelectorAll(".wire").forEach(w => {
      const [a, b] = w.dataset.w.split("-");
      w.classList.toggle("on", hops.some(([x, y]) => (x === a && y === b) || (x === b && y === a)));
    });

    // Packet travels the path, offset so it rides on top of the node box edge.
    const pts = s.move.map(id => layout.pos[id]);
    const packet = svg.querySelector("#packet");
    const frames = pts.map(([x, y]) => ({ transform: `translate(${x}px, ${y - layout.nh / 2 - 2}px)` }));
    packet.getAnimations().forEach(a => a.cancel());
    if (!animate || reduced || frames.length === 1) {
      packet.style.transform = frames[frames.length - 1].transform;
    } else {
      packet.animate(frames, { duration: 650 * (frames.length - 1), easing: "ease-in-out", fill: "forwards" })
        .finished.then(() => { packet.style.transform = frames[frames.length - 1].transform; }).catch(() => {});
    }
  }

  function go(i) { step = (i + JOURNEY.length) % JOURNEY.length; render(); }
  function stop() { clearInterval(timer); timer = null; $("#j-play").textContent = "▶ Play"; $("#j-play").setAttribute("aria-label", "Play"); }
  $("#j-prev").onclick = () => { stop(); go(step - 1); };
  $("#j-next").onclick = () => { stop(); go(step + 1); };
  $("#j-play").onclick = () => {
    if (timer) return stop();
    $("#j-play").textContent = "❚❚ Pause"; $("#j-play").setAttribute("aria-label", "Pause");
    if (step === JOURNEY.length - 1) go(0);
    timer = setInterval(() => step === JOURNEY.length - 1 ? stop() : go(step + 1), 4200);
  };
  $("#j-steps").replaceChildren(...JOURNEY.map((s, i) =>
    el("li", {}, el("button", { type: "button", title: s.title, onclick: () => { stop(); go(i); } }, `${i + 1}. ${s.title}`))));
  drawDiagram();
  addEventListener("resize", drawDiagram);

  /* ── 2 · Layer stack ─────────────────────────────────── */
  const GROUPS = { network: "Underneath: the visitor never sees it", html: "The page: what visitors experience", seo: "Around everything" };
  const stack = $("#layer-stack");
  for (const l of LAYERS) {
    if (GROUPS[l.id]) stack.append(el("div", { class: "stack-label" }, GROUPS[l.id]));
    const count = TERMS.filter(t => t.layer === l.id).length;
    stack.append(el("button", { class: "layer", type: "button", onclick: () => { setFilter(l.id); $("#encyclopedia").scrollIntoView(); } },
      el("span", { class: "bar", style: `background:var(--l-${l.id})` }),
      el("span", {}, el("b", {}, l.name), el("p", {}, l.blurb)),
      el("span", { class: "who" }, el("em", {}, l.who), `${count} terms`)));
  }

  /* ── 3 · Head anatomy linking ────────────────────────── */
  const hot = k => document.querySelectorAll("[data-k]").forEach(n => n.classList.toggle("hot", n.dataset.k === k));
  document.querySelectorAll(".head-code .ln, .surfaces [data-k]").forEach(n => {
    n.addEventListener("mouseenter", () => hot(n.dataset.k));
    n.addEventListener("mouseleave", () => hot(null));
    n.addEventListener("focus", () => hot(n.dataset.k));
    n.addEventListener("blur", () => hot(null));
    n.addEventListener("click", () => hot(n.dataset.k));
  });

  /* ── 4 · Encyclopedia ────────────────────────────────── */
  $("#term-total").textContent = TERMS.length;
  let filter = "all";
  const q = $("#q"), list = $("#terms"), filters = $("#filters");

  const cards = TERMS.map(t => {
    const body = el("div", { class: "t-body" }, el("p", {}, t.body));
    if (t.code) body.append(el("pre", { class: "code" }, el("code", {}, t.code)));
    if (t.related?.length) body.append(el("div", { class: "rel" }, "Related:", ...t.related.filter(r => byId[r]).map(termChip)));
    const d = el("details", { class: "term", id: t.id, style: `--c:var(--l-${t.layer})` },
      el("summary", {},
        el("span", { class: "t-name" }, t.term, el("span", { class: "t-layer" }, layerOf[t.layer].name)),
        el("span", { class: "t-short" }, t.short)),
      body);
    d.addEventListener("toggle", () => {
      d.classList.toggle("open", d.open);
      if (d.open) history.replaceState(null, "", `#${t.id}`);
    });
    d._text = `${t.term} ${t.short} ${t.body} ${layerOf[t.layer].name}`.toLowerCase();
    d._layer = t.layer;
    return d;
  });
  list.append(...cards);

  filters.append(el("button", { class: "chip", type: "button", "data-f": "all", onclick: () => setFilter("all") }, "All"),
    ...LAYERS.map(l => el("button", { class: "chip", type: "button", "data-f": l.id, onclick: () => setFilter(l.id) },
      el("span", { class: "dot", style: `background:var(--l-${l.id})` }), l.name)));

  function apply() {
    const words = q.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const c of cards) {
      const ok = (filter === "all" || c._layer === filter) && words.every(w => c._text.includes(w));
      c.hidden = !ok; if (ok) shown++;
    }
    $("#enc-empty").hidden = shown > 0;
    filters.querySelectorAll(".chip").forEach(b => b.setAttribute("aria-pressed", b.dataset.f === filter));
  }
  function setFilter(f) { filter = f; apply(); }
  q.addEventListener("input", apply);

  function openTerm(id) {
    const c = document.getElementById(id);
    if (!c) return;
    if (c.hidden) { q.value = ""; filter = "all"; apply(); }
    c.open = true;
    c.scrollIntoView({ block: "start" });
    c.classList.remove("flash"); void c.offsetWidth; c.classList.add("flash");
  }
  apply();
  if (location.hash && byId[location.hash.slice(1)]) openTerm(location.hash.slice(1));
})();
