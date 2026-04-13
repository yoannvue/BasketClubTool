"""
test_planning.py
Test end-to-end : ProchainesRencontres.xlsx → affiche planning PNG + upload Drive.
Usage : python test_planning.py
"""

import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

SOURCE = "ProchainesRencontres.xlsx"
OUTPUT = "test_planning.png"


def main():
    print("=== Test affiche planning ===\n")

    # 1. Lecture du fichier source
    if not Path(SOURCE).exists():
        print(f"ERREUR : fichier '{SOURCE}' introuvable dans le dossier courant.")
        print("Copie-le depuis la fédération et relance.")
        return

    from core.transform import load_planning_data
    dom, ext, week_label = load_planning_data(SOURCE)
    print(f"Semaine    : {week_label}")
    print(f"Domicile   : {len(dom)} match(s)")
    for i, m in enumerate(dom, 1):
        date_display = m['date_affiche'].replace('\n', ' ')
        print(f"  DOM_{i}: {m['equipe']:<10} vs {m['adversaire']:<22} {date_display}")
    print(f"Extérieur  : {len(ext)} match(s)")
    for i, m in enumerate(ext, 1):
        date_display = m['date_affiche'].replace('\n', ' ')
        print(f"  EXT_{i}: {m['adversaire']:<22} vs {m['equipe']:<10} {date_display}")

    # 2. Chargement settings
    settings_path = Path("config/settings.json")
    with open(settings_path, encoding="utf-8") as f:
        settings = json.load(f)

    if not settings.get("template_planning_id", "").strip():
        print("\nERREUR : 'template_planning_id' vide dans config/settings.json.")
        return

    # 3. Génération du PNG
    print(f"\nGénération du PNG (Google Slides API)...")
    print("→ Une fenêtre navigateur va peut-être s'ouvrir pour l'autorisation OAuth.")

    from core.slides_planning import generate_planning_image
    out = generate_planning_image(dom, ext, week_label, settings, OUTPUT)
    print(f"✅ PNG créé : {out}")

    # 4. Upload Drive (optionnel)
    folder_id = settings.get("drive_folder_id", "").strip()
    if folder_id:
        print(f"\nUpload sur Google Drive...")
        from core.drive import upload_file
        url = upload_file(out, folder_id)
        print(f"✅ Disponible sur Drive : {url}")
    else:
        print("\nℹ  drive_folder_id non configuré — pas d'upload Drive.")

    print("\n=== Terminé ===")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        import traceback
        print(f"\n❌ Erreur : {e}")
        traceback.print_exc()
    finally:
        input("\nAppuie sur Entrée pour fermer...")
