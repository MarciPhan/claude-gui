/* ======================= Pomocné funkce ======================= */

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const LOC = () => (document.documentElement.lang === "en" ? "en-GB" : "cs-CZ");

function plural(n, one, few, many) {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

function basename(p) {
  const parts = String(p || "").replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || p || "";
}

let toastTimer = null;
function showToast(text) {
  const t = $("toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}

/* Most do Pythonu (WebKitGTK): žádný HTTP server, volání jdou přímo do jádra aplikace */
const IS_PANE = window.name.indexOf("pane") === 0;
const LAST_KEY = IS_PANE ? "cg-last-" + window.name : "cg-last";
if (IS_PANE) document.body.classList.add("pane");
const BRIDGE = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.api;
const chatHandlers = new Map();
window.__onChat = (id, ev) => {
  const fn = chatHandlers.get(id);
  if (fn) { fn(ev); return; }
  if (!IS_PANE) for (const f of document.querySelectorAll("#gridPanes iframe")) { try { f.contentWindow.__onChat(id, ev); } catch (e) { /* panel ještě nenačtený */ } }
};

async function apiJson(path, opts = {}) {
  if (!BRIDGE) throw new Error("Aplikace musí běžet v nativním okně (app.py).");
  const body = opts.body ? JSON.parse(opts.body) : null;
  try {
    return JSON.parse(await BRIDGE.postMessage({ method: opts.method || "GET", path, body }));
  } catch (e) {
    throw new Error((e && e.message) || String(e));
  }
}

function toolSummary(input) {
  if (!input || typeof input !== "object") return "";
  const keys = ["command", "file_path", "notebook_path", "path", "pattern", "url", "query", "skill", "description", "prompt", "subject"];
  for (const k of keys) {
    const v = input[k];
    if (typeof v === "string" && v.trim()) {
      const t = v.split(/\s+/).join(" ").trim();
      return t.length > 160 ? t.slice(0, 160) + "…" : t;
    }
  }
  if (Array.isArray(input.todos)) return "úkolů: " + input.todos.length;
  return "";
}

function toolResultText(content) {
  let text = "";
  if (typeof content === "string") text = content;
  else if (Array.isArray(content)) {
    text = content.map((b) => (b && b.type === "text" ? b.text : b && b.type === "image" ? "[obrázek]" : "")).filter(Boolean).join("\n");
  }
  if (text.length > 3000) text = text.slice(0, 3000) + "\n[zkráceno, celkem " + text.length + " znaků]";
  return text;
}

