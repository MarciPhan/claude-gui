#!/usr/bin/env python3
"""Vývojový běh UI v běžném prohlížeči (bez GTK): nahrazuje WebKit most HTTP voláními.

Jen pro testování na 127.0.0.1; produkční aplikace je claude-gui/app.py.
"""
import json
import os
import queue
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "claude-gui"))
import core  # noqa: E402

PORT = int(os.environ.get("DEV_PORT", "8780"))
SUBS = []
SHIM = """<script nonce="N">
window.webkit={messageHandlers:{api:{postMessage:async m=>{const r=await fetch('/rpc',{method:'POST',body:JSON.stringify(m)});
const t=await r.text();if(!r.ok)throw new Error(t);return t;}}}};
const es=new EventSource('/events');es.onmessage=e=>{const d=JSON.parse(e.data);window.__onChat(d.id,d.ev)};
</script>"""


def push(chat_id, ev):
    for q in list(SUBS):
        q.put(json.dumps({"id": chat_id, "ev": ev}, ensure_ascii=False))


class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype="text/plain; charset=utf-8"):
        b = body.encode() if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        if self.path == "/":
            html = core.INDEX_FILE.read_text("utf-8").replace("__CSP_NONCE__", "N")
            return self._send(200, html.replace("<script nonce=\"N\">", SHIM + "<script nonce=\"N\">", 1), "text/html; charset=utf-8")
        if self.path == "/events":
            q = queue.Queue()
            SUBS.append(q)
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            try:
                while True:
                    try:
                        self.wfile.write(f"data: {q.get(timeout=15)}\n\n".encode())
                    except queue.Empty:
                        self.wfile.write(b": ping\n\n")
                    self.wfile.flush()
            except OSError:
                pass
            finally:
                SUBS.remove(q)
            return
        self._send(404, "")

    def do_POST(self):
        msg = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))) or b"{}")
        try:
            url = urlparse(msg.get("path") or "")
            body = msg.get("body")
            if msg.get("method") == "POST" and url.path == "/api/chat":
                cid = str((body or {}).get("chat_id") or "")[:64]
                res = {"ok": True, "run_id": core.start_chat(body or {}, lambda ev: push(cid, ev))}
            else:
                res = core.api_call(msg.get("method") or "GET", url.path, parse_qs(url.query), body)
            self._send(200, json.dumps(res, ensure_ascii=False))
        except core.ApiError as exc:
            self._send(400, str(exc))
        except Exception as exc:  # noqa: BLE001
            self._send(500, f"Chyba: {exc}")


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
