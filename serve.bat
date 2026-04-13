@echo off
REM ─────────────────────────────────────────────────────────────
REM  serve.bat  —  Lance le serveur local pour Basket Club Tool Web
REM  Necessaire pour que l'OAuth Google fonctionne (exige http://)
REM  et pour que les fichiers config/ soient accessibles via fetch.
REM  server.py expose aussi /api/teams pour sauvegarder teams.json.
REM ─────────────────────────────────────────────────────────────

cd /d "%~dp0"

python server.py

pause
