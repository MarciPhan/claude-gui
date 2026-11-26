"""Kontrola složení UI: všechny části existují, jsou použité a výsledek je platný JS."""
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "claude-gui"
sys.path.insert(0, str(ROOT))
import core  # noqa: E402


class BuildTest(unittest.TestCase):
    def test_all_parts_used(self):
        tpl = core.INDEX_FILE.read_text("utf-8")
        used = set(core.INCLUDE_RE.findall(tpl))
        on_disk = {f"{d}/{p.name}" for d in ("styles", "scripts") for p in (core.UI_DIR / d).iterdir() if p.is_file()}
        self.assertEqual(used, on_disk)

    def test_single_document_with_nonce(self):
        html = core.build_index("NONCE")
        self.assertNotIn("<!--@include", html)
        self.assertNotIn("__CSP_NONCE__", html)
        self.assertEqual(len(re.findall(r'<script nonce="NONCE">', html)), 2)
        self.assertNotIn("<script src", html)

    @unittest.skipUnless(shutil.which("node"), "chybí node")
    def test_js_syntax(self):
        html = core.build_index("N")
        for i, code in enumerate(re.findall(r"<script[^>]*>(.*?)</script>", html, re.S)):
            with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as f:
                f.write(code)
            r = subprocess.run(["node", "--check", f.name], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, f"skript {i}: {r.stderr[:400]}")


if __name__ == "__main__":
    unittest.main()
