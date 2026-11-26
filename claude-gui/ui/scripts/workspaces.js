/* ---------- pracovní prostory ---------- */

state.ws = { items: [] };

async function loadWorkspaces() {
  try {
    state.ws = await apiJson("/api/workspaces");
    renderList();
  } catch (e) { /* bez prostorů */ }
}

async function saveWorkspaces(items) {
  try {
    state.ws = await apiJson("/api/workspaces_save", { method: "POST", body: JSON.stringify({ items }) });
  } catch (e) {
    showToast("Prostory se nepodařilo uložit: " + e.message);
  }
  renderList();
  if (state.view === "ws") { if (wsById(state.wsView)) renderWorkspaceDashboard(); else setView("chat"); }
}

function wsById(id) { return state.ws.items.find((w) => w.id === id); }

function wsModal(title, bodyNode, buttons) {
  const dlg = document.createElement("div");
  dlg.className = "modal";
  const card = document.createElement("div");
  card.className = "modal-card ws-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  const head = document.createElement("div");
  head.className = "modal-head";
  const h = document.createElement("h2");
  h.textContent = title;
  const x = document.createElement("button");
  x.className = "icon-btn";
  x.type = "button";
  x.title = "Zavřít";
  x.setAttribute("aria-label", "Zavřít");
  x.innerHTML = ICONS.close;
  head.append(h, x);
  const foot = document.createElement("div");
  foot.className = "modal-foot";
  const close = () => dlg.remove();
  x.addEventListener("click", close);
  dlg.addEventListener("mousedown", (e) => { if (e.target === dlg) close(); });
  for (const b of buttons) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "btn" + (b.primary ? " primary" : "");
    el.textContent = b.text;
    el.addEventListener("click", () => b.fn(close));
    foot.appendChild(el);
  }
  card.append(head, bodyNode, foot);
  dlg.appendChild(card);
  document.body.appendChild(dlg);
  return { dlg, close };
}

function wsField(label, node, hint) {
  const l = document.createElement("label");
  l.className = "ws-field";
  const s = document.createElement("span");
  s.textContent = label;
  l.append(s, node);
  if (hint) { const p = document.createElement("small"); p.textContent = hint; l.appendChild(p); }
  return l;
}

function wsSelect(options, value) {
  const sel = document.createElement("select");
  sel.className = "text-input";
  for (const [v, t] of options) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = t;
    sel.appendChild(o);
  }
  sel.value = value || "";
  return sel;
}

async function editWorkspace(wid) {
  const w = wsById(wid) || { actions: [], id: "w" + Date.now().toString(36), name: "", path: "", instructions: "", commands: [], mode: "", model: "", provider: "" };
  const isNew = !wsById(wid);
  const body = document.createElement("div");
  body.className = "ws-form";
  const name = document.createElement("input");
  name.className = "text-input";
  name.maxLength = 80;
  name.value = w.name;
  const path = document.createElement("input");
  path.className = "text-input";
  path.value = w.path;
  path.setAttribute("list", "wsPaths");
  path.placeholder = "/home/marcipan/projekt";
  const dl = document.createElement("datalist");
  dl.id = "wsPaths";
  apiJson("/api/cwds").then((d) => {
    for (const c of d.cwds || []) { const o = document.createElement("option"); o.value = c.path; dl.appendChild(o); }
  }).catch(() => {});
  const prov = wsSelect([["", "Výchozí"], ["claude", "Claude"], ["codex", "Codex"], ["opencode", "OpenCode"]], w.provider);
  const model = wsSelect([["", "Výchozí"], ["opus", "Opus"], ["sonnet", "Sonnet"], ["haiku", "Haiku"]], w.model);
  const mode = wsSelect([["", "Výchozí"], ["default", "Ptát se"], ["acceptEdits", "Povolit úpravy"], ["auto", "Auto"], ["plan", "Plán"]], w.mode);
  const row = document.createElement("div");
  row.className = "ws-row";
  row.append(wsField("Poskytovatel", prov), wsField("Model", model), wsField("Oprávnění", mode));
  const ins = document.createElement("textarea");
  ins.className = "text-input ws-ta";
  ins.rows = 5;
  ins.value = w.instructions;
  ins.placeholder = "Např. stack, konvence, co nikdy nedělat…";
  const cmds = document.createElement("textarea");
  cmds.className = "text-input ws-ta";
  cmds.rows = 4;
  cmds.value = w.commands.map((c) => (c.name === c.cmd ? c.cmd : c.name + " | " + c.cmd)).join("\n");
  cmds.placeholder = "Testy | npm test\ngo vet ./...";
  const acts = document.createElement("textarea");
  acts.className = "text-input ws-ta";
  acts.rows = 6;
  acts.value = (w.actions || []).map((a) => "### " + a.name + (a.desc ? " | " + a.desc : "") + "\n" + a.prompt).join("\n\n");
  acts.placeholder = "### Audit | Podrobná kontrola\nText zadání pro Clauda…";
  body.append(wsField("Název", name), wsField("Složka", path), dl, row,
    wsField("Instrukce pro Clauda", ins, "Přidají se do systémového promptu u každé nové konverzace v prostoru."),
    wsField("Příkazy", cmds, "Jeden na řádek, volitelně „název | příkaz“. Spouští se na dashboardu prostoru."),
    wsField("Akce (zadání pro Clauda)", acts, "Každá začíná řádkem „### Název | popis“, pod ním text zadání. Na dashboardu z ní vznikne tlačítko, které spustí novou konverzaci."));
  wsModal(isNew ? "Nový pracovní prostor" : "Upravit prostor", body, [
    { text: "Zrušit", fn: (close) => close() },
    { text: "Uložit", primary: true, fn: async (close) => {
      const p = path.value.trim();
      if (!p) { showToast("Zadej složku prostoru."); return; }
      try {
        const chk = await apiJson("/api/checkdir?path=" + encodeURIComponent(p));
        if (!chk.ok) { showToast(chk.error || "Složka neexistuje."); return; }
        w.path = chk.path;
      } catch (e) { showToast(e.message); return; }
      w.name = name.value.trim() || basename(w.path);
      w.provider = prov.value;
      w.model = model.value;
      w.mode = mode.value;
      w.instructions = ins.value;
      w.commands = cmds.value.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
        const i = l.indexOf("|");
        return i > 0 ? { name: l.slice(0, i).trim(), cmd: l.slice(i + 1).trim() } : { name: l, cmd: l };
      }).filter((c) => c.cmd);
      w.actions = acts.value.split(/^### /m).map((b) => b.trim()).filter(Boolean).map((b) => {
        const nl = b.indexOf("\n");
        const head = (nl < 0 ? b : b.slice(0, nl)).trim();
        const i = head.indexOf("|");
        return { name: (i > 0 ? head.slice(0, i) : head).trim(), desc: i > 0 ? head.slice(i + 1).trim() : "", prompt: nl < 0 ? "" : b.slice(nl + 1).trim() };
      }).filter((a) => a.prompt);
      const items = state.ws.items.filter((x) => x.id !== w.id).concat([w]);
      state.open["w:" + w.id] = true;
      saveOpen();
      close();
      await saveWorkspaces(items);
    } },
  ]);
  name.focus();
}

async function runWsCommand(wid, index) {
  const w = wsById(wid);
  if (!w) return;
  const c = w.commands[index];
  const out = document.createElement("pre");
  out.className = "ws-out";
  out.textContent = "Spouštím…\n$ " + c.cmd;
  const m = wsModal(w.name + ": " + c.name, out, [{ text: "Zavřít", fn: (close) => close() }]);
  try {
    const r = await apiJson("/api/ws_run", { method: "POST", body: JSON.stringify({ id: wid, index }) });
    const status = r.code === 0 ? "hotovo" : r.code === null ? "přerušeno" : "skončilo s kódem " + r.code;
    out.textContent = "$ " + r.cmd + "\n\n" + (r.output || "(bez výstupu)") + "\n\n[" + status + ", " + r.seconds + " s]";
    out.classList.toggle("fail", r.code !== 0);
    out.scrollTop = out.scrollHeight;
  } catch (e) {
    out.textContent = "Chyba: " + e.message;
    out.classList.add("fail");
  }
  return m;
}

function startWorkspaceChat(wid) {
  const w = wsById(wid);
  if (!w) return;
  if (!w.exists) { showToast("Složka prostoru neexistuje: " + w.path); return; }
  startChatIn(w.path);
  state.current.workspace = w.id;
  if (w.provider) { $("provider").value = w.provider; localStorage.setItem("cg-provider", w.provider); }
  if (w.model) { $("model").value = w.model; localStorage.setItem("cg-model", w.model); }
  if (w.mode) { $("mode").value = w.mode; updateModeUi(); }
  syncPicker();
}

function workspaceMenu(anchor, wid) {
  const w = wsById(wid);
  if (!w) return;
  const entries = [];
  if (w.commands.length) {
    entries.push({ label: "Příkazy" });
    w.commands.forEach((c, i) => entries.push({ text: c.name, icon: ICONS.play, fn: () => runWsCommand(wid, i) }));
  }
  entries.push({ sep: true },
    { text: "Upravit prostor", icon: ICONS.edit, fn: () => editWorkspace(wid) },
    { text: "Smazat prostor", danger: true, fn: () => {
      saveWorkspaces(state.ws.items.filter((x) => x.id !== wid));
      showToast("Prostor je smazaný, složka i konverzace zůstaly.");
    } });
  showMenu(anchor, entries);
}

function startWorkspaceAction(wid, index) {
  const w = wsById(wid);
  const a = w && w.actions[index];
  if (!a) return;
  startWorkspaceChat(wid);
  if (state.current && state.current.workspace === wid) send(a.prompt);
}

function wsEl(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function openWorkspaceDashboard(wid) {
  const w = wsById(wid);
  if (!w) return;
  state.wsView = wid;
  setView("ws");
  renderWorkspaceDashboard();
}

function renderWorkspaceDashboard() {
  const host = $("wsView");
  const w = wsById(state.wsView);
  host.textContent = "";
  if (!w) return;
  const head = wsEl("header", "u-head");
  const menu = wsEl("button", "icon-btn only-narrow only-hidden");
  menu.type = "button";
  menu.innerHTML = ICONS.menu;
  menu.title = "Konverzace";
  menu.addEventListener("click", openSidebar);
  const h1 = wsEl("h1", "", w.name);
  const path = wsEl("small", "", w.path);
  path.style.cssText = "color:var(--faint);font:12px var(--mono)";
  const edit = wsEl("button", "btn", "Upravit");
  edit.type = "button";
  edit.addEventListener("click", () => editWorkspace(w.id));
  const nw = wsEl("button", "btn primary", "Nová konverzace");
  nw.type = "button";
  nw.addEventListener("click", () => startWorkspaceChat(w.id));
  head.append(menu, h1, path, edit, nw);
  const body = wsEl("div", "u-body");

  if (w.actions.length) {
    const sec = wsEl("section", "wsd-sec");
    sec.appendChild(wsEl("h2", "", "Akce"));
    const grid = wsEl("div", "wsd-grid");
    w.actions.forEach((a, i) => {
      const b = wsEl("button", "wsd-card");
      b.type = "button";
      b.append(wsEl("b", "", a.name), wsEl("span", "", a.desc || a.prompt.slice(0, 110) + "…"));
      b.addEventListener("click", () => startWorkspaceAction(w.id, i));
      grid.appendChild(b);
    });
    sec.appendChild(grid);
    body.appendChild(sec);
  }
  if (w.commands.length) {
    const sec = wsEl("section", "wsd-sec");
    sec.appendChild(wsEl("h2", "", "Příkazy"));
    const grid = wsEl("div", "wsd-grid");
    w.commands.forEach((c, i) => {
      const b = wsEl("button", "wsd-card cmd");
      b.type = "button";
      b.innerHTML = ICONS.play;
      b.appendChild(wsEl("b", "", c.name));
      b.addEventListener("click", () => runWsCommand(w.id, i));
      grid.appendChild(b);
    });
    sec.appendChild(grid);
    body.appendChild(sec);
  }
  const recent = state.sessions.filter((s) => s.cwd === w.path).sort((a, b) => b.mtime - a.mtime).slice(0, 8);
  const sec = wsEl("section", "wsd-sec");
  sec.appendChild(wsEl("h2", "", "Poslední konverzace"));
  if (!recent.length) sec.appendChild(wsEl("div", "wsd-note", "Zatím žádná konverzace."));
  else {
    const list = wsEl("div", "wsd-recent");
    const startToday = new Date().setHours(0, 0, 0, 0);
    for (const s of recent) {
      const b = wsEl("button");
      b.type = "button";
      b.append(wsEl("span", "", s.title || s.first || "Konverzace"), wsEl("small", "", formatTime(s.mtime * 1000, startToday)));
      b.addEventListener("click", () => { setView("chat"); openSession(s.id); });
      list.appendChild(b);
    }
    sec.appendChild(list);
  }
  body.appendChild(sec);
  if (w.instructions.trim()) {
    const s2 = wsEl("section", "wsd-sec");
    s2.appendChild(wsEl("h2", "", "Instrukce prostoru"));
    s2.appendChild(wsEl("div", "wsd-note", w.instructions));
    body.appendChild(s2);
  }
  host.append(head, body);
}
