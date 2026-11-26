"""Trezor přístupů (FTP, SSH, API…): metadata v JSON, hesla jen v systémové klíčence (libsecret).

Heslo se z klíčenky nikdy nevrací do UI. AI k němu dostane přístup jen přes proměnné prostředí
běžícího procesu (CG_<NÁZEV>_HOST/USER/PASS/PORT) u položek, které uživatel povolil.
"""

import json
import os
import re
import shutil
import subprocess
import unicodedata
import uuid
from pathlib import Path

KINDS = ("ftp", "sftp", "ssh", "api", "db", "other")
APP_ATTR = "claude-gui-vault"


def available():
    return bool(shutil.which("secret-tool"))


def _slug(name):
    s = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Za-z0-9]+", "_", s).strip("_").upper() or "ACCESS"


def _secret_set(eid, secret):
    r = subprocess.run(["secret-tool", "store", "--label=Claude GUI: " + eid, "app", APP_ATTR, "id", eid],
                       input=secret.encode(), capture_output=True, timeout=15)
    if r.returncode:
        raise RuntimeError("Klíčenku se nepodařilo zapsat: " + r.stderr.decode(errors="replace").strip()[:200])


def _secret_get(eid):
    r = subprocess.run(["secret-tool", "lookup", "app", APP_ATTR, "id", eid], capture_output=True, timeout=15)
    return r.stdout.decode(errors="replace") if r.returncode == 0 else ""


def _secret_del(eid):
    subprocess.run(["secret-tool", "clear", "app", APP_ATTR, "id", eid], capture_output=True, timeout=15)


class Vault:
    def __init__(self, path):
        self.path = Path(path)

    def _load(self):
        try:
            d = json.loads(self.path.read_text("utf-8"))
            return d if isinstance(d, list) else []
        except (OSError, ValueError):
            return []

    def _save(self, items):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(items, ensure_ascii=False, indent=1), "utf-8")
        os.chmod(tmp, 0o600)
        tmp.replace(self.path)

    def list(self):
        """Seznam bez hesel; `has_secret` říká, jestli je heslo v klíčence."""
        out = []
        for e in self._load():
            out.append({**e, "has_secret": bool(_secret_get(e["id"]))})
        return out

    def save(self, item):
        if not available():
            raise RuntimeError("Chybí secret-tool (balíček libsecret), bez systémové klíčenky nelze hesla ukládat.")
        name = str(item.get("name") or "").strip()[:60]
        if not name:
            raise ValueError("Zadejte název.")
        kind = item.get("kind") if item.get("kind") in KINDS else "other"
        items = self._load()
        eid = str(item.get("id") or "")
        cur = next((e for e in items if e["id"] == eid), None)
        if cur is None:
            eid = uuid.uuid4().hex[:8]
        rec = {"id": eid, "name": name, "kind": kind, "host": str(item.get("host") or "").strip()[:200],
               "port": str(item.get("port") or "").strip()[:6], "user": str(item.get("user") or "").strip()[:100],
               "note": str(item.get("note") or "").strip()[:300], "ai": bool(item.get("ai"))}
        secret = item.get("secret")
        if isinstance(secret, str) and secret:
            _secret_set(eid, secret)
        items = [rec if e["id"] == eid else e for e in items] if cur else items + [rec]
        self._save(items)
        return eid

    def delete(self, eid):
        _secret_del(str(eid))
        self._save([e for e in self._load() if e["id"] != eid])

    def ai_env(self):
        """(proměnné prostředí s hodnotami, popis pro systémový prompt bez hesel) pro povolené položky."""
        env, lines, used = {}, [], set()
        for e in self._load():
            if not e.get("ai"):
                continue
            pw = _secret_get(e["id"])
            base = "CG_" + _slug(e["name"])
            if base in used:
                base += "_" + e["id"][:4].upper()
            used.add(base)
            env[base + "_HOST"] = e.get("host", "")
            env[base + "_USER"] = e.get("user", "")
            env[base + "_PASS"] = pw
            if e.get("port"):
                env[base + "_PORT"] = e["port"]
            lines.append(f"- {e['name']} ({e['kind']}): ${base}_HOST, ${base}_USER, ${base}_PASS" +
                         (f", ${base}_PORT" if e.get("port") else "") + (f" – {e['note']}" if e.get("note") else ""))
        return env, lines


def hint(lines):
    if not lines:
        return ""
    return ("Uživatel ti dal přístupy k serverům. Jsou jako proměnné prostředí; použij je v příkazech "
            "(např. lftp -u \"$CG_X_USER,$CG_X_PASS\" \"$CG_X_HOST\"). Hodnoty hesel nikdy nevypisuj, nezapisuj do souborů, "
            "commitů ani odpovědí a nevolej `env`/`printenv`.\n" + "\n".join(lines))
