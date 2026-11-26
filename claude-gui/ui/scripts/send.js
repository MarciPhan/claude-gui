async function send(queuedText, queuedAtt, target) {
  const input = $("input");
  const text = queuedText !== undefined ? queuedText : input.value.trim();
  const atts = queuedAtt !== undefined ? queuedAtt : state.att;
  const cur = target || state.current;
  if ((!text && !atts.length) || (cur && runOf(cur)) || atts.some((a) => a.pending)) return;
  if (!cur) { openNewDialog(); return; }
  if (!cur.cwd) { showToast("Konverzace nemá známou pracovní složku."); return; }

  const fullText = attMessage(text, atts);
  if (queuedText === undefined) {
    input.value = "";
    autosize();
    state.att = [];
    renderAtt();
  }
  const box = boxFor(cur);
  const empty = box.querySelector(".empty");
  if (empty) empty.remove();
  box.appendChild(userEl(fullText));
  if (isShown(cur)) { stick = true; autoScroll(true); }

  // auto: MCP a skilly se načtou u první zprávy v konverzaci (nebo po vyžádání), dál úsporně
  const envMode = $("env").value;
  const leanNow = envMode === "lean" || (envMode === "auto" && cur.loaded === true);
  if (!leanNow) cur.loaded = true;

  const live = createLive(cur);
  const controller = new AbortController();
  const chatId = Math.random().toString(36).slice(2);
  const run = { controller, runId: null, cur, status: PROV_NAMES[$("provider").value] + " pracuje", stopped: false, text: fullText, provider: $("provider").value };
  live.run = run;
  state.runs.push(run);
  syncRunUi();

  try {
    await new Promise((resolve, reject) => {
      chatHandlers.set(chatId, (ev) => {
        handleEvent(ev, live);
        if (ev.type === "gui" && ev.subtype === "exit") resolve();
      });
      controller.signal.addEventListener("abort", () => reject(new DOMException("Zastaveno", "AbortError")));
      apiJson("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          chat_id: chatId,
          session_id: cur.id || null,
          cwd: cur.cwd,
          message: fullText,
          attachments: atts.map((a) => a.path),
          mode: $("mode").value,
          model: $("model").value,
          lean: leanNow,
          effort: $("effort").value,
          provider: $("provider").value,
          kb: JSON.parse(localStorage.getItem("cg-kb") || "[]"),
        }),
      }).catch(reject);
    });
  } catch (e) {
    if (e.name === "AbortError") live.note("Zastaveno.");
    else live.note("Chyba: " + e.message, "error");
  } finally {
    chatHandlers.delete(chatId);
    live.newSeg();
    for (const el of live.tools.values()) {
      if (el.classList.contains("running")) setToolResult(el, false, "Nedokončeno.");
    }
    const stopped = run.stopped;
    state.runs = state.runs.filter((r) => r !== run);
    if (stopped) state.queue = state.queue.filter((q) => !sameConv(q.cur, cur));
    syncRunUi();
    if (!stopped) drainQueue(cur);
    if (isShown(cur)) refreshContext();
    loadGlimpse();
    loadSessions().then(() => {
      if (state.current === cur && cur.id) {
        const meta = state.sessions.find((s) => s.id === cur.id);
        if (meta && meta.title && (cur.title === "Nová konverzace" || !cur.title)) { cur.title = meta.title; updateHeader(); }
        markActive();
      }
    });
  }
}

async function stopRun() {
  const run = state.run;
  if (!run) return;
  run.stopped = true;
  run.status = "Zastavuji";
  setStatus("Zastavuji");
  if (run.runId) {
    try {
      await apiJson("/api/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: run.runId }),
      });
    } catch (e) { /* zavření spojení proces stejně ukončí */ }
  }
  run.controller.abort();
}

