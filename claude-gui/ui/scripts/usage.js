/* ======================= Využití ======================= */

const RANGE_LABELS = { h5: "posledních 5 hodin", today: "dnes", d7: "posledních 7 dní", d30: "posledních 30 dní" };

function fmt(n) {
  n = Math.round(n || 0);
  if (n < 1000) return String(n);
  if (n < 1e6) return (n / 1000).toLocaleString(LOC(), { maximumFractionDigits: n < 1e4 ? 1 : 0 }) + " tis.";
  if (n < 1e9) return (n / 1e6).toLocaleString(LOC(), { maximumFractionDigits: 2 }) + " mil.";
  return (n / 1e9).toLocaleString(LOC(), { maximumFractionDigits: 2 }) + " mld.";
}
const fmtFull = (n) => Math.round(n || 0).toLocaleString(LOC());
const shortModel = (m) => String(m || "neznámý").replace(/^claude-/, "");

let paneHtml = null;
let paneUrl = null;
const LAYOUTS = { "2": [1, 2], "3": [1, 3], "4": [2, 2] };
function getLayout() {
  try { const l = localStorage.getItem("cg-layout"); return LAYOUTS[l] ? l : "2"; } catch (e) { return "2"; }
}

async function buildPanes() {
  const layout = getLayout();
  const [rows, cols] = LAYOUTS[layout];
  const n = rows * cols;
  const box = $("gridPanes");
  box.style.gridTemplateColumns = "repeat(" + cols + ", minmax(0, 1fr))";
  box.style.gridTemplateRows = "repeat(" + rows + ", minmax(0, 1fr))";
  for (const b of $("layoutSeg").querySelectorAll("button")) b.classList.toggle("active", b.dataset.l === layout);
  if (!paneHtml) {
    try {
      paneHtml = (await apiJson("/api/pane_html")).html;
      paneUrl = URL.createObjectURL(new Blob([paneHtml], { type: "text/html" }));
    } catch (e) {
      showToast("Panely se nepodařilo vytvořit: " + e.message);
      return;
    }
  }
  const panes = [...box.querySelectorAll(".gpane")];
  while (panes.length > n) panes.pop().remove();
  for (let i = panes.length; i < n; i++) {
    const w = document.createElement("div");
    w.className = "gpane";
    const f = document.createElement("iframe");
    f.name = "pane" + (i + 1);
    f.title = "Panel " + (i + 1);
    f.src = paneUrl;
    w.appendChild(f);
    box.appendChild(w);
  }
}

async function enterSplit() {
  document.body.classList.add("multi");
  $("tabSplit").classList.add("active");
  renderLimits();
  await buildPanes();
}
function exitSplit() {
  document.body.classList.remove("multi");
  $("tabSplit").classList.remove("active");
}
function toggleSplit() { if (document.body.classList.contains("multi")) exitSplit(); else enterSplit(); }

const paneApi = (f) => { try { return f.contentWindow.__paneApi; } catch (e) { return null; } };

async function openInPane(sid) {
  if (!document.body.classList.contains("multi")) await enterSplit();
  const frames = () => [...document.querySelectorAll("#gridPanes iframe")];
  for (let t = 0; t < 40 && !frames().every((f) => paneApi(f) && paneApi(f).ready()); t++) {
    await new Promise((r) => setTimeout(r, 150));
  }
  const open = frames().find((f) => paneApi(f) && paneApi(f).current() === sid);
  if (open) { open.focus(); return; }
  const pick = frames().find((f) => paneApi(f) && paneApi(f).empty()) || frames().find((f) => paneApi(f) && !paneApi(f).busy());
  if (!pick) { showToast("Všechny panely právě pracují."); return; }
  paneApi(pick).open(sid);
}

function setView(v) {
  state.view = v;
  document.body.dataset.view = v;
  $("tabChat").classList.toggle("active", v === "chat" && state.sideMode === "chats");
  $("tabProjects").classList.toggle("active", v === "chat" && state.sideMode === "projects");
  if (v === "usage") { closeSidebar(); loadUsage(); }
}

function setSideMode(m) {
  state.sideMode = m;
  try { localStorage.setItem("cg-side", m); } catch (e) { /* ignorovat */ }
  setView("chat");
  renderList();
}

