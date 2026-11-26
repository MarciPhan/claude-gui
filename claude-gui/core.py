#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Claude GUI – jádro aplikace (bez HTTP serveru).

Čte přepisy konverzací z ~/.claude/projects, počítá využití tokenů a spouští
`claude -p`. Volá ho přímo nativní okno (app.py) přes most WebKitu.
"""

import collections
import json
import os
import re
import secrets
import shutil
import signal
import subprocess
import sys
import threading
import time
from bisect import bisect_right
from datetime import datetime, timedelta
from pathlib import Path

# ---------------------------------------------------------------------------
# Konfigurace
# ---------------------------------------------------------------------------


APP_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(APP_DIR))
import extras  # noqa: E402
import providers
import vault  # noqa: E402
UI_DIR = APP_DIR / "ui"
INDEX_FILE = UI_DIR / "index.html"
INCLUDE_RE = re.compile(r"^<!--@include ([\w\-]+/[\w\-]+\.(?:css|js))-->\n", re.M)


def build_index(nonce):
    """Složí UI z ui/index.html a částí ve styles/ a scripts/ do jednoho dokumentu.

    Zůstává jediný dokument s CSP a nonce (žádné externí skripty), proto se části vkládají, ne načítají.
    """
    def part(m):
        return (UI_DIR / m.group(1)).read_text("utf-8")
    return INCLUDE_RE.sub(part, INDEX_FILE.read_text("utf-8")).replace("__CSP_NONCE__", nonce)
PROJECTS_DIR = Path.home() / ".claude" / "projects"
CLAUDE_BIN = shutil.which("claude") or "/usr/bin/claude"



SESSION_ID_RE = re.compile(r"^[A-Za-z0-9-]{1,128}$")
RUN_ID_RE = re.compile(r"^[a-f0-9]{16}$")
MODEL_RE = re.compile(r"^[A-Za-z0-9._\[\]-]{1,64}$")
EFFORTS = {"low", "medium", "high", "xhigh", "max"}
MODES = {"default", "acceptEdits", "auto", "plan", "bypassPermissions"}

# Úsporný běh: bez MCP serverů, skillů a dynamických sekcí promptu.
# Každá zpráva přes `claude -p` jinak znovu posílá celý seznam nástrojů a skillů.
LEAN_FLAGS = ["--strict-mcp-config", "--disable-slash-commands",
              "--exclude-dynamic-system-prompt-sections"]


HEAD_BYTES = 96 * 1024       # začátek souboru: první zpráva a cwd
TAIL_BYTES = 256 * 1024      # konec souboru: ai-title
MAX_ITEMS = 600              # maximum položek v přepisu
MAX_BODY = 5 * 1024 * 1024   # maximální velikost těla POST
MAX_SEARCH_HITS = 300

# Texty uživatele, které nejsou skutečnými zprávami
SKIP_PREFIXES = ("<system-reminder>", "<command-", "<local-command", "Caveat:")

# Rychlý předfiltr řádků v přepisu (Node zapisuje JSON bez mezer)
RELEVANT_MARKERS = (b'"type":"user"', b'"type":"assistant"', b'"type":"ai-title"', b'"type":"summary"')


# ---------------------------------------------------------------------------
# Práce s JSONL soubory
# ---------------------------------------------------------------------------

def parse_jsonl(data: bytes, drop_first: bool = False):
    """Rozparsuje blok JSONL; neúplné nebo poškozené řádky přeskočí."""
    lines = data.split(b"\n")
    if drop_first and lines:
        lines = lines[1:]  # první řádek může být useknutý uprostřed
    out = []
    for raw in lines:
        raw = raw.strip()
        if not raw:
            continue
        try:
            obj = json.loads(raw)
        except ValueError:
            continue
        if isinstance(obj, dict):
            out.append(obj)
    return out


def extract_user_text(obj):
    """Vrátí viditelný text zprávy uživatele, nebo None, pokud nejde o skutečnou zprávu."""
    if obj.get("isMeta") or obj.get("isSidechain"):
        return None
    msg = obj.get("message") or {}
    content = msg.get("content")
    parts = []
    if isinstance(content, str):
        parts = [content]
    elif isinstance(content, list):
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text" and isinstance(block.get("text"), str):
                parts.append(block["text"])
    texts = [p for p in parts if p.strip() and not p.lstrip().startswith(SKIP_PREFIXES)]
    if not texts:
        return None
    return "\n\n".join(texts).strip()


def count_user_images(obj):
    """Spočítá obrázky přiložené ke zprávě uživatele."""
    content = (obj.get("message") or {}).get("content")
    if not isinstance(content, list):
        return 0
    return sum(1 for b in content if isinstance(b, dict) and b.get("type") == "image")


def tool_diff(name, inp):
    """Vstup nástrojů Edit/MultiEdit/Write pro zobrazení změn (zkrácený)."""
    if not isinstance(inp, dict):
        return None

    def cut(s, n=12000):
        return s[:n] if isinstance(s, str) else ""

    if name == "Edit" and isinstance(inp.get("new_string"), str):
        return [{"old": cut(inp.get("old_string")), "new": cut(inp["new_string"])}]
    if name == "MultiEdit" and isinstance(inp.get("edits"), list):
        return [{"old": cut(e.get("old_string")), "new": cut(e.get("new_string"))}
                for e in inp["edits"][:30] if isinstance(e, dict)]
    if name == "Write" and isinstance(inp.get("content"), str):
        return [{"old": "", "new": cut(inp["content"]), "write": True}]
    return None


def tool_summary(inp):
    """Krátké shrnutí vstupu nástroje pro kompaktní čip."""
    if not isinstance(inp, dict):
        return ""
    for key in ("command", "file_path", "notebook_path", "path", "pattern", "url",
                "query", "skill", "description", "prompt", "subject"):
        val = inp.get(key)
        if isinstance(val, str) and val.strip():
            text = " ".join(val.split())
            return text[:160] + ("…" if len(text) > 160 else "")
    todos = inp.get("todos")
    if isinstance(todos, list):
        return f"úkolů: {len(todos)}"
    return ""


def tool_result_text(content, limit=3000):
    """Převede obsah tool_result na krátký text pro náhled."""
    if isinstance(content, str):
        text = content
    elif isinstance(content, list):
        parts = []
        for block in content:
            if not isinstance(block, dict):
                continue
            if block.get("type") == "text" and isinstance(block.get("text"), str):
                parts.append(block["text"])
            elif block.get("type") == "image":
                parts.append("[obrázek]")
        text = "\n".join(parts)
    else:
        text = ""
    if len(text) > limit:
        text = text[:limit] + f"\n[zkráceno, celkem {len(text)} znaků]"
    return text


def line_texts(obj):
    """Texty jednoho řádku, které se prohledávají fulltextem."""
    t = obj.get("type")
    if t == "user":
        text = extract_user_text(obj)
        if text:
            yield text
    elif t == "assistant":
        content = (obj.get("message") or {}).get("content")
        if isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text" and isinstance(block.get("text"), str):
                    yield block["text"]
    elif t == "ai-title" and isinstance(obj.get("aiTitle"), str):
        yield obj["aiTitle"]

# ---------------------------------------------------------------------------
# Seznam konverzací s cache podle mtime a size
# ---------------------------------------------------------------------------

_cache = {}  # cesta -> (mtime_ns, size, meta | None)
_cache_lock = threading.Lock()


def read_meta(path: Path, st):
    """Přečte jen začátek a konec souboru a sestaví metadata konverzace."""
    with open(path, "rb") as f:
        head = f.read(HEAD_BYTES)
        if st.st_size > HEAD_BYTES:
            offset = max(0, st.st_size - TAIL_BYTES)
            f.seek(offset)
            tail = f.read(TAIL_BYTES)
            drop = offset > 0
        else:
            tail = head
            drop = False

    cwd = None
    first = None
    for obj in parse_jsonl(head):
        if cwd is None and isinstance(obj.get("cwd"), str):
            cwd = obj["cwd"]
        if first is None and obj.get("type") == "user":
            first = extract_user_text(obj)
        if cwd and first:
            break

    title = None
    summary = None
    for obj in reversed(parse_jsonl(tail, drop_first=drop)):
        t = obj.get("type")
        if t == "ai-title" and isinstance(obj.get("aiTitle"), str) and obj["aiTitle"].strip():
            title = obj["aiTitle"].strip()
            break
        if summary is None and t == "summary" and isinstance(obj.get("summary"), str):
            summary = obj["summary"].strip()

    if not title and not first:
        return None  # soubor bez skutečných zpráv (jen snapshoty apod.)

    if not title:
        if summary:
            title = summary
        else:
            line = first.strip().splitlines()[0] if first.strip() else ""
            title = line[:80] + ("…" if len(line) > 80 else "")
    return {
        "id": path.stem,
        "title": title or "(bez názvu)",
        "first": (first or "")[:400],
        "cwd": cwd or "",
        "project": path.parent.name,
        "mtime": st.st_mtime,
        "size": st.st_size,
    }


def list_sessions():
    """Vrátí metadata všech konverzací seřazená od nejnovější."""
    result = []
    seen = set()
    if not PROJECTS_DIR.is_dir():
        return result
    for path in PROJECTS_DIR.glob("*/*.jsonl"):
        if not SESSION_ID_RE.match(path.stem):
            continue
        try:
            st = path.stat()
        except OSError:
            continue
        key = str(path)
        seen.add(key)
        with _cache_lock:
            cached = _cache.get(key)
        if cached and cached[0] == st.st_mtime_ns and cached[1] == st.st_size:
            meta = cached[2]
        else:
            try:
                meta = read_meta(path, st)
            except OSError:
                meta = None
            with _cache_lock:
                _cache[key] = (st.st_mtime_ns, st.st_size, meta)
        if meta:
            result.append(meta)
    with _cache_lock:
        for key in list(_cache):
            if key not in seen:
                del _cache[key]
    result.sort(key=lambda m: m["mtime"], reverse=True)
    return result


def find_session_file(session_id: str):
    """Najde soubor konverzace podle validovaného session-id."""
    if not SESSION_ID_RE.match(session_id or ""):
        return None
    candidates = []
    for path in PROJECTS_DIR.glob(f"*/{session_id}.jsonl"):
        try:
            resolved = path.resolve()
            resolved.relative_to(PROJECTS_DIR.resolve())  # ochrana proti úniku mimo složku
            candidates.append((resolved.stat().st_mtime, resolved))
        except (OSError, ValueError):
            continue
    if not candidates:
        return None
    candidates.sort(reverse=True)
    return candidates[0][1]


def load_transcript(path: Path):
    """Načte přepis jedné konverzace a omezí ho na posledních MAX_ITEMS položek."""
    items = []
    tools = {}
    title = None
    summary = None
    cwd = None
    with open(path, "rb") as f:
        for lineno, raw in enumerate(f):
            if not any(marker in raw for marker in RELEVANT_MARKERS):
                continue
            raw = raw.strip()
            if not raw:
                continue
            try:
                obj = json.loads(raw)
            except ValueError:
                continue
            if not isinstance(obj, dict):
                continue
            t = obj.get("type")
            if t == "ai-title":
                if isinstance(obj.get("aiTitle"), str) and obj["aiTitle"].strip():
                    title = obj["aiTitle"].strip()
                continue
            if t == "summary":
                if isinstance(obj.get("summary"), str):
                    summary = obj["summary"].strip()
                continue
            if t not in ("user", "assistant") or obj.get("isSidechain"):
                continue
            if cwd is None and isinstance(obj.get("cwd"), str):
                cwd = obj["cwd"]
            content = (obj.get("message") or {}).get("content")

            if t == "user":
                if obj.get("isMeta"):
                    continue
                if obj.get("isCompactSummary"):
                    items.append({"t": "note", "text": "Starší část konverzace byla shrnuta (kompaktace kontextu)."})
                    continue
                # Výsledky nástrojů připojíme k odpovídajícím čipům
                if isinstance(content, list):
                    for block in content:
                        if isinstance(block, dict) and block.get("type") == "tool_result":
                            item = tools.get(block.get("tool_use_id"))
                            if item is not None:
                                item["error"] = bool(block.get("is_error"))
                                item["result"] = tool_result_text(block.get("content"))
                text = extract_user_text(obj)
                images = count_user_images(obj)
                if text or images:
                    items.append({"t": "user", "text": text or "", "images": images, "ts": obj.get("timestamp"), "line": lineno})
            else:
                if not isinstance(content, list):
                    continue
                for block in content:
                    if not isinstance(block, dict):
                        continue
                    bt = block.get("type")
                    if bt == "text" and isinstance(block.get("text"), str) and block["text"].strip():
                        items.append({"t": "text", "line": lineno, "text": block["text"], **({"provider": obj["guiProvider"]} if obj.get("guiProvider") else {})})
                    elif bt == "thinking" and isinstance(block.get("thinking"), str) and block["thinking"].strip():
                        items.append({"t": "thinking", "line": lineno, "text": block["thinking"][:20000]})
                    elif bt == "tool_use":
                        item = {
                            "t": "tool",
                            "line": lineno,
                            "id": block.get("id"),
                            "name": block.get("name") or "nástroj",
                            "summary": tool_summary(block.get("input")),
                            "error": False,
                            "result": None,
                        }
                        diff = tool_diff(item["name"], block.get("input"))
                        if diff:
                            item["diff"] = diff
                        items.append(item)
                        if item["id"]:
                            tools[item["id"]] = item

    total = len(items)
    return {
        "id": path.stem,
        "title": title or summary or "",
        "cwd": cwd or "",
        "cwd_exists": bool(cwd) and os.path.isdir(cwd),
        "items": items[-MAX_ITEMS:],
        "total": total,
        "truncated": total > MAX_ITEMS,
    }


def search_sessions(query: str):
    """Fulltextové hledání v textech zpráv; vrací seznam session-id."""
    q = query.strip().lower()
    if len(q) < 2:
        return []
    ascii_query = q.isascii()
    qb = q.encode("utf-8")
    with _cache_lock:
        entries = sorted(
            ((k, v[2]) for k, v in _cache.items() if v[2]),
            key=lambda e: e[1]["mtime"],
            reverse=True,
        )
    hits = []
    for key, meta in entries:
        try:
            with open(key, "rb") as f:
                for raw in f:
                    # Levný předfiltr nad syrovými bajty
                    if ascii_query:
                        if qb not in raw.lower():
                            continue
                    elif q not in raw.decode("utf-8", "replace").lower():
                        continue
                    try:
                        obj = json.loads(raw)
                    except ValueError:
                        continue
                    if isinstance(obj, dict) and not obj.get("isSidechain") and any(q in s.lower() for s in line_texts(obj)):
                        hits.append(meta["id"])
                        break
        except OSError:
            continue
        if len(hits) >= MAX_SEARCH_HITS:
            break
    return hits

# ---------------------------------------------------------------------------
# Využití (tokeny) z přepisů
# ---------------------------------------------------------------------------

USAGE_CACHE_FILE = (Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local" / "share")
                    / "claude-gui-data" / "usage-cache.json")
USAGE_MAX_DAYS = 31

_usage_files = {}  # cesta -> [mtime_ns, size, [záznamy]]; záznam = [id, čas, model, in, out, cache_write, cache_read]
_usage_lock = threading.Lock()
_usage_disk_loaded = False


def _usage_load_disk():
    global _usage_disk_loaded
    with _usage_lock:
        if _usage_disk_loaded:
            return
        _usage_disk_loaded = True
        try:
            data = json.loads(USAGE_CACHE_FILE.read_text("utf-8"))
            if isinstance(data, dict):
                _usage_files.update(data)
        except (OSError, ValueError):
            pass


def _usage_save_disk(keep):
    with _usage_lock:
        for k in list(_usage_files):
            if k not in keep:
                del _usage_files[k]
        payload = json.dumps(_usage_files, separators=(",", ":"))
    try:
        USAGE_CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        tmp = USAGE_CACHE_FILE.with_suffix(".tmp")
        tmp.write_text(payload, "utf-8")
        os.replace(tmp, USAGE_CACHE_FILE)
    except OSError:
        pass


def parse_usage_file(path: Path):
    """Záznamy o tokenech jedné konverzace; opakované řádky téže zprávy se sloučí podle message.id."""
    best = {}
    with open(path, "rb") as f:
        for raw in f:
            if b'"usage"' not in raw or b'"type":"assistant"' not in raw:
                continue
            try:
                obj = json.loads(raw)
            except ValueError:
                continue
            msg = obj.get("message") or {}
            u = msg.get("usage")
            model = msg.get("model") or ""
            if not isinstance(u, dict) or model.startswith("<"):
                continue
            try:
                t = datetime.fromisoformat(str(obj.get("timestamp")).replace("Z", "+00:00")).timestamp()
            except ValueError:
                continue
            rec = [msg.get("id") or obj.get("uuid"), t, model,
                   int(u.get("input_tokens") or 0), int(u.get("output_tokens") or 0),
                   int(u.get("cache_creation_input_tokens") or 0), int(u.get("cache_read_input_tokens") or 0)]
            if sum(rec[3:]) == 0:
                continue
            best[rec[0]] = rec
    return list(best.values())


def collect_usage(since: float):
    """Všechny záznamy od času `since` napříč konverzacemi, bez duplicit mezi soubory."""
    _usage_load_disk()
    files = []
    for path in PROJECTS_DIR.glob("*/*.jsonl"):
        if not SESSION_ID_RE.match(path.stem):
            continue
        try:
            st = path.stat()
        except OSError:
            continue
        if st.st_mtime >= since:
            files.append((st.st_mtime_ns, path, st))
    files.sort(key=lambda e: e[0])  # původní konverzace dřív než její pokračování
    out, seen, changed = [], set(), False
    for _, path, st in files:
        key = str(path)
        with _usage_lock:
            cached = _usage_files.get(key)
        if cached and cached[0] == st.st_mtime_ns and cached[1] == st.st_size:
            recs = cached[2]
        else:
            try:
                recs = parse_usage_file(path)
            except OSError:
                continue
            with _usage_lock:
                _usage_files[key] = [st.st_mtime_ns, st.st_size, recs]
            changed = True
        for r in recs:
            if r[1] >= since and r[0] not in seen:
                seen.add(r[0])
                out.append((path.stem, r))
    if changed:
        _usage_save_disk({str(p) for _, p, _ in files})
    return out


def usage_report(rng: str):
    now = time.time()
    today = datetime.now().date()
    midnight = lambda d: datetime.combine(d, datetime.min.time()).timestamp()  # noqa: E731
    if rng == "h5":
        edges, unit = [now - 5 * 3600 + i * 900 for i in range(20)], "quarter"
    elif rng == "today":
        t0 = midnight(today)
        edges, unit = [t0 + i * 3600 for i in range(int((now - t0) // 3600) + 1)], "hour"
    else:
        n = 7 if rng == "d7" else 30
        edges, unit = [midnight(today - timedelta(days=n - 1 - i)) for i in range(n)], "day"
    since = edges[0]
    buckets = [[0, 0, 0, 0] for _ in edges]  # nové vstupy, výstup, čtení z cache, zprávy
    total = {"fresh": 0, "out": 0, "cr": 0, "msgs": 0}
    models, sessions = {}, {}
    for sid, (_, t, model, tin, tout, cw, cr) in collect_usage(since):
        fresh = tin + cw
        b = buckets[max(0, bisect_right(edges, t) - 1)]
        b[0] += fresh; b[1] += tout; b[2] += cr; b[3] += 1
        total["fresh"] += fresh; total["out"] += tout; total["cr"] += cr; total["msgs"] += 1
        for table, key in ((models, model), (sessions, sid)):
            e = table.setdefault(key, {"fresh": 0, "out": 0, "cr": 0, "msgs": 0})
            e["fresh"] += fresh; e["out"] += tout; e["cr"] += cr; e["msgs"] += 1
    metas = {m["id"]: m for m in list_sessions()}
    top = sorted(sessions.items(), key=lambda kv: kv[1]["fresh"] + kv[1]["out"], reverse=True)[:10]
    return {
        "range": rng, "now": now, "unit": unit, "edges": edges, "buckets": buckets, "total": total,
        "models": [dict(model=k, **v) for k, v in sorted(models.items(), key=lambda kv: kv[1]["fresh"] + kv[1]["out"], reverse=True)],
        "sessions": [dict(id=k, title=(metas.get(k) or {}).get("title") or "(bez názvu)",
                          cwd=(metas.get(k) or {}).get("cwd") or "", **v) for k, v in top],
    }


def read_context(path: Path):
    """Velikost kontextu poslední odpovědi (vstup + cache) z konce přepisu."""
    span = TAIL_BYTES * 2
    with open(path, "rb") as f:
        size = f.seek(0, 2)
        f.seek(max(0, size - span))
        data = f.read()
    for obj in reversed(parse_jsonl(data, drop_first=size > span)):
        if obj.get("type") != "assistant" or obj.get("isSidechain"):
            continue
        msg = obj.get("message") or {}
        u = msg.get("usage")
        model = msg.get("model") or ""
        if isinstance(u, dict) and not model.startswith("<"):
            tokens = sum(int(u.get(k) or 0) for k in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"))
            if tokens:
                return {"tokens": tokens, "model": model}
    return {"tokens": 0, "model": ""}

# ---------------------------------------------------------------------------
# Běžící procesy claude
# ---------------------------------------------------------------------------

RUNS = {}  # run_id -> Popen
RUNS_LOCK = threading.Lock()


def kill_group(proc):
    """Ukončí celou skupinu procesů: nejdřív SIGTERM, po 3 s SIGKILL."""
    try:
        os.killpg(proc.pid, signal.SIGTERM)
    except (ProcessLookupError, PermissionError):
        return

    def finish():
        time.sleep(3)
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            pass

    threading.Thread(target=finish, daemon=True).start()


# ---------------------------------------------------------------------------
# Rozhraní pro okno
# ---------------------------------------------------------------------------

class ApiError(Exception):
    pass


def api_call(method, path, query, body):
    """Obsluha jednoho požadavku z UI; vrací JSON-serializovatelný objekt."""
    if method == "POST":
        if path == "/api/upload":
            return save_upload(body)
        if path == "/api/stop":
            run_id = (body or {}).get("run_id")
            if not isinstance(run_id, str) or not RUN_ID_RE.match(run_id):
                raise ApiError("Neplatné run_id.")
            with RUNS_LOCK:
                proc = RUNS.get(run_id)
            if proc:
                kill_group(proc)
            return {"ok": True, "found": bool(proc)}
        if path == "/api/cp_restore":
            res = CHECKPOINTS.restore(str((body or {}).get("id", "")), str((body or {}).get("ref", "")))
            if res.get("error"):
                raise ApiError(res["error"])
            return res
        if path == "/api/branch":
            b = body or {}
            file = find_session_file(str(b.get("id", "")))
            if not file:
                raise ApiError("Konverzace nenalezena.")
            return {"id": extras.branch_session(file, int(b.get("upto", 0)), str(b.get("title") or "Větev")[:80])}
        if path == "/api/prompts_save":
            return {"items": LIBRARY.save_prompts((body or {}).get("items") or [])}
        if path == "/api/kb_save":
            if not LIBRARY.kb_save((body or {}).get("name"), str((body or {}).get("text", ""))):
                raise ApiError("Neplatný název dokumentu.")
            return {"ok": True}
        if path == "/api/kb_delete":
            LIBRARY.kb_delete((body or {}).get("name"))
            return {"ok": True}
        if path == "/api/vault_save":
            try:
                return {"id": VAULT.save(body or {})}
            except (ValueError, RuntimeError) as exc:
                raise ApiError(str(exc))
        if path == "/api/vault_delete":
            VAULT.delete(str((body or {}).get("id", "")))
            return {"ok": True}
        if path == "/api/export":
            b = body or {}
            fmt = b.get("fmt")
            if fmt not in ("md", "html", "pdf"):
                raise ApiError("Neplatný formát.")
            try:
                return {"path": extras.export_file(str(b.get("name") or ""), fmt, str(b.get("content") or ""))}
            except (OSError, RuntimeError, subprocess.SubprocessError) as exc:
                raise ApiError(str(exc))
        if path == "/api/limits_refresh":
            return refresh_limits()
        if path == "/api/org_save":
            return save_org(body or {})
        raise ApiError("Neznámý endpoint.")

    if path == "/api/checkpoints":
        return {"items": CHECKPOINTS.list((query.get("id") or [""])[0])}
    if path == "/api/cp_diff":
        d = CHECKPOINTS.diff((query.get("id") or [""])[0], (query.get("ref") or [""])[0])
        if d is None:
            raise ApiError("Kontrolní bod nenalezen.")
        return {"text": d}
    if path == "/api/prompts":
        return {"items": LIBRARY.prompts()}
    if path == "/api/kb":
        return {"items": LIBRARY.kb_list()}
    if path == "/api/kb_file":
        t = LIBRARY.kb_read((query.get("name") or [""])[0])
        if t is None:
            raise ApiError("Dokument nenalezen.")
        return {"text": t}
    if path == "/api/vault":
        return {"items": VAULT.list(), "keyring": vault.available()}
    if path == "/api/ports":
        return {"items": extras.listening_ports()}
    if path == "/api/providers":
        return providers.available()
    if path == "/api/sessions":
        return {"sessions": list_sessions()}
    if path == "/api/session":
        sid = (query.get("id") or [""])[0]
        if not SESSION_ID_RE.match(sid):
            raise ApiError("Neplatné session-id.")
        file = find_session_file(sid)
        if not file:
            raise ApiError("Konverzace nenalezena.")
        return load_transcript(file)
    if path == "/api/limits":
        return get_limits()
    if path == "/api/org":
        return get_org()
    if path == "/api/media":
        return media_data(query)
    if path == "/api/file_data":
        return file_data(query)
    if path == "/api/vendor" and (query.get("name") or [""])[0] == "katex":
        vdir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vendor")
        try:
            with open(os.path.join(vdir, "katex.min.js"), encoding="utf-8") as fh, \
                    open(os.path.join(vdir, "katex.css"), encoding="utf-8") as fc:
                return {"js": fh.read(), "css": fc.read()}
        except OSError:
            raise ApiError("Knihovna vzorců není nainstalovaná.")
    if path == "/api/vendor":
        name = (query.get("name") or [""])[0]
        files = {"mermaid": "mermaid.min.js"}
        if name not in files:
            raise ApiError("Neznámá knihovna.")
        vendor = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vendor", files[name])
        try:
            with open(vendor, encoding="utf-8") as fh:
                return {"js": fh.read()}
        except OSError:
            raise ApiError("Knihovna není nainstalovaná.")
    if path == "/api/usage":
        rng = (query.get("range") or ["today"])[0]
        return usage_report(rng if rng in ("h5", "today", "d7", "d30") else "today")
    if path == "/api/context":
        file = find_session_file((query.get("id") or [""])[0])
        return read_context(file) if file else {"tokens": 0, "model": ""}
    if path == "/api/search":
        q = (query.get("q") or [""])[0][:200]
        if not _cache:
            list_sessions()
        return {"ids": search_sessions(q)}
    if path == "/api/cwds":
        seen = {}
        for meta in list_sessions():
            c = meta.get("cwd")
            if c and c not in seen:
                seen[c] = meta["mtime"]
        out = [{"path": c, "name": os.path.basename(c.rstrip("/")) or c, "mtime": m}
               for c, m in seen.items() if os.path.isdir(c)]
        return {"cwds": out, "home": str(Path.home())}
    if path == "/api/checkdir":
        raw = (query.get("path") or [""])[0].strip()
        p = os.path.abspath(os.path.expanduser(raw)) if raw else ""
        if p and os.path.isdir(p):
            return {"ok": True, "path": p}
        return {"ok": False, "error": "Tahle složka neexistuje."}
    raise ApiError("Neznámý endpoint.")


UPLOAD_MAX = 40 * 1024 * 1024
UPLOAD_KEEP = 14 * 86400


def uploads_dir():
    return Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local" / "share") / "claude-gui-data" / "uploads"


def save_upload(body):
    """Uloží přílohu (base64) do složky uploads a vrátí cestu."""
    import base64
    import tempfile
    name = (body or {}).get("name")
    data = (body or {}).get("data")
    if not isinstance(name, str) or not isinstance(data, str):
        raise ApiError("Neplatná příloha.")
    name = re.sub(r"[^\w.\- ()]", "_", os.path.basename(name.replace("\\", "/")), flags=re.UNICODE).strip(". ") or "soubor"
    name = name[-120:]
    try:
        raw = base64.b64decode(data, validate=False)
    except ValueError:
        raise ApiError("Příloha je poškozená.")
    if len(raw) > UPLOAD_MAX:
        raise ApiError("Soubor je větší než 40 MB.")
    root = uploads_dir()
    root.mkdir(parents=True, exist_ok=True)
    now = time.time()
    for old in root.iterdir():  # úklid starých příloh
        try:
            if old.is_dir() and now - old.stat().st_mtime > UPLOAD_KEEP:
                shutil.rmtree(old, ignore_errors=True)
        except OSError:
            pass
    d = Path(tempfile.mkdtemp(prefix="u", dir=root))
    p = d / name
    p.write_bytes(raw)
    return {"path": str(p), "name": name, "size": shrink_image(p)}


def ingest_file(src):
    """Zkopíruje soubor z disku (nativní přetažení) do složky uploads."""
    import tempfile
    sp = Path(src)
    if not sp.is_file():
        raise ApiError("Složky nejde přiložit: " + sp.name)
    if sp.stat().st_size > UPLOAD_MAX:
        raise ApiError(sp.name + ": soubor je větší než 40 MB.")
    root = uploads_dir()
    root.mkdir(parents=True, exist_ok=True)
    d = Path(tempfile.mkdtemp(prefix="u", dir=root))
    dst = d / sp.name[-120:]
    shutil.copyfile(sp, dst)
    return {"path": str(dst), "name": dst.name, "size": shrink_image(dst)}


def new_upload_path(name):
    import tempfile
    root = uploads_dir()
    root.mkdir(parents=True, exist_ok=True)
    return Path(tempfile.mkdtemp(prefix="u", dir=root)) / name


MEDIA_MIME = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
    ".bmp": "image/bmp", ".svg": "image/svg+xml", ".avif": "image/avif",
    ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".oga": "audio/ogg", ".m4a": "audio/mp4",
    ".flac": "audio/flac", ".opus": "audio/ogg",
    ".mp4": "video/mp4", ".m4v": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".mkv": "video/x-matroska",
}
MEDIA_LIMIT = {"image": 25 * 1024 * 1024, "audio": 60 * 1024 * 1024, "video": 60 * 1024 * 1024}


def media_data(query):
    """Obrázek, zvuk nebo video z disku pro zobrazení v konverzaci (meta=1 vrátí jen popis)."""
    import base64
    raw = (query.get("path") or [""])[0].strip()
    cwd = (query.get("cwd") or [""])[0]
    if not raw or len(raw) > 1000:
        raise ApiError("Neplatná cesta.")
    if raw.startswith("file://"):
        raw = raw[7:]
    p = Path(os.path.expanduser(raw))
    if not p.is_absolute():
        p = Path(os.path.expanduser(cwd or "~")) / p
    try:
        p = p.resolve()
    except OSError:
        raise ApiError("Neplatná cesta.")
    mime = MEDIA_MIME.get(p.suffix.lower())
    if not mime:
        raise ApiError("Nepodporovaný typ souboru.")
    if not p.is_file():
        raise ApiError("Soubor neexistuje.")
    size = p.stat().st_size
    if size > MEDIA_LIMIT[mime.split("/")[0]]:
        raise ApiError("Soubor je příliš velký pro zobrazení v konverzaci.")
    info = {"name": p.name, "mime": mime, "size": size}
    if (query.get("meta") or [""])[0]:
        return info
    info["data"] = base64.b64encode(p.read_bytes()).decode("ascii")
    return info


def file_data(query):
    """Obrázek z uploads jako data URL (pro náhled ve zprávě)."""
    import base64
    import mimetypes
    rp = Path((query.get("path") or [""])[0]).resolve()
    if uploads_dir().resolve() not in rp.parents or not rp.is_file():
        raise ApiError("Soubor už neexistuje.")
    mime = mimetypes.guess_type(rp.name)[0] or ""
    if not mime.startswith("image/"):
        raise ApiError("Není obrázek.")
    if rp.stat().st_size > 12 * 1024 * 1024:
        raise ApiError("Obrázek je příliš velký pro náhled.")
    return {"data": "data:" + mime + ";base64," + base64.b64encode(rp.read_bytes()).decode("ascii")}


def check_attachments(body):
    """Vrátí seznam ověřených cest příloh (jen uvnitř složky uploads)."""
    att = body.get("attachments") or []
    if not isinstance(att, list) or len(att) > 30:
        raise ApiError("Neplatné přílohy.")
    root = uploads_dir().resolve()
    out = []
    for a in att:
        if not isinstance(a, str):
            raise ApiError("Neplatné přílohy.")
        rp = Path(a).resolve()
        if root not in rp.parents or not rp.is_file():
            raise ApiError("Příloha už neexistuje: " + os.path.basename(a))
        out.append(str(rp))
    return out


GUI_HINT = (
    "GUI renders: LaTeX ($..$, $$..$$), ```chart JSON "
    '{"type":"line|bar|stem|scatter|area","title","caption","xLabel","yLabel","x":[..],"series":[{"name","y":[..]}]}, '
    "```mermaid, md tables. Use them instead of ASCII art."
)

IMAGE_MAX_SIDE = 1400          # delší strana přiloženého obrázku (méně tokenů, API stejně zmenšuje nad ~1568)
INLINE_MIME = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp"}
INLINE_MAX = 5 * 1024 * 1024


def shrink_image(path):
    """Zmenší velký statický obrázek (jen přepíše soubor); vrátí novou velikost."""
    p = Path(path)
    try:
        if p.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp"):
            from PIL import Image
            with Image.open(p) as im:
                if max(im.size) > IMAGE_MAX_SIDE and not getattr(im, "is_animated", False):
                    fmt = im.format
                    k = IMAGE_MAX_SIDE / max(im.size)
                    out = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB").resize(
                        (max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
                    opts = {"quality": 85, "optimize": True} if fmt in ("JPEG", "WEBP") else {"optimize": True}
                    if fmt == "JPEG" and out.mode == "RGBA":
                        out = out.convert("RGB")
                    out.save(p, fmt, **opts)
    except Exception:  # noqa: BLE001 – bez Pillow nebo vadný soubor necháme beze změny
        pass
    return p.stat().st_size


def _with_checkpoint(emit, cwd, message, sid):
    """Před během uloží git snapshot a zapíše ho ke konverzaci, jakmile je znám její sid."""
    ref = extras.snapshot(cwd)
    if not ref:
        return emit
    state = {"sid": sid, "ref": ref}

    def wrapped(ev):
        if ev.get("type") == "system" and ev.get("subtype") == "init" and ev.get("session_id"):
            state["sid"] = ev["session_id"]
        if state["ref"] and state["sid"]:
            extras.record_checkpoint(CHECKPOINTS, state["sid"], cwd, message, state["ref"])
            state["ref"] = None
        emit(ev)
    return wrapped


def start_chat(body, emit):
    """Spustí `claude -p`; události (dict) posílá přes emit(). Vrací run_id."""
    message = body.get("message")
    if not isinstance(message, str) or not message.strip():
        raise ApiError("Prázdná zpráva.")
    attachments = check_attachments(body)
    cwd = body.get("cwd")
    if not isinstance(cwd, str) or not cwd:
        raise ApiError("Chybí pracovní složka.")
    cwd = os.path.abspath(os.path.expanduser(cwd))
    if not os.path.isdir(cwd):
        raise ApiError(f"Pracovní složka neexistuje: {cwd}")
    mode = body.get("mode") or "acceptEdits"
    if mode not in MODES:
        raise ApiError("Neplatný režim oprávnění.")
    sid = body.get("session_id")
    if sid is not None and (not isinstance(sid, str) or not SESSION_ID_RE.match(sid)):
        raise ApiError("Neplatné session-id.")
    model = body.get("model") or ""
    if model and (not isinstance(model, str) or not MODEL_RE.match(model)):
        raise ApiError("Neplatný název modelu.")
    prov = body.get("provider") or "claude"
    ephemeral = bool(body.get("ephemeral"))
    if not ephemeral:
        emit = _with_checkpoint(emit, cwd, message, sid)
    if prov in providers.CLI:
        v_env, v_lines = VAULT.ai_env()
        ctx = {"env": v_env, "hint": vault.hint(v_lines), "projects_dir": PROJECTS_DIR, "find_file": lambda s: find_session_file(s) if s else None,
               "transcript": load_transcript, "store": PROVIDER_STORE,
               "register": lambda rid, p: RUNS.__setitem__(rid, p), "unregister": lambda rid: RUNS.pop(rid, None)}
        try:
            return providers.start_chat(prov, message, cwd, mode, sid, ctx, emit, ephemeral)
        except (ValueError, OSError) as exc:
            raise ApiError(str(exc))

    inline = []
    for ap in attachments:
        mime = INLINE_MIME.get(Path(ap).suffix.lower())
        if mime:
            if os.path.getsize(ap) > INLINE_MAX:
                raise ApiError("Obrázek je i po zmenšení větší než 5 MB: " + os.path.basename(ap))
            inline.append((mime, ap))
    cmd = [CLAUDE_BIN, "-p", "--output-format", "stream-json", "--verbose",
           "--include-partial-messages", "--permission-mode", mode]
    if inline:
        cmd += ["--input-format", "stream-json"]
    if body.get("lean", True) is not False:
        cmd += LEAN_FLAGS
    cmd += ["--append-system-prompt", GUI_HINT]
    vault_env, vault_lines = VAULT.ai_env()
    if vault_lines:
        cmd += ["--append-system-prompt", vault.hint(vault_lines)]
    if not sid:
        kb = LIBRARY.kb_prompt(body.get("kb") if isinstance(body.get("kb"), list) else [])
        if kb:
            cmd += ["--append-system-prompt", kb]
    if ephemeral:
        cmd += ["--no-session-persistence"]
    effort = body.get("effort") or ""
    if effort and effort not in EFFORTS:
        raise ApiError("Neplatná úroveň přemýšlení.")
    if attachments:
        cmd += ["--add-dir", str(uploads_dir())]
    if sid and not ephemeral:
        cmd += ["--resume", sid]
    if model:
        cmd += ["--model", model]
    if effort:
        cmd += ["--effort", effort]

    env = dict(os.environ)
    env.pop("CLAUDECODE", None)
    env.pop("CLAUDE_CODE_ENTRYPOINT", None)
    env.update(vault_env)
    try:
        proc = subprocess.Popen(cmd, cwd=cwd, env=env, stdin=subprocess.PIPE,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                start_new_session=True)  # vlastní skupina procesů pro killpg
    except OSError as exc:
        raise ApiError(f"Nepodařilo se spustit {CLAUDE_BIN}: {exc}")

    run_id = secrets.token_hex(8)
    with RUNS_LOCK:
        RUNS[run_id] = proc
    stderr_tail = collections.deque(maxlen=200)

    def feed():
        try:
            if inline:
                import base64
                blocks = [{"type": "image", "source": {"type": "base64", "media_type": mt,
                                                       "data": base64.b64encode(Path(ap).read_bytes()).decode("ascii")}}
                          for mt, ap in inline]
                blocks.append({"type": "text", "text": message})
                line = json.dumps({"type": "user", "message": {"role": "user", "content": blocks},
                                   "parent_tool_use_id": None, "session_id": ""}, ensure_ascii=False) + "\n"
                proc.stdin.write(line.encode("utf-8"))
            else:
                proc.stdin.write(message.encode("utf-8"))
            proc.stdin.close()
        except OSError:
            pass

    def read_stderr():
        for line in proc.stderr:
            stderr_tail.append(line.decode("utf-8", "replace"))

    def pump():
        emit({"type": "gui", "subtype": "run", "run_id": run_id})
        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                ev = json.loads(line)
            except ValueError:
                continue
            if ev.get("type") == "rate_limit_event":
                update_limits(ev.get("rate_limit_info"))
            emit(ev)
        code = proc.wait()
        err_thread.join(timeout=2)
        with RUNS_LOCK:
            RUNS.pop(run_id, None)
        if proc.poll() is None:
            kill_group(proc)
        emit({"type": "gui", "subtype": "exit", "code": code,
              "stderr": "".join(stderr_tail)[-4000:] if code != 0 else ""})

    err_thread = threading.Thread(target=read_stderr, daemon=True)
    err_thread.start()
    threading.Thread(target=feed, daemon=True).start()
    threading.Thread(target=pump, daemon=True).start()
    return run_id


def shutdown_all():
    """Při zavření okna zabije i běžící procesy claude."""
    with RUNS_LOCK:
        procs = list(RUNS.values())
    for proc in procs:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            pass


# ---------------------------------------------------------------------------
# Limity předplatného (5 hodin, týden) a organizace konverzací
# ---------------------------------------------------------------------------

DATA_DIR = Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local" / "share") / "claude-gui-data"
LIMITS_FILE = DATA_DIR / "limits.json"
PROVIDER_STORE = providers.Store(DATA_DIR / "provider_sessions.json")
CHECKPOINTS = extras.Checkpoints(DATA_DIR / "checkpoints.json")
VAULT = vault.Vault(DATA_DIR / "vault.json")
LIBRARY = extras.Library(DATA_DIR)
ORG_FILE = DATA_DIR / "organize.json"
_limits = {"five_hour": None, "seven_day": None, "ts": 0}
_limits_lock = threading.Lock()
_limits_loaded = False


def _atomic_write(path: Path, data):
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False), "utf-8")
        os.replace(tmp, path)
    except OSError:
        pass


def update_limits(info):
    """Uloží stav limitů z události rate_limit_event, kterou posílá CLI."""
    if not isinstance(info, dict):
        return
    wins = info.get("unifiedWindows")
    if not isinstance(wins, dict):
        wins = {}
        if info.get("rateLimitType") in ("five_hour", "seven_day") and info.get("resetsAt"):
            wins[info["rateLimitType"]] = {"resetsAt": info["resetsAt"], "status": info.get("status")}
    with _limits_lock:
        for key in ("five_hour", "seven_day"):
            w = wins.get(key)
            if isinstance(w, dict) and w.get("resetsAt"):
                prev = _limits.get(key) or {}
                _limits[key] = {
                    "utilization": w.get("utilization", prev.get("utilization")),
                    "resetsAt": w["resetsAt"],
                    "status": w.get("status") or "allowed",
                }
        _limits["ts"] = time.time()
        snapshot = dict(_limits)
    _atomic_write(LIMITS_FILE, snapshot)


def get_limits():
    global _limits_loaded
    with _limits_lock:
        if not _limits_loaded:
            _limits_loaded = True
            try:
                data = json.loads(LIMITS_FILE.read_text("utf-8"))
                if isinstance(data, dict):
                    _limits.update({k: data.get(k) for k in ("five_hour", "seven_day", "ts")})
            except (OSError, ValueError):
                pass
        return dict(_limits)


def refresh_limits():
    """Minimální dotaz (haiku, bez nástrojů a bez uložení konverzace) jen pro zjištění limitů; stojí zlomek centu."""
    cmd = [CLAUDE_BIN, "-p", "--output-format", "stream-json", "--verbose", "--model", "haiku",
           "--system-prompt", "Reply: ok", "--tools", "", "--strict-mcp-config", "--disable-slash-commands",
           "--no-session-persistence", "--setting-sources", ""]
    env = dict(os.environ)
    env.pop("CLAUDECODE", None)
    env.pop("CLAUDE_CODE_ENTRYPOINT", None)
    try:
        out = subprocess.run(cmd, input=b"ok", capture_output=True, timeout=60, cwd=str(Path.home()), env=env).stdout
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ApiError(f"Limity se nepodařilo zjistit: {exc}")
    for line in out.splitlines():
        if b"rate_limit_event" in line:
            try:
                update_limits(json.loads(line).get("rate_limit_info"))
            except ValueError:
                pass
    return get_limits()


def get_org():
    try:
        data = json.loads(ORG_FILE.read_text("utf-8"))
    except (OSError, ValueError):
        data = {}
    folders = [f for f in data.get("folders", []) if isinstance(f, dict) and isinstance(f.get("id"), str) and isinstance(f.get("name"), str)]
    assign = {k: v for k, v in (data.get("assign") or {}).items() if isinstance(k, str) and isinstance(v, str)}
    return {"folders": folders, "assign": assign}


def save_org(body):
    folders = [{"id": str(f["id"])[:40], "name": str(f["name"]).strip()[:80] or "Složka"}
               for f in (body.get("folders") or []) if isinstance(f, dict) and f.get("id")]
    ids = {f["id"] for f in folders}
    assign = {k: v for k, v in (body.get("assign") or {}).items()
              if isinstance(k, str) and SESSION_ID_RE.match(k) and v in ids}
    data = {"folders": folders, "assign": assign}
    _atomic_write(ORG_FILE, data)
    return data
