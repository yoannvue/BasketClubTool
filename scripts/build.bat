@echo off
REM ─────────────────────────────────────────────────────────────────────
REM build.bat
REM Génère BasketClubTool.exe dans le dossier dist/
REM Prérequis : pip install -r requirements.txt (dans l'env Python cible)
REM ─────────────────────────────────────────────────────────────────────

cd /d "%~dp0.."

echo [1/3] Nettoyage des builds précédents...
if exist build rmdir /s /q build
if exist dist  rmdir /s /q dist

echo [2/3] Compilation avec PyInstaller...
pyinstaller ^
  --onefile ^
  --windowed ^
  --name "BasketClubTool" ^
  --add-data "config;config" ^
  main.py

echo [3/3] Copie du dossier config dans dist/...
xcopy /E /I /Y config dist\config

echo.
echo ✅  Build terminé.
echo     Livre le dossier dist\ entier au membre du comité.
echo     Il contient : BasketClubTool.exe + config\
echo.
pause
