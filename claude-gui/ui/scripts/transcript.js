/* ======================= Prvky přepisu ======================= */

const IMG_RE = /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i;
const thumbCache = new Map();

function loadThumb(path) {
  if (!thumbCache.has(path)) {
    thumbCache.set(path, apiJson("/api/file_data?path=" + encodeURIComponent(path)).then((d) => d.data));
  }
  return thumbCache.get(path);
}

function openLightbox(src, caption) {
  $("lbImg").src = src;
  $("lbImg").classList.remove("full");
  $("lbCap").textContent = caption || "";
  $("lightbox").hidden = false;
}
function closeLightbox() { $("lightbox").hidden = true; $("lbImg").removeAttribute("src"); }

function thumbEl(path) {
  const name = path.split("/").pop();
  const b = document.createElement("button");
  b.type = "button";
  b.className = "att-thumb loading";
  b.title = name + " (kliknutím zvětšit)";
  b.setAttribute("aria-label", "Zvětšit obrázek " + name);
  loadThumb(path).then((src) => {
    const im = document.createElement("img");
    im.alt = name;
    im.src = src;
    b.classList.remove("loading");
    b.appendChild(im);
    b.addEventListener("click", () => openLightbox(src, name));
  }).catch(() => {
    b.className = "att-badge";
    b.disabled = true;
    b.title = name + " (soubor už není k dispozici)";
    b.innerHTML = ICONS.image + "<span></span>";
    b.lastChild.textContent = name;
  });
  return b;
}

const ATT_RE = /\n*\[Přílohy[^\]]*\]\n((?:- .*(?:\n|$))+)\s*$/;

function userEl(text, images) {
  const wrap = document.createElement("div");
  wrap.className = "msg user";
  const b = document.createElement("div");
  b.className = "bubble";
  let files = [];
  const am = ATT_RE.exec(text || "");
  if (am) {
    files = am[1].trim().split("\n").map((l) => l.slice(2).trim());
    text = text.slice(0, am.index);
  }
  b.textContent = text || "";
  if (files.length) {
    const row = document.createElement("div");
    row.className = "att-row";
    for (const f of files) {
      if (IMG_RE.test(f)) { row.appendChild(thumbEl(f)); continue; }
      const chip = document.createElement("span");
      chip.className = "att-badge";
      chip.title = f;
      chip.innerHTML = (/\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(f) ? ICONS.image : ICONS.file) + "<span></span>";
      chip.lastChild.textContent = f.split("/").pop();
      row.appendChild(chip);
    }
    b.appendChild(row);
  }
  if (images && !files.length) {
    const badge = document.createElement("div");
    badge.className = "img-badge";
    badge.innerHTML = ICONS.image + "<span></span>";
    badge.lastChild.textContent = images + " " + plural(images, "obrázek", "obrázky", "obrázků");
    b.appendChild(badge);
  }
  wrap.appendChild(b);
  wrap._text = text || "";
  const act = document.createElement("div");
  act.className = "msg-actions";
  act.innerHTML = '<button type="button" class="ma-btn" data-ma="copy" title="Kopírovat">' + ICONS.copy + '</button>' +
    '<button type="button" class="ma-btn" data-ma="edit" title="Upravit a poslat znovu">' + ICONS.pencil + '</button>' +
    '<button type="button" class="ma-btn" data-ma="branch" title="Větvit odtud (nová konverzace)">' + ICONS.branch + '</button>';
  wrap.appendChild(act);
  return wrap;
}

function provLabel(name) {
  const d = document.createElement("div");
  d.className = "prov-label";
  d.textContent = name;
  return d;
}

function assistantEl() {
  const el = document.createElement("div");
  el.className = "msg assistant";
  el.innerHTML = '<div class="avatar">' + ICONS.logo + '</div><div class="body"></div>' +
    '<div class="msg-actions"><button type="button" class="ma-btn" data-ma="copy" title="Kopírovat odpověď">' + ICONS.copy + '<span>Kopírovat</span></button>' +
    '<button type="button" class="ma-btn" data-ma="review" title="Nechat zkontrolovat jiným modelem">' + ICONS.swap + '<span>Recenze</span></button></div>';
  return { el, body: el.querySelector(".body") };
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

async function onMsgAction(btn) {
  const msg = btn.closest(".msg");
  if (!msg) return;
  if (btn.dataset.ma === "branch") { branchFrom(msg, false); return; }
  if (btn.dataset.ma === "review") { reviewLast(); return; }
  if (btn.dataset.ma === "edit") {
    if (state.run) { showToast("Počkejte, až Claude dokončí práci."); return; }
    $("input").value = msg._text || "";
    autosize();
    $("input").focus();
    return;
  }
  const text = msg.classList.contains("user")
    ? (msg._text || "")
    : [...msg.querySelectorAll(".md")].map((m) => m.innerText.trim()).filter(Boolean).join("\n\n");
  if (!text) { showToast("Není co kopírovat."); return; }
  await copyText(text);
  const old = btn.innerHTML;
  btn.classList.add("done");
  btn.innerHTML = ICONS.check + (old.includes("<span>") ? "<span>Zkopírováno</span>" : "");
  setTimeout(() => { btn.classList.remove("done"); btn.innerHTML = old; }, 1500);
}

function textEl(text) {
  const d = document.createElement("div");
  d.className = "md";
  d.innerHTML = renderMarkdown(text);
  return d;
}

function thinkingEl(text) {
  const d = document.createElement("details");
  d.className = "thinking";
  d.innerHTML = '<summary><span class="tool-icon">' + ICONS.bulb + '</span><span class="tool-name">Uvažování</span><span class="tool-sum"></span><span class="chev">' + ICONS.chevron + '</span></summary><div class="thinking-text"></div>';
  d.querySelector(".tool-sum").textContent = text.split("\n")[0].slice(0, 120);
  d.querySelector(".thinking-text").textContent = text;
  return d;
}

const CHART_COLORS = ["#6ea0ff", "#f0894f", "#52c99a", "#c58bff", "#e8c15a", "#ff7a90", "#5fd0e0", "#b0b8c4"];

function niceTicks(min, max, count) {
  if (!(isFinite(min) && isFinite(max))) return [0, 1];
  if (min === max) { const d = Math.abs(min) || 1; min -= d / 2; max += d / 2; }
  const raw = (max - min) / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step + 1e-9) * step;
  const hi = Math.ceil(max / step - 1e-9) * step;
  const t = [];
  for (let v = lo; v <= hi + step / 2; v += step) t.push(Number((Math.round(v / step) * step).toPrecision(12)));
  return t;
}

const fmtTick = (v) => Number(v.toPrecision(6)).toLocaleString(LOC(), { maximumFractionDigits: 6 });

function buildChart(spec) {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) throw new Error("neplatná specifikace");
  const kind = ["line", "bar", "stem", "scatter", "area"].includes(spec.type) ? spec.type : "line";
  let series = Array.isArray(spec.series) ? spec.series : (Array.isArray(spec.y) ? [{ name: spec.name || "", y: spec.y }] : []);
  series = series.filter((s) => s && Array.isArray(s.y) && s.y.length).slice(0, 8);
  if (!series.length) throw new Error("chybí data (series[].y)");
  const shared = Array.isArray(spec.x) ? spec.x : null;
  const data = series.map((s) => {
    const xs = (Array.isArray(s.x) ? s.x : shared) || s.y.map((_, i) => i);
    return { name: s.name || "", pts: s.y.slice(0, 2000).map((y, i) => ({ x: xs[i], y: Number(y) })).filter((p) => isFinite(p.y) && p.y !== null) };
  });
  const cat = kind === "bar" || data.some((d) => d.pts.some((p) => typeof p.x !== "number"));
  const esc = escapeHtml;
  const title = spec.title ? String(spec.title) : "";
  const legend = data.length > 1 && data.some((d) => d.name);
  const W = 680, H = 300;
  const m = { l: spec.yLabel ? 66 : 54, r: 22, t: (title ? 46 : 20) + (legend ? 22 : 0), b: 38 + (spec.xLabel ? 20 : 0) };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;

  let ymin = Infinity, ymax = -Infinity;
  for (const d of data) for (const p of d.pts) { ymin = Math.min(ymin, p.y); ymax = Math.max(ymax, p.y); }
  if (kind === "bar" || kind === "stem" || kind === "area") { ymin = Math.min(ymin, 0); ymax = Math.max(ymax, 0); }
  else { const pad = (ymax - ymin) * 0.06 || 1; ymin -= pad; ymax += pad; }
  const yt = niceTicks(ymin, ymax, 5);
  const y0 = yt[0], y1 = yt[yt.length - 1];
  const sy = (v) => m.t + ph - ((v - y0) / (y1 - y0)) * ph;
  const base = sy(Math.min(Math.max(0, y0), y1));

  let sx, xticks;
  if (cat) {
    const labels = data[0].pts.map((p) => String(p.x));
    const n = Math.max(...data.map((d) => d.pts.length));
    sx = (p, i) => m.l + ((i + 0.5) / n) * pw;
    const every = Math.ceil(n / 12);
    xticks = [];
    for (let i = 0; i < n; i += every) xticks.push({ x: sx(null, i), t: labels[i] != null ? labels[i] : String(i) });
    sx.band = pw / n;
  } else {
    let xmin = Infinity, xmax = -Infinity;
    for (const d of data) for (const p of d.pts) { xmin = Math.min(xmin, p.x); xmax = Math.max(xmax, p.x); }
    if (xmin === xmax) { xmin -= 1; xmax += 1; }
    const padx = kind === "stem" || kind === "scatter" ? (xmax - xmin) * 0.03 : 0;
    xmin -= padx; xmax += padx;
    sx = (p) => m.l + 8 + ((p.x - xmin) / (xmax - xmin)) * (pw - 16);
    xticks = niceTicks(xmin, xmax, 8).filter((v) => v >= xmin - 1e-9 && v <= xmax + 1e-9).map((v) => ({ x: sx({ x: v }), t: fmtTick(v) }));
  }

  let o = "";
  if (title) o += '<text class="ch-title" x="' + m.l + '" y="26">' + esc(title) + "</text>";
  if (legend) {
    let lx = m.l;
    const ly = title ? 48 : 18;
    data.forEach((d, i) => {
      o += '<circle cx="' + (lx + 5) + '" cy="' + ly + '" r="5" fill="' + CHART_COLORS[i % CHART_COLORS.length] + '"/><text class="ch-leg" x="' + (lx + 15) + '" y="' + (ly + 4) + '">' + esc(d.name) + "</text>";
      lx += 30 + d.name.length * 6.6;
    });
  }
  for (const v of yt) {
    const y = sy(v);
    o += '<line class="' + (v === 0 ? "ch-zero" : "ch-grid") + '" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y + '" y2="' + y + '"/>' +
      '<text class="ch-tick" x="' + (m.l - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + fmtTick(v) + "</text>";
  }
  const axisY = m.t + ph;
  for (const t of xticks) {
    o += '<line class="ch-grid" x1="' + t.x + '" x2="' + t.x + '" y1="' + axisY + '" y2="' + (axisY + 5) + '"/>' +
      '<text class="ch-tick" x="' + t.x + '" y="' + (axisY + 19) + '" text-anchor="middle">' + esc(t.t) + "</text>";
  }
  if (spec.xLabel) o += '<text class="ch-ax" x="' + (m.l + pw / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(String(spec.xLabel)) + "</text>";
  if (spec.yLabel) o += '<text class="ch-ax" transform="translate(16 ' + (m.t + ph / 2) + ') rotate(-90)" text-anchor="middle">' + esc(String(spec.yLabel)) + "</text>";

  data.forEach((d, si) => {
    const col = CHART_COLORS[si % CHART_COLORS.length];
    const tip = (p) => "<title>" + esc((d.name ? d.name + ": " : "") + p.x + " = " + fmtTick(p.y)) + "</title>";
    const xy = d.pts.map((p, i) => [sx(p, i), sy(p.y), p]);
    if (kind === "line" || kind === "area") {
      let path = "";
      xy.forEach((q, i) => { path += (i ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1); });
      if (kind === "area" && xy.length) {
        o += '<path d="' + path + "L" + xy[xy.length - 1][0].toFixed(1) + " " + base + "L" + xy[0][0].toFixed(1) + " " + base + 'Z" fill="' + col + '" opacity=".16"/>';
      }
      o += '<path d="' + path + '" fill="none" stroke="' + col + '" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>';
      if (xy.length <= 60) for (const q of xy) o += '<circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="3.4" fill="' + col + '">' + tip(q[2]) + "</circle>";
    } else if (kind === "stem") {
      for (const q of xy) {
        o += '<line x1="' + q[0].toFixed(1) + '" x2="' + q[0].toFixed(1) + '" y1="' + base + '" y2="' + q[1].toFixed(1) + '" stroke="' + col + '" stroke-width="2.6"/>' +
          '<circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="5" fill="' + col + '">' + tip(q[2]) + "</circle>";
      }
    } else if (kind === "scatter") {
      for (const q of xy) o += '<circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="4.2" fill="' + col + '" opacity=".85">' + tip(q[2]) + "</circle>";
    } else {
      const gw = sx.band * 0.72, bw = gw / data.length;
      for (const q of xy) {
        const bx = q[0] - gw / 2 + si * bw;
        const top = Math.min(q[1], base), hh = Math.max(1, Math.abs(base - q[1]));
        o += '<rect x="' + bx.toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + Math.max(1, bw - 2).toFixed(1) + '" height="' + hh.toFixed(1) + '" rx="3" fill="' + col + '">' + tip(q[2]) + "</rect>";
      }
    }
  });

  return '<figure class="cgraph"><svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(title || "Graf") + '">' + o + "</svg>" +
    (spec.caption ? "<figcaption>" + esc(String(spec.caption)) + "</figcaption>" : "") + "</figure>";
}

let katexP = null;
const mathCache = new Map();

function loadKatex() {
  if (!katexP) {
    katexP = (async () => {
      const d = await apiJson("/api/vendor?name=katex");
      const st = document.createElement("style");
      st.textContent = d.css;
      document.head.appendChild(st);
      const s = document.createElement("script");
      s.nonce = document.querySelector("script[nonce]").nonce;
      s.textContent = d.js;
      document.head.appendChild(s);
      if (!window.katex) throw new Error("Knihovna vzorců se nenačetla.");
      return window.katex;
    })().catch((e) => { katexP = null; throw e; });
  }
  return katexP;
}

function scanMath() {
  const els = [...document.querySelectorAll(".math:not([data-done])")];
  if (!els.length) return;
  const apply = (k) => {
    for (const el of els) {
      const tex = el.dataset.tex || "";
      const disp = el.classList.contains("disp");
      const key = (disp ? "d:" : "i:") + tex;
      let out = mathCache.get(key);
      if (out === undefined) {
        try {
          out = k.renderToString(tex, { displayMode: disp, throwOnError: false, strict: "ignore", output: "htmlAndMathml", trust: false, maxExpand: 1000 });
        } catch (e) { out = null; }
        mathCache.set(key, out);
      }
      if (out) el.innerHTML = out;
      el.dataset.done = "1";
    }
  };
  if (window.katex) apply(window.katex);
  else loadKatex().then(apply).catch(() => { for (const el of els) el.dataset.done = "1"; });
}

const mediaMetaCache = new Map();
const mediaUrlCache = new Map();

function cachedCall(map, key, fn) {
  const hit = map.get(key);
  if (hit && (!hit.fail || Date.now() - hit.t < 3000)) return hit.p;
  const entry = { p: fn(), fail: false, t: Date.now() };
  entry.p.catch(() => { entry.fail = true; entry.t = Date.now(); });
  map.set(key, entry);
  return entry.p;
}

const mediaQuery = (path) => "path=" + encodeURIComponent(path) + "&cwd=" + encodeURIComponent((state.current && state.current.cwd) || "");

function mediaMeta(path) {
  return cachedCall(mediaMetaCache, mediaQuery(path), () => apiJson("/api/media?meta=1&" + mediaQuery(path)));
}

function mediaUrl(path) {
  return cachedCall(mediaUrlCache, mediaQuery(path), async () => {
    const d = await apiJson("/api/media?" + mediaQuery(path));
    const bin = atob(d.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: d.mime }));
  });
}

async function hydrateMedia(el) {
  const path = el.dataset.path;
  const alt = el.dataset.alt || "";
  try {
    const meta = await mediaMeta(path);
    const kind = meta.mime.split("/")[0];
    if (kind === "image") {
      const url = await mediaUrl(path);
      const im = document.createElement("img");
      im.className = "media-img";
      im.alt = alt || meta.name;
      im.title = meta.name + " (kliknutím zvětšit)";
      im.src = url;
      im.addEventListener("click", () => openLightbox(url, meta.name));
      el.replaceChildren(im);
      return;
    }
    const b = document.createElement("button");
    b.type = "button";
    b.className = "media-play";
    b.innerHTML = ICONS.play + '<span class="mp-t"><b></b><small></small></span>';
    b.querySelector("b").textContent = meta.name;
    b.querySelector("small").textContent = (kind === "video" ? "Video" : "Zvuk") + " · " + fmtSize(meta.size) + " · kliknutím přehrát";
    b.addEventListener("click", async () => {
      b.disabled = true;
      try {
        const m = document.createElement(kind === "video" ? "video" : "audio");
        m.className = "media-" + kind;
        m.controls = true;
        m.src = await mediaUrl(path);
        el.replaceChildren(m);
        m.play().catch(() => {});
      } catch (e) { b.disabled = false; showToast("Soubor se nepodařilo načíst: " + e.message); }
    });
    el.replaceChildren(b);
  } catch (e) {
    if (alt) el.textContent = alt; else el.remove();
  }
}

function scanMedia() {
  for (const el of document.querySelectorAll(".media:not([data-done])")) {
    el.dataset.done = "1";
    hydrateMedia(el);
  }
}

let mermaidP = null;
let dgSeq = 0;
const dgCache = new Map();
const dgQueue = new Set();
let dgTimer = null;

function loadMermaid() {
  if (!mermaidP) {
    mermaidP = (async () => {
      const d = await apiJson("/api/vendor?name=mermaid");
      const s = document.createElement("script");
      s.nonce = document.querySelector("script[nonce]").nonce;
      s.textContent = d.js;
      document.head.appendChild(s);
      const m = window.mermaid;
      if (!m) throw new Error("Knihovna diagramů se nenačetla.");
      const dark = isDark();
      m.initialize({ startOnLoad: false, securityLevel: "strict", theme: dark ? "dark" : "neutral", fontFamily: "inherit" });
      return m;
    })().catch((e) => { mermaidP = null; throw e; });
  }
  return mermaidP;
}

async function renderDiagram(key) {
  const [kind, src] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
  try {
    if (kind === "chart") {
      dgCache.set(key, { svg: buildChart(JSON.parse(src)) });
    } else if (kind === "svg") {
      dgCache.set(key, { img: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(src) });
    } else {
      const m = await loadMermaid();
      const id = "mmd" + ++dgSeq;
      try {
        const { svg } = await m.render(id, src);
        dgCache.set(key, { svg });
      } finally {
        for (const x of [document.getElementById(id), document.getElementById("d" + id)]) if (x) x.remove();
      }
    }
  } catch (e) {
    dgCache.set(key, { error: String((e && e.message) || e).split("\n")[0].slice(0, 160) });
  }
}

function applyDiagram(el, entry) {
  const view = el.querySelector(".diagram-view");
  el.dataset.done = "1";
  if (entry.svg) {
    view.innerHTML = entry.svg;
  } else if (entry.img) {
    view.classList.add("is-img");
    view.innerHTML = '<img alt="Obrázek SVG">';
    view.firstChild.src = entry.img;
  } else {
    view.innerHTML = '<span class="dg-err"></span>';
    view.firstChild.textContent = "Diagram nejde vykreslit (" + entry.error + "), zobrazuji kód.";
    el.querySelector("pre").hidden = false;
    el.querySelector(".dg-toggle").hidden = true;
  }
}

function scanDiagrams() {
  let queued = false;
  for (const el of document.querySelectorAll(".diagram:not([data-done])")) {
    const key = el.dataset.kind + ":" + el.querySelector("code").textContent;
    const hit = dgCache.get(key);
    if (hit) { applyDiagram(el, hit); continue; }
    dgQueue.add(key);
    queued = true;
  }
  if (queued) {
    clearTimeout(dgTimer);
    dgTimer = setTimeout(async () => {
      const keys = [...dgQueue];
      dgQueue.clear();
      for (const k of keys) await renderDiagram(k);
      scanDiagrams();
    }, 600);
  }
}

function copyTable(btn) {
  const box = btn.closest(".table-box");
  const rows = [...box.querySelectorAll("tr")].map((tr) => [...tr.children].map((c) => c.innerText.replace(/\s+/g, " ").trim()).join("\t"));
  copyText(rows.join("\n"));
  showToast("Tabulka je zkopírovaná, jde vložit do Excelu nebo Tabulek.");
}

function togglePreview(btn) {
  const code = btn.closest(".code");
  const old = code.querySelector(".html-preview");
  if (old) { URL.revokeObjectURL(old.dataset.url); old.remove(); btn.textContent = "Náhled"; return; }
  const src = code.querySelector("code").textContent;
  const url = URL.createObjectURL(new Blob([src], { type: "text/html" }));
  const f = document.createElement("iframe");
  f.className = "html-preview";
  f.dataset.url = url;
  f.setAttribute("sandbox", "");
  f.title = "Náhled HTML";
  f.src = url;
  code.appendChild(f);
  btn.textContent = "Skrýt náhled";
}

function toolDiff(name, input) {
  if (!input || typeof input !== "object") return null;
  const cut = (s) => (typeof s === "string" ? s.slice(0, 12000) : "");
  if (name === "Edit" && typeof input.new_string === "string") return [{ old: cut(input.old_string), new: cut(input.new_string) }];
  if (name === "MultiEdit" && Array.isArray(input.edits)) return input.edits.slice(0, 30).map((e) => ({ old: cut(e && e.old_string), new: cut(e && e.new_string) }));
  if (name === "Write" && typeof input.content === "string") return [{ old: "", new: cut(input.content), write: true }];
  return null;
}

function lineDiff(oldS, newS) {
  const a = oldS ? oldS.split("\n") : [];
  const b = newS ? newS.split("\n") : [];
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let ea = a.length, eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  const am = a.slice(s, ea), bm = b.slice(s, eb);
  const ops = [];
  const n = am.length, m = bm.length;
  if (n * m <= 40000) {
    const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = am[i] === bm[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (am[i] === bm[j]) { ops.push(["=", am[i]]); i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) ops.push(["-", am[i++]]);
      else ops.push(["+", bm[j++]]);
    }
    while (i < n) ops.push(["-", am[i++]]);
    while (j < m) ops.push(["+", bm[j++]]);
  } else {
    for (const l of am) ops.push(["-", l]);
    for (const l of bm) ops.push(["+", l]);
  }
  const before = a.slice(Math.max(0, s - 2), s).map((l) => ["=", l]);
  const after = a.slice(ea, ea + 2).map((l) => ["=", l]);
  return before.concat(ops, after);
}

function diffEl(blocks) {
  const wrap = document.createElement("div");
  let add = 0, del = 0, shown = 0, hidden = 0;
  const MAX_ROWS = 400;
  blocks.forEach((blk, idx) => {
    const box = document.createElement("div");
    box.className = "diff";
    if (blk.write) {
      const note = document.createElement("div");
      note.className = "diff-note";
      note.textContent = "Celý obsah souboru";
      box.appendChild(note);
    } else if (blocks.length > 1) {
      const note = document.createElement("div");
      note.className = "diff-note";
      note.textContent = "Úprava " + (idx + 1) + " z " + blocks.length;
      box.appendChild(note);
    }
    const inner = document.createElement("div");
    inner.className = "diff-in";
    const ops = blk.write ? (blk.new ? blk.new.split("\n") : []).map((l) => ["+", l]) : lineDiff(blk.old, blk.new);
    for (const [sign, text] of ops) {
      if (sign === "+") add++;
      else if (sign === "-") del++;
      if (shown >= MAX_ROWS) { hidden++; continue; }
      shown++;
      const row = document.createElement("div");
      row.className = "dl " + (sign === "+" ? "add" : sign === "-" ? "del" : "ctx");
      const sg = document.createElement("span");
      sg.className = "sg";
      sg.textContent = sign === "=" ? "" : sign;
      const tx = document.createElement("span");
      tx.className = "tx";
      tx.textContent = text;
      row.append(sg, tx);
      inner.appendChild(row);
    }
    box.appendChild(inner);
    wrap.appendChild(box);
  });
  if (hidden) {
    const more = document.createElement("div");
    more.className = "diff-note";
    more.textContent = "… dalších " + hidden + " řádků není zobrazeno";
    wrap.appendChild(more);
  }
  return { el: wrap, add, del };
}

function toolEl(it) {
  const d = document.createElement("details");
  d.className = "tool";
  if (it.id) d.dataset.id = it.id;
  d.innerHTML = '<summary><span class="tool-icon">' + toolIcon(it.name) + '</span><span class="tool-name"></span><span class="tool-sum"></span><span class="diffstat"></span><span class="state"></span><span class="chev">' + ICONS.chevron + "</span></summary><pre></pre>";
  d.dataset.name = it.name || "";
  d.dataset.sum = it.summary || "";
  d.querySelector(".tool-name").textContent = it.name || "nástroj";
  d.querySelector(".tool-sum").textContent = it.summary || "";
  d.querySelector(".tool-sum").title = it.summary || "";
  if (it.diff && it.diff.length) {
    const dv = diffEl(it.diff);
    d.insertBefore(dv.el, d.querySelector("pre"));
    d.classList.add("has-diff");
    d.querySelector(".diffstat").innerHTML = '<span class="a">+' + dv.add + '</span><span class="d">-' + dv.del + "</span>";
  }
  if (it.running) {
    d.classList.add("running");
    d.querySelector(".state").innerHTML = '<span class="mini-spin"></span>';
    d.querySelector("pre").textContent = "Probíhá…";
  } else {
    setToolResult(d, it.error, it.result);
  }
  return d;
}

function setToolResult(el, isError, result) {
  el.classList.remove("running");
  el.classList.toggle("err", !!isError);
  el.querySelector(".state").innerHTML = isError ? '<span class="tool-icon" title="Chyba">' + ICONS.alert + "</span>" : "";
  el.querySelector("pre").textContent = result ? result : (result === null || result === undefined ? "Výstup není k dispozici." : "Bez výstupu.");
  addToolMedia(el, result);
}

function addToolMedia(el, result) {
  const sum = el.dataset.sum || "";
  const found = new Set();
  const direct = /^(Read|Write|NotebookEdit)$/.test(el.dataset.name || "") && MEDIA_FULL_RE.test(sum);
  if (direct) found.add(sum);
  for (const src of [sum, typeof result === "string" ? result : ""]) {
    for (const m of src.matchAll(MEDIA_SCAN_RE)) { found.add(m[1]); if (found.size >= 4) break; }
  }
  if (!found.size) return;
  if (!el._media) el._media = new Set();
  const pre = el.querySelector("pre");
  for (const path of found) {
    if (el._media.has(path)) continue;
    el._media.add(path);
    const sp = document.createElement("span");
    sp.className = "media";
    sp.dataset.path = path;
    sp.dataset.alt = "";
    el.insertBefore(sp, pre);
  }
  el.classList.add("has-media");
  if (direct && el.dataset.name === "Read") el.classList.add("media-only");
  el.open = true;
}

function noteEl(text, kind) {
  const d = document.createElement("div");
  d.className = "note" + (kind ? " " + kind : "");
  d.textContent = text;
  return d;
}

