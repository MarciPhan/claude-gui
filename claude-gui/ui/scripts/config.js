/* ======================= Konfigurace a stav ======================= */

const $ = (id) => document.getElementById(id);

const state = {
  queue: [],
  sessions: [],      // metadata ze serveru
  current: null,     // { id, cwd, title, cwdExists }
  query: "",
  serverHits: null,  // Set session-id z fulltextu
  searchSeq: 0,
  view: "chat",
  sideMode: "chats",
  open: {},
  org: { folders: [], assign: {} },
  limits: null,
  usage: null,
  usageRange: ["h5", "today", "d7", "d30"].includes(localStorage.getItem("cg-range")) ? localStorage.getItem("cg-range") : "today",
};


/* ---------- Vzhled: světlý / tmavý / podle systému ---------- */
const THEME_KEY = "cg-theme";
const themePref = () => { try { return localStorage.getItem(THEME_KEY) || "auto"; } catch (e) { return "auto"; } };
const isDark = () => {
  const p = themePref();
  return p === "dark" || (p !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
};
function applyTheme(p) {
  const root = document.documentElement;
  if (p === "light" || p === "dark") { root.dataset.theme = p; root.style.colorScheme = p; }
  else { delete root.dataset.theme; root.style.colorScheme = ""; }
  for (const b of document.querySelectorAll("#themeSeg button")) {
    const on = b.dataset.mode === p;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", String(on));
  }
  try {  // mermaid se načítá líně; při startu ještě není deklarovaný
    if (mermaidP && window.mermaid) window.mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: isDark() ? "dark" : "neutral", fontFamily: "inherit" });
  } catch (e) { /* diagram použije původní téma */ }
  for (const f of document.querySelectorAll("#gridPanes iframe")) { try { f.contentWindow.__setTheme(p); } catch (e) { /* panel ještě nenačtený */ } }
}
window.__setTheme = applyTheme;
window.addEventListener("storage", (e) => { if (e.key === THEME_KEY) applyTheme(themePref()); });
applyTheme(themePref());
