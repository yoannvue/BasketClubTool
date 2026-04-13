/**
 * results-transform.js
 * Parse un fichier Excel de résultats (ResultatsDeLasemaine.xlsx).
 *
 * Dépend de transform.js (fonctions globales : _loadTeamsConfig, _cellStr,
 * _resolveDivision, _isAbp, _abpShortName, _opponentShortName,
 * _buildDatetime, _formatDateFr).
 *
 * API publique :
 *   loadResultsData(file: File) → Promise<{ matchList, weekLabel }>
 *
 * Chaque match dans matchList :
 *   { equipe, adversaire, scoreAbp, scoreAdv, categorie, domicile, _catSort }
 */

// ── Colonnes Excel (même structure que ProchainesRencontres) ─────────────────

const _RCOLS = {
  Division: 0, Equipe1: 2, Equipe2: 3,
  Date: 4, Heure: 5,
  Score1: 8, Score2: 10,
};

// ── Tri par catégorie ────────────────────────────────────────────────────────

/**
 * Retourne une clé numérique de tri pour une catégorie ABP.
 *
 * Ordre : les plus petits (U9) d'abord, F avant M dans chaque tranche,
 * équipes numérotées (U11F-2 après U11F), Seniors puis Loisirs en dernier.
 *
 * Exemples : U9F(0) < U9M(1) < U11F(2) < U11F-2(3) < U11M(4) < … < SENIORS(90) < LOISIRS(99)
 */
function _catSortKey(categorie) {
  const c = String(categorie || "").toUpperCase().trim();

  // Tranche d'âge
  const ageMatch = c.match(/U(\d+)/);
  let age;
  if (ageMatch)              age = parseInt(ageMatch[1], 10);
  else if (c.includes("SENIOR")) age = 90;
  else if (c.includes("LOISIR")) age = 99;
  else                            age = 98; // AMICAL ou autre

  // Genre : F=0, M=1, autre=2
  let gender = 2;
  if (ageMatch) {
    const afterAge = c.slice(ageMatch.index + ageMatch[0].length);
    if (afterAge.startsWith("F"))      gender = 0;
    else if (afterAge.startsWith("M")) gender = 1;
  } else if (c.includes("SENIOR")) {
    if (/\bF\b/.test(c))      gender = 0;
    else if (/\bM\b/.test(c)) gender = 1;
  }

  // Numéro d'équipe (U11F-2 → 2)
  const numMatch = c.match(/-(\d+)$/);
  const teamNum  = numMatch ? parseInt(numMatch[1], 10) : 0;

  return age * 10000 + gender * 100 + teamNum;
}

// ── API publique ─────────────────────────────────────────────────────────────

/**
 * Lit un fichier Excel de résultats.
 *
 * Retourne { matchList, weekLabel }.
 * Les matchs sont triés par catégorie (plus jeunes d'abord, F avant M).
 */
async function loadResultsData(file) {
  const teamsConfig = await _loadTeamsConfig();
  const divMap      = teamsConfig.divisions   || {};
  const adversaires = teamsConfig.adversaires || {};
  const marker      = (teamsConfig.abp_marker || "AMICALE BASKET PECQUENCOURT").toUpperCase();

  const buf  = await file.arrayBuffer();
  const wb   = XLSX.read(buf, { type: "array", cellDates: true });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  const matchList  = [];
  const datesFound = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const e1  = _cellStr(row[_RCOLS.Equipe1]);
    const e2  = _cellStr(row[_RCOLS.Equipe2]);

    if (!e1 && !e2) continue;
    if (e1.toLowerCase().includes("exempt") || e2.toLowerCase().includes("exempt")) continue;

    const division = _cellStr(row[_RCOLS.Division]);
    const info     = _resolveDivision(division, divMap);

    const s1 = _cellStr(row[_RCOLS.Score1]);
    const s2 = _cellStr(row[_RCOLS.Score2]);

    // Ignorer les lignes sans score
    if (s1 === "" && s2 === "") continue;

    const dt = _buildDatetime(row[_RCOLS.Date], row[_RCOLS.Heure]);
    if (dt) datesFound.push(dt);

    let abp, opp, scoreAbp, scoreAdv, domicile;

    if (_isAbp(e1, marker)) {
      abp      = _abpShortName(division, e1, divMap);
      opp      = _opponentShortName(e2, adversaires);
      scoreAbp = s1;
      scoreAdv = s2;
      domicile = true;
    } else if (_isAbp(e2, marker)) {
      abp      = _abpShortName(division, e2, divMap);
      opp      = _opponentShortName(e1, adversaires);
      scoreAbp = s2;
      scoreAdv = s1;
      domicile = false;
    } else {
      continue;
    }

    matchList.push({
      equipe:    abp,
      adversaire: opp,
      scoreAbp,
      scoreAdv,
      categorie:  info.categorie,
      domicile,
      _catSort:   _catSortKey(info.categorie),
    });
  }

  // Tri : catégorie d'abord, puis nom d'équipe pour les équipes multiples
  matchList.sort((a, b) =>
    a._catSort - b._catSort || a.equipe.localeCompare(b.equipe)
  );

  let weekLabel;
  if (datesFound.length > 0) {
    const d = new Date(Math.min(...datesFound.map(x => x.getTime())));
    weekLabel = `Résultats — semaine du ${_formatDateFr(d)}`;
  } else {
    weekLabel = `Résultats — ${_formatDateFr(new Date())}`;
  }

  return { matchList, weekLabel };
}
