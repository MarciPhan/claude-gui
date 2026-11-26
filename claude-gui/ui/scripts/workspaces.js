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
  const w = wsById(wid) || { id: "w" + Date.now().toString(36), name: "", path: "", instructions: "", commands: [], mode: "", model: "", provider: "" };
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
  body.append(wsField("Název", name), wsField("Složka", path), dl, row,
    wsField("Instrukce pro Clauda", ins, "Přidají se do systémového promptu u každé nové konverzace v prostoru."),
    wsField("Příkazy", cmds, "Jeden na řádek, volitelně „název | příkaz“. Spouští se v seznamu prostoru."));
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
  const entries = [{ text: "Nová konverzace", icon: ICONS.plus, fn: () => startWorkspaceChat(wid) }];
  if (w.commands.length) {
    entries.push({ sep: true }, { label: "Příkazy" });
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
