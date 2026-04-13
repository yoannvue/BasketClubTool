"""
core/slides_results.py
Génère l'affiche des résultats du weekend à partir du template Google Slides.

Placeholders attendus dans le template :
  {{SEMAINE}}
  {{BILAN}}                       (ex. '9 victoires · 4 défaites')
  {{RES_1_EQUIPE}}, {{RES_1_ADVERSAIRE}}, {{RES_1_SCORE}}, {{RES_1_RESULTAT}}
  {{RES_2_EQUIPE}}, ...
  (jusqu'à N résultats)

{{RES_N_RESULTAT}} vaut 'V', 'D' ou 'N'.
Tu peux utiliser la couleur conditionnelle directement dans Google Slides
en ciblant ce placeholder avec un script Apps Script si besoin — mais en
remplacement de texte simple, 'V' / 'D' / 'N' suffit pour une lecture humaine.
"""

from datetime import datetime
from core.drive import (
    copy_presentation,
    replace_placeholders,
    delete_empty_table_rows,
    export_slide_as_png,
    delete_presentation,
)
from core.results import compute_bilan

MAX_RESULTS = 20


def generate_results_image(
    results: list[dict],
    week_label: str,
    settings: dict,
    output_path: str = "",
) -> str:
    """Génère l'affiche résultats et retourne le chemin du PNG créé.

    Args:
        results    : liste de dicts retournés par results.read_results()
        week_label : ex. 'Weekend du 22 mars 2026'
        settings   : dict chargé depuis config/settings.json
        output_path: chemin de sortie optionnel
    """
    template_id = settings.get("template_results_id", "").strip()
    if not template_id:
        raise ValueError(
            "L'ID du template résultats n'est pas configuré.\n"
            "Va dans Paramètres et renseigne 'template_results_id'."
        )

    if not output_path:
        date_tag = datetime.now().strftime("%Y%m%d_%H%M")
        output_path = f"affiche_resultats_{date_tag}.png"

    bilan = compute_bilan(results)
    bilan_str = (
        f"{bilan['victoires']} victoire{'s' if bilan['victoires'] > 1 else ''}"
        f" · {bilan['defaites']} défaite{'s' if bilan['defaites'] > 1 else ''}"
    )
    if bilan["nuls"]:
        bilan_str += f" · {bilan['nuls']} nul{'s' if bilan['nuls'] > 1 else ''}"

    temp_name = f"_tmp_resultats_{datetime.now().strftime('%Y%m%d%H%M%S')}"
    pres_id = None

    try:
        pres_id = copy_presentation(template_id, temp_name)

        replacements: dict[str, str] = {
            "{{SEMAINE}}": week_label,
            "{{BILAN}}":   bilan_str,
        }

        for i in range(1, MAX_RESULTS + 1):
            if i <= len(results):
                r = results[i - 1]
                replacements[f"{{{{RES_{i}_EQUIPE}}}}"]      = r.get("equipe", "")
                replacements[f"{{{{RES_{i}_ADVERSAIRE}}}}"]  = r.get("adversaire", "")
                replacements[f"{{{{RES_{i}_SCORE}}}}"]       = r.get("score", "")
                replacements[f"{{{{RES_{i}_RESULTAT}}}}"]    = r.get("resultat", "")
            else:
                replacements[f"{{{{RES_{i}_EQUIPE}}}}"]     = ""
                replacements[f"{{{{RES_{i}_ADVERSAIRE}}}}"] = ""
                replacements[f"{{{{RES_{i}_SCORE}}}}"]      = ""
                replacements[f"{{{{RES_{i}_RESULTAT}}}}"]   = ""

        replace_placeholders(pres_id, replacements)
        n = delete_empty_table_rows(pres_id)
        if n:
            print(f"     {n} ligne(s) vide(s) supprimée(s) dans les tableaux")
        export_slide_as_png(pres_id, output_path)

        return output_path

    finally:
        if pres_id:
            try:
                delete_presentation(pres_id)
            except Exception:
                pass
