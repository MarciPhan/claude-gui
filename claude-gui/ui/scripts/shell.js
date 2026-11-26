/* ======================= Posouvání ======================= */

let stick = true;
function autoScroll(force) {
  const b = $("messages");
  if (force || stick) b.scrollTop = b.scrollHeight;
  updateDown();
}

function updateDown() {
  const b = $("messages");
  $("btnDown").hidden = state.view !== "chat" || b.scrollHeight - b.scrollTop - b.clientHeight < 160;
}

/* ======================= Hlavička a prázdné stavy ======================= */

function updateHeader() {
  if (typeof renderQueue === "function") renderQueue();
  const cur = state.current;
  $("btnClear").hidden = !(cur && cur.id && cur.cwd);
  $("title").textContent = cur ? (cur.title || "Konverzace") : "Claude Code";
  const cwdBox = $("cwd");
  cwdBox.innerHTML = "";
  cwdBox.classList.remove("missing");
  if (cur) {
    cwdBox.innerHTML = ICONS.folder + "<span></span>";
    const span = cwdBox.querySelector("span");
    if (cur.cwd) {
      span.textContent = cur.cwd + (cur.cwdExists === false ? " (složka neexistuje)" : "");
      span.title = cur.cwd;
      if (cur.cwdExists === false) cwdBox.classList.add("missing");
    } else {
      span.textContent = "Pracovní složka není známá";
      cwdBox.classList.add("missing");
    }
  }
  document.title = cur && cur.title ? cur.title + " – Claude Code" : "Claude Code";
  updateSendButton();
}

function showWelcome() {
  const box = $("messages");
  box.innerHTML = '<div class="empty"><div class="logo-big">' + ICONS.logo +
    '</div><div class="big">Vyberte konverzaci vlevo nebo začněte novou</div>' +
    "<div>Odpovědi Claude Code se zobrazují průběžně, k historii se můžete kdykoli vrátit.</div>" +
    '<button type="button" id="welcomeNew">' + ICONS.plus + "<span>Nová konverzace</span></button></div>";
  $("welcomeNew").addEventListener("click", openNewDialog);
}

function showNewEmpty(cwd) {
  const box = $("messages");
  box.innerHTML = "";
  const d = document.createElement("div");
  d.className = "empty";
  d.innerHTML = '<div class="logo-big">' + ICONS.logo + '</div><div class="big">Nová konverzace</div><div class="where"></div>';
  d.querySelector(".where").textContent = "Claude poběží ve složce " + cwd + ". Napište první zprávu.";
  const sg = document.createElement("div");
  sg.className = "suggest";
  for (const t of ["Projdi projekt a shrň, jak je postavený", "Najdi a oprav chyby v tomto kódu", "Napiš testy pro hlavní funkce", "Vysvětli mi, co dělá tento soubor", "Navrhni, co by se dalo zlepšit"]) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = t;
    b.addEventListener("click", () => { $("input").value = t; autosize(); $("input").focus(); });
    sg.appendChild(b);
  }
  d.appendChild(sg);
  box.appendChild(d);
}

