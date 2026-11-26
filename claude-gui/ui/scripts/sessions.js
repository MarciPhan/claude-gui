/* ======================= Seznam konverzací ======================= */

let loadingSessions = null;
function loadSessions() {
  if (loadingSessions) return loadingSessions;
  loadingSessions = (async () => {
    try {
      const d = await apiJson("/api/sessions");
      state.sessions = d.sessions || [];
      const n = state.sessions.length;
      $("countInfo").textContent = n + " " + plural(n, "konverzace", "konverzace", "konverzací");
      renderList();
    } catch (e) {
      showToast("Seznam konverzací se nenačetl: " + e.message);
    } finally {
      loadingSessions = null;
    }
  })();
  return loadingSessions;
}

function formatTime(ts, startToday) {
  const d = new Date(ts);
  if (ts >= startToday) return d.toLocaleTimeString(LOC(), { hour: "2-digit", minute: "2-digit" });
  const now = new Date();
  if (document.documentElement.lang === "en") return d.toLocaleDateString("en-GB", d.getFullYear() === now.getFullYear() ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
  if (d.getFullYear() === now.getFullYear()) return d.getDate() + ". " + (d.getMonth() + 1) + ".";
  return d.getDate() + ". " + (d.getMonth() + 1) + ". " + d.getFullYear();
}

function timeGroups(items) {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
  const dow = (now.getDay() + 6) % 7; // pondělí = 0
  const startWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow).getTime();
  const groups = [["Dnes", []], ["Včera", []], ["Tento týden", []], ["Starší", []]];
  for (const s of items) {
    const t = s.mtime * 1000;
    groups[t >= startToday ? 0 : t >= startYesterday ? 1 : t >= startWeek ? 2 : 3][1].push(s);
  }
  return { groups, startToday };
}

function itemRow(s, startToday) {
  const row = document.createElement("div");
  row.className = "item-row";
  const b = document.createElement("button");
  b.type = "button";
  b.className = "item" + (state.current && state.current.id === s.id ? " active" : "") + (state.runs.some((r) => r.cur.id === s.id) ? " running" : "");
  b.dataset.id = s.id;
  b.title = (s.first || s.title) + (s.cwd ? "\n" + s.cwd : "");
  b.innerHTML = '<div class="item-title"></div><div class="item-meta"><span class="item-folder">' + ICONS.folder + '<span></span></span><span class="item-time"></span></div>';
  b.querySelector(".item-title").textContent = s.title;
  b.querySelector(".item-folder span").textContent = basename(s.cwd) || s.project;
  b.querySelector(".item-time").textContent = formatTime(s.mtime * 1000, startToday);
  const more = document.createElement("button");
  more.type = "button";
  more.className = "item-more";
  more.dataset.id = s.id;
  more.title = "Další akce";
  more.setAttribute("aria-label", "Další akce");
  more.innerHTML = ICONS.more;
  row.append(b, more);
  return row;
}

function getPins() {
  try { return new Set(JSON.parse(localStorage.getItem("cg-pins") || "[]")); } catch (e) { return new Set(); }
}
function togglePin(sid) {
  const s = getPins();
  if (s.has(sid)) s.delete(sid); else s.add(sid);
  try { localStorage.setItem("cg-pins", JSON.stringify([...s])); } catch (e) { /* bez uložení */ }
  renderList();
}

function isOpen(key, hasCurrent) {
  if (key in state.open) return !!state.open[key];
  return key.startsWith("f:") || key === "pin" || hasCurrent;
}

function groupEl(key, iconHtml, name, count, arr, startToday, actHtml, actData, emptyText, extra, extra2) {
  const hasCurrent = !!state.current && arr.some((s) => s.id === state.current.id);
  const open = isOpen(key, hasCurrent);
  const g = document.createElement("div");
  g.className = "grp" + (open ? " open" : "");
  const head = document.createElement("button");
  head.type = "button";
  head.className = "grp-head";
  head.dataset.key = key;
  head.innerHTML = '<span class="chev">' + ICONS.chevron + '</span><span class="ic-folder">' + iconHtml + '</span><span class="grp-name"></span><span class="grp-count"></span>';
  head.querySelector(".grp-name").textContent = name;
  head.querySelector(".grp-count").textContent = count;
  g.appendChild(head);
  if (actHtml) {
    const act = document.createElement("button");
    act.type = "button";
    act.className = "grp-act";
    act.innerHTML = actHtml.icon;
    act.title = actHtml.title;
    act.setAttribute("aria-label", actHtml.title);
    for (const [k, v] of Object.entries(actData)) act.dataset[k] = v;
    g.appendChild(act);
  }
  if (extra) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "grp-act second";
    b.innerHTML = extra.icon;
    b.title = extra.title;
    b.setAttribute("aria-label", extra.title);
    for (const [k, v] of Object.entries(extra.data)) b.dataset[k] = v;
    g.appendChild(b);
  }
  if (extra2) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "grp-act third";
    b.innerHTML = extra2.icon;
    b.title = extra2.title;
    b.setAttribute("aria-label", extra2.title);
    for (const [k, v] of Object.entries(extra2.data)) b.dataset[k] = v;
    g.appendChild(b);
  }
  if (open) {
    const body = document.createElement("div");
    body.className = "grp-body";
    if (!arr.length && emptyText) {
      const e = document.createElement("div");
      e.className = "grp-empty";
      e.textContent = emptyText;
      body.appendChild(e);
    }
    for (const s of arr) body.appendChild(itemRow(s, startToday));
    g.appendChild(body);
  }
  return g;
}

function renderList() {
  const q = state.query.trim().toLowerCase();
  let items = state.sessions;
  if (q) {
    items = items.filter((s) =>
      (s.title + "\n" + (s.first || "") + "\n" + (s.cwd || "")).toLowerCase().includes(q) ||
      (state.serverHits && state.serverHits.has(s.id)));
  }
  const list = $("list");
  list.classList.toggle("searching", !!q);
  list.innerHTML = "";
  const folders = state.org.folders;
  if (!items.length && (q || state.sideMode === "projects" || !folders.length)) {
    list.innerHTML = '<div class="list-empty">' + (q ? "Nic nenalezeno." : "Zatím tu nejsou žádné konverzace.") + "</div>";
    return;
  }
  const frag = document.createDocumentFragment();
  const { startToday } = timeGroups(items);
  const labeled = (label, arr) => {
    const g = document.createElement("div");
    g.className = "group-label";
    g.textContent = label;
    frag.appendChild(g);
    for (const s of arr) frag.appendChild(itemRow(s, startToday));
  };

  if (q) {
    for (const [label, arr] of timeGroups(items).groups) if (arr.length) labeled(label, arr);
  } else if (state.sideMode === "projects") {
    const byCwd = new Map();
    for (const s of items) {
      const k = s.cwd || s.project;
      if (!byCwd.has(k)) byCwd.set(k, []);
      byCwd.get(k).push(s);
    }
    const wsPaths = new Set(state.ws.items.map((w) => w.path));
    const wsHead = document.createElement("div");
    wsHead.className = "sec-head";
    wsHead.innerHTML = '<span>Pracovní prostory</span><button type="button" class="icon-btn" data-act="newws" title="Nový pracovní prostor" aria-label="Nový pracovní prostor">' + ICONS.plus + "</button>";
    frag.appendChild(wsHead);
    if (!state.ws.items.length) {
      const hint = document.createElement("div");
      hint.className = "empty-note";
      hint.textContent = "Prostor spojí složku, výchozí nastavení, instrukce a příkazy. Vytvoř ho tlačítkem +.";
      frag.appendChild(hint);
    }
    for (const w of state.ws.items) {
      const arr = (byCwd.get(w.path) || []).slice();
      const g = groupEl("w:" + w.id, ICONS.folder, w.name, arr.length, arr, startToday,
        { icon: ICONS.more, title: "Akce prostoru" }, { act: "wsmenu", wid: w.id }, "Zatím žádná konverzace",
        { icon: ICONS.plus, title: "Nová konverzace v prostoru", data: { act: "wsnew", wid: w.id } },
        { icon: ICONS.usage, title: "Dashboard prostoru", data: { act: "wsdash", wid: w.id } });
      g.querySelector(".grp-head").title = w.path + (w.exists ? "" : " (složka neexistuje)");
      frag.appendChild(g);
    }
    const projects = [...byCwd.entries()].filter(([k]) => !wsPaths.has(k)).sort((a, b) => b[1][0].mtime - a[1][0].mtime);
    if (projects.length) {
      const head = document.createElement("div");
      head.className = "sec-head";
      head.innerHTML = "<span>Ostatní složky</span>";
      frag.appendChild(head);
    }
    for (const [cwd, arr] of projects) {
      const g = groupEl("p:" + cwd, ICONS.folder, basename(cwd) || cwd, arr.length, arr, startToday,
        { icon: ICONS.plus, title: "Nová konverzace v této složce" }, { act: "newchat", cwd });
      g.querySelector(".grp-head").title = cwd;
      frag.appendChild(g);
    }
  } else {
    const pins = getPins();
    const pinned = items.filter((s) => pins.has(s.id));
    if (pinned.length) {
      items = items.filter((s) => !pins.has(s.id));
      frag.appendChild(groupEl("pin", ICONS.pin, "Připnuté", pinned.length, pinned, startToday, null, {}));
    }
    const head = document.createElement("div");
    head.className = "sec-head";
    head.innerHTML = '<span>Složky</span><button type="button" class="icon-btn" data-act="newfolder" title="Nová složka" aria-label="Nová složka">' + ICONS.foldernew + "</button>";
    frag.appendChild(head);
    const assign = state.org.assign;
    const ids = new Set(folders.map((f) => f.id));
    for (const f of folders) {
      const arr = items.filter((s) => assign[s.id] === f.id);
      frag.appendChild(groupEl("f:" + f.id, ICONS.folder, f.name, arr.length, arr, startToday,
        { icon: ICONS.more, title: "Akce složky" }, { act: "foldermenu", fid: f.id }, "Prázdná složka"));
    }
    const rest = items.filter((s) => !ids.has(assign[s.id]));
    for (const [label, arr] of timeGroups(rest).groups) if (arr.length) labeled(label, arr);
  }
  list.appendChild(frag);
}

/* ---------- složky, nabídky, dialog s textem ---------- */

function saveOpen() { try { localStorage.setItem("cg-open", JSON.stringify(state.open)); } catch (e) { /* ignorovat */ } }

async function loadOrg() {
  try {
    const d = await apiJson("/api/org");
    state.org = { folders: d.folders || [], assign: d.assign || {} };
    renderList();
  } catch (e) { /* bez složek */ }
}

async function saveOrg() {
  try {
    const d = await apiJson("/api/org_save", { method: "POST", body: JSON.stringify(state.org) });
    state.org = { folders: d.folders, assign: d.assign };
  } catch (e) {
    showToast("Složky se nepodařilo uložit: " + e.message);
  }
  renderList();
}

function askText(title, value, okLabel) {
  return new Promise((resolve) => {
    const dlg = $("dlgText"), input = $("dlgTextInput");
    $("dlgTextTitle").textContent = title;
    $("dlgTextOk").textContent = okLabel || "Uložit";
    input.value = value || "";
    dlg.hidden = false;
    input.focus();
    input.select();
    const done = (v) => {
      dlg.hidden = true;
      for (const [el, ev, fn] of handlers) el.removeEventListener(ev, fn);
      resolve(v);
    };
    const ok = () => { const v = input.value.trim(); if (v) done(v); };
    const handlers = [
      [$("dlgTextOk"), "click", ok], [$("dlgTextCancel"), "click", () => done(null)],
      [$("dlgTextClose"), "click", () => done(null)],
      [dlg, "click", (e) => { if (e.target === dlg) done(null); }],
      [input, "keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); ok(); } else if (e.key === "Escape") done(null); }],
    ];
    for (const [el, ev, fn] of handlers) el.addEventListener(ev, fn);
  });
}

function hideMenu() {
  $("menu").hidden = true;
  for (const el of document.querySelectorAll(".item-more.open")) el.classList.remove("open");
}

function showMenu(anchor, entries) {
  const m = $("menu");
  m.innerHTML = "";
  for (const e of entries) {
    if (e.sep) { const s = document.createElement("div"); s.className = "m-sep"; m.appendChild(s); continue; }
    if (e.label && !e.fn) { const l = document.createElement("div"); l.className = "m-label"; l.textContent = e.label; m.appendChild(l); continue; }
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "menuitem");
    b.className = (e.danger ? "danger " : "") + (e.on ? "on" : "");
    b.innerHTML = (e.icon || "") + "<span></span>";
    b.lastChild.textContent = e.text;
    b.addEventListener("click", () => { hideMenu(); e.fn(); });
    m.appendChild(b);
  }
  m.hidden = false;
  anchor.classList.add("open");
  const r = anchor.getBoundingClientRect();
  const w = m.offsetWidth, hh = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + "px";
  m.style.top = (r.bottom + hh + 8 > innerHeight ? Math.max(8, r.top - hh - 4) : r.bottom + 4) + "px";
}

async function newFolder(thenAssign) {
  const name = await askText("Nová složka", "", "Vytvořit");
  if (!name) return;
  const id = "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  state.org.folders.push({ id, name });
  if (thenAssign) state.org.assign[thenAssign] = id;
  state.open["f:" + id] = true;
  saveOpen();
  await saveOrg();
}

function sessionMenu(anchor, sid) {
  const cur = state.org.assign[sid];
  const entries = [
    { text: getPins().has(sid) ? "Odepnout" : "Připnout", icon: ICONS.pin, fn: () => togglePin(sid) },
    { text: "Otevřít vedle sebe", icon: ICONS.split, fn: () => (IS_PANE ? window.parent : window).openInPane(sid) },
    { sep: true },
    { label: "Přesunout do složky" },
  ];
  for (const f of state.org.folders) {
    entries.push({ text: f.name, icon: ICONS.folder, on: cur === f.id, fn: () => { state.org.assign[sid] = f.id; state.open["f:" + f.id] = true; saveOpen(); saveOrg(); } });
  }
  entries.push({ text: "Nová složka…", icon: ICONS.foldernew, fn: () => newFolder(sid) });
  if (cur) { entries.push({ sep: true }); entries.push({ text: "Odebrat ze složky", fn: () => { delete state.org.assign[sid]; saveOrg(); } }); }
  showMenu(anchor, entries);
}

function folderMenu(anchor, fid) {
  const f = state.org.folders.find((x) => x.id === fid);
  if (!f) return;
  showMenu(anchor, [
    { text: "Přejmenovat", fn: async () => { const n = await askText("Přejmenovat složku", f.name); if (n) { f.name = n; saveOrg(); } } },
    { text: "Smazat složku", danger: true, fn: () => {
      state.org.folders = state.org.folders.filter((x) => x.id !== fid);
      for (const k of Object.keys(state.org.assign)) if (state.org.assign[k] === fid) delete state.org.assign[k];
      saveOrg();
      showToast("Složka je smazaná, konverzace zůstaly v seznamu.");
    } },
  ]);
}

function startChatIn(cwd) {
  leaveConv();
  state.current = { id: null, cwd, title: "Nová konverzace", cwdExists: true };
  localStorage.removeItem(LAST_KEY);
  if (state.view !== "chat") setView("chat");
  $("ctx").hidden = true;
  updateHeader();
  markActive();
  showNewEmpty(cwd);
  syncRunUi();
  closeSidebar();
  $("input").focus();
}

function onListClick(e) {
  const t = e.target;
  const item = t.closest(".item");
  if (item) { openSession(item.dataset.id); return; }
  const more = t.closest(".item-more");
  if (more) { e.stopPropagation(); sessionMenu(more, more.dataset.id); return; }
  const act = t.closest("[data-act]");
  if (act) {
    e.stopPropagation();
    const a = act.dataset.act;
    if (a === "newchat") startChatIn(act.dataset.cwd);
    else if (a === "newws") editWorkspace(null);
    else if (a === "wsnew") startWorkspaceChat(act.dataset.wid);
    else if (a === "wsdash") openWorkspaceDashboard(act.dataset.wid);
    else if (a === "wsmenu") workspaceMenu(act, act.dataset.wid);
    else if (a === "newfolder") newFolder();
    else if (a === "foldermenu") folderMenu(act, act.dataset.fid);
    return;
  }
  const head = t.closest(".grp-head");
  if (head) {
    const key = head.dataset.key;
    state.open[key] = !head.parentElement.classList.contains("open");
    saveOpen();
    renderList();
  }
}

function markActive() {
  for (const el of $("list").querySelectorAll(".item")) {
    el.classList.toggle("active", !!state.current && el.dataset.id === state.current.id);
  }
}

