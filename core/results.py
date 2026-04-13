"""
core/results.py
Lit ResultatsDuWeekend.xlsx et retourne les données structurées
pour la génération de l'affiche résultats.
"""

import re
import json
import pandas as pd
from pathlib import Path
from datetime import datetime

CONFIG_PATH = Path("config/teams.json")

_MOIS_FR = {
    1: "janvier", 2: "février", 3: "mars", 4: "avril",
    5: "mai", 6: "juin", 7: "juillet", 8: "août",
    9: "septembre", 10: "octobre", 11: "novembre", 12: "décembre",
}

def _format_date_fr(dt) -> str:
    return f"{dt.day} {_MOIS_FR[dt.month]} {dt.year}"


def _load_config() -> dict:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


def _division_prefix(division: str) -> str:
    m = re.match(r"^([A-Z]+\d*)", str(division).strip())
    return m.group(1) if m else str(division)


def _is_abp(name: str, marker: str) -> bool:
    return marker.upper() in str(name).upper()


def _abp_short_name(division: str, team_name: str, config: dict) -> str:
    prefix = _division_prefix(division)
    category = config["divisions"].get(prefix, prefix)
    m = re.search(r"PECQUENCOURT\s*-\s*(\d+)", str(team_name), re.IGNORECASE)
    suffix = f"-{m.group(1)}" if m else ""
    return category + suffix


def _opponent_short_name(name: str, config: dict) -> str:
    clean = re.sub(r"\s*\(\d+\)\s*$", "", str(name)).strip()
    suffix_match = re.search(r"\s*-\s*(\d+)\s*$", clean)
    team_suffix = f" - {suffix_match.group(1)}" if suffix_match else ""
    base_name = clean[: suffix_match.start()].strip() if suffix_match else clean

    for long_name, short_name in sorted(
        config["adversaires"].items(), key=lambda x: -len(x[0])
    ):
        if long_name.upper() in base_name.upper():
            return short_name + team_suffix

    return (base_name + team_suffix)[:25]


def get_week_label(source_path: str) -> str:
    """Retourne un label de semaine basé sur la date du premier résultat."""
    try:
        df = pd.read_excel(source_path, header=0)
        df.columns = [
            "Division", "NumMatch", "Equipe1", "Equipe2",
            "Date", "Heure", "Salle", "Emarque",
            "Score1", "Forfait1", "Score2", "Forfait2",
        ]
        dates = pd.to_datetime(df["Date"], dayfirst=True, errors="coerce").dropna()
        if not dates.empty:
            first = dates.min()
            return f"Weekend du {_format_date_fr(first)}"
    except Exception:
        pass
    return f"Weekend du {_format_date_fr(datetime.now())}"


def read_results(source_path: str) -> list[dict]:
    """Retourne la liste des résultats ABP sous forme de dicts:
    {equipe, adversaire, score_abp, score_opp, score, resultat ('V'/'D'/'N')}
    Triés par catégorie puis résultat (victoires en premier).
    """
    config = _load_config()
    marker = config["abp_marker"]

    df = pd.read_excel(source_path, header=0)
    df.columns = [
        "Division", "NumMatch", "Equipe1", "Equipe2",
        "Date", "Heure", "Salle", "Emarque",
        "Score1", "Forfait1", "Score2", "Forfait2",
    ]

    results = []

    for _, row in df.iterrows():
        e1, e2 = str(row["Equipe1"]), str(row["Equipe2"])

        if "exempt" in e1.lower() or "exempt" in e2.lower():
            continue

        s1_raw, s2_raw = row["Score1"], row["Score2"]
        if pd.isna(s1_raw) or pd.isna(s2_raw):
            continue

        s1, s2 = int(s1_raw), int(s2_raw)
        division = str(row["Division"])

        if _is_abp(e1, marker):
            abp = _abp_short_name(division, e1, config)
            opp = _opponent_short_name(e2, config)
            score_abp, score_opp = s1, s2
        elif _is_abp(e2, marker):
            abp = _abp_short_name(division, e2, config)
            opp = _opponent_short_name(e1, config)
            score_abp, score_opp = s2, s1
        else:
            continue

        if score_abp > score_opp:
            resultat = "V"
        elif score_abp < score_opp:
            resultat = "D"
        else:
            resultat = "N"

        results.append(
            {
                "equipe": abp,
                "adversaire": opp,
                "score_abp": score_abp,
                "score_opp": score_opp,
                "score": f"{score_abp} - {score_opp}",
                "resultat": resultat,
            }
        )

    # Tri : catégorie alphabétique, puis victoires en premier
    sort_order = {"V": 0, "N": 1, "D": 2}
    results.sort(key=lambda r: (r["equipe"], sort_order[r["resultat"]]))

    return results


def compute_bilan(results: list[dict]) -> dict:
    """Calcule le bilan global (victoires, nuls, défaites)."""
    v = sum(1 for r in results if r["resultat"] == "V")
    n = sum(1 for r in results if r["resultat"] == "N")
    d = sum(1 for r in results if r["resultat"] == "D")
    return {"victoires": v, "nuls": n, "defaites": d, "total": v + n + d}
