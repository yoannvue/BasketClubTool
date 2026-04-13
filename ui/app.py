"""
ui/app.py
Interface graphique Tkinter de BasketClubTool.
Conçue pour être simple : trois sections, un journal, un bouton Paramètres.
"""

import json
import threading
import traceback
import tkinter as tk
from tkinter import ttk, filedialog, scrolledtext
from pathlib import Path

SETTINGS_PATH = Path("config/settings.json")
COLOR_PRIMARY = "#1F4E79"
COLOR_BTN_FG  = "white"


class BasketApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("Basket Club Tool — Amicale Basket Pecquencourt")
        self.root.geometry("720x560")
        self.root.resizable(False, False)

        self.settings = self._load_settings()
        self.vars: dict[str, tk.StringVar] = {}

        self._build_ui()

    # ──────────────────────────────────────────
    # Settings
    # ──────────────────────────────────────────

    def _load_settings(self) -> dict:
        try:
            with open(SETTINGS_PATH, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {
                "drive_folder_id": "",
                "template_planning_id": "",
                "template_results_id": "",
            }

    def _save_settings(self) -> None:
        with open(SETTINGS_PATH, "w", encoding="utf-8") as f:
            json.dump(self.settings, f, indent=2, ensure_ascii=False)

    # ──────────────────────────────────────────
    # UI construction
    # ──────────────────────────────────────────

    def _build_ui(self):
        # Bandeau titre
        header = tk.Frame(self.root, bg=COLOR_PRIMARY, height=56)
        header.pack(fill="x")
        header.pack_propagate(False)
        tk.Label(
            header,
            text="🏀  Basket Club Tool",
            font=("Arial", 15, "bold"),
            bg=COLOR_PRIMARY,
            fg=COLOR_BTN_FG,
        ).pack(side="left", padx=20, pady=14)

        # Corps principal
        body = tk.Frame(self.root, padx=16, pady=12)
        body.pack(fill="both", expand=True)

        # ── Section planning ──
        self._build_section(
            parent=body,
            title="Planning semaine",
            file_key="planning_src",
            file_label="Fichier ProchainesRencontres.xlsx",
            buttons=[
                ("📊  Générer MatchsSemaine.xlsx", self._action_transform),
                ("🖼  Générer affiche planning",   self._action_planning_image),
            ],
        )

        # ── Section résultats ──
        self._build_section(
            parent=body,
            title="Résultats du weekend",
            file_key="results_src",
            file_label="Fichier ResultatsDuWeekend.xlsx",
            buttons=[
                ("🖼  Générer affiche résultats", self._action_results_image),
            ],
        )

        # ── Journal ──
        tk.Label(body, text="Journal", font=("Arial", 9, "bold"), anchor="w").pack(
            fill="x", pady=(8, 2)
        )
        self.log_area = scrolledtext.ScrolledText(
            body, height=9, font=("Courier New", 9), state="disabled", wrap="word"
        )
        self.log_area.pack(fill="both", expand=True)

        # ── Pied de page ──
        footer = tk.Frame(self.root, padx=16, pady=6)
        footer.pack(fill="x")
        tk.Button(
            footer,
            text="⚙  Paramètres",
            command=self._open_settings,
            relief="flat",
            bg="#E0E0E0",
            padx=10,
            pady=3,
        ).pack(side="right")

    def _build_section(
        self,
        parent: tk.Frame,
        title: str,
        file_key: str,
        file_label: str,
        buttons: list,
    ):
        frame = ttk.LabelFrame(parent, text=title, padding=(10, 6))
        frame.pack(fill="x", pady=(0, 10))

        # Sélecteur de fichier
        row = tk.Frame(frame)
        row.pack(fill="x", pady=(0, 6))
        tk.Label(row, text=file_label, anchor="w", width=34).pack(side="left")
        self.vars[file_key] = tk.StringVar()
        tk.Entry(row, textvariable=self.vars[file_key], width=36).pack(
            side="left", padx=4
        )
        tk.Button(
            row,
            text="…",
            width=3,
            command=lambda k=file_key: self._pick_file(k),
        ).pack(side="left")

        # Boutons d'action
        btn_row = tk.Frame(frame)
        btn_row.pack(fill="x")
        for label, cmd in buttons:
            tk.Button(
                btn_row,
                text=label,
                command=cmd,
                bg=COLOR_PRIMARY,
                fg=COLOR_BTN_FG,
                relief="flat",
                padx=10,
                pady=4,
                cursor="hand2",
            ).pack(side="left", padx=(0, 8))

    # ──────────────────────────────────────────
    # Helpers
    # ──────────────────────────────────────────

    def _pick_file(self, key: str):
        path = filedialog.askopenfilename(
            title="Sélectionne le fichier Excel",
            filetypes=[("Fichiers Excel", "*.xlsx"), ("Tous les fichiers", "*.*")],
        )
        if path:
            self.vars[key].set(path)

    def _log(self, message: str):
        """Ajoute un message dans le journal (thread-safe via after())."""
        def _append():
            self.log_area.config(state="normal")
            self.log_area.insert("end", message + "\n")
            self.log_area.config(state="disabled")
            self.log_area.see("end")
        self.root.after(0, _append)

    def _run_async(self, fn):
        """Lance une fonction dans un thread secondaire pour ne pas bloquer l'UI."""
        threading.Thread(target=fn, daemon=True).start()

    def _get_file(self, key: str) -> str | None:
        path = self.vars.get(key, tk.StringVar()).get().strip()
        if not path:
            self._log(f"⚠  Sélectionne d'abord le fichier source.")
            return None
        return path

    # ──────────────────────────────────────────
    # Actions
    # ──────────────────────────────────────────

    def _action_transform(self):
        self._run_async(self._do_transform)

    def _do_transform(self):
        from core.transform import transform
        from core.drive import upload_file

        src = self._get_file("planning_src")
        if not src:
            return
        try:
            self._log("⏳  Génération de MatchsSemaine.xlsx…")
            out = transform(src)
            self._log(f"✅  Fichier créé : {out}")

            folder_id = self.settings.get("drive_folder_id", "").strip()
            if folder_id:
                self._log("⏳  Upload sur Google Drive…")
                url = upload_file(out, folder_id)
                self._log(f"✅  Disponible sur Drive : {url}")
            else:
                self._log("ℹ  Drive non configuré — fichier local uniquement.")
        except Exception as e:
            self._log(f"❌  Erreur : {e}")
            self._log(traceback.format_exc())

    def _action_planning_image(self):
        self._run_async(self._do_planning_image)

    def _do_planning_image(self):
        from core.transform import load_planning_data
        from core.slides_planning import generate_planning_image
        from core.drive import upload_file

        src = self._get_file("planning_src")
        if not src:
            return
        try:
            self._log("⏳  Lecture des matchs…")
            dom, ext, week_label = load_planning_data(src)
            self._log(f"     {len(dom)}D + {len(ext)}E match(s) — {week_label}")
            self._log("⏳  Génération de l'affiche planning (Google Slides)…")
            out = generate_planning_image(dom, ext, week_label, self.settings)
            self._log(f"✅  Affiche créée : {out}")

            folder_id = self.settings.get("drive_folder_id", "").strip()
            if folder_id:
                self._log("⏳  Upload sur Google Drive…")
                url = upload_file(out, folder_id)
                self._log(f"✅  Disponible sur Drive : {url}")
        except Exception as e:
            self._log(f"❌  Erreur : {e}")
            self._log(traceback.format_exc())

    def _action_results_image(self):
        self._run_async(self._do_results_image)

    def _do_results_image(self):
        from core.results import read_results, get_week_label, compute_bilan
        from core.slides_results import generate_results_image
        from core.drive import upload_file

        src = self._get_file("results_src")
        if not src:
            return
        try:
            self._log("⏳  Lecture des résultats…")
            results = read_results(src)
            week_label = get_week_label(src)
            bilan = compute_bilan(results)
            self._log(
                f"     {bilan['total']} résultat(s) — "
                f"{bilan['victoires']}V / {bilan['nuls']}N / {bilan['defaites']}D"
            )
            self._log("⏳  Génération de l'affiche résultats (Google Slides)…")
            out = generate_results_image(results, week_label, self.settings)
            self._log(f"✅  Affiche créée : {out}")

            folder_id = self.settings.get("drive_folder_id", "").strip()
            if folder_id:
                self._log("⏳  Upload sur Google Drive…")
                url = upload_file(out, folder_id)
                self._log(f"✅  Disponible sur Drive : {url}")
        except Exception as e:
            self._log(f"❌  Erreur : {e}")
            self._log(traceback.format_exc())

    # ──────────────────────────────────────────
    # Paramètres
    # ──────────────────────────────────────────

    def _open_settings(self):
        win = tk.Toplevel(self.root)
        win.title("Paramètres")
        win.geometry("560x220")
        win.resizable(False, False)
        win.grab_set()

        fields = [
            ("ID dossier Google Drive",         "drive_folder_id",       "ID visible dans l'URL Drive : …/folders/XXXXXX"),
            ("ID template Slides — Planning",   "template_planning_id",  "ID visible dans l'URL Slides : …/presentation/d/XXXXXX/edit"),
            ("ID template Slides — Résultats",  "template_results_id",   "ID visible dans l'URL Slides : …/presentation/d/XXXXXX/edit"),
        ]

        svars: dict[str, tk.StringVar] = {}

        for i, (label, key, hint) in enumerate(fields):
            tk.Label(win, text=label, anchor="w", font=("Arial", 9, "bold")).grid(
                row=i * 2, column=0, sticky="w", padx=14, pady=(10, 0)
            )
            sv = tk.StringVar(value=self.settings.get(key, ""))
            svars[key] = sv
            tk.Entry(win, textvariable=sv, width=52).grid(
                row=i * 2, column=0, sticky="ew", padx=14, pady=(0, 0)
            )
            tk.Label(win, text=hint, anchor="w", font=("Arial", 8), fg="#888").grid(
                row=i * 2 + 1, column=0, sticky="w", padx=14
            )

        def _save():
            for key, sv in svars.items():
                self.settings[key] = sv.get().strip()
            self._save_settings()
            self._log("✅  Paramètres sauvegardés.")
            win.destroy()

        btn_frame = tk.Frame(win)
        btn_frame.grid(row=len(fields) * 2, column=0, sticky="e", padx=14, pady=12)
        tk.Button(btn_frame, text="Annuler", command=win.destroy, padx=8).pack(side="left", padx=4)
        tk.Button(
            btn_frame,
            text="Sauvegarder",
            command=_save,
            bg=COLOR_PRIMARY,
            fg=COLOR_BTN_FG,
            relief="flat",
            padx=10,
            pady=4,
        ).pack(side="left")
