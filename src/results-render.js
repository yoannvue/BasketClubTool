/**
 * results-render.js
 * Génère l'affiche des résultats en mode Portrait via Canvas API.
 * Aucune dépendance externe, aucun appel réseau.
 *
 * Dépend de local-render.js pour les primitives partagées :
 *   _fill, _txt, _mw, _loadImg, _LC (HDR_H notamment)
 *
 * API publique :
 *   generateResultsImage(matchList, weekLabel, bgPath?, sponsorText?)
 *   → Promise<Blob>  (type image/png)
 *
 * matchList produit par loadResultsData() dans results-transform.js :
 *   [{ equipe, adversaire, scoreAbp, scoreAdv, categorie, _catSort }, …]
 *   (déjà triés par catégorie)
 */

// ── Configuration visuelle ────────────────────────────────────────────────────

const _RRC = Object.freeze({
  W:          900,
  PAD:         30,
  ROW_H:       40,  // hauteur d'une ligne de résultat
  ROW_GAP:      2,  // séparateur entre lignes
  FOOTER_H:    200,  // zone sponsor (footer)

  C: {
    PRIMARY:        "#1F4E79",
    PRIMARY2:       "#2E6DA4",
    ACCENT:         "#E8882A",
    BG:             "#EDF2F9",
    BORDER:         "#B0C4D8",
    TEXT:           "#1A1A2E",
    MUTED:          "#7B8FA6",
    ROW_BG:         "#ffffff65",
    SCORE_WIN:      "#1B5725",
    SCORE_LOSE:     "#7B1E1E",
    SCORE_DRAW:     "#2E6DA4",
    FOOTER_BG:      "#f4f7fb",
    FOOTER_BORDER:  "#B0C4D8",
    SPONSOR_TEXT:   "#b0b8c4",
  },

  F: {
    CLUB:    "600 13px 'Segoe UI', Arial, sans-serif",
    WEEK:    "bold 24px 'Segoe UI', Arial, sans-serif",
    TEAM:    "bold 14px 'Segoe UI', Arial, sans-serif",
    SCORE:   "bold 24px 'Segoe UI', Arial, sans-serif",
    SPONSOR: "600 13px 'Segoe UI', Arial, sans-serif",
  },
});

// ── Helpers internes ──────────────────────────────────────────────────────────

/** Dessine le header identique au mode Portrait du planning. */
function _drawResultsHeader(ctx, W, weekLabel, logoImg) {
  const C   = _RRC.C;
  const F   = _RRC.F;
  const PAD = _RRC.PAD;
  const HDR = _LC.HDR_H;

  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, C.PRIMARY);
  grad.addColorStop(1, C.PRIMARY2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, HDR);

  if (logoImg) {
    const MAX_H = HDR - 16;
    const MAX_W = 160;
    const s  = Math.min(MAX_W / logoImg.width, MAX_H / logoImg.height);
    const lW = Math.round(logoImg.width  * s);
    const lH = Math.round(logoImg.height * s);
    ctx.drawImage(logoImg, W - PAD - lW, Math.round((HDR - lH) / 2), lW, lH);
  }

  const txtX = PAD + 10;
  _txt(ctx, weekLabel.toUpperCase(), txtX, HDR / 2 - 10, F.WEEK, "#ffffff", "left");
  _txt(ctx, "AMICALE BASKET PECQUENCOURT \u2014 MONTIGNY EN OSTREVENT",
       txtX, HDR / 2 + 22, F.CLUB, "rgba(255,255,255,0.72)", "left");

  // Bande accent bas
  _fill(ctx, 0, HDR - 5, W, 5, C.ACCENT);
}

/** Dessine le footer réservé au sponsor. */
function _drawFooter(ctx, W, H, sponsorText) {
  const C       = _RRC.C;
  const F       = _RRC.F;
  const footerY = H - _RRC.FOOTER_H;

  _fill(ctx, 0, footerY, W, _RRC.FOOTER_H, C.FOOTER_BG);

  // Trait supérieur + bande accent
  _fill(ctx, 0, footerY, W, 4, C.ACCENT);
  ctx.strokeStyle = C.FOOTER_BORDER;
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(0, footerY + 4.5);
  ctx.lineTo(W, footerY + 4.5);
  ctx.stroke();

  const label = sponsorText && sponsorText.trim()
    ? sponsorText.trim()
    : "\u25C6  ESPACE SPONSOR  \u25C6";

  const color = sponsorText && sponsorText.trim() ? C.TEXT : C.SPONSOR_TEXT;
  _txt(ctx, label, W / 2, footerY + _RRC.FOOTER_H / 2 + 4, F.SPONSOR, color, "center");
}

// ── API publique ──────────────────────────────────────────────────────────────

/**
 * @param {object[]} matchList    Tableau produit par loadResultsData().
 * @param {string}   weekLabel    Label de la semaine (ex: "Résultats — semaine du 12 avril 2026").
 * @param {string|null} bgPath   Chemin vers l'image de fond (null = aucun).
 * @param {string}   sponsorText Texte sponsor dans le footer (vide = placeholder).
 * @returns {Promise<Blob>}
 */
async function generateResultsImage(matchList, weekLabel, bgPath = null, sponsorText = "") {
  const C    = _RRC.C;
  const F    = _RRC.F;
  const W    = _RRC.W;
  const PAD  = _RRC.PAD;
  const colW = W - PAD * 2;

  // ── Calcul hauteur ───────────────────────────────────────────────
  const n        = matchList.length || 1;
  const contentH = n * _RRC.ROW_H + (n - 1) * _RRC.ROW_GAP;
  const H        = _LC.HDR_H + 12 + contentH + 12 + _RRC.FOOTER_H;

  // ── Ressources ───────────────────────────────────────────────────
  const [logoImg, bgImg] = await Promise.all([
    _loadImg("ressources/logo.png"),
    bgPath ? _loadImg(bgPath) : Promise.resolve(null),
  ]);

  // ── Canvas ───────────────────────────────────────────────────────
  const canvas = document.createElement("canvas");
  canvas.width  = W;
  canvas.height = H;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D non support\u00e9 par ce navigateur.");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // ── 1. Fond uni ──────────────────────────────────────────────────
  _fill(ctx, 0, 0, W, H, C.BG);

  // ── 2. Image de fond (cover centré, sous tout le reste) ──────────
  if (bgImg) {
    const scale = Math.max(W / bgImg.width, H / bgImg.height);
    const bW    = bgImg.width  * scale;
    const bH    = bgImg.height * scale;
    ctx.drawImage(bgImg, (W - bW) / 2, (H - bH) / 2, bW, bH);
  }

  // ── 3. Header (par-dessus le fond) ───────────────────────────────
  _drawResultsHeader(ctx, W, weekLabel, logoImg);

  // ── 4. Lignes de résultats ───────────────────────────────────────
  //  Zones X  :  NomABP (38 %)  |  Score (24 %, centré)  |  Adversaire (38 %, droite)
  const ZONE_LEFT  = Math.floor(colW * 0.38);
  const ZONE_SCORE = Math.floor(colW * 0.24);
  const ZONE_RIGHT = colW - ZONE_LEFT - ZONE_SCORE;

  const xTeamLeft = PAD + 12;
  const xScoreCtr = PAD + ZONE_LEFT + ZONE_SCORE / 2;
  const xOppRight = PAD + ZONE_LEFT + ZONE_SCORE + ZONE_RIGHT - 12;

  let y = _LC.HDR_H + 12;

  if (matchList.length === 0) {
    _txt(ctx, "Aucun r\u00e9sultat \u00e0 afficher.", PAD + 10, y + _RRC.ROW_H / 2, F.TEAM, C.MUTED);
  }

  for (let i = 0; i < matchList.length; i++) {
    const m   = matchList[i];
    const ry  = y;
    const mid = ry + _RRC.ROW_H / 2;

    // Fond uniforme semi-transparent pour toutes les lignes
    _fill(ctx, PAD, ry, colW, _RRC.ROW_H, C.ROW_BG);

    // Séparateur léger entre lignes
    if (i < matchList.length - 1) {
      ctx.strokeStyle = "rgba(0,0,0,0.08)";
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(PAD + 16,        ry + _RRC.ROW_H + 0.5);
      ctx.lineTo(PAD + colW - 16, ry + _RRC.ROW_H + 0.5);
      ctx.stroke();
    }

    // Couleur du score : vert = victoire, rouge = défaite, bleu = nul
    const sa = parseInt(m.scoreAbp, 10);
    const so = parseInt(m.scoreAdv, 10);
    let scoreCol = C.SCORE_DRAW;
    if (!isNaN(sa) && !isNaN(so)) {
      if      (sa > so) scoreCol = C.SCORE_WIN;
      else if (sa < so) scoreCol = C.SCORE_LOSE;
    }

    _txt(ctx, m.equipe      || "", xTeamLeft, mid, F.TEAM,  C.TEXT,    "left");
    const fmtScore = s => String(parseInt(s, 10) >= 0 ? parseInt(s, 10) : s).padStart(2, "0");
    _txt(ctx, `${fmtScore(m.scoreAbp)}  \u2013  ${fmtScore(m.scoreAdv)}`, xScoreCtr, mid, F.SCORE, scoreCol, "center");
    _txt(ctx, m.adversaire  || "", xOppRight, mid, F.TEAM,  C.TEXT,    "right");

    y += _RRC.ROW_H + _RRC.ROW_GAP;
  }

  // Encadrement du bloc résultats
  if (matchList.length > 0) {
    ctx.strokeStyle = C.BORDER;
    ctx.lineWidth   = 1;
    ctx.strokeRect(PAD + 0.5, _LC.HDR_H + 12 + 0.5, colW - 1, contentH - 1);
  }

  // ── 5. Footer ────────────────────────────────────────────────────
  _drawFooter(ctx, W, H, sponsorText);

  // ── Export PNG ───────────────────────────────────────────────────
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error("Export PNG \u00e9chou\u00e9."))),
      "image/png"
    );
  });
}
