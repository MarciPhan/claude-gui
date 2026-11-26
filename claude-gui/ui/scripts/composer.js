/* ======================= Výběr modelu a úrovně ======================= */

const MODEL_NAMES = { "": "Výchozí model", opus: "Opus", sonnet: "Sonnet", haiku: "Haiku" };
const EFFORT_NAMES = { "": "", low: "nízká", medium: "střední", high: "vysoká", xhigh: "velmi vysoká", max: "max" };

const PROV_NAMES = { claude: "Claude", codex: "Codex", opencode: "OpenCode" };
function syncPicker() {
  const pv = $("provider").value;
  const label = pv !== "claude" ? (PROV_NAMES[pv] || pv) : (MODEL_NAMES[$("model").value] || "Model") + (EFFORT_NAMES[$("effort").value] ? " · " + EFFORT_NAMES[$("effort").value] : "");
  $("pickLabel").textContent = label;
  for (const el of $("pop").querySelectorAll("[data-set]")) {
    el.classList.toggle("sel", $(el.dataset.set).value === el.dataset.v);
  }
}

function togglePop(force) {
  const open = force !== undefined ? force : $("pop").hidden;
  $("pop").hidden = !open;
  $("btnPick").setAttribute("aria-expanded", String(open));
}

function niceMax(max) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(max, 1))));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= max) return m * p;
  return 10 * p;
}

function bucketLabel(t, unit) {
  const d = new Date(t * 1000);
  if (unit === "day") return d.getDate() + ". " + (d.getMonth() + 1) + ".";
  return d.toLocaleTimeString(LOC(), { hour: "2-digit", minute: "2-digit" });
}

function bucketTitle(t, unit, end) {
  const d = new Date(t * 1000);
  if (unit === "day") return d.toLocaleDateString(LOC(), { weekday: "short", day: "numeric", month: "numeric" });
  const to = new Date((end || t + 3600) * 1000);
  const hm = (x) => x.toLocaleTimeString(LOC(), { hour: "2-digit", minute: "2-digit" });
  return hm(d) + " až " + hm(to);
}

function ledgerHtml(d) {
  const t = d.total;
  return '<dl class="ledger">' +
    '<div><dt><span class="dot in"></span>Nové vstupy</dt><dd>' + fmt(t.fresh) + "<small>vstup + zápis do cache</small></dd></div>" +
    '<div><dt><span class="dot out"></span>Výstup</dt><dd>' + fmt(t.out) + "<small>text, kód, uvažování</small></dd></div>" +
    "<div><dt>Čtení z cache</dt><dd>" + fmt(t.cr) + "<small>levné opakované vstupy</small></dd></div>" +
    "<div><dt>Odpovědí</dt><dd>" + fmtFull(t.msgs) + "<small>" + (t.msgs ? "v průměru " + fmt((t.fresh + t.out) / t.msgs) + " nových tokenů" : "žádná aktivita") + "</small></dd></div></dl>";
}

function chartHtml(d) {
  const b = d.buckets;
  const max = niceMax(Math.max(1, ...b.map((x) => x[0] + x[1])));
  const pct = (v) => (v / max) * 100;
  const step = Math.max(1, Math.ceil(b.length / (d.unit === "day" && b.length > 10 ? 8 : 10)));
  let cols = "";
  let xs = "";
  b.forEach((x, i) => {
    const mh = (v) => (v > 0 ? "min-height:2px;" : "");
    cols += '<div class="col" tabindex="0" data-i="' + i + '"><div class="stack">' +
      '<i class="s-out" style="height:' + pct(x[1]) + "%;" + mh(x[1]) + '"></i>' +
      '<i class="s-in" style="height:' + pct(x[0]) + "%;" + mh(x[0]) + '"></i></div></div>';
    xs += "<span>" + (i % step === 0 ? bucketLabel(d.edges[i], d.unit) : "") + "</span>";
  });
  return '<div class="chart"><div class="yaxis"><span>' + fmt(max) + "</span><span>" + fmt(max / 2) + "</span><span>0</span></div>" +
    '<div class="plot"><div class="grid-line" style="top:0"></div><div class="grid-line" style="top:50%"></div><div class="cols">' + cols + "</div></div>" +
    '<div class="xaxis">' + xs + "</div></div>";
}

function rowsHtml(items, max, opts) {
  if (!items.length) return '<div class="u-empty">V tomto období zatím nic není.</div>';
  return '<div class="rows">' + items.map((e) => {
    const sum = e.fresh + e.out;
    const wIn = max ? (e.fresh / max) * 100 : 0;
    const wOut = max ? (e.out / max) * 100 : 0;
    const tag = opts.click ? "button" : "div";
    return "<" + tag + ' class="row"' + (opts.click ? ' type="button" data-id="' + escapeHtml(e.id) + '"' : "") + ">" +
      '<div class="row-top"><span class="row-name">' + escapeHtml(opts.name(e)) + '</span><span class="row-val">' + fmt(sum) + "</span></div>" +
      '<div class="row-sub"><span>' + escapeHtml(opts.sub(e)) + "</span><span>" + fmtFull(e.msgs) + " odp.</span></div>" +
      '<div class="meter"><i class="m-in" style="width:' + wIn + '%"></i><i class="m-out" style="width:' + wOut + '%"></i></div>' + "</" + tag + ">";
  }).join("") + "</div>";
}

function renderUsage(d) {
  const body = $("usageBody");
  const rangeName = RANGE_LABELS[d.range] || "";
  const maxM = Math.max(1, ...d.models.map((m) => m.fresh + m.out));
  const maxS = Math.max(1, ...d.sessions.map((s) => s.fresh + s.out));
  body.innerHTML = ledgerHtml(d) +
    '<section class="panel"><div class="panel-head"><h2>Průběh, ' + rangeName + '</h2><div class="legend"><span><span class="dot in"></span>Nové vstupy</span><span><span class="dot out"></span>Výstup</span></div></div>' +
    '<div class="readout" id="readout"></div>' + chartHtml(d) + "</section>" +
    '<div class="two">' +
    '<section class="panel"><div class="panel-head"><h2>Podle modelů</h2></div>' +
    rowsHtml(d.models.map((m) => Object.assign({ id: m.model }, m)), maxM, { name: (e) => shortModel(e.model), sub: (e) => fmt(e.fresh) + " nových, " + fmt(e.out) + " výstup" }) + "</section>" +
    '<section class="panel"><div class="panel-head"><h2>Nejnáročnější konverzace</h2></div>' +
    rowsHtml(d.sessions, maxS, { click: true, name: (e) => e.title, sub: (e) => (basename(e.cwd) || "bez složky") + ", " + fmt(e.fresh) + " nových" }) + "</section></div>" +
    '<p class="u-note">Počítáno z přepisů v ~/.claude/projects, tedy jen konverzace z tohoto počítače. Nové vstupy jsou vstup plus zápis do cache. Čtení z cache je levné a velké, proto je mimo graf. Limity předplatného odtud zjistit nejdou, protože se nezapisují do přepisů.</p>';

  const readout = $("readout");
  const t = d.total;
  const def = "Celkem " + fmt(t.fresh + t.out) + " tokenů za " + rangeName + ". Najeďte na sloupec pro detail.";
  readout.textContent = def;
  const show = (i) => {
    const x = d.buckets[i];
    const end = d.edges[i + 1] || d.now;
    readout.innerHTML = "<b>" + escapeHtml(bucketTitle(d.edges[i], d.unit, end)) + "</b>: " + fmt(x[0]) + " nových, " + fmt(x[1]) + " výstup, " + fmtFull(x[3]) + " odp.";
  };
  for (const col of body.querySelectorAll(".col")) {
    const i = +col.dataset.i;
    col.addEventListener("mouseenter", () => show(i));
    col.addEventListener("focus", () => show(i));
    col.addEventListener("mouseleave", () => { readout.textContent = def; });
    col.addEventListener("blur", () => { readout.textContent = def; });
  }
}

function skeletonHtml() {
  return '<div class="skel" style="height:84px"></div><div class="skel" style="height:260px;margin-top:18px"></div>' +
    '<div class="two" style="margin-top:18px"><div class="skel" style="height:180px"></div><div class="skel" style="height:180px"></div></div>';
}

let usageSeq = 0;
async function loadUsage() {
  const seq = ++usageSeq;
  const body = $("usageBody");
  for (const b of $("rangeSeg").querySelectorAll("button")) {
    const on = b.dataset.r === state.usageRange;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", String(on));
  }
  if (!state.usage || state.usage.range !== state.usageRange) body.innerHTML = skeletonHtml();
  try {
    const d = await apiJson("/api/usage?range=" + state.usageRange);
    if (seq !== usageSeq) return;
    state.usage = d;
    renderUsage(d);
  } catch (e) {
    if (seq !== usageSeq) return;
    body.innerHTML = "";
    body.appendChild(noteEl("Využití se nenačetlo: " + e.message, "error"));
  }
}

async function loadGlimpse() {
  try {
    const d = await apiJson("/api/usage?range=today");
    $("glimpseVal").innerHTML = fmt(d.total.fresh) + " <small>nových</small> · " + fmt(d.total.out) + " <small>výstup</small>";
    $("glimpseMsgs").textContent = fmtFull(d.total.msgs) + " odp.";
    if (state.usage && state.usage.range === "today") state.usage = null;
  } catch (e) {
    $("glimpseVal").textContent = "Nedostupné";
  }
}

async function refreshContext() {
  const cur = state.current;
  const el = $("ctx");
  if (!cur || !cur.id) { el.hidden = true; return; }
  try {
    const d = await apiJson("/api/context?id=" + encodeURIComponent(cur.id));
    if (state.current !== cur) return;
    if (!d.tokens) { el.hidden = true; return; }
    const win = d.tokens > 200000 ? 1000000 : 200000;
    const p = Math.min(100, (d.tokens / win) * 100);
    $("ctxLabel").textContent = "Kontext " + fmt(d.tokens);
    $("ctxFill").style.width = p + "%";
    el.classList.toggle("high", p >= 70 && p < 90);
    el.classList.toggle("full", p >= 90);
    el.title = "Kontext poslední odpovědi: " + fmtFull(d.tokens) + " tokenů, asi " + Math.round(p) + " % okna " + fmt(win) + " (odhad okna) · " + shortModel(d.model);
    el.hidden = false;
  } catch (e) {
    el.hidden = true;
  }
}

function init() {
  initTools();
  // Ikony
  for (const el of document.querySelectorAll("[data-icon]")) el.innerHTML = ICONS[el.dataset.icon] || "";
  $("btnNew").innerHTML = '<span class="plus">' + ICONS.plus + "</span><span>Nová konverzace</span>";
  $("btnRefresh").innerHTML = ICONS.refresh + "<span>Obnovit</span>";
  const fav = document.createElement("link");
  fav.rel = "icon";
  fav.href = "data:image/svg+xml," + encodeURIComponent(ICONS.logo.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" '));
  document.head.appendChild(fav);

  // Uložené volby
  const savedMode = localStorage.getItem("cg-mode");
  $("mode").value = ["default", "acceptEdits", "auto", "plan", "bypassPermissions"].includes(savedMode) ? savedMode : "acceptEdits";
  $("model").value = localStorage.getItem("cg-model") || "";
  $("provider").value = ["codex", "opencode"].includes(localStorage.getItem("cg-provider")) ? localStorage.getItem("cg-provider") : "claude";
  apiJson("/api/providers").then((p) => {
    state.providers = p;
    for (const o of $("pop").querySelectorAll('[data-set="provider"]')) {
      if (!p[o.dataset.v]) { o.disabled = true; o.querySelector("small").textContent = "není nainstalován"; }
    }
    if (!p[$("provider").value]) { $("provider").value = "claude"; syncPicker(); }
  }).catch(() => {});
  const savedEffort = localStorage.getItem("cg-effort");
  $("effort").value = ["low", "medium", "high", "xhigh", "max"].includes(savedEffort) ? savedEffort : "";
  state.sideMode = localStorage.getItem("cg-side") === "projects" ? "projects" : "chats";
  try { state.open = JSON.parse(localStorage.getItem("cg-open") || "{}") || {}; } catch (e) { state.open = {}; }
  $("env").value = ["lean", "full"].includes(localStorage.getItem("cg-env")) ? localStorage.getItem("cg-env") : "auto";
  updateModeUi();
  syncPicker();
  setView("chat");

  // Události
  $("mode").addEventListener("change", updateModeUi);
  $("model").addEventListener("change", () => localStorage.setItem("cg-model", $("model").value));
  $("provider").addEventListener("change", () => { localStorage.setItem("cg-provider", $("provider").value); syncPicker(); });
  $("mode").addEventListener("change", syncPicker);
  $("env").addEventListener("change", syncPicker);
  $("env").addEventListener("change", () => localStorage.setItem("cg-env", $("env").value));
  $("btnReload").addEventListener("click", () => {
    if (state.current) state.current.loaded = false;
    if ($("env").value === "lean") $("env").value = "auto";
    showToast("MCP a skilly se donačtou při další zprávě.");
  });
  $("tabChat").addEventListener("click", () => setSideMode("chats"));
  $("tabProjects").addEventListener("click", () => setSideMode("projects"));
  $("tabUsage").addEventListener("click", () => setView("usage"));
  $("btnClear").addEventListener("click", () => { const c = state.current; if (c && c.cwd) { startChatIn(c.cwd); showToast("Kontext je čistý, stará konverzace zůstala v seznamu."); } });
  $("effort").addEventListener("change", () => localStorage.setItem("cg-effort", $("effort").value));
  $("btnPick").addEventListener("click", (e) => { e.stopPropagation(); togglePop(); });
  $("pop").addEventListener("click", (e) => {
    e.stopPropagation();
    const o = e.target.closest("[data-set]");
    if (!o) return;
    const sel = $(o.dataset.set);
    sel.value = o.dataset.v;
    sel.dispatchEvent(new Event("change"));
    syncPicker();
  });
  $("btnReload").addEventListener("click", () => syncPicker());
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".pick-wrap")) togglePop(false);
    if (!e.target.closest("#menu")) hideMenu();
    const r = e.target.closest(".lim-refresh");
    if (r) refreshLimits();
  });
  $("list").addEventListener("scroll", hideMenu);
  $("glimpse").addEventListener("click", () => setView("usage"));
  $("btnMenu2").addEventListener("click", openSidebar);
  $("btnUsageRefresh").addEventListener("click", () => { state.usage = null; loadUsage(); loadGlimpse(); });
  $("rangeSeg").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-r]");
    if (!b) return;
    state.usageRange = b.dataset.r;
    localStorage.setItem("cg-range", state.usageRange);
    loadUsage();
  });
  $("usageBody").addEventListener("click", (e) => {
    const row = e.target.closest("button.row[data-id]");
    if (row) openSession(row.dataset.id);
  });
  $("btnNew").addEventListener("click", openNewDialog);
  $("btnRefresh").addEventListener("click", loadSessions);
  $("search").addEventListener("input", onSearchInput);
  $("list").addEventListener("click", onListClick);
  $("btnMenu").addEventListener("click", openSidebar);
  $("btnCloseSide").addEventListener("click", hideSidebar);
  $("scrim").addEventListener("click", () => document.body.classList.remove("side-open"));

  $("messages").addEventListener("scroll", () => {
    const b = $("messages");
    stick = b.scrollHeight - b.scrollTop - b.clientHeight < 80;
    updateDown();
  });
  $("messages").addEventListener("click", (e) => {
    const btn = e.target.closest(".copy-btn");
    if (btn) copyCode(btn);
    const tc = e.target.closest(".tbl-copy");
    if (tc) { copyTable(tc); return; }
    const pv = e.target.closest(".pv-btn");
    if (pv) { togglePreview(pv); return; }
    const dt = e.target.closest(".dg-toggle");
    if (dt) {
      const code = dt.closest(".diagram");
      const pre = code.querySelector("pre");
      pre.hidden = !pre.hidden;
      dt.textContent = pre.hidden ? "Zobrazit kód" : "Skrýt kód";
      return;
    }
    const ma = e.target.closest(".ma-btn");
    if (ma) onMsgAction(ma);
  });
  $("btnDown").addEventListener("click", () => { autoScroll(true); stick = true; updateDown(); });

  const input = $("input");
  input.addEventListener("input", autosize);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendOrQueue();
    }
  });
  $("btnSend").addEventListener("click", () => (state.run && !$("input").value.trim() && !state.att.length ? stopRun() : sendOrQueue()));

  // přílohy: tlačítko, vložení ze schránky, přetažení
  $("btnAttach").addEventListener("click", () => $("fileIn").click());
  $("lbClose").addEventListener("click", closeLightbox);
  $("lightbox").addEventListener("click", (e) => { if (e.target.id === "lightbox" || e.target.classList.contains("lb-stage")) closeLightbox(); });
  $("lbImg").addEventListener("click", () => $("lbImg").classList.toggle("full"));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("lightbox").hidden) { e.preventDefault(); closeLightbox(); } });
  $("fileIn").addEventListener("change", (e) => { addFiles(e.target.files); e.target.value = ""; });
  let pasteSeen = false;
  const pasteNative = async (loud) => {
    if (!state.current) return;
    try { addNative([await apiJson("/api/clip_image")], []); } catch (err) { if (loud) showToast(err.message); }
  };
  // WebKit při schránce s jediným obrázkem událost paste někdy vůbec nevyvolá
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "v") {
      pasteSeen = false;
      setTimeout(() => { if (!pasteSeen) pasteNative(true); }, 250);
    }
  });
  document.addEventListener("paste", async (e) => {
    pasteSeen = true;
    const cd = e.clipboardData;
    if (!cd) return;
    const files = [...(cd.files || [])];
    for (const it of cd.items || []) {
      if (it.kind === "file") { const f = it.getAsFile(); if (f && !files.some((x) => x.name === f.name && x.size === f.size)) files.push(f); }
    }
    if (files.length) { e.preventDefault(); if (state.current) addFiles(files); else showToast("Nejdřív otevřete nebo založte konverzaci."); return; }
    if (cd.types && [...cd.types].some((t) => t === "text/plain" || t === "text/html")) return;
    if (!state.current || e.target.closest("input:not(#input), [contenteditable]")) return;
    e.preventDefault();
    pasteNative();
  });
  {
    let depth = 0;
    const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");
    const hide = () => { depth = 0; $("dropOv").hidden = true; };
    document.addEventListener("dragenter", (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      if (state.current) $("dropOv").hidden = false;
    });
    document.addEventListener("dragover", (e) => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } });
    document.addEventListener("dragleave", (e) => { if (hasFiles(e) && --depth <= 0) hide(); });
    document.addEventListener("drop", (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      hide();
      if (!state.current) { showToast("Nejdřív otevřete nebo založte konverzaci."); return; }
      addFiles(e.dataTransfer.files);
      input.focus();
    });
    window.addEventListener("blur", hide);
  }

  $("dlgClose").addEventListener("click", closeNewDialog);
  $("dlgCancel").addEventListener("click", closeNewDialog);
  $("dlgOk").addEventListener("click", confirmNew);
  $("dlg").addEventListener("click", (e) => { if (e.target === $("dlg")) closeNewDialog(); });
  $("cwdInput").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); confirmNew(); } });
  $("btnNew").title = "Nová konverzace (Ctrl+Shift+O)";
  $("search").title = "Hledat (Ctrl+K)";
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === "\\") { e.preventDefault(); (IS_PANE ? window.parent : window).toggleSplit(); return; }
    if (k === "k" && !e.shiftKey) {
      e.preventDefault();
      if (wideSide()) setSideHidden(false); else document.body.classList.add("side-open");
      $("search").focus();
      $("search").select();
    } else if (k === "o" && e.shiftKey) {
      e.preventDefault();
      const c = state.current;
      if (c && c.cwd) startChatIn(c.cwd); else openNewDialog();
    } else if (k === "b" && !e.shiftKey) {
      e.preventDefault();
      if (wideSide()) setSideHidden(!document.body.classList.contains("side-hidden"));
      else document.body.classList.toggle("side-open");
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!$("menu").hidden) hideMenu();
      else if (!$("pop").hidden) togglePop(false);
      else if (!$("dlg").hidden) closeNewDialog();
      else closeSidebar();
    }
  });

  // Obnova seznamu: při návratu do okna a během běhu (bez trvalého dotazování)
  let lastFocusLoad = 0;
  window.addEventListener("focus", () => {
    if (Date.now() - lastFocusLoad > 5000) { lastFocusLoad = Date.now(); loadSessions(); }
  });
  setInterval(() => { if (state.runs.length) loadSessions(); }, 8000);

  updateHeader();
  showWelcome();
  loadOrg();
  loadWorkspaces();
  if (!IS_PANE) {
    loadGlimpse();
    loadLimits();
    setInterval(renderLimits, 30000);
  }
  setInterval(() => {
    const age = Date.now() / 1000 - ((state.limits && state.limits.ts) || 0);
    if (!IS_PANE && document.visibilityState === "visible" && !state.runs.length && age > 600) refreshLimits();
  }, 300000);
  loadSessions().then(() => {
    const last = localStorage.getItem(LAST_KEY);
    if (last && !state.current && state.sessions.some((s) => s.id === last)) openSession(last);
  });
  input.focus();
}

{
  let dgRaf = 0;
  new MutationObserver(() => {
    if (dgRaf) return;
    dgRaf = requestAnimationFrame(() => { dgRaf = 0; scanDiagrams(); });
  }).observe($("messages"), { childList: true, subtree: true });
}

new MutationObserver(() => { scanMath(); scanMedia(); }).observe($("messages"), { childList: true, subtree: true });

window.__paneApi = {
  ready: () => state.sessions.length > 0,
  empty: () => !(state.current && state.current.id),
  busy: () => !!state.run,
  current: () => (state.current && state.current.id) || null,
  open: (id) => openSession(id),
  fresh: (cwd) => startChatIn(cwd),
};

init();
if (!IS_PANE) {
  $("tabSplit").addEventListener("click", toggleSplit);
  $("btnGridExit").addEventListener("click", exitSplit);
  $("layoutSeg").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-l]");
    if (!b) return;
    try { localStorage.setItem("cg-layout", b.dataset.l); } catch (err) { /* bez uložení */ }
    buildPanes();
  });
  setInterval(() => {
    if (!document.body.classList.contains("multi")) return;
    for (const f of document.querySelectorAll("#gridPanes iframe")) {
      const a = paneApi(f);
      f.parentElement.classList.toggle("busy", !!(a && a.busy()));
    }
  }, 1500);
}
