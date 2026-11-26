"""Pracovní prostory: ukládání, čištění vstupu a spouštění příkazů."""
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "claude-gui"
sys.path.insert(0, str(ROOT))
import core  # noqa: E402


class WorkspaceTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old = core.WORKSPACES_FILE
        core.WORKSPACES_FILE = Path(self.tmp.name) / "ws.json"
        self.dir = Path(self.tmp.name) / "proj"
        self.dir.mkdir()

    def tearDown(self):
        core.WORKSPACES_FILE = self.old
        self.tmp.cleanup()

    def _save(self, **extra):
        w = {"id": "a1", "name": "Test", "path": str(self.dir), "mode": "bogus", "model": "bad model!",
             "commands": [{"name": "Echo", "cmd": "echo ahoj; pwd"}, {"name": "x", "cmd": "  "}], **extra}
        return core.save_workspaces({"items": [w]})["items"][0]

    def test_sanitize(self):
        w = self._save()
        self.assertEqual(w["mode"], "")
        self.assertEqual(w["model"], "")
        self.assertEqual(len(w["commands"]), 1)
        self.assertTrue(w["exists"])

    def test_run_command_by_index(self):
        self._save()
        r = core.run_workspace_command({"id": "a1", "index": 0})
        self.assertEqual(r["code"], 0)
        self.assertIn("ahoj", r["output"])
        self.assertIn(str(self.dir), r["output"])

    def test_run_rejects_unknown(self):
        self._save()
        for body in ({"id": "a1", "index": 5}, {"id": "nope", "index": 0}, {"id": "a1", "index": "x"}):
            with self.assertRaises(core.ApiError):
                core.run_workspace_command(body)

    def test_failing_command_code(self):
        self._save(commands=[{"name": "f", "cmd": "exit 3"}])
        self.assertEqual(core.run_workspace_command({"id": "a1", "index": 0})["code"], 3)


if __name__ == "__main__":
    unittest.main()
