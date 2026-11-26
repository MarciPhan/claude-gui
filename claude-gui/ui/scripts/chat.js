/* ======================= Odesílání a stream ======================= */

function setStatus(text) { $("statusText").textContent = text; }

const ATT_MAX = 40 * 1024 * 1024;
state.att = [];

function fmtSize(n) {
  return n < 1024 ? n + " B" : n < 1048576 ? Math.round(n / 1024) + " kB" : (n / 1048576).toLocaleString(LOC(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " MB";
}

function renderAtt() {
  const box = $("attStrip");
  box.hidden = !state.att.length;
  box.replaceChildren(...state.att.map((a) => {
    const chip = document.createElement("div");
    chip.className = "att-chip" + (a.pending ? " pending" : "");
    chip.title = a.name;
    if (a.thumb) {
      const im = document.createElement("img");
      im.src = a.thumb;
      im.alt = "";
      im.title = "Zvětšit";
      im.addEventListener("click", () => openLightbox(a.thumb, a.name));
      chip.appendChild(im);
    } else {
      const ic = document.createElement("span");
      ic.className = "att-ic";
      ic.innerHTML = ICONS.file;
      chip.appendChild(ic);
    }
    const t = document.createElement("span");
    t.className = "att-t";
    const n = document.createElement("b");
    n.textContent = a.name;
    const s = document.createElement("small");
    s.textContent = a.pending ? "nahrávám…" : fmtSize(a.size);
    t.append(n, s);
    const x = document.createElement("button");
    x.type = "button";
    x.className = "att-x";
    x.title = "Odebrat přílohu";
    x.setAttribute("aria-label", "Odebrat přílohu " + a.name);
    x.innerHTML = ICONS.close;
    x.addEventListener("click", () => {
      if (a.thumb) URL.revokeObjectURL(a.thumb);
      state.att = state.att.filter((e) => e !== a);
      renderAtt();
      updateSendButton();
    });
    chip.append(t, x);
    return chip;
  }));
}

function readB64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).slice(String(r.result).indexOf(",") + 1));
    r.onerror = () => reject(new Error("Soubor nejde přečíst."));
    r.readAsDataURL(file);
  });
}

async function addFiles(files) {
  for (const f of Array.from(files || [])) {
    if (f.size > ATT_MAX) { showToast(f.name + ": soubor je větší než 40 MB."); continue; }
    if (state.att.length >= 20) { showToast("Nejvýše 20 příloh najednou."); break; }
    const name = f.name || ("vložený-obrázek." + ((f.type || "image/png").split("/")[1] || "png").replace("jpeg", "jpg"));
    const a = { name, size: f.size, pending: true, thumb: /^image\//.test(f.type) ? URL.createObjectURL(f) : "" };
    state.att.push(a);
    renderAtt();
    updateSendButton();
    try {
      const r = await apiJson("/api/upload", { method: "POST", body: JSON.stringify({ name, data: await readB64(f) }) });
      a.path = r.path;
      a.name = r.name;
      a.size = r.size;
      a.pending = false;
    } catch (e) {
      showToast("Přílohu se nepodařilo nahrát: " + e.message);
      if (a.thumb) URL.revokeObjectURL(a.thumb);
      state.att = state.att.filter((x) => x !== a);
    }
    renderAtt();
    updateSendButton();
  }
}

function addNative(files, errors) {
  for (const e of errors || []) showToast(e);
  if (!files.length) return;
  if (!state.current) { showToast("Nejdřív otevřete nebo založte konverzaci."); return; }
  for (const f of files) {
    if (state.att.length >= 20) { showToast("Nejvýše 20 příloh najednou."); break; }
    const a = { name: f.name, size: f.size, path: f.path, pending: false, thumb: "" };
    state.att.push(a);
    if (IMG_RE.test(f.name)) loadThumb(f.path).then((src) => { a.thumb = src; renderAtt(); }).catch(() => {});
  }
  renderAtt();
  updateSendButton();
  $("input").focus();
}

window.__dropHover = (on) => { $("dropOv").hidden = !(on && state.current); };
window.__onFiles = (files, x, y, errors) => {
  if (!IS_PANE && document.body.classList.contains("multi")) {
    const hit = [...document.querySelectorAll("#gridPanes iframe")].find((f) => {
      const r = f.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    });
    if (hit) { try { hit.contentWindow.__onFiles(files, 0, 0, errors); return; } catch (e) { /* panel nepřipravený */ } }
    showToast("Pusťte soubory do konkrétního panelu.");
    return;
  }
  addNative(files, errors);
};

function attMessage(text, atts) {
  if (!atts.length) return text;
  const inl = atts.filter((a) => /\.(png|jpe?g|gif|webp)$/i.test(a.path)).length;
  const head = inl === atts.length ? "[Přílohy - obrázky jsou přiložené přímo ve zprávě]"
    : inl ? "[Přílohy - obrázky jsou přiložené přímo ve zprávě, ostatní soubory otevři nástrojem Read]"
    : "[Přílohy - soubory na disku, otevři je nástrojem Read]";
  return (text ? text + "\n\n" : "") + head + "\n" + atts.map((a) => "- " + a.path).join("\n");
}

function updateSendButton() {
  const btn = $("btnSend");
  const has = !!$("input").value.trim() || state.att.length > 0;
  if (state.run && has) {
    btn.className = "send";
    btn.innerHTML = ICONS.send;
    btn.title = "Zařadit do fronty";
    btn.setAttribute("aria-label", "Zařadit do fronty");
    btn.disabled = false;
  } else if (state.run) {
    btn.className = "send stop";
    btn.innerHTML = ICONS.stop;
    btn.title = "Zastavit";
    btn.setAttribute("aria-label", "Zastavit");
    btn.disabled = false;
  } else {
    btn.className = "send";
    btn.innerHTML = ICONS.send;
    btn.title = "Odeslat";
    btn.setAttribute("aria-label", "Odeslat");
    btn.disabled = !has || state.att.some((a) => a.pending);
  }
}

function setRunning(on) {
  $("status").hidden = !on;
  $("mode").disabled = on;
  $("model").disabled = on;
  $("env").disabled = on;
  $("btnPick").disabled = on;
  $("btnClear").disabled = on;
  if (on) togglePop(false);
  if (on) setStatus("Claude pracuje");
  updateSendButton();
}

function adoptSession(id, cur) {
  if (!id || !cur) return;
  cur.id = id;
  if (state.current === cur) {
    localStorage.setItem(LAST_KEY, id);
    markActive();
  }
}

state.runs = [];   // všechny běžící konverzace: { controller, runId, cur, status, stopped }
state.stash = [];  // odložený obsah konverzací, které běží na pozadí: { cur, holder }
Object.defineProperty(state, "run", { get() { return state.runs.find((r) => sameConv(r.cur, state.current)) || null; } });

const stashOf = (cur) => state.stash.find((s) => sameConv(s.cur, cur));
const runOf = (cur) => state.runs.find((r) => sameConv(r.cur, cur)) || null;
const isShown = (cur) => sameConv(cur, state.current);

function boxFor(cur) {
  if (isShown(cur)) return $("messages");
  let s = stashOf(cur);
  if (!s) { s = { cur, holder: document.createElement("div") }; state.stash.push(s); }
  return s.holder;
}

function leaveConv() {
  const cur = state.current;
  if (!cur || !(runOf(cur) || state.queue.some((q) => sameConv(q.cur, cur)))) return;
  let s = stashOf(cur);
  if (!s) { s = { cur, holder: document.createElement("div") }; state.stash.push(s); }
  s.holder.replaceChildren(...Array.from($("messages").childNodes));
}

function enterConv() {
  const s = stashOf(state.current);
  if (!s) return false;
  $("messages").replaceChildren(...Array.from(s.holder.childNodes));
  state.stash = state.stash.filter((x) => x !== s);
  return true;
}

function syncRunUi() {
  const r = state.run;
  setRunning(!!r);
  if (r) setStatus(r.status || "Claude pracuje");
  renderQueue();
  markRunning();
}

function markRunning() {
  for (const el of $("list").querySelectorAll(".item")) {
    el.classList.toggle("running", state.runs.some((r) => r.cur.id && r.cur.id === el.dataset.id));
  }
}

function createLive(cur) {
  const box = { appendChild: (el) => boxFor(cur).appendChild(el) };
  const live = {
    cur, group: null, seg: null, segText: "", sawDelta: false,
    hadResult: false, tools: new Map(), pending: false,
  };
  live.scroll = () => { if (isShown(cur)) autoScroll(); };
  live.setStatus = (t) => {
    const r = runOf(cur);
    if (r) r.status = t;
    if (isShown(cur)) setStatus(t);
  };
  live.ensureGroup = () => {
    if (!live.group) {
      live.group = assistantEl();
      box.appendChild(live.group.el);
      if (live.provLabel) live.group.body.appendChild(provLabel(live.provLabel));
    }
    return live.group;
  };
  live.render = () => {
    live.pending = false;
    if (live.seg) live.seg.innerHTML = renderMarkdown(live.segText);
    live.scroll();
  };
  live.newSeg = () => { if (live.seg) live.render(); live.seg = null; live.segText = ""; };
  live.appendText = (t) => {
    if (!live.seg) {
      live.seg = document.createElement("div");
      live.seg.className = "md";
      live.ensureGroup().body.appendChild(live.seg);
      live.segText = "";
    }
    live.segText += t;
    if (!live.pending) { live.pending = true; requestAnimationFrame(live.render); }
  };
  live.addBlock = (el) => { live.newSeg(); live.ensureGroup().body.appendChild(el); live.scroll(); };
  live.note = (text, kind) => { live.newSeg(); live.group = null; box.appendChild(noteEl(text, kind)); live.scroll(); };
  live.meta = (ev) => {
    const parts = [];
    if (typeof ev.duration_ms === "number") parts.push("Hotovo za " + (ev.duration_ms / 1000).toLocaleString(LOC(), { maximumFractionDigits: 1 }) + " s");
    if (ev.usage && typeof ev.usage.output_tokens === "number") parts.push("výstup " + fmt(ev.usage.output_tokens) + " tok.");
    if (typeof ev.num_turns === "number") parts.push("počet kroků: " + ev.num_turns);
    if (typeof ev.total_cost_usd === "number") parts.push("cena " + ev.total_cost_usd.toLocaleString(LOC(), { maximumFractionDigits: 4 }) + " USD");
    if (!parts.length) return;
    const d = document.createElement("div");
    d.className = "run-meta";
    for (const p of parts) { const s = document.createElement("span"); s.textContent = p; d.appendChild(s); }
    live.newSeg();
    live.ensureGroup().body.appendChild(d);
    live.scroll();
  };
  return live;
}

function handleStreamEvent(e, live) {
  if (!e) return;
  if (e.type === "message_start") {
    live.sawDelta = false;
  } else if (e.type === "content_block_start") {
    const cb = e.content_block || {};
    if (cb.type === "text") { live.newSeg(); live.setStatus("Claude píše"); }
    else if (cb.type === "thinking") live.setStatus("Claude přemýšlí");
    else if (cb.type === "tool_use") live.setStatus("Claude používá nástroj " + (cb.name || ""));
  } else if (e.type === "content_block_delta") {
    const d = e.delta || {};
    if (d.type === "text_delta" && d.text) { live.appendText(d.text); live.sawDelta = true; }
  }
}

function handleAssistant(msg, live) {
  if (!msg || !Array.isArray(msg.content)) return;
  for (const b of msg.content) {
    if (!b) continue;
    if (b.type === "text") {
      // Text už přišel po kouscích přes stream_event, jinak ho vykreslíme celý
      if (!live.sawDelta && b.text && b.text.trim()) { live.newSeg(); live.appendText(b.text); live.newSeg(); }
    } else if (b.type === "thinking") {
      if (b.thinking && b.thinking.trim()) live.addBlock(thinkingEl(b.thinking));
    } else if (b.type === "tool_use") {
      if (b.id && live.tools.has(b.id)) continue;
      const el = toolEl({ id: b.id, name: b.name, summary: toolSummary(b.input), diff: toolDiff(b.name, b.input), running: true });
      if (b.id) live.tools.set(b.id, el);
      live.addBlock(el);
      live.setStatus("Claude používá nástroj " + (b.name || ""));
    }
  }
}

function handleToolResults(msg, live) {
  if (!msg || !Array.isArray(msg.content)) return;
  for (const b of msg.content) {
    if (b && b.type === "tool_result") {
      const el = live.tools.get(b.tool_use_id);
      if (el) setToolResult(el, b.is_error, toolResultText(b.content));
    }
  }
  live.setStatus("Claude pracuje");
}

function offerSwitch(live) {
  const run = live.run;
  if (!run || !run.text || !state.providers) return;
  const row = document.createElement("div");
  row.className = "switch-row";
  for (const p of ["claude", "codex", "opencode"]) {
    if (p === run.provider || !state.providers[p]) continue;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn";
    b.textContent = "Pokračovat v " + PROV_NAMES[p];
    b.addEventListener("click", () => {
      row.remove();
      $("provider").value = p;
      localStorage.setItem("cg-provider", p);
      syncPicker();
      send(run.text, [], live.cur);
    });
    row.appendChild(b);
  }
  if (row.children.length) { live.group = null; boxFor(live.cur).appendChild(row); live.scroll(); }
}

function handleEvent(ev, live) {
  switch (ev.type) {
    case "gui":
      if (ev.subtype === "run" && live.run) live.run.runId = ev.run_id;
      else if (ev.subtype === "exit" && ev.code !== 0 && !live.hadResult) {
        live.note("Claude skončil s kódem " + ev.code + "." + (ev.stderr ? "\n\n" + ev.stderr.trim() : ""), "error");
      }
      break;
    case "system":
      if (ev.subtype === "init" && ev.session_id) {
        live.provLabel = ev.model === "Codex" || ev.model === "OpenCode" ? ev.model : "";
        adoptSession(ev.session_id, live.cur);
        loadSessions();
      }
      break;
    case "rate_limit_event":
      applyLimitInfo(ev.rate_limit_info);
      break;
    case "stream_event":
      handleStreamEvent(ev.event, live);
      break;
    case "assistant":
      handleAssistant(ev.message, live);
      break;
    case "user":
      handleToolResults(ev.message, live);
      break;
    case "result": {
      live.hadResult = true;
      if (ev.session_id) adoptSession(ev.session_id, live.cur);
      if (ev.is_error) {
        const text = (typeof ev.result === "string" && ev.result) ||
          (Array.isArray(ev.errors) && ev.errors.join("\n")) ||
          ("Claude vrátil chybu (" + (ev.subtype || "neznámá") + ").");
        live.note(text, "error");
        offerSwitch(live);
      } else {
        live.meta(ev);
      }
      if (Array.isArray(ev.permission_denials) && ev.permission_denials.length) {
        const names = [...new Set(ev.permission_denials.map((d) => d.tool_name).filter(Boolean))].join(", ");
        live.note("Tyto akce potřebovaly oprávnění a byly zamítnuty: " + names + ". V neinteraktivním běhu se nelze zeptat, zvolte jiný režim oprávnění.", "info");
      }
      break;
    }
    default:
      break; // neznámé typy událostí ignorujeme
  }
}

const sameConv = (a, b) => !!a && !!b && (a === b || (a.id && a.id === b.id));

function renderQueue() {
  const box = $("queue");
  const items = state.queue.filter((q) => sameConv(q.cur, state.current));
  box.hidden = !items.length;
  box.replaceChildren(...items.map((q, i) => {
    const row = document.createElement("div");
    row.className = "q-item";
    const n = document.createElement("span");
    n.className = "q-n";
    n.textContent = "Ve frontě " + (i + 1);
    const t = document.createElement("span");
    t.className = "q-t";
    const label = (q.text || "") + (q.att && q.att.length ? (q.text ? " " : "") + "[" + q.att.length + " " + plural(q.att.length, "příloha", "přílohy", "příloh") + "]" : "");
    t.textContent = label;
    t.title = label;
    const x = document.createElement("button");
    x.type = "button";
    x.className = "icon-btn";
    x.title = "Odebrat z fronty";
    x.setAttribute("aria-label", "Odebrat z fronty");
    x.innerHTML = ICONS.close;
    x.addEventListener("click", () => { state.queue = state.queue.filter((e) => e !== q); renderQueue(); });
    row.append(n, t, x);
    return row;
  }));
}

function enqueue() {
  const input = $("input");
  const text = input.value.trim();
  if ((!text && !state.att.length) || state.att.some((a) => a.pending)) return;
  if (!state.current) { openNewDialog(); return; }
  state.queue.push({ text, att: state.att, cur: state.current });
  state.att = [];
  input.value = "";
  autosize();
  renderQueue();
  renderAtt();
  updateSendButton();
}

function sendOrQueue() {
  if (state.run) enqueue(); else send();
}

function drainQueue(cur) {
  const i = state.queue.findIndex((q) => sameConv(q.cur, cur));
  if (i < 0) return;
  const [q] = state.queue.splice(i, 1);
  renderQueue();
  send(q.text, q.att || [], q.cur);
}


