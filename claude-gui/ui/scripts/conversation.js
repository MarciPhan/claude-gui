/* ======================= Hledání ======================= */

let searchTimer = null;
function onSearchInput() {
  state.query = $("search").value;
  const q = state.query.trim();
  state.serverHits = null;
  renderList();
  clearTimeout(searchTimer);
  const info = $("searchInfo");
  if (q.length < 2) { info.hidden = true; return; }
  searchTimer = setTimeout(async () => {
    const seq = ++state.searchSeq;
    info.hidden = false;
    info.innerHTML = '<span class="mini-spin"></span><span>Prohledávám text konverzací</span>';
    try {
      const d = await apiJson("/api/search?q=" + encodeURIComponent(q));
      if (seq !== state.searchSeq || state.query.trim() !== q) return;
      state.serverHits = new Set(d.ids || []);
      const n = state.serverHits.size;
      info.textContent = "Text obsahuje " + n + " " + plural(n, "konverzace", "konverzace", "konverzací");
      renderList();
    } catch (e) {
      if (seq === state.searchSeq) info.textContent = "Fulltext selhal: " + e.message;
    }
  }, 350);
}

/* ======================= Otevření konverzace ======================= */

async function openSession(id) {
  const meta = state.sessions.find((s) => s.id === id);
  leaveConv();
  state.current = { id, cwd: meta ? meta.cwd : "", title: meta ? meta.title : "Konverzace", cwdExists: undefined };
  localStorage.setItem(LAST_KEY, id);
  if (state.view !== "chat") setView("chat");
  $("ctx").hidden = true;
  updateHeader();
  markActive();
  closeSidebar();
  syncRunUi();
  if (enterConv()) {
    stick = true;
    autoScroll(true);
    refreshContext();
    return;
  }
  const box = $("messages");
  box.innerHTML = "";
  box.appendChild(noteEl("Načítám přepis…"));
  try {
    const data = await apiJson("/api/session?id=" + encodeURIComponent(id));
    if (!state.current || state.current.id !== id) return;
    if (data.cwd) state.current.cwd = data.cwd;
    if (data.title) state.current.title = data.title;
    state.current.cwdExists = data.cwd_exists;
    updateHeader();
    renderTranscript(data);
    refreshContext();
  } catch (e) {
    if (!state.current || state.current.id !== id) return;
    box.innerHTML = "";
    box.appendChild(noteEl("Přepis se nenačetl: " + e.message, "error"));
  }
}

function renderTranscript(data) {
  const box = $("messages");
  box.innerHTML = "";
  if (data.truncated) {
    box.appendChild(noteEl("Přepis je zkrácený: zobrazuji posledních " + data.items.length + " z " + data.total + " položek.", "info"));
  }
  let group = null;
  for (const it of data.items) {
    if (it.t === "user") { group = null; box.appendChild(userEl(it.text, it.images)); continue; }
    if (it.t === "note") { group = null; box.appendChild(noteEl(it.text)); continue; }
    if (!group) { group = assistantEl(); box.appendChild(group.el); }
    if (it.t === "text" && it.provider && group.prov !== it.provider) { group.prov = it.provider; group.body.appendChild(provLabel(PROV_NAMES[it.provider] || it.provider)); }
    if (it.t === "text") group.body.appendChild(textEl(it.text));
    else if (it.t === "thinking") group.body.appendChild(thinkingEl(it.text));
    else if (it.t === "tool") group.body.appendChild(toolEl(it));
  }
  if (!data.items.length) box.appendChild(noteEl("Konverzace neobsahuje žádné zobrazitelné zprávy."));
  stick = true;
  autoScroll(true);
}

/* ======================= Dialog nové konverzace ======================= */

async function openNewDialog() {
  closeSidebar();
  $("dlgError").hidden = true;
  $("dlg").hidden = false;
  const input = $("cwdInput");
  input.value = (state.current && state.current.cwd) || "";
  input.focus();
  input.select();
  const list = $("cwdList");
  list.innerHTML = '<div class="list-empty">Načítám složky…</div>';
  try {
    const d = await apiJson("/api/cwds");
    list.innerHTML = "";
    if (!input.value && d.cwds.length) input.value = d.cwds[0].path;
    if (!d.cwds.length) {
      list.innerHTML = '<div class="list-empty">Zatím žádné použité složky. Zadejte cestu ručně.</div>';
      if (!input.value) input.value = d.home;
    }
    for (const c of d.cwds) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cwd-item";
      b.innerHTML = ICONS.folder + '<div class="cwd-item-text"><div class="cwd-item-name"></div><div class="cwd-item-path"></div></div>';
      b.querySelector(".cwd-item-name").textContent = c.name;
      b.querySelector(".cwd-item-path").textContent = c.path;
      b.addEventListener("click", () => {
        input.value = c.path;
        for (const x of list.querySelectorAll(".cwd-item")) x.classList.toggle("sel", x === b);
      });
      b.addEventListener("dblclick", () => { input.value = c.path; confirmNew(); });
      list.appendChild(b);
    }
  } catch (e) {
    list.innerHTML = "";
    list.appendChild(noteEl("Složky se nenačetly: " + e.message, "error"));
  }
}

function closeNewDialog() { $("dlg").hidden = true; }

async function confirmNew() {
  const raw = $("cwdInput").value.trim();
  const err = $("dlgError");
  if (!raw) { err.textContent = "Zadejte pracovní složku."; err.hidden = false; return; }
  try {
    const d = await apiJson("/api/checkdir?path=" + encodeURIComponent(raw));
    if (!d.ok) { err.textContent = d.error || "Tahle složka neexistuje."; err.hidden = false; return; }
    state.current = { id: null, cwd: d.path, title: "Nová konverzace", cwdExists: true };
    if (state.view !== "chat") setView("chat");
    $("ctx").hidden = true;
    localStorage.removeItem(LAST_KEY);
    closeNewDialog();
    updateHeader();
    markActive();
    showNewEmpty(d.path);
    $("input").focus();
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
  }
}

