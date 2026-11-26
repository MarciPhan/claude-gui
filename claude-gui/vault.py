"""Šifrovaný trezor přístupů (FTP, SSH, API…).

Celý obsah (názvy, servery, uživatelé, hesla) je v jednom souboru zašifrovaném AES-256-GCM; klíč se odvozuje
z hlavního hesla (scrypt) a existuje jen v paměti aplikace po odemknutí. AI se k datům nedostane: žádná
klíčenka, žádné proměnné prostředí. Přístupy za ni provádí zprostředkovatel (broker.py).
"""

import base64
import json
import os
import re
import threading
import time
import uuid
from pathlib import Path

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

KINDS = ("ftp", "ssh", "api", "other")
MODES = ("off", "ask", "auto")  # AI nemá přístup / ptát se při každém použití / bez ptaní
AAD = b"claude-gui-vault-v1"
SCRYPT = {"n": 2 ** 15, "r": 8, "p": 1}
MIN_PASSWORD = 8


class VaultError(Exception):
    pass


def _b64(b):
    return base64.b64encode(b).decode()


def _kdf(password, salt, n, r, p):
    return Scrypt(salt=salt, length=32, n=n, r=r, p=p).derive(password.encode("utf-8"))


class Vault:
    def __init__(self, path, idle_seconds=1800):
        self.path = Path(path)
        self.idle = idle_seconds
        self.lock_ = threading.RLock()
        self._key = None
        self._salt = None
        self._items = []
        self._last = 0.0

    # --- stav ---
    def exists(self):
        return self.path.exists()

    def unlocked(self):
        with self.lock_:
            if self._key is not None and time.monotonic() - self._last > self.idle:
                self.lock()
            return self._key is not None

    def _need(self):
        if not self.unlocked():
            raise VaultError("Trezor je zamčený.")
        self._last = time.monotonic()

    def lock(self):
        with self.lock_:
            self._key = None
            self._items = []

    # --- soubor ---
    def _write(self):
        nonce = os.urandom(12)
        ct = AESGCM(self._key).encrypt(nonce, json.dumps(self._items, ensure_ascii=False).encode(), AAD)
        doc = {"v": 1, "kdf": "scrypt", **SCRYPT, "salt": _b64(self._salt), "blob": _b64(nonce + ct)}
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            json.dump(doc, f)
        tmp.replace(self.path)

    def setup(self, password):
        with self.lock_:
            if self.exists():
                raise VaultError("Trezor už existuje.")
            if len(password or "") < MIN_PASSWORD:
                raise VaultError(f"Hlavní heslo musí mít aspoň {MIN_PASSWORD} znaků.")
            self._salt = os.urandom(16)
            self._key = _kdf(password, self._salt, **SCRYPT)
            self._items = []
            self._last = time.monotonic()
            self._write()

    def unlock(self, password):
        with self.lock_:
            try:
                doc = json.loads(self.path.read_text("utf-8"))
                salt = base64.b64decode(doc["salt"])
                key = _kdf(password or "", salt, doc["n"], doc["r"], doc["p"])
                raw = base64.b64decode(doc["blob"])
                items = json.loads(AESGCM(key).decrypt(raw[:12], raw[12:], AAD))
            except (InvalidTag, KeyError, ValueError, OSError):
                time.sleep(1)  # zpomalení hádání
                raise VaultError("Špatné hlavní heslo.")
            self._salt, self._key, self._items, self._last = salt, key, items, time.monotonic()

    def change_password(self, old, new):
        with self.lock_:
            self.unlock(old)
            if len(new or "") < MIN_PASSWORD:
                raise VaultError(f"Hlavní heslo musí mít aspoň {MIN_PASSWORD} znaků.")
            self._salt = os.urandom(16)
            self._key = _kdf(new, self._salt, **SCRYPT)
            self._write()

    # --- položky ---
    def list(self):
        """Pro UI: bez hesel (`has_secret` říká, jestli nějaké je)."""
        with self.lock_:
            self._need()
            return [{**{k: v for k, v in e.items() if k != "secret"}, "has_secret": bool(e.get("secret"))} for e in self._items]

    def get(self, ident):
        """Celá položka včetně hesla; jen pro zprostředkovatele, nikdy ne pro UI."""
        with self.lock_:
            self._need()
            ident = (ident or "").strip().lower()
            return next((dict(e) for e in self._items if e["id"] == ident or e["name"].lower() == ident), None)

    def allowed(self):
        with self.lock_:
            self._need()
            return [dict(e) for e in self._items if e.get("mode", "off") != "off"]

    def save(self, item):
        with self.lock_:
            self._need()
            name = str(item.get("name") or "").strip()[:60]
            if not name:
                raise VaultError("Zadejte název.")
            if re.search(r"\s{2,}|^-", name):
                raise VaultError("Neplatný název.")
            eid = str(item.get("id") or "")
            cur = next((e for e in self._items if e["id"] == eid), None)
            if any(e["name"].lower() == name.lower() and e is not cur for e in self._items):
                raise VaultError("Přístup s tímto názvem už existuje.")
            rec = {"id": cur["id"] if cur else uuid.uuid4().hex[:8], "name": name,
                   "kind": item.get("kind") if item.get("kind") in KINDS else "other",
                   "host": str(item.get("host") or "").strip()[:200], "port": str(item.get("port") or "").strip()[:6],
                   "user": str(item.get("user") or "").strip()[:100], "note": str(item.get("note") or "").strip()[:300],
                   "mode": item.get("mode") if item.get("mode") in MODES else "ask",
                   "plain": bool(item.get("plain")),
                   "secret": item["secret"] if isinstance(item.get("secret"), str) and item["secret"] else (cur or {}).get("secret", "")}
            self._items = [rec if e is cur else e for e in self._items] if cur else self._items + [rec]
            self._write()
            return rec["id"]

    def delete(self, eid):
        with self.lock_:
            self._need()
            self._items = [e for e in self._items if e["id"] != eid]
            self._write()


HINT = ("Máš příkaz `cg-vault` pro práci se servery uživatele (FTP, SSH, API) bez znalosti hesel: `cg-vault list` "
        "vypíše dostupné přístupy, dál `cg-vault ftp|ssh|http NÁZEV …` (nápověda: `cg-vault --help`). "
        "Hesla ani servery neznáš a nezjišťuj je. Uživatel může každé použití potvrzovat; při zamítnutí to respektuj.")
