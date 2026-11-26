# Claude GUI

[English](README.md) | **Čeština**

Lokální nativní okno (GTK4 + libadwaita + WebKitGTK 6.0) pro [Claude Code](https://claude.com/claude-code) CLI. Žádný server ani prohlížeč, UI je jediný soubor `index.html`. Rozhraní je česky i anglicky (ozubené kolo v postranním panelu, Nastavení, Jazyk rozhraní; výchozí je jazyk systému).

Funkce: více konverzací najednou, historie a pokračování (`--resume`), složky/projekty, model a effort, limity a dashboard využití, split view, diffy v nástrojích, přílohy (drag & drop, vložení ze schránky, náhledy), vzorce (KaTeX), grafy, Mermaid diagramy, tabulky, zobrazení obrázků/audia/videa.

Úspora tokenů: velké obrázky se zmenší (delší strana 1400 px) a obrázky ≤ 5 MB se posílají přímo ve zprávě; krátký systémový pokyn.

## Požadavky

- nainstalovaný a přihlášený [Claude Code CLI](https://docs.claude.com/en/docs/claude-code) (`claude` v PATH)
- Python 3 s PyGObject, GTK 4, libadwaita, WebKitGTK 6.0
- volitelně Pillow (zmenšení obrázků)

| Distribuce | Balíčky |
|---|---|
| Fedora | `sudo dnf install python3-gobject gtk4 libadwaita webkitgtk6.0 python3-pillow` |
| Debian/Ubuntu (24.04+) | `sudo apt install python3-gi gir1.2-gtk-4.0 gir1.2-adw-1 gir1.2-webkit-6.0 python3-pil` |
| Arch | `sudo pacman -S python-gobject gtk4 libadwaita webkitgtk-6.0 python-pillow` |
| openSUSE | `sudo zypper install python3-gobject-Gdk typelib-1_0-Gtk-4_0 typelib-1_0-Adw-1 typelib-1_0-WebKit-6_0 python3-Pillow` |

## Instalace

```
git clone https://github.com/MarciPhan/claude-gui.git
cd claude-gui
./install.sh
```

Kopíruje se do `~/.local/share/claude-gui`, přidá se položka „Claude Code“ do nabídky aplikací. Odinstalace: `./install.sh --uninstall`. Bez instalace lze spustit přímo `python3 claude-gui/app.py`.

## Data

Konverzace se čtou z `~/.claude/projects` (stejné jako CLI). Nahrané přílohy jsou v `~/.local/share/claude-gui-data/uploads` a po 14 dnech se mažou.

## Poskytovatelé a nástroje

Kromě Claude Code umí aplikace komunikovat i s Codex CLI a OpenCode (jsou-li nainstalované); poskytovatele vyberete v nabídce modelu. Všechny sdílejí jednu konverzaci, takže když Claudovi dojdou tokeny, pokračujete jiným. Nabídka nástrojů (tlačítko s klíčem v poli zprávy) přidává knihovnu promptů, znalostní bázi, recenzi druhým modelem, `/compact`, export do Markdown/HTML/PDF, boční náhled webu či lokální aplikace a kontrolní body v gitu (obnova pracovní složky před libovolným během). Po najetí na zprávu ji můžete větvit do nové konverzace.

## Licence a třetí strany

Kód: MIT. Součástí jsou knihovny [KaTeX](https://katex.org) (MIT) a [Mermaid](https://mermaid.js.org) (MIT) v adresáři `claude-gui/vendor`. „Claude“ a jeho logo jsou ochranné známky společnosti Anthropic; projekt je neoficiální.
