/**
 * excel-organisation.js
 * Génère le fichier Excel d'organisation des matchs.
 *
 * Dépendances : SheetJS (window.XLSX) chargé via CDN.
 *
 * API publique :
 *   buildOrganisationWorkbook(domicileList, exterieurList, weekLabel)
 *   → { wb, filename }   — construit le classeur sans le télécharger
 *
 *   generateOrganisationExcel(domicileList, exterieurList, weekLabel)
 *   → { wb, filename }   — construit + déclenche le téléchargement navigateur
 *
 * Colonnes produites :
 *   Type | Équipe ABP | Adversaire | Date | Heure | Salle
 *   | Arbitres | Chrono | Emarqué | Souffleur | Resp. Salle | Buvette
 *
 * Règle de remplissage des colonnes d'organisation :
 *   - Match à domicile  → cellules vides (à compléter manuellement)
 *   - Match à extérieur → cellules valorisées à "N/A"
 */

// Colonnes d'organisation ABP
const _ORG_COLS = ["Arbitres", "Chrono", "Emarqué", "Souffleur", "Resp. Salle", "Buvette"];

/**
 * Construit le classeur SheetJS sans le télécharger.
 * Retourne { wb, filename } — le classeur peut être passé à gdUploadWorkbook().
 */
function buildOrganisationWorkbook(domicileList, exterieurList, weekLabel) {
  // Fusionner et trier par date croissante
  const allMatches = [...domicileList, ...exterieurList]
    .sort((a, b) => a._sort - b._sort);

  // ── En-tête ──────────────────────────────────────────────────────────────
  const header = [
    "Type",
    "Équipe ABP",
    "Adversaire",
    "Date",
    "Heure",
    "Salle",
    ..._ORG_COLS,
  ];

  // ── Lignes ─────────────────────────────────────────────────────────────────
  const rows = allMatches.map(m => {
    const orgValues = m.domicile
      ? _ORG_COLS.map(() => "")       // domicile : à compléter
      : _ORG_COLS.map(() => "N/A");   // extérieur : non applicable

    return [
      m.typematch  || "",
      m.equipe     || "",
      m.adversaire || "",
      m.date       || "",
      m.heure      || "",
      m.salle      || "",
      ...orgValues,
    ];
  });

  // ── Création du classeur ──────────────────────────────────────────────────
  const wsData = [header, ...rows];
  const ws     = XLSX.utils.aoa_to_sheet(wsData);

  // ── Largeurs de colonnes ───────────────────────────────────────────────────
  ws["!cols"] = [
    { wch: 14 },  // Type
    { wch: 12 },  // Équipe ABP
    { wch: 20 },  // Adversaire
    { wch: 12 },  // Date
    { wch: 8  },  // Heure
    { wch: 22 },  // Salle
    { wch: 12 },  // Arbitres
    { wch: 10 },  // Chrono
    { wch: 12 },  // Emarqué
    { wch: 12 },  // Souffleur
    { wch: 14 },  // Resp. Salle
    { wch: 10 },  // Buvette
  ];

  // ── Style de l'en-tête (fond bleu, texte blanc, gras) ─────────────────────
  const headerStyle = {
    font:      { bold: true, color: { rgb: "FFFFFF" } },
    fill:      { fgColor: { rgb: "1F4E79" } },
    alignment: { horizontal: "center", vertical: "center", wrapText: false },
    border: {
      bottom: { style: "medium", color: { rgb: "E8882A" } },
    },
  };

  const ncols = header.length;
  for (let c = 0; c < ncols; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[addr]) ws[addr].s = headerStyle;
  }

  // Alterner les lignes domicile / extérieur avec une couleur de fond
  allMatches.forEach((m, i) => {
    const rowIdx = i + 1; // ligne 0 = header
    const fill   = m.domicile
      ? { fgColor: { rgb: "EBF3FB" } }  // bleu clair = domicile
      : { fgColor: { rgb: "F9EBEA" } }; // rouge clair = extérieur
    for (let c = 0; c < ncols; c++) {
      const addr = XLSX.utils.encode_cell({ r: rowIdx, c });
      if (!ws[addr]) ws[addr] = { t: "z" };
      ws[addr].s = { fill, alignment: { vertical: "center" } };
    }
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Organisation");

  wb.Props = {
    Title:   `Organisation matchs — ${weekLabel}`,
    Author:  "Basket Club Tool — ABP",
    Company: "Amicale Basket Pecquencourt",
  };

  const filename = `organisation_matchs_${new Date().toISOString().slice(0, 10)}.xlsx`;
  return { wb, filename };
}

/**
 * Construit le classeur ET déclenche le téléchargement navigateur.
 * Retourne { wb, filename } pour permettre un upload Drive optionnel ensuite.
 */
function generateOrganisationExcel(domicileList, exterieurList, weekLabel) {
  const { wb, filename } = buildOrganisationWorkbook(domicileList, exterieurList, weekLabel);
  XLSX.writeFile(wb, filename, { bookSST: false, cellStyles: true });
  return { wb, filename };
}
