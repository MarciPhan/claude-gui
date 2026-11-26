"""Další poskytovatelé (Codex CLI, OpenCode): běh přes CLI, výstup v podobě událostí Claude.

Konverzace se zapisují do stejných JSONL souborů jako konverzace Claude Code
(~/.claude/projects), takže historie, hledání, využití i návrat k Claude fungují beze změny.
"""
import glob
import json
import os
import re
import shutil
import subprocess
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

CLI = ("codex", "opencode")
LABELS = {"claude": "Claude", "codex": "Codex", "opencode": "OpenCode"}
HANDOFF_LIMIT = 40000
TOOL_NAMES = {"bash": "Bash", "read": "Read", "edit": "Edit", "write": "Write", "grep": "Grep", "glob": "Glob",
              "list": "Glob", "webfetch": "WebFetch", "websearch": "WebSearch", "patch": "Edit", "task": "Task"}


def which(name):
    hit = shutil.which(name)
    if hit:
        return hit
    dirs = sorted(glob.glob(os.path.expanduser("~/.nvm/versions/node/*/bin")), reverse=True)
    dirs += [os.path.expanduser("~/.local/bin"), os.path.expanduser("~/.opencode/bin")]
    for d in dirs:
        p = os.path.join(d, name)
        if os.access(p, os.X_OK):
            return p
    return None


def available():
    return {"claude": True, "codex": bool(which("codex")), "opencode": bool(which("opencode"))}


def _cmd(prov, text, cwd, readonly, psid, auto=False):
    ro = "read-only" if readonly else "workspace-write"
    if prov == "codex":
        if psid:
            return [which("codex"), "exec", "resume", "--json", "--skip-git-repo-check",
                    "-c", f'sandbox_mode="{ro}"', psid, "-"], text
        return [which("codex"), "exec", "--json", "--skip-git-repo-check", "-C", cwd, "-s", ro, "-"], text
    cmd = [which("opencode"), "run", "--format", "json", "--dir", cwd]
    if psid:
        cmd += ["-s", psid]
    if readonly:
        cmd += ["--agent", "plan"]  # bez něj OpenCode v režimu jen ke čtení klidně zapisuje
    elif auto:
        cmd += ["--auto"]  # schvaluje i vše, co by jinak vyžadovalo potvrzení: jen v režimu bez oprávnění
    return cmd + ["--", text], None


def _encode(cwd):
    return re.sub(r"[^A-Za-z0-9]", "-", cwd)


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class Store:
    """Sidecar s id relací jednotlivých CLI (sid konverzace -> {poskytovatel: id relace})."""

    def __init__(self, path):
        self.path = Path(path)
        self.lock = threading.Lock()

    def get(self, sid, prov):
        with self.lock:
            try:
                return json.loads(self.path.read_text("utf-8")).get(sid, {}).get(prov, "")
            except (OSError, ValueError):
                return ""

    def put(self, sid, prov, val):
        with self.lock:
            try:
                d = json.loads(self.path.read_text("utf-8"))
            except (OSError, ValueError):
                d = {}
            d.setdefault(sid, {})[prov] = val
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_text(json.dumps(d), "utf-8")


def _last_uuid(path):
    try:
        size = path.stat().st_size
        with open(path, "rb") as f:
            f.seek(max(0, size - 65536))
            tail = f.read().decode("utf-8", "replace").splitlines()
    except OSError:
        return None
    for ln in reversed(tail):
        try:
            d = json.loads(ln)
        except ValueError:
            continue
        if isinstance(d, dict) and d.get("uuid") and d.get("type") in ("user", "assistant"):
            return d["uuid"]
    return None


def handoff_text(items):
    parts = []
    for it in items:
        if it.get("t") == "user" and it.get("text"):
            parts.append("Uživatel: " + it["text"])
        elif it.get("t") == "text" and it.get("text"):
            parts.append("Asistent: " + it["text"])
    if not parts:
        return ""
    return ("Níže je dosavadní konverzace uživatele s jiným AI asistentem. Převzal jsi ji, protože původní asistent "
            "nemůže pokračovat. Nepřepisuj ji, jen na ni navaž.\n\n<konverzace>\n" + "\n\n".join(parts)[-HANDOFF_LIMIT:]
            + "\n</konverzace>\n\nPoslední zpráva uživatele:\n")


def _convert(prov, d):
    """Řádek JSON z CLI -> seznam (druh, data): ('session', id) | ('text', str) | ('tool', {...}) | ('usage', n)."""
    out = []
    if prov == "codex":
        t, it = d.get("type"), d.get("item") or {}
        if t == "thread.started":
            out.append(("session", d.get("thread_id", "")))
        elif t == "item.completed":
            k = it.get("type")
            if k == "agent_message" and it.get("text"):
                out.append(("text", it["text"]))
            elif k == "command_execution":
                out.append(("tool", {"name": "Bash", "input": {"command": it.get("command", "")},
                                     "output": it.get("aggregated_output", ""), "error": bool(it.get("exit_code"))}))
            elif k == "file_change":
                for ch in it.get("changes") or [{}]:
                    out.append(("tool", {"name": "Edit", "input": {"file_path": ch.get("path", "")}, "output": "", "error": False}))
        elif t == "turn.completed":
            out.append(("usage", (d.get("usage") or {}).get("output_tokens", 0)))
        return out
    if d.get("sessionID"):
        out.append(("session", d["sessionID"]))
    part = d.get("part") or {}
    if d.get("type") == "text" and part.get("text"):
        out.append(("text", part["text"]))
    elif d.get("type") == "tool_use":
        st = part.get("state") or {}
        inp = dict(st.get("input") or {})
        if "filePath" in inp:
            inp["file_path"] = inp.pop("filePath")
        name = TOOL_NAMES.get(str(part.get("tool", "")).lower(), str(part.get("tool") or "Tool"))
        out.append(("tool", {"name": name, "input": inp, "output": str(st.get("output") or ""),
                             "error": st.get("status") == "error"}))
    return out


def start_chat(prov, message, cwd, mode, sid, ctx, emit, ephemeral=False):
    """ctx: projects_dir, find_file, transcript(path), store (Store), register(run_id, proc), unregister(run_id)."""
    if not available().get(prov):
        raise ValueError(f"{LABELS.get(prov, prov)} není nainstalován.")
    path = ctx["find_file"](sid) if sid and not ephemeral else None
    new = path is None
    if new:
        sid = (sid if sid and not ephemeral else None) or str(uuid.uuid4())
        d = Path(ctx["projects_dir"]) / _encode(cwd)
        if not ephemeral:
            d.mkdir(parents=True, exist_ok=True)
        path = d / f"{sid}.jsonl"
    psid = "" if ephemeral else ctx["store"].get(sid, prov)
    if psid and not re.fullmatch(r"[A-Za-z0-9][\w.\-]{0,127}", psid):
        psid = ""  # id relace míří do argumentů příkazu, neplatné zahodíme
    payload = message
    if not psid and not new and not ephemeral:
        payload = handoff_text(ctx["transcript"](path)["items"]) + message
    readonly = mode in ("default", "plan")
    cmd, stdin_text = _cmd(prov, payload, cwd, readonly, psid, auto=mode in ("auto", "bypassPermissions"))
    proc = subprocess.Popen(cmd, cwd=cwd, stdin=subprocess.PIPE if stdin_text is not None else subprocess.DEVNULL,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    run_id = uuid.uuid4().hex[:16]
    ctx["register"](run_id, proc)
    errbuf = []

    def feed():
        try:
            if stdin_text is not None:
                proc.stdin.write(stdin_text.encode("utf-8"))
                proc.stdin.close()
        except OSError:
            pass

    def read_err():
        for ln in proc.stderr:
            errbuf.append(ln.decode("utf-8", "replace"))

    def pump():
        t0 = time.time()
        emit({"type": "gui", "subtype": "run", "run_id": run_id})
        emit({"type": "system", "subtype": "init", "session_id": sid, "model": LABELS[prov]})
        emit({"type": "stream_event", "event": {"type": "message_start", "message": {}}})
        texts, tools, tokens, idx = [], [], 0, 0
        record = []  # (druh, data) v pořadí vzniku
        for raw in proc.stdout:
            try:
                d = json.loads(raw)
            except ValueError:
                continue
            for kind, val in _convert(prov, d if isinstance(d, dict) else {}):
                if kind == "session" and val and not ephemeral:
                    ctx["store"].put(sid, prov, val)
                elif kind == "usage":
                    tokens += int(val or 0)
                elif kind == "text":
                    texts.append(val)
                    record.append(("text", val))
                    emit({"type": "stream_event", "event": {"type": "content_block_start", "index": idx, "content_block": {"type": "text", "text": ""}}})
                    emit({"type": "stream_event", "event": {"type": "content_block_delta", "index": idx, "delta": {"type": "text_delta", "text": val}}})
                    emit({"type": "stream_event", "event": {"type": "content_block_stop", "index": idx}})
                    idx += 1
                elif kind == "tool":
                    tid = "toolu_" + uuid.uuid4().hex[:20]
                    val["id"] = tid
                    record.append(("tool", val))
                    emit({"type": "assistant", "message": {"content": [{"type": "tool_use", "id": tid, "name": val["name"], "input": val["input"]}]}})
                    emit({"type": "user", "message": {"content": [{"type": "tool_result", "tool_use_id": tid, "is_error": val["error"], "content": val["output"]}]}})
        code = proc.wait()
        t_err.join(timeout=2)
        ctx["unregister"](run_id)
        err = "".join(errbuf).strip()[-1500:]
        if not ephemeral:
            _persist(path, sid, cwd, message, record, prov, new)
        ok = code == 0
        emit({"type": "result", "subtype": "success" if ok else "error", "is_error": not ok,
              "result": "" if ok else (err or f"{LABELS[prov]} skončil s kódem {code}"), "session_id": sid,
              "duration_ms": int((time.time() - t0) * 1000), "total_cost_usd": 0, "num_turns": 1,
              "usage": {"output_tokens": tokens}})
        emit({"type": "gui", "subtype": "exit", "code": 0, "stderr": ""})

    t_err = threading.Thread(target=read_err, daemon=True)
    t_err.start()
    threading.Thread(target=feed, daemon=True).start()
    threading.Thread(target=pump, daemon=True).start()
    return run_id


def _persist(path, sid, cwd, message, record, prov, new):
    """Připíše výměnu do JSONL ve formátu Claude Code (pak ji umí číst GUI i `claude --resume`)."""
    prev = None if new else _last_uuid(path)
    lines = []

    def add(typ, msg, **extra):
        nonlocal prev
        u = str(uuid.uuid4())
        rec = {"parentUuid": prev, "isSidechain": False, "userType": "external", "cwd": cwd, "sessionId": sid,
               "version": "2.1.311", "type": typ, "message": msg, "uuid": u, "timestamp": _now()}
        rec.update(extra)
        lines.append(json.dumps(rec, ensure_ascii=False, separators=(",", ":")))
        prev = u

    add("user", {"role": "user", "content": message})
    for kind, val in record:
        if kind == "text":
            add("assistant", {"id": "msg_" + uuid.uuid4().hex[:24], "type": "message", "role": "assistant", "model": prov,
                              "content": [{"type": "text", "text": val}], "stop_reason": "end_turn",
                              "usage": {"input_tokens": 0, "output_tokens": 0}}, guiProvider=prov)
        else:
            add("assistant", {"id": "msg_" + uuid.uuid4().hex[:24], "type": "message", "role": "assistant", "model": prov,
                              "content": [{"type": "tool_use", "id": val["id"], "name": val["name"], "input": val["input"]}],
                              "stop_reason": "tool_use", "usage": {"input_tokens": 0, "output_tokens": 0}}, guiProvider=prov)
            add("user", {"role": "user", "content": [{"type": "tool_result", "tool_use_id": val["id"],
                                                      "content": val["output"], "is_error": val["error"]}]})
    with open(path, "a", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
