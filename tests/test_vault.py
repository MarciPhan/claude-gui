"""Trezor a zprostředkovatel: šifrování, odepření, očištění výstupu, ochrana hesla před AI."""
import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "claude-gui"
sys.path.insert(0, str(ROOT))
import broker  # noqa: E402
import vault  # noqa: E402

PW = "hlavni-heslo-123"
SECRET = "Tajne#Heslo/987"


class VaultTest(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        os.environ["XDG_RUNTIME_DIR"] = self.d
        self.v = vault.Vault(Path(self.d) / "v.enc")
        self.v.setup(PW)
        self.id = self.v.save({"name": "Web", "kind": "ftp", "host": "ftp.example.cz", "user": "jakub", "secret": SECRET, "mode": "ask"})

    def test_file_is_encrypted(self):
        raw = (Path(self.d) / "v.enc").read_bytes()
        for needle in (SECRET.encode(), b"ftp.example.cz", b"jakub", b"Web"):
            self.assertNotIn(needle, raw)
        self.assertEqual(oct((Path(self.d) / "v.enc").stat().st_mode & 0o777), "0o600")

    def test_unlock_roundtrip_and_wrong_password(self):
        self.v.lock()
        with self.assertRaises(vault.VaultError):
            self.v.list()
        with self.assertRaises(vault.VaultError):
            self.v.unlock("spatne-heslo")
        self.v.unlock(PW)
        self.assertEqual(self.v.get("web")["secret"], SECRET)

    def test_list_never_contains_secret(self):
        self.assertNotIn(SECRET, json.dumps(self.v.list()))

    def test_edit_keeps_secret_when_empty(self):
        self.v.save({"id": self.id, "name": "Web", "kind": "ftp", "host": "x", "secret": "", "mode": "ask"})
        self.assertEqual(self.v.get(self.id)["secret"], SECRET)

    def test_change_password(self):
        self.v.change_password(PW, "nove-heslo-456")
        self.v.lock()
        self.v.unlock("nove-heslo-456")
        with self.assertRaises(vault.VaultError):
            self.v.unlock(PW)

    def test_scrub_variants(self):
        import base64
        import urllib.parse
        for variant in (SECRET, urllib.parse.quote(SECRET, safe=""), base64.b64encode(SECRET.encode()).decode()):
            self.assertNotIn(variant, broker.scrub("x " + variant + " y", SECRET))

    def _broker(self, answers=None):
        b = broker.Broker(self.v, Path(self.d) / "log.jsonl")
        events = []

        def emit(ev):
            events.append(ev)
            if ev.get("subtype") == "vault_ask":
                threading.Timer(0.05, b.answer, (ev["id"], answers)).start()
        tok, env = b.issue(emit, self.d)
        return b, tok, env, events

    def test_invalid_token_and_unknown_entry(self):
        b, tok, env, _ = self._broker(True)
        self.assertFalse(b.handle({"token": "x", "op": "list"})["ok"])
        self.assertFalse(b.handle({"token": tok, "op": "ftp", "name": "neexistuje", "args": ["ls"]})["ok"])
        b.revoke(tok)
        self.assertFalse(b.handle({"token": tok, "op": "list"})["ok"])

    def test_ask_denied_and_logged_without_secret(self):
        b, tok, env, ev = self._broker(False)
        r = b.handle({"token": tok, "op": "ftp", "name": "web", "args": ["cat", SECRET]})
        self.assertFalse(r["ok"])
        self.assertIn("zamítl", r["out"])
        ask = [e for e in ev if e.get("subtype") == "vault_ask"][0]
        self.assertNotIn(SECRET, json.dumps(ask))
        self.assertNotIn(SECRET, (Path(self.d) / "log.jsonl").read_text())

    def test_mode_off_hidden(self):
        self.v.save({"id": self.id, "name": "Web", "kind": "ftp", "host": "h", "mode": "off"})
        b, tok, *_ = self._broker(True)
        self.assertFalse(b.handle({"token": tok, "op": "ftp", "name": "web", "args": ["ls"]})["ok"])
        self.assertNotIn("Web", b.handle({"token": tok, "op": "list"})["out"])

    def test_http_only_to_own_host(self):
        self.v.save({"name": "Api", "kind": "api", "host": "api.example.cz", "secret": SECRET, "mode": "auto"})
        b, tok, *_ = self._broker()
        r = b.handle({"token": tok, "op": "http", "name": "api", "args": ["GET", "https://evil.example.org/x"]})
        self.assertFalse(r["ok"])
        r = b.handle({"token": tok, "op": "http", "name": "api", "args": ["GET", "http://api.example.cz/x"]})
        self.assertFalse(r["ok"])

    def test_local_path_confined(self):
        with self.assertRaises(ValueError):
            broker.Broker._local(self.d, "../../etc/passwd")

    def test_helper_over_socket_and_env_has_no_secret(self):
        b, tok, env, _ = self._broker(True)
        self.assertNotIn(SECRET, json.dumps(env))
        out = subprocess.run([str(ROOT / "bin" / "cg-vault"), "list"], env={**os.environ, **env}, capture_output=True, text=True)
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertIn("Web", out.stdout)
        self.assertNotIn(SECRET, out.stdout + out.stderr)
        self.assertEqual(oct(os.stat(env["CG_VAULT_SOCK"]).st_mode & 0o777), "0o600")


if __name__ == "__main__":
    unittest.main()
