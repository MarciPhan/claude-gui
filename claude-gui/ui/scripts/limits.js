/* ======================= Limity předplatného ======================= */

function untilText(ts) {
  const s = ts - Date.now() / 1000;
  if (s <= 0) return "právě se obnovuje";
  const m = Math.round(s / 60);
  if (m < 60) return "za " + Math.max(m, 1) + " min";
  const h = Math.floor(m / 60), mm = m % 60;
  if (h < 24) return "za " + h + " h" + (mm ? " " + mm + " min" : "");
  return "za " + Math.floor(h / 24) + " d " + (h % 24) + " h";
}

function limitHtml(name, longName, w, weekly, ts) {
  if (!w || !w.resetsAt) {
    return '<div class="lim"><div class="lim-top"><span>' + name + '</span><span class="lim-pct">—</span></div><div class="lim-bar"><i style="width:0"></i></div><div class="lim-reset">zatím neznámé</div></div>';
  }
  const expired = w.resetsAt * 1000 < Date.now();
  const pct = expired ? 0 : Math.min(100, Math.round((w.utilization || 0) * 100));
  const at = new Date(w.resetsAt * 1000);
  const abs = weekly
    ? at.toLocaleString(LOC(), { weekday: "short", hour: "2-digit", minute: "2-digit" })
    : at.toLocaleTimeString(LOC(), { hour: "2-digit", minute: "2-digit" });
  const full = at.toLocaleString(LOC(), { weekday: "long", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
  const asOf = ts ? new Date(ts * 1000).toLocaleTimeString(LOC(), { hour: "2-digit", minute: "2-digit" }) : "";
  const title = "Využito " + pct + " % " + longName + ". " + (expired ? "Okno se už obnovilo." : "Reset " + full + ".") + (asOf ? " Stav z " + asOf + "." : "");
  const cls = pct >= 90 ? " full" : pct >= 75 ? " high" : "";
  return '<div class="lim' + cls + '" title="' + escapeHtml(title) + '"><div class="lim-top"><span>' + name + '</span><span class="lim-pct">' + pct + ' %</span></div>' +
    '<div class="lim-bar"><i style="width:' + pct + '%"></i></div><div class="lim-reset">' + (expired ? "obnoveno" : "reset " + untilText(w.resetsAt)) + "</div></div>";
}

function renderLimits() {
  const L = state.limits || {};
  const html = limitHtml("5 hodin", "5hodinového limitu", L.five_hour, false, L.ts) +
    limitHtml("Týden", "týdenního limitu", L.seven_day, true, L.ts) +
    '<button type="button" class="icon-btn lim-refresh' + (state.limitsBusy ? " spin" : "") + '" title="Zjistit aktuální stav limitů" aria-label="Zjistit aktuální stav limitů">' + ICONS.refresh + "</button>";
  for (const host of document.querySelectorAll(".limits-host")) host.innerHTML = html;
}

function applyLimitInfo(info) {
  if (!info) return;
  const wins = info.unifiedWindows || {};
  const L = state.limits || { five_hour: null, seven_day: null, ts: 0 };
  for (const k of ["five_hour", "seven_day"]) {
    const w = wins[k];
    if (w && w.resetsAt) L[k] = { utilization: w.utilization != null ? w.utilization : (L[k] || {}).utilization, resetsAt: w.resetsAt, status: w.status };
  }
  L.ts = Date.now() / 1000;
  state.limits = L;
  renderLimits();
}

async function refreshLimits() {
  if (state.limitsBusy) return;
  state.limitsBusy = true;
  renderLimits();
  try {
    state.limits = await apiJson("/api/limits_refresh", { method: "POST", body: "{}" });
  } catch (e) {
    showToast(e.message);
  } finally {
    state.limitsBusy = false;
    renderLimits();
  }
}

async function loadLimits() {
  try { state.limits = await apiJson("/api/limits"); } catch (e) { /* bez dat */ }
  renderLimits();
  const age = Date.now() / 1000 - ((state.limits && state.limits.ts) || 0);
  if (age > 300) refreshLimits();
}

