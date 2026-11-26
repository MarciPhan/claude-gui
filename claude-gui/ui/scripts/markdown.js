/* ======================= Markdown renderer ======================= */
/* Bezpečnost: veškerý text se nejdřív escapuje, značky se skládají až potom.
   Odkazy jen http/https, žádné surové HTML se nepropouští. */

const MEDIA_EXT = "png|jpe?g|gif|webp|bmp|svg|avif|mp3|wav|ogg|oga|m4a|flac|opus|mp4|m4v|webm|mov|mkv";
const MEDIA_FULL_RE = new RegExp("^(?:\\/|~\\/|\\.\\.?\\/)[^\\s`'\"<>()\\[\\]]+\\.(?:" + MEDIA_EXT + ")$", "i");
const MEDIA_BARE_RE = new RegExp("(^|[\\s(])((?:\\/|~\\/|\\.\\.?\\/)[^\\s`'\"<>()\\[\\]]+?\\.(?:" + MEDIA_EXT + "))(?=$|[\\s),.;:!?])", "gi");
const MEDIA_SCAN_RE = new RegExp("(?:^|[\\s\"'(=:])((?:\\/|~\\/)[^\\s\"'()<>]+?\\.(?:" + MEDIA_EXT + "))(?![\\w\\/.-])", "gi");

function mediaSpan(path, alt) {
  return '<span class="media" data-path="' + path + '" data-alt="' + (alt || "") + '"></span>';
}

function mathSpan(tex, disp) {
  return '<span class="math' + (disp ? " disp" : "") + '" data-tex="' + tex + '">' + tex + "</span>";
}

function renderInline(text) {
  const store = [];
  const keep = (html) => "\u0000" + (store.push(html) - 1) + "\u0000";
  let s = escapeHtml(String(text).replace(/\u0000/g, ""));

  // Inline kód má přednost před vším ostatním
  s = s.replace(/`([^`\n]+)`/g, (m, code) => keep("<code>" + code + "</code>" + (MEDIA_FULL_RE.test(code) ? mediaSpan(code, "") : "")));

  // LaTeX: \(...\), $$...$$ a $...$ (po inline kódu, před ostatními značkami)
  s = s.replace(/\\\((.+?)\\\)/g, (m, t) => keep(mathSpan(t, false)));
  s = s.replace(/\$\$(.+?)\$\$/g, (m, t) => keep(mathSpan(t, true)));
  s = s.replace(/(^|[^\\$\w])\$(?![\s$])([^$\n]*?[^\s$\\])\$(?!\d)/g, (m, pre, t) => pre + keep(mathSpan(t, false)));

  // ![popis](cesta): lokální soubor se zobrazí v konverzaci, vzdálené obrázky jen jako odkaz
  s = s.replace(/!\[([^\]\n]*)\]\(([^)\s]+)\)/g, (m, alt, src) =>
    /^https?:/i.test(src)
      ? keep('<a href="' + src + '" target="_blank" rel="noopener noreferrer">' + (alt || src) + "</a>")
      : keep(mediaSpan(src, alt)));

  // [text](url) jen pro http/https
  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, label, url) =>
    keep('<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + label + "</a>"));

  // Holé URL adresy
  s = s.replace(/https?:\/\/[^\s<]+/g, (url) => {
    let trail = "";
    const m = url.match(/(&quot;|&#39;|[.,;:!?)\]])+$/);
    if (m) { trail = m[0]; url = url.slice(0, -trail.length); }
    return keep('<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + "</a>") + trail;
  });

  s = s.replace(MEDIA_BARE_RE, (m, pre, path) => pre + path + keep(mediaSpan(path, "")));

  s = s.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*\w])\*([^*\s][^*\n]*?)\*(?![*\w])/g, "$1<em>$2</em>");
  s = s.replace(/~~([^~\n]+?)~~/g, "<del>$1</del>");

  return s.replace(/\u0000(\d+)\u0000/g, (m, i) => store[+i]);
}

function codeBlockHtml(code, lang) {
  const l = String(lang || "").toLowerCase();
  if (l === "mermaid" || l === "chart" || (l === "svg" && /<svg[\s>]/i.test(code))) {
    return '<div class="code diagram" data-kind="' + l + '"><div class="code-head"><span>' + (l === "svg" ? "Obrázek SVG" : l === "chart" ? "Graf" : "Diagram") +
      '</span><span class="head-actions"><button class="dg-toggle" type="button">Zobrazit kód</button><button class="copy-btn" type="button">' + ICONS.copy +
      '<span>Kopírovat</span></button></span></div><div class="diagram-view"><span class="dg-wait">Vykresluji…</span></div><pre hidden><code>' +
      escapeHtml(code) + "</code></pre></div>";
  }
  if (l === "html" || l === "htm") {
    return '<div class="code"><div class="code-head"><span>HTML</span><span class="head-actions"><button class="pv-btn" type="button">Náhled</button><button class="copy-btn" type="button">' + ICONS.copy +
      "<span>Kopírovat</span></button></span></div><pre><code>" + escapeHtml(code) + "</code></pre></div>";
  }
  return '<div class="code"><div class="code-head"><span>' + escapeHtml(lang || "kód") +
    '</span><button class="copy-btn" type="button">' + ICONS.copy + "<span>Kopírovat</span></button></div><pre><code>" +
    escapeHtml(code) + "</code></pre></div>";
}

const LIST_RE = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const TABLE_SEP_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function splitRow(line) {
  let t = line.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|")) t = t.slice(0, -1);
  return t.split("|").map((c) => c.trim());
}

function parseList(lines, start) {
  const items = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(LIST_RE);
    if (m) {
      const indent = m[1].replace(/\t/g, "    ").length;
      items.push({
        indent,
        contentIndent: indent + m[2].length + 1,
        ordered: /\d/.test(m[2]),
        start: parseInt(m[2], 10) || 1,
        text: m[3],
      });
      i++;
      continue;
    }
    if (!line.trim()) {
      // Prázdný řádek: seznam pokračuje, jen pokud další neprázdný řádek je položka nebo odsazené pokračování
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      if (j < lines.length && items.length && (LIST_RE.test(lines[j]) || /^\s{2,}\S/.test(lines[j]))) {
        if (!LIST_RE.test(lines[j])) items[items.length - 1].text += "\n";
        i = j;
        continue;
      }
      break;
    }
    if (/^\s+\S/.test(line) && items.length) {
      // Odsazené pokračování položky (i bloky kódu uvnitř seznamu)
      const it = items[items.length - 1];
      const re = new RegExp("^ {0," + it.contentIndent + "}");
      it.text += "\n" + line.replace(/\t/g, "    ").replace(re, "");
      i++;
      continue;
    }
    break;
  }

  let html = "";
  const stack = [];
  for (const it of items) {
    while (stack.length && it.indent < stack[stack.length - 1].indent) {
      html += "</li></" + stack.pop().tag + ">";
    }
    const top = stack[stack.length - 1];
    if (!top || it.indent > top.indent) {
      const tag = it.ordered ? "ol" : "ul";
      html += "<" + tag + (it.ordered && it.start !== 1 ? ' start="' + it.start + '"' : "") + ">";
      stack.push({ indent: it.indent, tag });
    } else {
      html += "</li>";
    }
    html += "<li>" + (it.text.includes("\n") ? renderMarkdown(it.text) : renderInline(it.text));
  }
  while (stack.length) html += "</li></" + stack.pop().tag + ">";
  return { html, next: i };
}

function mathBlock(tex) {
  return '<div class="math-block">' + mathSpan(escapeHtml(tex.trim()), true) + "</div>";
}

function renderMarkdown(src) {
  const lines = String(src || "").replace(/\u0000/g, "").replace(/\r\n?/g, "\n").split("\n");
  let html = "";
  let para = [];
  let i = 0;
  const flushPara = () => {
    if (para.length) {
      html += "<p>" + para.map(renderInline).join("<br>") + "</p>";
      para = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // Blok kódu
    const fence = line.match(/^\s*(`{3,}|~{3,})\s*([\w+#.-]*)/);
    if (fence) {
      flushPara();
      const marker = fence[1];
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(marker)) { buf.push(lines[i]); i++; }
      i++;
      html += codeBlockHtml(buf.join("\n"), fence[2]);
      continue;
    }

    // Blok vzorce: $$ ... $$, \[ ... \] nebo \begin{prostředí} ... \end{prostředí}
    const dm = line.match(/^\s*(\$\$|\\\[)(.*)$/);
    if (dm) {
      const close = dm[1] === "$$" ? "$$" : "\\]";
      const first = dm[2].indexOf(close);
      if (first < 0 || !dm[2].slice(first + close.length).trim()) {
        flushPara();
        const buf = [];
        if (first >= 0) {
          buf.push(dm[2].slice(0, first));
        } else {
          buf.push(dm[2]);
          i++;
          while (i < lines.length) {
            const k = lines[i].indexOf(close);
            if (k >= 0) { buf.push(lines[i].slice(0, k)); break; }
            buf.push(lines[i]);
            i++;
          }
        }
        i++;
        html += mathBlock(buf.join("\n"));
        continue;
      }
    }
    const bm = line.match(/^\s*\\begin\{([A-Za-z*]+)\}/);
    if (bm) {
      flushPara();
      const endTag = "\\end{" + bm[1] + "}";
      const buf = [];
      while (i < lines.length) {
        buf.push(lines[i]);
        if (lines[i].includes(endTag)) break;
        i++;
      }
      i++;
      html += mathBlock(buf.join("\n"));
      continue;
    }

    if (!line.trim()) { flushPara(); i++; continue; }

    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      flushPara();
      html += "<h" + h[1].length + ">" + renderInline(h[2]) + "</h" + h[1].length + ">";
      i++;
      continue;
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flushPara(); html += "<hr>"; i++; continue; }

    if (/^\s*>/.test(line)) {
      flushPara();
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, "")); i++; }
      html += "<blockquote>" + renderMarkdown(buf.join("\n")) + "</blockquote>";
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1])) {
      flushPara();
      const head = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) { rows.push(splitRow(lines[i])); i++; }
      html += '<div class="table-box"><button class="tbl-copy ma-btn" type="button" title="Kopírovat tabulku (vložitelné do Excelu a Tabulek)">' + ICONS.copy + '</button><div class="table-wrap"><table><thead><tr>' +
        head.map((c) => "<th>" + renderInline(c) + "</th>").join("") + "</tr></thead><tbody>" +
        rows.map((r) => "<tr>" + r.map((c) => "<td>" + renderInline(c) + "</td>").join("") + "</tr>").join("") +
        "</tbody></table></div></div>";
      continue;
    }

    if (LIST_RE.test(line)) {
      flushPara();
      const r = parseList(lines, i);
      html += r.html;
      i = r.next;
      continue;
    }

    para.push(line.trim());
    i++;
  }
  flushPara();
  return html;
}

