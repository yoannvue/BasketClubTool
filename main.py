"""
main.py
Point d'entrée de BasketClubTool.
Fonctionne aussi bien en mode script Python qu'en .exe compilé par PyInstaller.
"""

import sys
import os
import tkinter as tk

# Quand compilé avec PyInstaller (--onefile), les ressources (config/) sont
# extraites dans un répertoire temporaire (sys._MEIPASS). On s'assure de
# travailler depuis le répertoire contenant l'exe, pas le répertoire temp.
if getattr(sys, "frozen", False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

os.chdir(BASE_DIR)

from ui.app import BasketApp


def main():
    root = tk.Tk()
    root.iconbitmap(default="") if os.name == "nt" else None
    app = BasketApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
