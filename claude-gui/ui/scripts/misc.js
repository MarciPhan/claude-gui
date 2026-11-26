/* ======================= Ostatní UI ======================= */

function autosize() {
  const t = $("input");
  t.style.height = "auto";
  t.style.height = Math.min(t.scrollHeight, 240) + "px";
  updateSendButton();
}

function updateModeUi() {
  const mode = $("mode").value;
  $("bypassWarn").hidden = mode !== "bypassPermissions";
  $("mode").classList.toggle("danger", mode === "bypassPermissions");
  localStorage.setItem("cg-mode", mode);
}

const wideSide = () => !IS_PANE && window.matchMedia("(min-width: 761px)").matches;
function closeSidebar() { document.body.classList.remove("side-open"); }
function hideSidebar() {
  if (wideSide()) setSideHidden(true); else closeSidebar();
}
function openSidebar() {
  if (wideSide()) setSideHidden(false); else document.body.classList.add("side-open");
}
function setSideHidden(v) {
  document.body.classList.toggle("side-hidden", v);
  try { localStorage.setItem("sideHidden", v ? "1" : ""); } catch (e) { /* bez uložení */ }
}
try { if (localStorage.getItem("sideHidden")) document.body.classList.add("side-hidden"); } catch (e) { /* bez uložení */ }

async function copyCode(btn) {
  const pre = btn.closest(".code").querySelector("pre");
  const text = pre ? pre.textContent : "";
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  btn.classList.add("done");
  btn.innerHTML = ICONS.check + "<span>Zkopírováno</span>";
  setTimeout(() => {
    btn.classList.remove("done");
    btn.innerHTML = ICONS.copy + "<span>Kopírovat</span>";
  }, 1500);
}

