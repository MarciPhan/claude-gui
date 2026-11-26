"use strict";
/* ======================= Jazyk rozhraní (cs / en) =======================
   Zdrojové texty jsou česky. V angličtině se překládají za běhu: přesná shoda celého textu
   nebo (mimo obsah zpráv) shoda frází podle slovníku. Obsah konverzací se nikdy nepřekládá. */
(() => {
  const EN = {
    "Skrýt panel": "Hide panel", "Zobrazení": "View", "Využití": "Usage", "Konverzace": "Conversations", "Projekty": "Projects",
    "Více konverzací vedle sebe (Ctrl+\\)": "Several conversations side by side (Ctrl+\\)", "Rozdělit": "Split",
    "Hledat v názvech i textu": "Search titles and text", "Hledat v konverzacích": "Search conversations", "Hledat (Ctrl+K)": "Search (Ctrl+K)",
    "Otevřít přehled využití": "Open usage overview", "Načítám…": "Loading…", "Znovu načíst seznam": "Reload list",
    "Zobrazit konverzace": "Show conversations",
    "Vyčistit kontext (nová konverzace ve stejné složce, stará zůstane v seznamu)": "Clear context (new conversation in the same folder, the old one stays in the list)",
    "Vyčistit kontext": "Clear context",
    "Zapnutý režim bypassPermissions: Claude spouští libovolné příkazy a mění či maže soubory bez jakéhokoli potvrzení. Používejte ho jen v izolovaném prostředí, kde vám nevadí ztráta dat.":
      "bypassPermissions mode is on: Claude runs any command and changes or deletes files without any confirmation. Use it only in an isolated environment where data loss does not matter.",
    "Claude pracuje": "Claude is working", "Na konec konverzace": "To the end of the conversation",
    "Napište zprávu pro Claude, nebo sem přetáhněte soubory": "Write a message to Claude, or drop files here",
    "Zpráva": "Message", "Přiložit soubory nebo obrázky": "Attach files or images", "Přiložit soubory": "Attach files",
    "Výchozí": "Default", "podle nastavení Claude Code": "per Claude Code settings",
    "Nejschopnější, na složité úkoly": "Most capable, for complex tasks", "Vyvážený, na každodenní práci": "Balanced, for everyday work",
    "Nejrychlejší a nejlevnější": "Fastest and cheapest", "Úroveň přemýšlení": "Thinking level",
    "Nízká": "Low", "Střední": "Medium", "Vysoká": "High", "Velmi vysoká": "Very high", "Pokročilé": "Advanced",
    "Co smí Claude dělat": "What Claude may do", "Jen číst a plánovat": "Read and plan only", "Číst a upravovat soubory": "Read and edit files",
    "doporučeno": "recommended", "Automaticky": "Automatic", "rozhoduje klasifikátor": "decided by a classifier",
    "Zamítat vše riskantní": "Deny anything risky", "Vše bez ptaní": "Allow everything without asking",
    "nebezpečné, bez jakékoli kontroly": "dangerous, no checks at all", "Rozšíření (MCP servery a skilly)": "Extensions (MCP servers and skills)",
    "Načíst jednou, pak úsporně": "Load once, then economically", "Nikdy": "Never", "nejméně tokenů": "fewest tokens", "Vždy": "Always",
    "nejvíc tokenů": "most tokens", "Donačíst při další zprávě": "Reload on next message", "Odeslat": "Send",
    "Enter odešle, Shift+Enter vloží nový řádek": "Enter sends, Shift+Enter inserts a new line",
    "Období": "Period", "5 hodin": "5 hours", "Dnes": "Today", "7 dní": "7 days", "30 dní": "30 days", "Přepočítat": "Recalculate",
    "Nástroje": "Tools",
    "Knihovna promptů": "Prompt library",
    "Uložené šablony zpráv": "Saved message templates",
    "Znalostní báze": "Knowledge base",
    "Trvalé instrukce pro nové konverzace": "Standing instructions for new conversations",
    "Recenze druhým modelem": "Review by a second model",
    "Posoudí poslední odpověď jiný poskytovatel": "Another provider reviews the last answer",
    "Zkomprimovat kontext": "Compress context",
    "Pošle /compact": "Sends /compact",
    "Exportovat konverzaci": "Export conversation",
    "Markdown, HTML nebo PDF": "Markdown, HTML or PDF",
    "Náhled webu / aplikace": "Web / app preview",
    "Otevře URL nebo soubor": "Opens a URL or file",
    "Kontrolní body": "Checkpoints",
    "Vrátit změny před během": "Roll back changes made by a run",
    "Recenze": "Review",
    "Větvit odtud (nová konverzace)": "Branch from here (new conversation)",
    "Nechat zkontrolovat jiným modelem": "Have another model review it",
    "Poskytovatel": "Provider",
    "Konverzace zůstává společná": "The conversation stays shared",
    "OpenAI Codex CLI, konverzace zůstává společná": "OpenAI Codex CLI, the conversation stays shared",
    "OpenCode CLI, konverzace zůstává společná": "OpenCode CLI, the conversation stays shared",
    "Zaškrtnuté soubory se přidají jako instrukce do nových konverzací.": "Checked files are added as instructions to new conversations.",
    "Zatím žádné prompty.": "No prompts yet.",
    "Vložit": "Insert",
    "Smazat": "Delete",
    "Přidat prompt": "Add prompt",
    "Zpět": "Back",
    "Uložit": "Save",
    "Název": "Title",
    "Text promptu": "Prompt text",
    "Upravit": "Edit",
    "Nový soubor": "New file",
    "Zatím žádné kontrolní body. Vytvoří se před každým během v git repozitáři.": "No checkpoints yet. One is created before each run in a git repository.",
    "Změny": "Changes",
    "Obnovit": "Restore",
    "(beze změn)": "(no changes)",
    "Obnoveno.": "Restored.",
    "Vrátit pracovní složku do stavu před tímto během?": "Restore the working folder to its state before this run?",
    "Export konverzace": "Export conversation",
    "Soubor se uloží do složky Stažené.": "The file is saved to your Downloads folder.",
    "Uloženo:": "Saved:",
    "Otevřít náhled": "Open preview",
    "Počkejte na dokončení práce.": "Wait for the run to finish.",
    "Nejdřív začněte konverzaci.": "Start a conversation first.",
    "Vytvořena nová větev.": "New branch created.",
    "Zprávu se nepodařilo přiřadit k přepisu.": "Could not match the message to the transcript.",
    "Zkontroluj kriticky svou předchozí odpověď (poslední odpověď asistenta výše): najdi chyby, mezery a rizika a navrhni konkrétní opravy. Buď stručný.": "Critically review your previous answer (the assistant's last answer above): find errors, gaps and risks and propose concrete fixes. Be brief.",
    "Zatím žádné prompty": "No prompts yet",
    "Nová konverzace": "New conversation", "Zavřít": "Close", "Pracovní složka": "Working folder",
    "Claude poběží v této složce. Vyberte některou z dříve použitých, nebo zadejte cestu (funguje i ~).":
      "Claude will run in this folder. Pick one you used before or type a path (~ works too).",
    "Zrušit": "Cancel", "Začít konverzaci": "Start conversation", "Rozdělené zobrazení": "Split view",
    "Více konverzací vedle sebe": "Several conversations side by side", "Zpět na jednu konverzaci": "Back to one conversation",
    "Zavřít (Esc)": "Close (Esc)", "Pustit pro přiložení": "Drop to attach", "obrázky, dokumenty, kód, cokoli": "images, documents, code, anything",
    "Uložit": "Save", "Nastavení": "Settings", "Jazyk rozhraní": "Interface language",
    "Automaticky = podle jazyka systému.": "Automatic follows the system language.",
    "Aplikace musí běžet v nativním okně (app.py).": "The app must run in a native window (app.py).",
    "úkolů:": "tasks:", "Obrázek SVG": "SVG image", "Graf": "Chart", "Zobrazit kód": "Show code", "Skrýt kód": "Hide code",
    "Kopírovat": "Copy", "Vykresluji…": "Rendering…", "Náhled": "Preview", "kód": "code",
    "Kopírovat tabulku (vložitelné do Excelu a Tabulek)": "Copy table (pastes into Excel and Sheets)",
    "(kliknutím zvětšit)": "(click to enlarge)", "Zvětšit obrázek": "Enlarge image", "(soubor už není k dispozici)": "(file is no longer available)",
    "obrázek": "image", "obrázky": "images", "obrázků": "images", "Upravit a poslat znovu": "Edit and resend",
    "Kopírovat odpověď": "Copy response", "Počkejte, až Claude dokončí práci.": "Wait until Claude finishes.",
    "Není co kopírovat.": "Nothing to copy.", "Zkopírováno": "Copied", "Uvažování": "Reasoning",
    "neplatná specifikace": "invalid specification", "chybí data (series[].y)": "missing data (series[].y)",
    "Knihovna vzorců se nenačetla.": "The formula library failed to load.", "kliknutím přehrát": "click to play",
    "Soubor se nepodařilo načíst:": "Could not load the file:", "Knihovna diagramů se nenačetla.": "The diagram library failed to load.",
    "Diagram nejde vykreslit (": "Cannot render the diagram (", "), zobrazuji kód.": "), showing the code.",
    "Tabulka je zkopírovaná, jde vložit do Excelu nebo Tabulek.": "Table copied, you can paste it into Excel or Sheets.",
    "Náhled HTML": "HTML preview", "Skrýt náhled": "Hide preview", "Celý obsah souboru": "Entire file contents", "Úprava": "Edit",
    "… dalších": "… more", "řádků není zobrazeno": "lines not shown", "nástroj": "tool", "Probíhá…": "In progress…",
    "Výstup není k dispozici.": "Output not available.", "Bez výstupu.": "No output.", "(složka neexistuje)": "(folder does not exist)",
    "Pracovní složka není známá": "Working folder unknown",
    "Vyberte konverzaci vlevo nebo začněte novou": "Pick a conversation on the left or start a new one",
    "Odpovědi Claude Code se zobrazují průběžně, k historii se můžete kdykoli vrátit.": "Claude Code's replies appear as they stream; you can return to the history at any time.",
    "Claude poběží ve složce": "Claude will run in the folder", "Napište první zprávu.": "Write your first message.",
    "Projdi projekt a shrň, jak je postavený": "Go through the project and summarize how it is built",
    "Najdi a oprav chyby v tomto kódu": "Find and fix bugs in this code", "Napiš testy pro hlavní funkce": "Write tests for the main functions",
    "Vysvětli mi, co dělá tento soubor": "Explain what this file does", "Navrhni, co by se dalo zlepšit": "Suggest what could be improved",
    "konverzací": "conversations", "konverzace": "conversations", "Seznam konverzací se nenačetl:": "Could not load the conversation list:",
    "Včera": "Yesterday", "Tento týden": "This week", "Starší": "Older", "Další akce": "More actions", "Nic nenalezeno.": "Nothing found.",
    "Zatím tu nejsou žádné konverzace.": "No conversations here yet.", "Projekty (podle pracovní složky)": "Projects (by working folder)",
    "Nová konverzace v tomto projektu": "New conversation in this project", "Připnuté": "Pinned", "Složky": "Folders",
    "Nová složka": "New folder", "Akce složky": "Folder actions", "Prázdná složka": "Empty folder",
    "Složky se nepodařilo uložit:": "Could not save folders:", "Vytvořit": "Create", "Připnout": "Pin", "Odepnout": "Unpin",
    "Otevřít vedle sebe": "Open side by side", "Přesunout do složky": "Move to folder", "Nová složka…": "New folder…",
    "Odebrat ze složky": "Remove from folder", "Přejmenovat": "Rename", "Přejmenovat složku": "Rename folder", "Smazat složku": "Delete folder",
    "Složka je smazaná, konverzace zůstaly v seznamu.": "Folder deleted, its conversations stayed in the list.",
    "Prohledávám text konverzací": "Searching conversation text", "Text obsahuje": "Text matches", "Fulltext selhal:": "Full-text search failed:",
    "Načítám přepis…": "Loading transcript…", "Přepis se nenačetl:": "Could not load the transcript:",
    "Přepis je zkrácený: zobrazuji posledních": "Transcript is truncated: showing the last", "položek.": "items.",
    "Konverzace neobsahuje žádné zobrazitelné zprávy.": "The conversation has no displayable messages.",
    "Načítám složky…": "Loading folders…", "Zatím žádné použité složky. Zadejte cestu ručně.": "No folders used yet. Enter a path manually.",
    "Složky se nenačetly:": "Could not load folders:", "Zadejte pracovní složku.": "Enter a working folder.",
    "Tahle složka neexistuje.": "This folder does not exist.", "Zvětšit": "Enlarge", "nahrávám…": "uploading…",
    "Odebrat přílohu": "Remove attachment", "Soubor nejde přečíst.": "The file cannot be read.",
    ": soubor je větší než 40 MB.": ": file is larger than 40 MB.", "Nejvýše 20 příloh najednou.": "At most 20 attachments at once.",
    "Přílohu se nepodařilo nahrát:": "Could not upload the attachment:", "Nejdřív otevřete nebo založte konverzaci.": "Open or start a conversation first.",
    "Pusťte soubory do konkrétního panelu.": "Drop files into a specific pane.", "Zařadit do fronty": "Add to queue",
    "Hotovo za": "Done in", "výstup": "output", "počet kroků:": "steps:", "Claude píše": "Claude is writing",
    "Claude přemýšlí": "Claude is thinking", "Claude používá nástroj": "Claude is using a tool",
    "Claude skončil s kódem": "Claude exited with code", "Claude vrátil chybu (": "Claude returned an error (", "neznámá": "unknown",
    "Tyto akce potřebovaly oprávnění a byly zamítnuty:": "These actions needed permission and were denied:",
    "V neinteraktivním běhu se nelze zeptat, zvolte jiný režim oprávnění.": "A non-interactive run cannot ask; choose another permission mode.",
    "Ve frontě": "Queued", "příloha": "attachment", "přílohy": "attachments", "příloh": "attachments", "Odebrat z fronty": "Remove from queue",
    "Konverzace nemá známou pracovní složku.": "The conversation has no known working folder.", "Nedokončeno.": "Unfinished.",
    "posledních 5 hodin": "the last 5 hours", "posledních 7 dní": "the last 7 days", "posledních 30 dní": "the last 30 days", "neznámý": "unknown",
    "Panely se nepodařilo vytvořit:": "Could not create panes:", "Všechny panely právě pracují.": "All panes are busy.",
    "právě se obnovuje": "resetting now", "zatím neznámé": "not known yet", "Okno se už obnovilo.": "The window has already reset.",
    "Stav z": "As of", "obnoveno": "reset", "reset za": "resets in", "Reset": "Resets", "Týden": "Week",
    "Zjistit aktuální stav limitů": "Check current limit status", "Výchozí model": "Default model",
    "nízká": "low", "střední": "medium", "vysoká": "high", "velmi vysoká": "very high",
    "Nové vstupy": "New inputs", "vstup + zápis do cache": "input + cache write", "Výstup": "Output",
    "text, kód, uvažování": "text, code, reasoning", "Čtení z cache": "Cache reads", "levné opakované vstupy": "cheap repeated inputs",
    "Odpovědí": "Replies", "v průměru": "on average", "nových tokenů": "new tokens", "žádná aktivita": "no activity",
    "V tomto období zatím nic není.": "Nothing in this period yet.", "odp.": "replies", "Průběh,": "Trend,", "Podle modelů": "By model",
    "nových": "new", "výstup,": "output,", "Nejnáročnější konverzace": "Most demanding conversations", "bez složky": "no folder",
    "Počítáno z přepisů v ~/.claude/projects, tedy jen konverzace z tohoto počítače. Nové vstupy jsou vstup plus zápis do cache. Čtení z cache je levné a velké, proto je mimo graf. Limity předplatného odtud zjistit nejdou, protože se nezapisují do přepisů.":
      "Calculated from the transcripts in ~/.claude/projects, so only conversations from this computer. New inputs are input plus cache write. Cache reads are cheap and large, so they are left out of the chart. Subscription limits cannot be determined from here because they are not written to the transcripts.",
    "tokenů za": "tokens for", "Najeďte na sloupec pro detail.": "Hover over a bar for details.",
    "Využití se nenačetlo:": "Could not load usage:", "Nedostupné": "Unavailable", "Kontext poslední odpovědi:": "Context of the last reply:",
    "tokenů, asi": "tokens, about", "(odhad okna)": "(window estimate)",
    "MCP a skilly se donačtou při další zprávě.": "MCP and skills will reload on the next message.",
    "Kontext je čistý, stará konverzace zůstala v seznamu.": "Context is clear, the old conversation stayed in the list.",
    "Nová konverzace (Ctrl+Shift+O)": "New conversation (Ctrl+Shift+O)", "Zastavit": "Stop", "Zastaveno.": "Stopped.",
    "Zastavuji": "Stopping", "Zastaveno": "Stopped", "Chyba": "Error", "Chyba:": "Error:", "cena": "cost", "dnes": "today",
    "tis.": "k", "mil.": "M", "mld.": "B", "Panel": "Pane", "Celkem": "Total", "Kontext": "Context", "Obnovit": "Refresh",
    /* chyby z jádra aplikace */
    "Neplatné run_id.": "Invalid run_id.", "Neznámý endpoint.": "Unknown endpoint.", "Neplatné session-id.": "Invalid session id.",
    "Knihovna vzorců není nainstalovaná.": "The formula library is not installed.", "Neznámá knihovna.": "Unknown library.",
    "Knihovna není nainstalovaná.": "The library is not installed.", "Neplatná příloha.": "Invalid attachment.",
    "Příloha je poškozená.": "The attachment is corrupted.", "Soubor je větší než 40 MB.": "The file is larger than 40 MB.",
    "Složky nejde přiložit:": "Folders cannot be attached:", "Neplatná cesta.": "Invalid path.", "Nepodporovaný typ souboru.": "Unsupported file type.",
    "Soubor je příliš velký pro zobrazení v konverzaci.": "The file is too large to display in the conversation.",
    "Soubor už neexistuje.": "The file no longer exists.", "Není obrázek.": "Not an image.",
    "Obrázek je příliš velký pro náhled.": "The image is too large for a preview.", "Neplatné přílohy.": "Invalid attachments.",
    "Příloha už neexistuje:": "The attachment no longer exists:", "Prázdná zpráva.": "Empty message.", "Chybí pracovní složka.": "Missing working folder.",
    "Pracovní složka neexistuje:": "Working folder does not exist:", "Neplatný režim oprávnění.": "Invalid permission mode.",
    "Neplatný název modelu.": "Invalid model name.", "Obrázek je i po zmenšení větší než 5 MB:": "The image is still larger than 5 MB after downscaling:",
    "Neplatná úroveň přemýšlení.": "Invalid thinking level.", "Nepodařilo se spustit": "Could not start",
    "Limity se nepodařilo zjistit:": "Could not determine limits:", "Ve schránce není obrázek.": "There is no image in the clipboard."
  };

  const RULES = [
    [/Využito (\d+) % (5hodinového|týdenního) limitu\./g, (m, p, w) => p + " % of the " + (w[0] === "5" ? "5-hour" : "weekly") + " limit used."],
    [/(^|[^\d])1 konverzace/g, (m, pre) => pre + "1 conversation"]
  ];

  const isWord = (c) => /[\p{L}\p{N}]/u.test(c);
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const BIG = new RegExp(Object.keys(EN).sort((a, b) => b.length - a.length).map((k) =>
    (isWord(k[0]) ? "(?<![\\p{L}\\p{N}])" : "") + esc(k) + (isWord(k[k.length - 1]) ? "(?![\\p{L}\\p{N}])" : "")).join("|"), "gu");

  function tr(s, exactOnly) {
    const t = s.trim();
    if (!t) return s;
    const lead = s.slice(0, s.indexOf(t)), trail = s.slice(lead.length + t.length);
    let out = Object.prototype.hasOwnProperty.call(EN, t) ? EN[t] : undefined;
    if (out === undefined) {
      if (exactOnly) return s;
      out = t;
      for (const [re, f] of RULES) out = out.replace(re, f);
      out = out.replace(BIG, (m) => EN[m]);
    }
    return lead + out + trail;
  }

  const KEY = "cg-lang";
  const ATTRS = ["title", "placeholder", "aria-label", "alt"];
  const SKIP = ".bubble, textarea, input, .item-title, .att-t, #title, .cwd-item, .lb-cap, svg text, script, style";
  const EXACT = "pre, code, .md, .thinking, .diagram-view";
  const FULLOK = ".dg-err, .media-play, .msg-actions, .tbl-copy, .code-head";
  const UIQ = ".code-head, .copy-btn, .tbl-copy, .dg-wait, .dg-err, .dg-toggle, .pv-btn, .media-play, .dg-note";
  const tRec = new WeakMap(), aRec = new WeakMap();
  let lang = "cs", touched = false, ready = false;

  function modeOf(el) {
    if (el.closest(SKIP)) return 0;
    if (el.closest(FULLOK)) return 2;
    return el.closest(EXACT) ? 1 : 2;
  }

  function doText(n) {
    const p = n.parentElement;
    if (!p) return;
    const r = tRec.get(n), cur = n.nodeValue;
    const src = r && cur === r.out ? r.src : cur;
    let out = src;
    if (lang === "en") { const m = modeOf(p); if (m) out = tr(src, m === 1); }
    if (out !== cur) { tRec.set(n, { src, out }); n.nodeValue = out; } else if (r && cur !== r.out) tRec.delete(n);
  }

  function doAttrs(el) {
    let rec = aRec.get(el);
    for (const a of ATTRS) {
      const cur = el.getAttribute(a);
      if (cur === null) continue;
      const r = rec && rec[a];
      const src = r && cur === r.out ? r.src : cur;
      const out = lang === "en" ? tr(src, false) : src;
      if (out !== cur) { if (!rec) { rec = {}; aRec.set(el, rec); } rec[a] = { src, out }; el.setAttribute(a, out); }
      else if (r && cur !== r.out) delete rec[a];
    }
  }

  function walkAll(root) {
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) doText(n);
    const base = root.nodeType === 9 ? root.documentElement : root;
    if (base.matches && base.matches("[title],[placeholder],[aria-label],[alt]")) doAttrs(base);
    for (const el of base.querySelectorAll("[title],[placeholder],[aria-label],[alt]")) doAttrs(el);
  }

  function walk(root) {
    if (root.nodeType === 1 && root.closest(".md")) {
      // obsah odpovědi: překládají se jen ovládací prvky vykreslovačů (kopírovat, náhled, diagram)
      const hit = new Set(root.querySelectorAll(UIQ));
      if (root.matches(UIQ)) hit.add(root);
      for (const el of hit) walkAll(el);
      return;
    }
    walkAll(root);
  }

  const mo = new MutationObserver((recs) => {
    if (lang === "cs" && !touched) return;
    const texts = new Set(), attrs = new Set(), adds = new Set();
    for (const r of recs) {
      if (r.type === "characterData") texts.add(r.target);
      else if (r.type === "attributes") attrs.add(r.target);
      else for (const n of r.addedNodes) adds.add(n);
    }
    for (const n of adds) if (n.isConnected) walk(n);
    for (const n of texts) if (n.isConnected) doText(n);
    for (const el of attrs) if (el.isConnected) doAttrs(el);
    mo.takeRecords();
  });

  const pref = () => { try { return localStorage.getItem(KEY) || "auto"; } catch (e) { return "auto"; } };
  const resolve = (p) => p === "cs" || p === "en" ? p : ((navigator.language || "cs").toLowerCase().startsWith("cs") ? "cs" : "en");

  function paintSeg(p) {
    for (const b of document.querySelectorAll("#langSeg button")) {
      const on = b.dataset.lang === p;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", String(on));
    }
  }

  function apply(p) {
    const before = lang;
    lang = resolve(p);
    document.documentElement.lang = lang;
    if (lang === "en") touched = true;
    if (lang === "en" || touched) walkAll(document);
    mo.takeRecords();
    paintSeg(p);
    // texty skládané skriptem (data, čísla, relativní časy) se přegenerují ve zvoleném jazyce
    if (ready && before !== lang) try { renderList(); renderLimits(); updateHeader(); if (document.body.dataset.view === "usage" && state.usage) renderUsage(state.usage); } catch (e) { /* UI ještě není připravené */ }
    for (const f of document.querySelectorAll("#gridPanes iframe")) { try { f.contentWindow.__setLang(p); } catch (e) { /* panel ještě nenačtený */ } }
  }

  function setPref(p) {
    try { localStorage.setItem(KEY, p); } catch (e) { /* bez úložiště jen pro tuto relaci */ }
    apply(p);
  }
  window.__setLang = (p) => apply(p);
  window.addEventListener("storage", (e) => { if (e.key === KEY) apply(pref()); });

  function wire() {
    const dlg = document.getElementById("dlgSettings");
    const open = () => { paintSeg(pref()); dlg.hidden = false; };
    const close = () => { dlg.hidden = true; };
    document.getElementById("btnSettings").addEventListener("click", open);
    document.getElementById("dlgSetClose").addEventListener("click", close);
    dlg.addEventListener("mousedown", (e) => { if (e.target === dlg) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !dlg.hidden) { e.preventDefault(); close(); } });
    document.getElementById("langSeg").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-lang]");
      if (b) setPref(b.dataset.lang);
    });
  }

  wire();
  mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  apply(pref());
  ready = true;
})();
