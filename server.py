#!/usr/bin/env python3
"""
server.py
Serveur local pour Basket Club Tool Web.

Sert les fichiers statiques ET expose /api/teams pour lire/écrire config/teams.json.
Usage : python server.py   (ou via serve.bat)
"""

import json
import os
import webbrowser
from http.server import SimpleHTTPRequestHandler, HTTPServer
from pathlib import Path

PORT       = 8080
BASE_DIR   = Path(__file__).parent
TEAMS_PATH = BASE_DIR / "config" / "teams.json"


class Handler(SimpleHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        if self.path == "/api/teams":
            self._serve_teams()
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == "/api/teams":
            self._save_teams()
        else:
            self.send_response(404)
            self.end_headers()

    # ── Handlers API ──────────────────────────────────────────

    def _serve_teams(self):
        try:
            body = TEAMS_PATH.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:
            self._json(500, {"error": str(exc)})

    def _save_teams(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw    = self.rfile.read(length)
            data   = json.loads(raw.decode("utf-8"))
            TEAMS_PATH.write_text(
                json.dumps(data, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            self._json(200, {"ok": True})
        except Exception as exc:
            self._json(500, {"error": str(exc)})

    def _json(self, status, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        # N'affiche que les appels API dans la console, pas les statiques
        if args and "/api/" in str(args[0]):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    os.chdir(BASE_DIR)
    srv = HTTPServer(("localhost", PORT), Handler)
    print(f"\n  Basket Club Tool — Serveur local")
    print(f"  Adresse : http://localhost:{PORT}/web/")
    print(f"  Arrêt   : Ctrl+C\n")
    webbrowser.open(f"http://localhost:{PORT}/web/")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n  Serveur arrêté.")
