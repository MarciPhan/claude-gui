/* ---------- Nástroje: prompty, KB, export, checkpointy, náhled, větvení, recenze ---------- */
const toolsDlg = () => $("dlgTools");
function openTools(title, build, foot) {
  $("toolsTitle").textContent = title;
  const body = $("toolsBody"), ft = $("toolsFoot");
  body.replaceChildren(); ft.replaceChildren();
  build(body, ft);
  toolsDlg().hidden = false;
}
function closeTools() { toolsDlg().hidden = true; }
function mkBtn(label, fn, primary) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "btn" + (primary ? " primary" : ""); b.textContent = label;
  b.addEventListener("click", fn); return b;
}
function mkRow(title, sub, actions) {
  const r = document.createElement("div"); r.className = "cwd-item";
  const t = document.createElement("div");
  const n = document.createElement("strong"); n.textContent = title; t.appendChild(n);
  if (sub) { const sm = document.createElement("div"); sm.style.opacity = ".7"; sm.style.fontSize = "12px"; sm.textContent = sub; t.appendChild(sm); }
  r.appendChild(t);
  const a = document.createElement("div"); a.style.display = "flex"; a.style.gap = "6px";
  for (const x of actions) a.appendChild(x);
  r.appendChild(a); return r;
}
function insertIntoInput(text) {
  const i = $("input"); i.value = (i.value ? i.value + "\n" : "") + text; autosize(); i.focus();
}

async function toolPrompts() {
  let data;
  try { data = await apiJson("/api/prompts"); } catch (e) { showToast(e.message); return; }
  let list = (data.items || []).map((x) => ({ title: x.name, text: x.text }));
  const render = (body, ft) => {
    body.replaceChildren();
    for (const [i, pr] of list.entries()) {
      body.appendChild(mkRow(pr.title, (pr.text || "").slice(0, 90), [
        mkBtn("Vložit", () => { insertIntoInput(pr.text); closeTools(); }, true),
        mkBtn("Smazat", async () => { list.splice(i, 1); await apiJson("/api/prompts_save", { method: "POST", body: JSON.stringify({ items: list.map((x) => ({ name: x.title, text: x.text })) }) }); render(body, ft); }),
      ]));
    }
    if (!list.length) body.appendChild(noteEl("Zatím žádné prompty."));
    ft.replaceChildren(mkBtn("Přidat prompt", () => {
      body.replaceChildren();
      const t = document.createElement("input"); t.className = "text-input"; t.placeholder = "Název";
      const x = document.createElement("textarea"); x.placeholder = "Text promptu";
      body.append(t, x);
      ft.replaceChildren(mkBtn("Zpět", () => render(body, ft)), mkBtn("Uložit", async () => {
        if (!t.value.trim() || !x.value.trim()) return;
        list.push({ title: t.value.trim(), text: x.value });
        await apiJson("/api/prompts_save", { method: "POST", body: JSON.stringify({ items: list.map((x) => ({ name: x.title, text: x.text })) }) });
        render(body, ft);
      }, true));
    }), mkBtn("Zavřít", closeTools));
  };
  openTools("Knihovna promptů", render);
}

async function toolKb() {
  let data;
  try { data = await apiJson("/api/kb"); } catch (e) { showToast(e.message); return; }
  const files = (data.items || []).map((n) => ({ name: n }));
  const sel = new Set(JSON.parse(localStorage.getItem("cg-kb") || "[]"));
  const render = (body, ft) => {
    body.replaceChildren();
    body.appendChild(noteEl("Zaškrtnuté soubory se přidají jako instrukce do nových konverzací."));
    for (const f of files) {
      const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = sel.has(f.name);
      cb.addEventListener("change", () => { cb.checked ? sel.add(f.name) : sel.delete(f.name); localStorage.setItem("cg-kb", JSON.stringify([...sel])); });
      body.appendChild(mkRow(f.name, "", [cb, mkBtn("Upravit", () => edit(f.name, body, ft)),
        mkBtn("Smazat", async () => { await apiJson("/api/kb_delete", { method: "POST", body: JSON.stringify({ name: f.name }) }); files.splice(files.indexOf(f), 1); sel.delete(f.name); localStorage.setItem("cg-kb", JSON.stringify([...sel])); render(body, ft); })]));
    }
    ft.replaceChildren(mkBtn("Nový soubor", () => edit("", body, ft)), mkBtn("Zavřít", closeTools, true));
  };
  const edit = async (name, body, ft) => {
    let content = "";
    if (name) { try { content = (await apiJson("/api/kb_file?name=" + encodeURIComponent(name))).text || ""; } catch (e) { showToast(e.message); } }
    body.replaceChildren();
    const n = document.createElement("input"); n.className = "text-input"; n.placeholder = "nazev.md"; n.value = name;
    const x = document.createElement("textarea"); x.value = content;
    body.append(n, x);
    ft.replaceChildren(mkBtn("Zpět", () => render(body, ft)), mkBtn("Uložit", async () => {
      const nm = n.value.trim(); if (!nm) return;
      await apiJson("/api/kb_save", { method: "POST", body: JSON.stringify({ name: nm, text: x.value }) });
      if (!files.some((f) => f.name === nm)) files.push({ name: nm, size: x.value.length });
      render(body, ft);
    }, true));
  };
  openTools("Znalostní báze", render);
}

async function toolCheckpoints() {
  const cur = state.current;
  if (!cur || !cur.id) { showToast("Nejdřív začněte konverzaci."); return; }
  let data;
  try { data = await apiJson("/api/checkpoints?id=" + encodeURIComponent(cur.id)); } catch (e) { showToast(e.message); return; }
  openTools("Kontrolní body", (body, ft) => {
    const items = data.items || [];
    if (!items.length) body.appendChild(noteEl("Zatím žádné kontrolní body. Vytvoří se před každým během v git repozitáři."));
    for (const c of items.slice().reverse()) {
      body.appendChild(mkRow((c.prompt || "").slice(0, 70) || c.ref.slice(0, 8), new Date((c.ts || 0) * 1000).toLocaleString("cs-CZ"), [
        mkBtn("Změny", async () => {
          const d = await apiJson("/api/cp_diff?id=" + encodeURIComponent(cur.id) + "&ref=" + encodeURIComponent(c.ref));
          body.replaceChildren(); const pre = document.createElement("pre"); pre.style.whiteSpace = "pre-wrap"; pre.textContent = d.text || "(beze změn)"; body.appendChild(pre);
        }),
        mkBtn("Obnovit", async () => {
          if (!confirm("Vrátit pracovní složku do stavu před tímto během?")) return;
          try { await apiJson("/api/cp_restore", { method: "POST", body: JSON.stringify({ id: cur.id, ref: c.ref }) }); showToast("Obnoveno."); closeTools(); } catch (e) { showToast(e.message); }
        }, true),
      ]));
    }
    ft.replaceChildren(mkBtn("Zavřít", closeTools, true));
  });
}

async function toolExport() {
  const cur = state.current;
  if (!cur) { showToast("Žádná konverzace."); return; }
  openTools("Export konverzace", (body, ft) => {
    body.appendChild(noteEl("Soubor se uloží do složky Stažené."));
    for (const fmt of ["md", "html", "pdf"]) {
      ft.appendChild(mkBtn(fmt.toUpperCase(), async () => {
        const parts = [];
        for (const m of $("messages").querySelectorAll(".msg")) {
          if (m.classList.contains("user")) parts.push({ r: "user", t: m._text || "", h: "" });
          else {
            const mds = [...m.querySelectorAll(".md")];
            parts.push({ r: "assistant", t: mds.map((x) => x.innerText.trim()).join("\n\n"), h: mds.map((x) => x.innerHTML).join("") });
          }
        }
        let content;
        if (fmt === "md") content = "# " + (cur.title || "Konverzace") + "\n\n" + parts.map((x) => (x.r === "user" ? "## Uživatel\n\n" : "## Asistent\n\n") + x.t).join("\n\n");
        else content = "<!doctype html><html><head><meta charset=\"utf-8\"><title>" + escapeHtml(cur.title || "Konverzace") + "</title><style>body{font-family:sans-serif;max-width:800px;margin:2em auto;line-height:1.5}pre{background:#f4f4f4;padding:8px;overflow:auto}.u{background:#eef;padding:8px 12px;border-radius:8px;margin:1em 0}</style></head><body><h1>" + escapeHtml(cur.title || "Konverzace") + "</h1>" + parts.map((x) => x.r === "user" ? '<div class="u">' + escapeHtml(x.t).replace(/\n/g, "<br>") + "</div>" : "<div>" + x.h + "</div>").join("") + "</body></html>";
        try {
          const r = await apiJson("/api/export", { method: "POST", body: JSON.stringify({ name: (cur.title || "konverzace").slice(0, 60), fmt, content }) });
          showToast("Uloženo: " + (r.path || "")); closeTools();
        } catch (e) { showToast(e.message); }
      }, fmt === "md"));
    }
  });
}

async function toolPreview() {
  let ports = [];
  try { ports = (await apiJson("/api/ports")).items || []; } catch (e) { /* nic */ }
  openTools("Náhled webu / aplikace", (body, ft) => {
    const inp = document.createElement("input"); inp.className = "text-input"; inp.placeholder = "http://localhost:3000 nebo /cesta/k/index.html";
    body.appendChild(inp);
    const go = async (u) => {
      u = (u || inp.value).trim(); if (!u) return;
      try { await apiJson("/api/preview", { method: "POST", body: JSON.stringify({ url: u }) }); closeTools(); } catch (e) { showToast(e.message); }
    };
    for (const pt of ports) body.appendChild(mkRow("localhost:" + (pt.port || pt), pt.proc || "", [mkBtn("Otevřít", () => go("http://localhost:" + (pt.port || pt)), true)]));
    ft.replaceChildren(mkBtn("Zavřít", closeTools), mkBtn("Otevřít náhled", () => go(), true));
    setTimeout(() => inp.focus(), 0);
  });
}

function toolCompact() {
  if (state.run) { showToast("Počkejte na dokončení práce."); return; }
  send("/compact");
}

/* mapování DOM zprávy na řádek přepisu */
async function lineOf(msg) {
  const cur = state.current;
  if (!cur || !cur.id) return null;
  const data = await apiJson("/api/session?id=" + encodeURIComponent(cur.id));
  const users = data.items.filter((i) => i.t === "user");
  const msgs = [...$("messages").querySelectorAll(".msg")];
  const doms = msgs.filter((m) => m.classList.contains("user"));
  if (users.length !== doms.length) return null;
  if (msg.classList.contains("user")) { const u = users[doms.indexOf(msg)]; return u ? u.line : null; }
  // asistent: řádek posledního prvku před další uživatelskou zprávou
  const idx = msgs.indexOf(msg);
  let ui = 0; for (let k = 0; k < idx; k++) if (msgs[k].classList.contains("user")) ui++;
  const start = ui ? users[ui - 1].line : 0;
  const next = users[ui] ? users[ui].line : Infinity;
  let last = null;
  for (const it of data.items) if (it.line != null && it.line >= start && it.line < next) last = it.line;
  return last == null ? null : last + 1;
}

async function branchFrom(msg, edit) {
  if (state.run) { showToast("Počkejte na dokončení práce."); return; }
  const cur = state.current;
  if (!cur || !cur.id) return;
  let upto;
  try { upto = await lineOf(msg); } catch (e) { showToast(e.message); return; }
  if (upto == null) { showToast("Zprávu se nepodařilo přiřadit k přepisu."); return; }
  const isUser = msg.classList.contains("user");
  try {
    const r = await apiJson("/api/branch", { method: "POST", body: JSON.stringify({ id: cur.id, upto, title: (cur.title || "Konverzace") + " (větev)" }) });
    await loadSessions();
    await openSession(r.id);
    if (isUser && edit) { $("input").value = msg._text || ""; autosize(); $("input").focus(); }
    showToast("Vytvořena nová větev.");
  } catch (e) { showToast(e.message); }
}

function reviewLast() {
  if (state.run) { showToast("Počkejte na dokončení práce."); return; }
  const cur = $("provider").value || "claude";
  const order = ["codex", "opencode", "claude"].filter((p) => p !== cur && (p === "claude" || (state.providers && state.providers[p] !== false && !(state.providers[p] && state.providers[p].available === false))));
  const rev = order[0] || "claude";
  $("provider").value = rev; $("provider").dispatchEvent(new Event("change"));
  send("Zkontroluj kriticky svou předchozí odpověď (poslední odpověď asistenta výše): najdi chyby, mezery a rizika a navrhni konkrétní opravy. Buď stručný.");
}

function initTools() {
  const pop = $("toolsPop");
  $("btnTools").addEventListener("click", (e) => { e.stopPropagation(); pop.hidden = !pop.hidden; });
  document.addEventListener("click", (e) => { if (!pop.hidden && !pop.contains(e.target)) pop.hidden = true; });
  pop.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tool]"); if (!b) return;
    pop.hidden = true;
    ({ prompts: toolPrompts, kb: toolKb, review: reviewLast, compact: toolCompact, export: toolExport, preview: toolPreview, checkpoints: toolCheckpoints })[b.dataset.tool]();
  });
  $("toolsClose").addEventListener("click", closeTools);
  toolsDlg().addEventListener("click", (e) => { if (e.target === toolsDlg()) closeTools(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !toolsDlg().hidden) closeTools(); });
}

