/**
 * transform.js
 * Port JavaScript de core/transform.py
 *
 * Dépendances :
 *   - SheetJS (window.XLSX) chargé via CDN dans index.html
 *   - config/Divisions.xlsx  (chargé via fetch depuis la racine du projet)
 *   - config/NomsEquipes.xlsx
 *   - config/teams.json
 *
 * API publique :
 *   loadPlanningData(file: File) → Promise<{ domicileList, exterieurList, weekLabel }>
 *
 * Les référentiels de divisions et adversaires sont lus depuis /api/teams (teams.json).
 * Les fichiers Divisions.xlsx et NomsEquipes.xlsx ne sont plus utilisés.
 */

// ── Constantes ──────────────────────────────────────────────────────────────

const _MOIS_FR = [
  "janvier","février","mars","avril","mai","juin",
  "juillet","août","septembre","octobre","novembre","décembre",
];

// Index JS : getDay() → 0=dim, 1=lun, …, 6=sam
// On mappe vers JOURS_FR = [LUN, MAR, MER, JEU, VEN, SAM, DIM] (même ordre que Python)
const _JOURS_FR = ["LUNDI","MARDI","MERCREDI","JEUDI","VENDREDI","SAMEDI","DIMANCHE"];

// getDay() → index dans _JOURS_FR : dim=6, lun=0, …, sam=5
function _jsDayToJourFr(jsDay) {
  return jsDay === 0 ? _JOURS_FR[6] : _JOURS_FR[jsDay - 1];
}

// ── Chargement des référentiels ─────────────────────────────────────────────

/**
 * Charge teams.json depuis localStorage (clé "bct_teams").
 * Aucun serveur requis — les données sont stockées via la page « Équipes & Divisions ».
 * Retourne l'objet complet { divisions, adversaires, abp_marker }.
 */
async function _loadTeamsConfig() {
  // 1. Modifications utilisateur (page config) en priorité
  const stored = localStorage.getItem("bct_teams");
  if (stored) {
    try { return JSON.parse(stored); } catch (_) {}
  }
  // 2. Fichier du dépôt (GitHub Pages ou serveur local)
  const resp = await fetch("config/teams.json");
  if (resp.ok) return resp.json();
  throw new Error(
    "Impossible de charger config/teams.json (" + resp.status + "). " +
    "Vérifiez que le fichier est présent dans le dépôt."
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function _cellStr(val) {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

/**
 * Résolution division → { categorie, typematch }
 * teams.json stocke { prefixe: "CATEGORIE" } (valeur simple).
 * Correspondance exacte, puis fallback sur préfixe régex.
 */
function _resolveDivision(division, divMap) {
  division = _cellStr(division);

  function _wrap(val) {
    return typeof val === "object" ? val : { categorie: String(val), typematch: "CHAMPIONNAT" };
  }

  if (Object.prototype.hasOwnProperty.call(divMap, division)) return _wrap(divMap[division]);

  // Fallback préfixe (ex: "DFU11-8-P2-NEW" non encore dans teams.json)
  const m = division.match(/^([A-Z]+\d*)/);
  const prefix = m ? m[1] : division;
  for (const [key, val] of Object.entries(divMap)) {
    if (key.startsWith(prefix)) return _wrap(val);
  }
  return { categorie: division, typematch: "CHAMPIONNAT" };
}

function _isAbp(name, marker) {
  return String(name).toUpperCase().includes(marker.toUpperCase());
}

/** Retourne le nom court ABP, ex: "U11F-2" */
function _abpShortName(division, teamName, divMap) {
  const info = _resolveDivision(division, divMap);
  const m    = String(teamName).match(/PECQUENCOURT\s*-\s*(\d+)/i);
  return info.categorie + (m ? `-${m[1]}` : "");
}

/**
 * Retourne le nom court de l'adversaire depuis teams.json["adversaires"].
 * Recherche exacte puis partielle (plus long en premier).
 * Fallback : nom brut tronqué à 25 caractères.
 */
function _opponentShortName(name, adversairesMap) {
  const clean = String(name).replace(/\s*\(\d+\)\s*$/, "").trim();
  const suffixMatch = clean.match(/\s*-\s*(\d+)\s*$/);
  const teamSuffix  = suffixMatch ? ` - ${suffixMatch[1]}` : "";
  const baseName    = suffixMatch ? clean.slice(0, suffixMatch.index).trim() : clean;

  // Correspondance exacte (insensible à la casse)
  const exactKey = Object.keys(adversairesMap || {}).find(
    k => k.toUpperCase() === baseName.toUpperCase()
  );
  if (exactKey) return adversairesMap[exactKey] + teamSuffix;

  // Correspondance partielle (plus long en premier)
  const sorted = Object.entries(adversairesMap || {})
    .sort((a, b) => b[0].length - a[0].length);
  for (const [long_, short_] of sorted) {
    if (baseName.toUpperCase().includes(long_.toUpperCase())) return short_ + teamSuffix;
  }

  return (baseName + teamSuffix).slice(0, 25);
}

// ── Parsing date / heure ────────────────────────────────────────────────────

/**
 * Construit un objet Date à partir de la valeur brute SheetJS.
 *
 * SheetJS avec cellDates:true retourne :
 *   - Date Excel (type Date) → objet Date JS en heure locale
 *   - Heure Excel (fraction de jour) → objet Date JS avec date 1899-12-30 mais heure correcte
 *   - Texte → string (ex: "12/04/2026" ou "14:00")
 */
function _buildDatetime(dateVal, heureVal) {
  let year, month, day, hours, minutes;

  // ── Extraction de la partie date ──
  if (dateVal instanceof Date) {
    year  = dateVal.getFullYear();
    month = dateVal.getMonth();   // 0-indexed
    day   = dateVal.getDate();
  } else {
    const s = _cellStr(dateVal);
    // Format DD/MM/YYYY
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) {
      day   = parseInt(m[1], 10);
      month = parseInt(m[2], 10) - 1;
      year  = parseInt(m[3], 10);
    } else {
      // Format YYYY-MM-DD (ISO-like de pandas)
      const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m2) {
        year  = parseInt(m2[1], 10);
        month = parseInt(m2[2], 10) - 1;
        day   = parseInt(m2[3], 10);
      } else {
        return null;
      }
    }
  }

  // ── Extraction de la partie heure ──
  if (heureVal instanceof Date) {
    hours   = heureVal.getHours();
    minutes = heureVal.getMinutes();
  } else {
    const s = _cellStr(heureVal);
    // Format HH:MM ou HH:MM:SS
    const m = s.match(/^(\d{1,2}):(\d{2})/);
    if (m) {
      hours   = parseInt(m[1], 10);
      minutes = parseInt(m[2], 10);
    } else {
      hours   = 0;
      minutes = 0;
    }
  }

  return new Date(year, month, day, hours, minutes, 0);
}

/**
 * Formate la date pour l'affiche : "SAMEDI\n14H00"
 * Le \n dans la string sera interprété comme saut de ligne par l'API Slides.
 */
function _formatDateAffiche(dt) {
  if (!(dt instanceof Date) || isNaN(dt.getTime())) return "";
  const jour   = _jsDayToJourFr(dt.getDay());
  const heures = dt.getHours();
  const mins   = String(dt.getMinutes()).padStart(2, "0");
  return `${jour}\n${heures}H${mins}`;
}

function _formatDateFr(dt) {
  return `${dt.getDate()} ${_MOIS_FR[dt.getMonth()]} ${dt.getFullYear()}`;
}

// ── Colonnes Excel ProchainesRencontres ─────────────────────────────────────

const COLS = {
  Division: 0, NumMatch: 1, Equipe1: 2, Equipe2: 3,
  Date: 4, Heure: 5, Salle: 6, Emarque: 7,
  Score1: 8, Forfait1: 9, Score2: 10, Forfait2: 11,
};

// ── API publique ─────────────────────────────────────────────────────────────

/**
 * Lit un fichier ProchainesRencontres.xlsx (objet File navigateur).
 *
 * Retourne :
 *   { domicileList, exterieurList, weekLabel }
 *
 * Chaque match :
 *   { equipe, adversaire, typematch, dateAffiche, date, heure, salle, domicile, _sort }
 */
async function loadPlanningData(file) {
  const teamsConfig = await _loadTeamsConfig();

  const divMap      = teamsConfig.divisions   || {};
  const adversaires = teamsConfig.adversaires || {};
  const marker      = (teamsConfig.abp_marker || "AMICALE BASKET PECQUENCOURT").toUpperCase();

  const buf  = await file.arrayBuffer();
  const wb   = XLSX.read(buf, { type: "array", cellDates: true });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  // Lire avec header:1 (tableau de tableaux, 1re ligne = entêtes ignorée)
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  const domicileList  = [];
  const exterieurList = [];
  const exemptList    = [];  // catégories ABP exemptées cette semaine
  const datesFound    = [];

  // Sauter la ligne d'en-tête (index 0)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const e1  = _cellStr(row[COLS.Equipe1]);
    const e2  = _cellStr(row[COLS.Equipe2]);

    if (!e1 && !e2) continue;

    // Ligne "Exempt" : capturer la catégorie ABP et sauter
    if (e1.toLowerCase().includes("exempt") || e2.toLowerCase().includes("exempt")) {
      const exemptDiv = _cellStr(row[COLS.Division]);
      if (e2.toLowerCase().includes("exempt") && _isAbp(e1, marker)) {
        exemptList.push(_abpShortName(exemptDiv, e1, divMap));
      } else if (e1.toLowerCase().includes("exempt") && _isAbp(e2, marker)) {
        exemptList.push(_abpShortName(exemptDiv, e2, divMap));
      }
      continue;
    }

    const division = _cellStr(row[COLS.Division]);
    const info     = _resolveDivision(division, divMap);

    const dt        = _buildDatetime(row[COLS.Date], row[COLS.Heure]);
    const sortKey   = dt ? dt.getTime() : i;
    const dateAffiche = _formatDateAffiche(dt);
    const dateStr   = dt
      ? `${String(dt.getDate()).padStart(2,"0")}/${String(dt.getMonth()+1).padStart(2,"0")}/${dt.getFullYear()}`
      : _cellStr(row[COLS.Date]);
    const heureStr  = dt
      ? `${String(dt.getHours()).padStart(2,"0")}:${String(dt.getMinutes()).padStart(2,"0")}`
      : _cellStr(row[COLS.Heure]);
    const salle     = _cellStr(row[COLS.Salle]);

    let abp, opp, domicile;
    if (_isAbp(e1, marker)) {
      abp      = _abpShortName(division, e1, divMap);
      opp      = _opponentShortName(e2, adversaires);
      domicile = true;
    } else if (_isAbp(e2, marker)) {
      abp      = _abpShortName(division, e2, divMap);
      opp      = _opponentShortName(e1, adversaires);
      domicile = false;
    } else {
      continue;
    }

    if (dt) datesFound.push(dt);

    const match = {
      equipe:      abp,
      adversaire:  opp,
      typematch:   info.typematch,
      dateAffiche, // ex: "SAMEDI\n14H00"
      date:        dateStr,
      heure:       heureStr,
      salle,
      domicile,
      _sort:       sortKey,
    };
    (domicile ? domicileList : exterieurList).push(match);
  }

  domicileList.sort((a, b) => a._sort - b._sort);
  exterieurList.sort((a, b) => a._sort - b._sort);

  let weekLabel;
  if (datesFound.length > 0) {
    const first = new Date(Math.min(...datesFound.map(d => d.getTime())));
    weekLabel = `Semaine du ${_formatDateFr(first)}`;
  } else {
    weekLabel = `Semaine du ${_formatDateFr(new Date())}`;
  }

  return { domicileList, exterieurList, weekLabel, exemptList };
}
