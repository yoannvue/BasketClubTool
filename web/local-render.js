/**
 * local-render.js
 * Génère l'affiche planning localement via Canvas API.
 * Aucune dépendance externe, aucun appel réseau.
 *
 * API publique :
 *   generatePlanningImageLocal(domicileList, exterieurList, weekLabel)
 *   → Promise<Blob>  (type image/png)
 */

// ── Configuration visuelle ────────────────────────────────────────────────────

const _LC = Object.freeze({
  W:         1400,
  PAD:         40,
  GAP:         24,
  HDR_H:      100,
  SEC_H:       46,
  LINE_H:      32,   // réduit
  LINE_PAD_V:  12,
  DAY_H:       26,   // hauteur de l'en-tête de groupe jour
  DAY_GAP:     10,   // espace entre groupes

  C: {
    PRIMARY:       "#1F4E79",
    PRIMARY2:      "#2E6DA4",
    ACCENT:        "#E8882A",
    BG:            "#EDF2F9",
    WHITE:         "#FFFFFF",
    DOM_BG:        "#1B5725",
    EXT_BG:        "#7B1E1E",
    BORDER:        "#B0C4D8",
    TEXT:          "#1A1A2E",
    DATE_C:        "#2E6DA4",
    SEP_C:         "#E8882A",
    VS_C:          "#7B8FA6",
    DAY_LABEL_BG:  "#F4F7FB",
  },

  F: {
    CLUB:      "600 14px 'Segoe UI', Arial, sans-serif",
    WEEK:      "bold 26px 'Segoe UI', Arial, sans-serif",
    SECTION:   "bold 13px 'Segoe UI', Arial, sans-serif",
    DAY_LABEL: "bold 11px 'Segoe UI', Arial, sans-serif",
    DATE:      "600 14px 'Segoe UI', Arial, sans-serif",
    MATCH:     "bold 14px 'Segoe UI', Arial, sans-serif",
    VS:        "400 12px 'Segoe UI', Arial, sans-serif",
    SEP:       "bold 14px 'Segoe UI', Arial, sans-serif",
  },
});

// ── Primitives Canvas ─────────────────────────────────────────────────────────

function _fill(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function _txt(ctx, s, x, y, font, color, align, baseline) {
  ctx.font         = font;
  ctx.fillStyle    = color;
  ctx.textAlign    = align    || "left";
  ctx.textBaseline = baseline || "middle";
  ctx.fillText(s, x, y);
}

function _mw(ctx, s, font) {
  ctx.font = font;
  return ctx.measureText(s).width;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _parseDateAffiche(dateAffiche) {
  const parts = (dateAffiche || "").split("\n");
  const jour  = parts[0] || "";
  const heure = (parts[1] || "").replace("H", ":");
  return { jour, heure };
}

/** Regroupe les matchs par jour. */
function _computeGroups(list) {
  const groups = [];
  let current  = null;
  for (const m of list) {
    const { jour } = _parseDateAffiche(m.dateAffiche);
    if (!current || current.jour !== jour) {
      current = { jour, matches: [] };
      groups.push(current);
    }
    current.matches.push(m);
  }
  return groups;
}

/** Hauteur de la zone de liste (sous le bandeau de section). */
function _blockContentHeight(groups) {
  if (!groups || groups.length === 0)
    return _LC.LINE_PAD_V + _LC.LINE_H + _LC.LINE_PAD_V;
  let h = _LC.LINE_PAD_V;
  for (let gi = 0; gi < groups.length; gi++) {
    h += _LC.DAY_H;
    h += groups[gi].matches.length * _LC.LINE_H;
    if (gi < groups.length - 1) h += _LC.DAY_GAP;
  }
  h += _LC.LINE_PAD_V;
  return h;
}

function _totalHeight(domGroups, extGroups) {
  const dH = _LC.SEC_H + _blockContentHeight(domGroups);
  const eH = _LC.SEC_H + _blockContentHeight(extGroups);
  return _LC.HDR_H + 12 + Math.max(dH, eH) + 12;
}

// ── Dessin d'un bloc ──────────────────────────────────────────────────────────

/**
 * groups = tableau de { jour: string, matches: object[] }
 * (produit par _computeGroups)
 */
function _drawBlock(ctx, isDOM, groups, bx, startY, w) {
  const C  = _LC.C;
  const F  = _LC.F;
  const PX = 18;
  let y    = startY;
  const accentColor = isDOM ? C.DOM_BG : C.EXT_BG;

  // Bandeau titre de section
  _fill(ctx, bx, y, w, _LC.SEC_H, accentColor);
  _txt(
    ctx,
    isDOM ? "\u25B6  MATCHS \u00C0 DOMICILE" : "\u25B6  MATCHS \u00C0 L'EXT\u00C9RIEUR",
    bx + PX, y + _LC.SEC_H / 2,
    F.SECTION, C.WHITE
  );
  y += _LC.SEC_H;

  // Fond du contenu
  const contentH = _blockContentHeight(groups);
  _fill(ctx, bx, y, w, contentH, C.WHITE);

  // Encadrement
  ctx.strokeStyle = C.BORDER;
  ctx.lineWidth   = 1;
  ctx.strokeRect(bx + 0.5, startY + 0.5, w - 1, _LC.SEC_H + contentH - 1);

  y += _LC.LINE_PAD_V;

  if (groups.length === 0) {
    _txt(ctx, "Aucun match", bx + PX, y + _LC.LINE_H / 2, F.VS, C.VS_C);
    return;
  }

  // ── Pré-calcul des largeurs max (heure seule — le jour est dans le header) ──
  const allMatches = groups.flatMap(g => g.matches);
  const sepStr = "  |  ";
  const vsStr  = "  vs  ";
  const sepW   = _mw(ctx, sepStr, F.SEP);
  const vsW    = _mw(ctx, vsStr,  F.VS);
  let maxHeureW = 0;
  let maxEq1W   = 0;
  for (const m of allMatches) {
    const { heure } = _parseDateAffiche(m.dateAffiche);
    maxHeureW = Math.max(maxHeureW, _mw(ctx, heure, F.DATE));
    maxEq1W   = Math.max(maxEq1W,  _mw(ctx, m.equipe || "", F.MATCH));
  }
  const COL_GAP = 14;
  const heureX  = bx + PX;
  const sepX    = heureX + maxHeureW + COL_GAP;
  const eq1X    = sepX   + sepW;
  const vsX     = eq1X   + maxEq1W   + COL_GAP;
  const eq2X    = vsX    + vsW;

  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];

    // ── En-tête de groupe jour ──
    _fill(ctx, bx + 1, y, w - 2, _LC.DAY_H, C.DAY_LABEL_BG);
    // Barre latérale colorée
    _fill(ctx, bx + 1, y, 4, _LC.DAY_H, accentColor);
    _txt(ctx, g.jour, bx + PX + 2, y + _LC.DAY_H / 2, F.DAY_LABEL, accentColor);
    y += _LC.DAY_H;

    // ── Lignes de matchs ──
    for (let i = 0; i < g.matches.length; i++) {
      const m   = g.matches[i];
      const ry  = y;
      const mid = ry + _LC.LINE_H / 2;

      // Séparateur bas de ligne (sauf dernier du groupe)
      if (i < g.matches.length - 1) {
        ctx.strokeStyle = "rgba(0,0,0,0.06)";
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(bx + PX,     ry + _LC.LINE_H + 0.5);
        ctx.lineTo(bx + w - PX, ry + _LC.LINE_H + 0.5);
        ctx.stroke();
      }

      const { heure } = _parseDateAffiche(m.dateAffiche);
      _txt(ctx, heure,             heureX, mid, F.DATE,  C.DATE_C);
      _txt(ctx, sepStr,            sepX,   mid, F.SEP,   C.SEP_C);
      _txt(ctx, m.equipe || "",    eq1X,   mid, F.MATCH, C.TEXT);
      _txt(ctx, vsStr,             vsX,    mid, F.VS,    C.VS_C);
      _txt(ctx, m.adversaire || "", eq2X,  mid, F.MATCH, C.TEXT);

      y += _LC.LINE_H;
    }

    // Espace entre groupes
    if (gi < groups.length - 1) y += _LC.DAY_GAP;
  }
}

// ── API publique ──────────────────────────────────────────────────────────────

async function generatePlanningImageLocal(domicileList, exterieurList, weekLabel) {
  const C   = _LC.C;
  const F   = _LC.F;
  const W   = _LC.W;
  const PAD = _LC.PAD;
  const GAP = _LC.GAP;

  const domGroups = _computeGroups(domicileList);
  const extGroups = _computeGroups(exterieurList);
  const H         = _totalHeight(domGroups, extGroups);

  const canvas = document.createElement("canvas");
  canvas.width  = W;
  canvas.height = H;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D non support\u00e9 par ce navigateur.");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Fond
  _fill(ctx, 0, 0, W, H, C.BG);

  // Header dégradé
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, C.PRIMARY);
  grad.addColorStop(1, C.PRIMARY2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, _LC.HDR_H);

  // Semaine en grand (haut), club en petit (bas)
  const hcx = W / 2;
  _txt(ctx, weekLabel.toUpperCase(),       hcx, _LC.HDR_H / 2 - 10, F.WEEK, C.WHITE, "center");
  _txt(ctx, "AMICALE BASKET PECQUENCOURT", hcx, _LC.HDR_H / 2 + 22, F.CLUB, "rgba(255,255,255,0.72)", "center");

  // Bande accent
  _fill(ctx, 0, _LC.HDR_H - 5, W, 5, C.ACCENT);

  // Blocs DOM | EXT
  const colW = Math.floor((W - PAD * 2 - GAP) / 2);
  const yT   = _LC.HDR_H + 12;

  _drawBlock(ctx, true,  domGroups, PAD,             yT, colW);
  _drawBlock(ctx, false, extGroups, PAD + colW + GAP, yT, colW);

  // Export PNG
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error("Export PNG \u00e9chou\u00e9."))),
      "image/png"
    );
  });
}
