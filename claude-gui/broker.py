"""Zprostředkovatel přístupů: AI nikdy nedostane hesla, jen příkaz `cg-vault`.

`cg-vault` mluví přes unixový socket (jen pro tohoto uživatele) s tímto modulem v hlavním procesu aplikace.
Ten ověří token běžícího dotazu, případně se zeptá uživatele v okně, provede operaci s údaji z trezoru
a vrátí výstup očištěný od hesla. Údaje v paměti aplikace jsou chráněné proti čtení z ostatních procesů
(PR_SET_DUMPABLE=0, viz core.py).
"""

import base64
import ftplib
import json
import os
import re
import secrets
import socket
import ssl
import struct
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

import vault as vault_mod

TOKEN_TTL = 6 * 3600
ASK_TIMEOUT = 120
OUT_LIMIT = 20000
BIN_DIR = Path(__file__).resolve().parent / "bin"


def scrub(text, *secrets_):
    """Odstraní heslo (i v běžných kódováních) z výstupu."""
    for s in secrets_:
        if not s or len(s) < 3:
            continue
        variants = {s, urllib.parse.quote(s, safe=""), urllib.parse.quote_plus(s), base64.b64encode(s.encode()).decode(),
                    base64.b64encode(s.encode()).decode().rstrip("="), s[::-1]}
        for v in sorted(variants, key=len, reverse=True):
            text = text.replace(v, "***")
    return text


class Broker:
    def __init__(self, vault, log_path):
        self.vault = vault
        self.log_path = Path(log_path)
        self.tokens = {}      # token -> {"emit","cwd","exp"}
        self.pending = {}     # id -> {"ev","allow"}
        self.lock = threading.Lock()
        self.sock_path = None
        self.started = False

    # --- spuštění a tokeny ---
    def start(self):
        with self.lock:
            if self.started:
                return
            base = Path(os.environ.get("XDG_RUNTIME_DIR") or f"/tmp/claude-gui-{os.getuid()}")
            base.mkdir(parents=True, exist_ok=True, mode=0o700)
            os.chmod(base, 0o700)
            self.sock_path = str(base / f"claude-gui-broker-{os.getpid()}.sock")
            try:
                os.unlink(self.sock_path)
            except OSError:
                pass
            srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            srv.bind(self.sock_path)
            os.chmod(self.sock_path, 0o600)
            srv.listen(8)
            self.srv = srv
            self.started = True
            threading.Thread(target=self._accept, daemon=True).start()

    def issue(self, emit, cwd):
        """Token a proměnné prostředí pro jeden běh; token platí, dokud běh neskončí."""
        self.start()
        tok = secrets.token_urlsafe(24)
        with self.lock:
            now = time.time()
            self.tokens = {t: v for t, v in self.tokens.items() if v["exp"] > now}
            self.tokens[tok] = {"emit": emit, "cwd": cwd, "exp": now + TOKEN_TTL}
        env = {"CG_VAULT_SOCK": self.sock_path, "CG_VAULT_TOKEN": tok,
               "PATH": str(BIN_DIR) + os.pathsep + os.environ.get("PATH", "")}
        return tok, env

    def revoke(self, tok):
        with self.lock:
            self.tokens.pop(tok, None)

    def answer(self, rid, allow):
        with self.lock:
            p = self.pending.get(rid)
        if p:
            p["allow"] = bool(allow)
            p["ev"].set()
        return bool(p)

    # --- server ---
    def _accept(self):
        while True:
            try:
                conn, _ = self.srv.accept()
            except OSError:
                return
            threading.Thread(target=self._serve, args=(conn,), daemon=True).start()

    def _serve(self, conn):
        try:
            with conn:
                cred = conn.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, struct.calcsize("3i"))
                if struct.unpack("3i", cred)[1] != os.getuid():
                    return
                conn.settimeout(10)
                buf = b""
                while b"\n" not in buf and len(buf) < 70000:
                    chunk = conn.recv(8192)
                    if not chunk:
                        break
                    buf += chunk
                try:
                    req = json.loads(buf.split(b"\n")[0])
                except ValueError:
                    res = {"ok": False, "out": "Neplatný požadavek."}
                else:
                    try:
                        res = self.handle(req)
                    except Exception as exc:  # noqa: BLE001 – chybu vrátíme klientovi
                        res = {"ok": False, "out": f"Chyba: {exc}"}
                conn.settimeout(30)
                conn.sendall(json.dumps(res, ensure_ascii=False).encode())
        except OSError:
            pass

    # --- logika ---
    def handle(self, req):
        with self.lock:
            ctx = self.tokens.get(str(req.get("token") or ""))
        if not ctx or ctx["exp"] < time.time():
            return {"ok": False, "out": "Přístup byl odepřen (neplatný nebo ukončený běh)."}
        op = str(req.get("op") or "")
        if op == "list":
            return self._list(ctx)
        name = str(req.get("name") or "")
        args = [str(a) for a in (req.get("args") or [])][:50]
        if not self._wait_unlocked(ctx):
            return {"ok": False, "out": "Trezor je zamčený a uživatel ho neodemkl."}
        entry = self.vault.get(name)
        if not entry or entry.get("mode", "off") == "off":
            return {"ok": False, "out": f"Přístup '{name}' neexistuje nebo k němu AI nemá povolený přístup. Zkus `cg-vault list`."}
        kinds = {"ftp": "ftp", "ssh": "ssh", "http": "api"}
        if op not in kinds or (entry["kind"] != kinds[op] and not (op == "http" and entry["kind"] == "other")):
            return {"ok": False, "out": f"Operace '{op}' se k tomuto typu přístupu ({entry['kind']}) nehodí."}
        desc = f"{op}: " + " ".join(args)
        sec = entry.get("secret", "")
        desc = scrub(desc, sec)[:500]
        if entry["mode"] == "ask" and not self._ask(ctx, entry["name"], desc):
            self._log(entry["name"], op, desc, False)
            return {"ok": False, "out": "Uživatel operaci zamítl."}
        try:
            out = {"ftp": self._ftp, "ssh": self._ssh, "http": self._http}[op](entry, args, ctx["cwd"])
            ok = True
        except Exception as exc:  # noqa: BLE001
            out, ok = f"Chyba: {exc}", False
        out = scrub(str(out), sec)
        if len(out) > OUT_LIMIT:
            out = out[:OUT_LIMIT] + "\n[výstup zkrácen]"
        self._log(entry["name"], op, desc, True, ok)
        return {"ok": ok, "out": out}

    def _list(self, ctx):
        if not self._wait_unlocked(ctx):
            return {"ok": False, "out": "Trezor je zamčený a uživatel ho neodemkl."}
        rows = [f"{e['name']}  [{e['kind']}]" + (f"  {e['note']}" if e.get("note") else "") +
                ("  (každé použití potvrzuje uživatel)" if e["mode"] == "ask" else "") for e in self.vault.allowed()]
        return {"ok": True, "out": "\n".join(rows) or "Žádné přístupy nejsou povolené."}

    def _wait_unlocked(self, ctx):
        if self.vault.unlocked():
            return True
        try:
            ctx["emit"]({"type": "gui", "subtype": "vault_unlock"})
        except Exception:  # noqa: BLE001
            pass
        end = time.time() + ASK_TIMEOUT
        while time.time() < end:
            if self.vault.unlocked():
                return True
            time.sleep(0.5)
        return False

    def _ask(self, ctx, name, desc):
        rid = uuid.uuid4().hex[:12]
        p = {"ev": threading.Event(), "allow": False}
        with self.lock:
            self.pending[rid] = p
        try:
            ctx["emit"]({"type": "gui", "subtype": "vault_ask", "id": rid, "name": name, "detail": desc})
            p["ev"].wait(ASK_TIMEOUT)
            return p["allow"]
        finally:
            with self.lock:
                self.pending.pop(rid, None)

    def _log(self, name, op, desc, allowed, ok=None):
        try:
            self.log_path.parent.mkdir(parents=True, exist_ok=True)
            with open(self.log_path, "a", encoding="utf-8") as f:
                f.write(json.dumps({"ts": int(time.time()), "name": name, "op": op, "detail": desc, "allowed": allowed, "ok": ok},
                                   ensure_ascii=False) + "\n")
            os.chmod(self.log_path, 0o600)
        except OSError:
            pass

    # --- operace ---
    @staticmethod
    def _local(cwd, rel):
        p = (Path(cwd) / rel).resolve()
        if p != Path(cwd).resolve() and Path(cwd).resolve() not in p.parents:
            raise ValueError("Místní cesta musí být uvnitř pracovní složky.")
        return p

    def _ftp(self, e, a, cwd):
        if not a:
            raise ValueError("Použití: cg-vault ftp NÁZEV ls|cat|get|put|rm|mkdir|rmdir|mv|pwd …")
        cmd, rest = a[0], a[1:]
        host, port = e["host"], int(e["port"] or 21)
        try:
            ftp = ftplib.FTP_TLS(timeout=30, context=ssl.create_default_context())
            ftp.connect(host, port)
            ftp.login(e["user"], e["secret"])
            ftp.prot_p()
        except (ssl.SSLError, ftplib.error_perm, OSError, EOFError) as exc:
            if not e.get("plain"):
                raise RuntimeError(f"Zabezpečené spojení (FTPS) selhalo: {exc}. Nešifrované FTP je u tohoto přístupu zakázané.")
            ftp = ftplib.FTP(timeout=30)
            ftp.connect(host, port)
            ftp.login(e["user"], e["secret"])
        try:
            if cmd == "ls":
                lines = []
                ftp.retrlines("LIST " + (rest[0] if rest else ""), lines.append)
                return "\n".join(lines) or "(prázdné)"
            if cmd == "pwd":
                return ftp.pwd()
            if cmd == "cat" and rest:
                chunks = []
                ftp.retrbinary("RETR " + rest[0], chunks.append)
                return b"".join(chunks).decode("utf-8", "replace")
            if cmd == "get" and rest:
                dst = self._local(cwd, rest[1] if len(rest) > 1 else Path(rest[0]).name)
                with open(dst, "wb") as f:
                    ftp.retrbinary("RETR " + rest[0], f.write)
                return f"Staženo do {dst}"
            if cmd == "put" and len(rest) >= 2:
                src = self._local(cwd, rest[0])
                with open(src, "rb") as f:
                    ftp.storbinary("STOR " + rest[1], f)
                return f"Nahráno {src.name} jako {rest[1]}"
            if cmd == "rm" and rest:
                ftp.delete(rest[0])
                return "Smazáno."
            if cmd == "mkdir" and rest:
                ftp.mkd(rest[0])
                return "Složka vytvořena."
            if cmd == "rmdir" and rest:
                ftp.rmd(rest[0])
                return "Složka smazána."
            if cmd == "mv" and len(rest) >= 2:
                ftp.rename(rest[0], rest[1])
                return "Přesunuto."
            raise ValueError("Neznámý nebo neúplný příkaz. Podporováno: ls, pwd, cat, get, put, rm, mkdir, rmdir, mv.")
        finally:
            try:
                ftp.quit()
            except Exception:  # noqa: BLE001
                pass

    def _ssh(self, e, a, cwd):
        if not a:
            raise ValueError("Použití: cg-vault ssh NÁZEV \"příkaz na serveru\"")
        base = ["ssh", "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=20"]
        if e.get("port"):
            base += ["-p", str(int(e["port"]))]
        target = (e["user"] + "@" if e["user"] else "") + e["host"]
        r = w = None
        pass_fds = ()
        if e.get("secret"):
            if not shutil_which("sshpass"):
                raise RuntimeError("Pro přihlášení heslem je potřeba balíček sshpass.")
            r, w = os.pipe()
            os.write(w, (e["secret"] + "\n").encode())
            os.close(w)
            pass_fds = (r,)
            cmd = ["sshpass", "-d", str(r)] + base + ["-o", "PubkeyAuthentication=no", target, "--", " ".join(a)]
        else:
            cmd = base + ["-o", "BatchMode=yes", target, "--", " ".join(a)]
        try:
            p = subprocess.run(cmd, capture_output=True, timeout=120, pass_fds=pass_fds, stdin=subprocess.DEVNULL)
        finally:
            if r is not None:
                os.close(r)
        out = (p.stdout + p.stderr).decode("utf-8", "replace")
        if p.returncode:
            raise RuntimeError(f"kód {p.returncode}\n{out}")
        return out or "(bez výstupu)"

    def _http(self, e, a, cwd):
        if len(a) < 2:
            raise ValueError("Použití: cg-vault http NÁZEV GET|POST|PUT|DELETE URL [data]")
        method, url = a[0].upper(), a[1]
        if method not in ("GET", "POST", "PUT", "PATCH", "DELETE"):
            raise ValueError("Neplatná metoda.")
        u = urllib.parse.urlparse(url)
        if u.scheme != "https" or (u.hostname or "").lower() != e["host"].lower():
            raise ValueError(f"URL musí být https a mířit na {e['host']} (heslo se jinam neposílá).")
        headers = {"User-Agent": "claude-gui-vault"}
        if e.get("secret"):
            if e.get("user"):
                headers["Authorization"] = "Basic " + base64.b64encode(f"{e['user']}:{e['secret']}".encode()).decode()
            else:
                headers["Authorization"] = "Bearer " + e["secret"]
        data = a[2].encode() if len(a) > 2 else None
        if data:
            headers["Content-Type"] = "application/json" if a[2].lstrip().startswith(("{", "[")) else "application/x-www-form-urlencoded"

        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *args, **kwargs):  # přesměrování by mohlo poslat hlavičku jinam
                return None
        opener = urllib.request.build_opener(NoRedirect)
        try:
            resp = opener.open(urllib.request.Request(url, data=data, headers=headers, method=method), timeout=30)
            return f"HTTP {resp.status}\n" + resp.read(OUT_LIMIT * 2).decode("utf-8", "replace")
        except urllib.error.HTTPError as exc:
            return f"HTTP {exc.code}\n" + exc.read(OUT_LIMIT * 2).decode("utf-8", "replace")


def shutil_which(x):
    import shutil
    return shutil.which(x)
