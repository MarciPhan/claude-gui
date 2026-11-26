#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Claude GUI – nativní okno (GTK4 + libadwaita + WebKitGTK).

Žádný HTTP server ani prohlížeč: UI (složené z ui/) běží ve vestavěném WebKitu
a s jádrem (core.py) mluví přes `window.webkit.messageHandlers.api`.
"""

import json
import os
import secrets
import sys
import threading
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import gi

gi.require_version("Gtk", "4.0")
gi.require_version("Adw", "1")
gi.require_version("WebKit", "6.0")
gi.require_version("JavaScriptCore", "6.0")
from gi.repository import Adw, Gdk, Gio, GLib, Gtk, JavaScriptCore, WebKit  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
import core  # noqa: E402

APP_ID = "cz.marcipan.ClaudeGui"
DATA_DIR = Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local" / "share") / "claude-gui-data"
BASE_URI = "claude-gui://app/"


class Window(Adw.ApplicationWindow):
    def __init__(self, app):
        super().__init__(application=app, title="Claude Code", default_width=1220, default_height=800)
        self.set_size_request(380, 480)

        DATA_DIR.mkdir(parents=True, exist_ok=True)
        session = WebKit.NetworkSession.new(str(DATA_DIR / "webkit"), str(DATA_DIR / "webkit-cache"))
        ucm = WebKit.UserContentManager()
        ucm.register_script_message_handler_with_reply("api", None)
        ucm.connect("script-message-with-reply-received::api", self.on_message)

        self.web = WebKit.WebView(network_session=session, user_content_manager=ucm)
        settings = self.web.get_settings()
        settings.set_enable_developer_extras(os.environ.get("CLAUDE_GUI_DEBUG") == "1")
        settings.set_enable_javascript_markup(True)
        settings.set_enable_back_forward_navigation_gestures(False)
        self.web.set_hexpand(True)
        self.web.set_vexpand(True)
        self.web.connect("decide-policy", self.on_policy)
        self.web.connect("notify::title", lambda *_: self.title_label.set_label(self.web.get_title() or "Claude Code"))
        self.web.connect("context-menu", lambda *_: not os.environ.get("CLAUDE_GUI_DEBUG"))  # bez kontextové nabídky prohlížeče

        header = Adw.HeaderBar()
        self.title_label = Gtk.Label(label="Claude Code", ellipsize=3)
        self.title_label.add_css_class("heading")
        header.set_title_widget(self.title_label)
        view = Adw.ToolbarView()
        view.add_top_bar(header)
        self.paned = Gtk.Paned(orientation=Gtk.Orientation.HORIZONTAL, resize_start_child=True, shrink_start_child=False, shrink_end_child=False)
        self.paned.set_start_child(self.web)
        self.preview_box = None
        view.set_content(self.paned)
        self.set_content(view)

        self.connect("close-request", self.on_close)
        self.install_zoom_shortcuts()

        nonce = secrets.token_urlsafe(16)
        html = core.build_index(nonce)
        csp = (f'<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; frame-src about: blob:; '
               f"script-src 'nonce-{nonce}'; style-src 'unsafe-inline'; font-src data:; media-src blob:; img-src data: blob:\">")
        html = html.replace("</head>", csp + "</head>", 1)
        self.pane_html = html  # stejný dokument se vkládá do panelů rozděleného zobrazení
        self.web.load_html(html, BASE_URI)
        self.install_file_drop()

    # --- nativní přetažení souborů z Nautilu apod. ---

    def show_preview(self, uri):
        """Boční nativní panel s náhledem webu nebo aplikace."""
        if self.preview_box is None:
            self.preview_web = WebKit.WebView(network_session=WebKit.NetworkSession.new_ephemeral())  # bez sdílených cookies a úložiště
            self.preview_web.set_hexpand(True)
            self.preview_web.set_vexpand(True)
            bar = Gtk.Box(spacing=6, margin_start=6, margin_end=6, margin_top=4, margin_bottom=4)
            self.preview_title = Gtk.Label(label="Náhled", hexpand=True, xalign=0, ellipsize=3)
            reload_btn = Gtk.Button(icon_name="view-refresh-symbolic")
            reload_btn.add_css_class("flat")
            reload_btn.connect("clicked", lambda *_: self.preview_web.reload())
            ext_btn = Gtk.Button(icon_name="web-browser-symbolic")
            ext_btn.add_css_class("flat")
            ext_btn.connect("clicked", lambda *_: Gio.AppInfo.launch_default_for_uri(self.preview_web.get_uri() or "", None))
            close_btn = Gtk.Button(icon_name="window-close-symbolic")
            close_btn.add_css_class("flat")
            close_btn.connect("clicked", lambda *_: self.hide_preview())
            for w in (self.preview_title, reload_btn, ext_btn, close_btn):
                bar.append(w)
            self.preview_web.connect("notify::title", lambda *_: self.preview_title.set_label(self.preview_web.get_title() or self.preview_web.get_uri() or "Náhled"))
            self.preview_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
            self.preview_box.set_size_request(320, -1)
            self.preview_box.append(bar)
            self.preview_box.append(self.preview_web)
        if self.preview_box.get_parent() is None:
            self.paned.set_end_child(self.preview_box)
            self.paned.set_position(max(380, int(self.get_width() * 0.5)))
        self.preview_web.load_uri(uri)

    def hide_preview(self):
        if self.preview_box is not None and self.preview_box.get_parent() is not None:
            self.paned.set_end_child(None)

    def install_file_drop(self):
        target = Gtk.DropTarget.new(Gdk.FileList, Gdk.DragAction.COPY)
        target.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)

        def hover(on):
            self.web.evaluate_javascript(f"window.__dropHover && window.__dropHover({'true' if on else 'false'})",
                                         -1, None, None, None, None)

        def on_enter(t, x, y):
            hover(True)
            return Gdk.DragAction.COPY

        def on_motion(t, x, y):
            return Gdk.DragAction.COPY

        def on_leave(t):
            hover(False)

        def on_drop(t, value, x, y):
            hover(False)
            paths = [f.get_path() for f in value.get_files() if f.get_path()]
            zoom = self.web.get_zoom_level() or 1.0
            threading.Thread(target=self.ingest, args=(paths, x / zoom, y / zoom), daemon=True).start()
            return True

        target.connect("enter", on_enter)
        target.connect("motion", on_motion)
        target.connect("leave", on_leave)
        target.connect("drop", on_drop)
        self.web.add_controller(target)

    def ingest(self, paths, x, y):
        files, errors = [], []
        for p in paths:
            try:
                files.append(core.ingest_file(p))
            except core.ApiError as exc:
                errors.append(str(exc))
            except OSError as exc:
                errors.append(f"{os.path.basename(p)}: {exc}")
        js = f"window.__onFiles && window.__onFiles({json.dumps(files, ensure_ascii=False)}, {x}, {y}, {json.dumps(errors, ensure_ascii=False)})"

        def run():
            self.web.evaluate_javascript(js, -1, None, None, None, None)
            return False
        GLib.idle_add(run)

    # --- zoom (Ctrl +, Ctrl -, Ctrl 0) ---

    def install_zoom_shortcuts(self):
        ctrl = Gtk.ShortcutController()
        ctrl.set_scope(Gtk.ShortcutScope.GLOBAL)

        def zoom(delta):
            def cb(*_):
                z = 1.0 if delta == 0 else max(0.5, min(2.5, self.web.get_zoom_level() + delta))
                self.web.set_zoom_level(z)
                return True
            return Gtk.CallbackAction.new(cb)

        for keys, delta in ((("<Control>plus", "<Control>equal", "<Control>KP_Add"), 0.1),
                            (("<Control>minus", "<Control>KP_Subtract"), -0.1),
                            (("<Control>0", "<Control>KP_0"), 0)):
            for k in keys:
                ctrl.add_shortcut(Gtk.Shortcut.new(Gtk.ShortcutTrigger.parse_string(k), zoom(delta)))
        self.add_controller(ctrl)

    # --- odkazy se otevírají ve výchozím prohlížeči, okno nikam nenavigujeme ---

    def on_policy(self, web, decision, dtype):
        if dtype in (WebKit.PolicyDecisionType.NAVIGATION_ACTION, WebKit.PolicyDecisionType.NEW_WINDOW_ACTION):
            uri = decision.get_navigation_action().get_request().get_uri()
            if not uri.startswith((BASE_URI, "about:", "blob:")):
                if uri.startswith(("http://", "https://")):
                    Gio.AppInfo.launch_default_for_uri(uri, None)
                decision.ignore()
                return True
        return False

    def on_close(self, *_):
        core.shutdown_all()
        return False

    # --- most JS <-> Python ---

    def on_message(self, manager, value, reply):
        try:
            msg = json.loads(value.to_json(0))
        except ValueError:
            reply.return_error_message("Neplatná zpráva.")
            return True
        threading.Thread(target=self.handle, args=(msg, reply, value.get_context()), daemon=True).start()
        return True

    def respond(self, reply, jsc, ok, payload):
        def run():
            if ok:
                reply.return_value(JavaScriptCore.Value.new_string(jsc, json.dumps(payload, ensure_ascii=False)))
            else:
                reply.return_error_message(str(payload))
            return False
        GLib.idle_add(run)

    def handle(self, msg, reply, jsc):
        try:
            url = urlparse(msg.get("path") or "")
            method = msg.get("method") or "GET"
            body = msg.get("body")
            if method == "POST" and url.path == "/api/chat":
                chat_id = str((body or {}).get("chat_id") or "")[:64]
                run_id = core.start_chat(body or {}, lambda ev: self.push(chat_id, ev))
                result = {"ok": True, "run_id": run_id}
            elif method == "GET" and url.path == "/api/clip_image":
                result = self.clip_image()
            elif method == "POST" and url.path == "/api/preview":
                target = str((body or {}).get("url") or "").strip()
                if target.startswith(("/", "~")):
                    target = Path(target).expanduser().as_uri()
                elif "://" not in target:
                    target = "http://" + target
                if urlparse(target).scheme not in ("http", "https", "file"):
                    raise core.ApiError("Náhled podporuje jen http, https a lokální soubory.")
                GLib.idle_add(lambda: self.show_preview(target) or False)
                result = {"ok": True}
            elif method == "GET" and url.path == "/api/pane_html":
                result = {"html": self.pane_html}
            else:
                result = core.api_call(method, url.path, parse_qs(url.query), body)
            self.respond(reply, jsc, True, result)
        except core.ApiError as exc:
            self.respond(reply, jsc, False, exc)
        except Exception as exc:  # noqa: BLE001 – chybu vrátíme do UI
            self.respond(reply, jsc, False, f"Chyba: {exc}")

    def clip_image(self):
        """Obrázek ze systémové schránky (když ho WebKit nepředá stránce) uloží do uploads."""
        done = threading.Event()
        out = {}
        ext = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/bmp": "bmp", "image/gif": "gif"}

        def store(data, e):
            dst = core.new_upload_path("vložený-obrázek." + e)
            dst.write_bytes(data)
            out["r"] = {"path": str(dst), "name": dst.name, "size": core.shrink_image(dst)}

        def via_texture(clip):
            def finish(c, res):
                try:
                    tex = c.read_texture_finish(res)
                    if tex is not None:
                        dst = core.new_upload_path("vložený-obrázek.png")
                        tex.save_to_png(str(dst))
                        out["r"] = {"path": str(dst), "name": dst.name, "size": core.shrink_image(dst)}
                except Exception:  # noqa: BLE001 – ve schránce není obrázek
                    pass
                done.set()
            clip.read_texture_async(None, finish)

        def start():
            clip = self.get_clipboard()
            mimes = list(clip.get_formats().get_mime_types() or [])
            pref = [m for m in ext if m in mimes]
            if not pref:
                via_texture(clip)
                return False

            def finish_raw(c, res):
                try:
                    stream, mime = c.read_finish(res)
                except GLib.Error:
                    via_texture(c)
                    return

                def pump():
                    chunks = []
                    try:
                        while True:
                            b = stream.read_bytes(1 << 20, None).get_data()
                            if not b:
                                break
                            chunks.append(bytes(b))
                        stream.close(None)
                    except GLib.Error:
                        pass
                    data = b"".join(chunks)
                    if data:
                        store(data, ext.get(mime, "png"))
                        done.set()
                    else:
                        GLib.idle_add(lambda: via_texture(c) or False)
                threading.Thread(target=pump, daemon=True).start()
            clip.read_async(pref, GLib.PRIORITY_DEFAULT, None, finish_raw)
            return False

        GLib.idle_add(start)
        done.wait(10)
        if "r" not in out:
            raise core.ApiError("Ve schránce není obrázek.")
        return out["r"]

    def push(self, chat_id, event):
        """Událost z běžícího claude do UI (volá se z pracovních vláken)."""
        js = f"window.__onChat({json.dumps(chat_id)}, {json.dumps(event, ensure_ascii=False)})"

        def run():
            self.web.evaluate_javascript(js, -1, None, None, None, None)
            return False
        GLib.idle_add(run)


class App(Adw.Application):
    def __init__(self):
        super().__init__(application_id=APP_ID, flags=Gio.ApplicationFlags.DEFAULT_FLAGS)

    def do_activate(self):
        win = self.props.active_window
        if not win:
            win = Window(self)
        win.present()


if __name__ == "__main__":
    sys.exit(App().run(sys.argv))
