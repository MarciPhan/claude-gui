#!/usr/bin/env bash
# Instalace Claude GUI do domovského adresáře (bez sudo). Odinstalace: ./install.sh --uninstall
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"
DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
APP="$DATA/claude-gui"
DESK="$DATA/applications/cz.marcipan.ClaudeGui.desktop"
ICON="$DATA/icons/hicolor/scalable/apps/claude-gui.svg"

if [ "${1:-}" = "--uninstall" ]; then
  rm -rf "$APP" "$DESK" "$ICON"
  echo "Odinstalováno (data o konverzacích v ~/.claude zůstávají)."; exit 0
fi

python3 - <<'PY' || { echo "Chybí PyGObject s GTK4, libadwaita a WebKitGTK 6.0. Viz README (balíčky pro vaši distribuci)." >&2; exit 1; }
import gi
gi.require_version("Gtk", "4.0"); gi.require_version("Adw", "1")
gi.require_version("WebKit", "6.0"); gi.require_version("JavaScriptCore", "6.0")
PY
command -v claude >/dev/null || echo "Upozornění: příkaz 'claude' (Claude Code CLI) není v PATH, bez něj aplikace nic neodešle." >&2

mkdir -p "$APP" "$(dirname "$DESK")" "$(dirname "$ICON")"
cp -r "$SRC/claude-gui/." "$APP/"
cp "$SRC/data/claude-gui.svg" "$ICON"
cat > "$DESK" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Claude Code
Comment=Lokální okno pro Claude Code
Exec=/usr/bin/env python3 $APP/app.py
Icon=claude-gui
Terminal=false
Categories=Utility;Development;
StartupWMClass=cz.marcipan.ClaudeGui
DESKTOP
update-desktop-database "$DATA/applications" 2>/dev/null || true
gtk-update-icon-cache -q "$DATA/icons/hicolor" 2>/dev/null || true
echo "Hotovo. Spusťte „Claude Code“ z nabídky aplikací nebo: python3 $APP/app.py"
