"""
core/slides_planning.py
Génère l'affiche planning de la semaine à partir du template Google Slides.

Placeholders attendus dans le template :
  {{SEMAINE}}

  Tableau domicile (N allant de 1 au nb de matchs dom) :
    {{DOM_N_EQUIPE1}}   équipe ABP (ex: U13M)
    {{DOM_N_EQUIPE2}}   adversaire (ex: DENAIN)
    {{DOM_N_DATE}}      SAMEDI\n14H00

  Tableau extérieur (N allant de 1 au nb de matchs ext) :
    {{EXT_N_EQUIPE1}}   adversaire (ex: DENAIN)
    {{EXT_N_EQUIPE2}}   équipe ABP (ex: U13M)
    {{EXT_N_DATE}}      SAMEDI\n14H00

Les placeholders excédentaires (lignes inutilisées du template)
sont remplacés par des chaînes vides.
"""

from datetime import datetime
from core.drive import (
    copy_presentation,
    replace_placeholders,
    delete_empty_table_rows,
    export_slide_as_png,
    delete_presentation,
)

MAX_MATCHES = 20


def generate_planning_image(
    domicile_list: list[dict],
    exterieur_list: list[dict],
    week_label: str,
    settings: dict,
    output_path: str = "",
) -> str:
    """Génère l'affiche planning et retourne le chemin du PNG créé.

    Args:
        domicile_list  : matchs à domicile (depuis transform.load_planning_data)
        exterieur_list : matchs à l'extérieur
        week_label     : ex. 'Semaine du 28 mars 2026'
        settings       : dict chargé depuis config/settings.json
        output_path    : chemin de sortie (auto-généré si vide)
    """
    template_id = settings.get("template_planning_id", "").strip()
    if not template_id:
        raise ValueError(
            "L'ID du template planning n'est pas configuré.\n"
            "Va dans Paramètres et renseigne 'template_planning_id'."
        )

    if not output_path:
        date_tag = datetime.now().strftime("%Y%m%d_%H%M")
        output_path = f"affiche_planning_{date_tag}.png"

    temp_name = f"_tmp_planning_{datetime.now().strftime('%Y%m%d%H%M%S')}"
    pres_id = None

    try:
        pres_id = copy_presentation(template_id, temp_name)

        replacements: dict[str, str] = {"{{SEMAINE}}": week_label}

        # Matchs domicile
        for i in range(1, MAX_MATCHES + 1):
            if i <= len(domicile_list):
                m = domicile_list[i - 1]
                replacements[f"{{{{DOM_{i}_EQUIPE1}}}}"] = m["equipe"]
                replacements[f"{{{{DOM_{i}_EQUIPE2}}}}"] = m["adversaire"]
                replacements[f"{{{{DOM_{i}_DATE}}}}"]    = m["date_affiche"]
            else:
                replacements[f"{{{{DOM_{i}_EQUIPE1}}}}"] = ""
                replacements[f"{{{{DOM_{i}_EQUIPE2}}}}"] = ""
                replacements[f"{{{{DOM_{i}_DATE}}}}"]    = ""

        # Matchs extérieur — EQUIPE1 = adversaire, EQUIPE2 = ABP
        for i in range(1, MAX_MATCHES + 1):
            if i <= len(exterieur_list):
                m = exterieur_list[i - 1]
                replacements[f"{{{{EXT_{i}_EQUIPE1}}}}"] = m["adversaire"]
                replacements[f"{{{{EXT_{i}_EQUIPE2}}}}"] = m["equipe"]
                replacements[f"{{{{EXT_{i}_DATE}}}}"]    = m["date_affiche"]
            else:
                replacements[f"{{{{EXT_{i}_EQUIPE1}}}}"] = ""
                replacements[f"{{{{EXT_{i}_EQUIPE2}}}}"] = ""
                replacements[f"{{{{EXT_{i}_DATE}}}}"]    = ""

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
