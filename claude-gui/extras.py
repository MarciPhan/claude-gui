"""Doplňky: kontrolní body (git), větvení konverzací, znalostní báze, knihovna promptů, export, porty."""
import glob
import json
import os
import re
import subprocess
import tempfile
import time
import uuid
from pathlib import Path

KB_LIMIT = 60000


# ---------- kontrolní body: git snapshot sledovaných souborů před každou zprávou ----------
def _git(cwd, *a, t=15):
    return subprocess.run(["git", "-C", cwd, *a], capture_output=True, text=True, timeout=t)


def snapshot(cwd):
    try:
        if _git(cwd, "rev-parse", "--is-inside-work-tree").returncode:
            return None
        ref = _git(cwd, "stash", "create").stdout.strip() or _git(cwd, "rev-parse", "HEAD").stdout.strip()
        if not ref:
            return None
        _git(cwd, "update-ref", "refs/claude-gui/" + ref[:12], ref)
        return ref
    except (OSError, subprocess.SubprocessError):
        return None


class Checkpoints:
    def __init__(self, path):
        self.path = Path(path)

    def _load(self):
        try:
            return json.loads(self.path.read_text("utf-8"))
        except (OSError, ValueError):
            return {}

    def add(self, sid, entry):
        d = self._load()
        d.setdefault(sid, []).append(entry)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(d, ensure_ascii=False), "utf-8")

    def list(self, sid):
        return self._load().get(sid, [])

    def find(self, sid, ref):
        return next((c for c in self.list(sid) if c["ref"] == ref), None)

    def diff(self, sid, ref):
        c = self.find(sid, ref)
        if not c:
            return None
        return _git(c["cwd"], "diff", "--stat", ref).stdout.strip() or "Beze změn oproti tomuto kontrolnímu bodu."

    def restore(self, sid, ref):
        c = self.find(sid, ref)
        if not c:
            return {"error": "Kontrolní bod nenalezen."}
        safety = snapshot(c["cwd"])
        r = _git(c["cwd"], "restore", "--source=" + ref, "--worktree", "--", ".")
        if r.returncode:
            return {"error": r.stderr.strip() or "Obnova selhala."}
        return {"ok": True, "safety": safety}


def record_checkpoint(store, sid, cwd, prompt, ref):
    if ref and sid:
        store.add(sid, {"ref": ref, "cwd": cwd, "ts": int(time.time()), "prompt": prompt[:80]})


# ---------- větvení konverzací ----------
def _has_dangling_tool_use(rec, answered):
    c = (rec.get("message") or {}).get("content")
    return rec.get("type") == "assistant" and isinstance(c, list) and any(
        isinstance(b, dict) and b.get("type") == "tool_use" and b.get("id") not in answered for b in c)


def branch_session(path, upto, title):
    """Kopie konverzace do řádku `upto` (výhradně) s novým sessionId. Vrací nové id."""
    raw = Path(path).read_text("utf-8", "replace").splitlines()[:max(0, upto)]
    recs = []
    for ln in raw:
        try:
            recs.append(json.loads(ln))
        except ValueError:
            continue
    answered = set()
    for r in recs:
        c = (r.get("message") or {}).get("content")
        if r.get("type") == "user" and isinstance(c, list):
            answered |= {b.get("tool_use_id") for b in c if isinstance(b, dict) and b.get("type") == "tool_result"}
    while recs and (_has_dangling_tool_use(recs[-1], answered) or recs[-1].get("type") not in ("user", "assistant")):
        recs.pop()
    new = str(uuid.uuid4())
    out = []
    for r in recs:
        if "sessionId" in r:
            r["sessionId"] = new
        out.append(json.dumps(r, ensure_ascii=False, separators=(",", ":")))
    out.append(json.dumps({"type": "ai-title", "aiTitle": title, "sessionId": new}, ensure_ascii=False, separators=(",", ":")))
    (Path(path).parent / f"{new}.jsonl").write_text("\n".join(out) + "\n", "utf-8")
    return new


# ---------- znalostní báze a knihovna promptů ----------
def _kb_name(n):
    n = os.path.basename(n or "")
    return n if re.fullmatch(r"[\w\-. ]+\.md", n, re.U) else None


class Library:
    DEFAULT_PROMPTS = [
        {"name": "Audit webu", "text": "Proveď audit tohoto webu: SEO, přístupnost, výkon a chyby. Výsledek jako seznam podle priority s návrhem opravy."},
        {"name": "Nasadit a ověřit", "text": "Nasaď změny na server, ověř výsledek (stránka odpovídá, žádné chyby v logu) a stručně shrň, co se změnilo."},
        {"name": "Shrnout stav", "text": "Stručně shrň aktuální stav práce, co je hotové a co zbývá udělat."},
        {"name": "Zkontrolovat češtinu", "text": "Zkontroluj české texty: překlepy, diakritiku, gramatiku a styl. Vypiš jen nálezy a opravy."},
        {"name": "Vysvětlit chybu", "text": "Vysvětli příčinu této chyby a navrhni nejmenší bezpečnou opravu:\n\n"},
    ]

    def __init__(self, data_dir):
        self.dir = Path(data_dir)
        self.kb = self.dir / "kb"
        self.prompts_file = self.dir / "prompts.json"

    def prompts(self):
        try:
            return json.loads(self.prompts_file.read_text("utf-8"))
        except (OSError, ValueError):
            return [dict(p) for p in self.DEFAULT_PROMPTS]

    def save_prompts(self, items):
        clean = [{"name": str(i.get("name", ""))[:80], "text": str(i.get("text", ""))[:20000]}
                 for i in items if isinstance(i, dict) and i.get("name") and i.get("text")]
        self.dir.mkdir(parents=True, exist_ok=True)
        self.prompts_file.write_text(json.dumps(clean, ensure_ascii=False), "utf-8")
        return clean

    def kb_list(self):
        try:
            return sorted(f for f in os.listdir(self.kb) if f.endswith(".md"))
        except OSError:
            return []

    def kb_read(self, n):
        n = _kb_name(n)
        try:
            return (self.kb / n).read_text("utf-8")
        except (OSError, TypeError):
            return None

    def kb_save(self, n, text):
        n = _kb_name(n)
        if not n:
            return False
        self.kb.mkdir(parents=True, exist_ok=True)
        (self.kb / n).write_text(text, "utf-8")
        return True

    def kb_delete(self, n):
        n = _kb_name(n)
        if n:
            try:
                (self.kb / n).unlink()
            except OSError:
                pass

    def kb_prompt(self, names):
        parts = [f"## {n}\n{t}" for n in (names or []) if (t := self.kb_read(n))]
        if not parts:
            return ""
        return ("Uživatel přiložil znalostní bázi. Řiď se jí, pokud se týká zadání.\n\n" + "\n\n".join(parts))[:KB_LIMIT]


# ---------- export ----------
def downloads_dir():
    try:
        out = subprocess.run(["xdg-user-dir", "DOWNLOAD"], capture_output=True, text=True, timeout=3).stdout.strip()
        if out and os.path.isdir(out):
            return Path(out)
    except (OSError, subprocess.SubprocessError):
        pass
    return Path.home()


_EXPORT_CSP = ('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; '
               'style-src \'unsafe-inline\'; img-src data:">')


def export_file(name, fmt, content):
    name = re.sub(r"[^\w\-. ]+", "-", name or "konverzace", flags=re.U).strip("-. ")[:60] or "konverzace"
    dst = downloads_dir() / f"{name}.{fmt}"
    n = 1
    while dst.exists():
        n += 1
        dst = dst.with_name(f"{name}-{n}.{fmt}")
    if fmt in ("html", "pdf"):
        # export nesmí spouštět skripty ani sahat na síť (PDF se vykresluje v prohlížeči)
        content = content.replace("<head>", "<head>" + _EXPORT_CSP, 1) if "<head>" in content else _EXPORT_CSP + content
    if fmt == "pdf":
        with tempfile.TemporaryDirectory() as td:
            src = os.path.join(td, "in.html")
            Path(src).write_text(content, "utf-8")
            subprocess.run(["google-chrome", "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                            "--user-data-dir=" + os.path.join(td, "p"), "--print-to-pdf=" + str(dst), "file://" + src],
                           capture_output=True, timeout=60)
        if not dst.exists():
            raise RuntimeError("PDF se nepodařilo vytvořit (chybí google-chrome?).")
    else:
        dst.write_text(content, "utf-8")
    return str(dst)


# ---------- běžící lokální aplikace ----------
def listening_ports(skip=()):
    try:
        out = subprocess.run(["ss", "-ltnpH"], capture_output=True, text=True, timeout=5).stdout
    except (OSError, subprocess.SubprocessError):
        return []
    res = {}
    for ln in out.splitlines():
        c = ln.split()
        if len(c) < 4:
            continue
        host, _, port = c[3].rpartition(":")
        if host not in ("127.0.0.1", "0.0.0.0", "*", "[::]", "[::1]") or not port.isdigit():
            continue
        p = int(port)
        if p < 1024 or p in skip:
            continue
        m = re.search(r'\(\("([^"]+)"', ln)
        res[p] = m.group(1) if m else ""
    return [{"port": p, "proc": n} for p, n in sorted(res.items())]
