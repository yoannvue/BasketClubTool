/**
 * local-render.js
 * Génère l'affiche planning localement via Canvas API.
 * Aucune dépendance externe, aucun appel réseau.
 *
 * API publique :
 *   generatePlanningImageLocal(domicileList, exterieurList, weekLabel, exemptList?)
 *   → Promise<Blob>  (type image/png)
 *
 * exemptList (optionnel) : tableau de noms de catégories ABP exemptées,
 *   ex: ["U13M", "U9F"]. Affiché sous la colonne la plus courte.
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
    WHITE:         "#ffffff3d",
    DOM_BG:        "#1F4E79",
    EXT_BG:        "#1F4E79",
    BORDER:        "#B0C4D8",
    TEXT:          "#1A1A2E",
    DATE_C:        "#2E6DA4",
    SEP_C:         "#E8882A",
    VS_C:          "#7B8FA6",
    DAY_LABEL_BG:  "#f4f7fb77",
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

// ── Liste des fonds disponibles ─────────────────────────────────────────────
//
// Source : config/backgrounds.json
// Pour ajouter un fond : déposer l'image dans ressources/fonds/ et ajouter
// une entrée { "label": "Nom affiché", "file": "ressources/fonds/nom.png" }
// dans config/backgrounds.json.

let BACKGROUNDS = [];

async function _loadBackgrounds() {
  if (BACKGROUNDS.length > 0) return; // déjà chargé
  try {
    const resp = await fetch("config/backgrounds.json");
    if (resp.ok) {
      BACKGROUNDS = await resp.json();
    } else {
      console.warn(`[local-render] Impossible de charger backgrounds.json (HTTP ${resp.status})`);
    }
  } catch (e) {
    console.warn("[local-render] Erreur chargement backgrounds.json :", e);
  }
}

// ── Dropdown fond d'affiche (partagé) ─────────────────────────────────────────

/**
 * Construit un sélecteur de fond avec vignette dans le conteneur `containerId`.
 * `setFn(filePath | null)` est appelé à chaque sélection.
 * Premier élément sélectionné par défaut (peut être null si pas de fond).
 */
function _buildBgDropdown(containerId, setFn) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const initial = BACKGROUNDS[0] || { label: "Aucun", file: null };

  // ─ Wrapper
  const wrap    = document.createElement("div");
  wrap.className = "bg-dropdown";

  // ─ Trigger (bouton affiché en permanence)
  const trigger = document.createElement("button");
  trigger.type      = "button";
  trigger.className = "bg-dd-trigger";

  const trigThumb = document.createElement("div");
  trigThumb.className = "bg-dd-thumb";
  if (initial.file) trigThumb.style.backgroundImage = `url('${initial.file}')`;

  const trigLabel = document.createElement("span");
  trigLabel.className   = "bg-dd-label";
  trigLabel.textContent = initial.label;

  const trigArrow = document.createElement("span");
  trigArrow.className   = "bg-dd-arrow";
  trigArrow.textContent = "▾";

  trigger.appendChild(trigThumb);
  trigger.appendChild(trigLabel);
  trigger.appendChild(trigArrow);

  // ─ Panel
  const panel    = document.createElement("div");
  panel.className = "bg-dd-panel";
  panel.hidden    = true;

  BACKGROUNDS.forEach((bg, i) => {
    const item    = document.createElement("div");
    item.className = "bg-dd-item" + (i === 0 ? " active" : "");
    item.role      = "option";

    const thumb    = document.createElement("div");
    thumb.className = "bg-dd-thumb";
    if (bg.file) thumb.style.backgroundImage = `url('${bg.file}')`;

    const lbl      = document.createElement("span");
    lbl.textContent = bg.label;

    item.appendChild(thumb);
    item.appendChild(lbl);

    item.addEventListener("click", () => {
      // Mettre à jour le trigger
      trigThumb.style.backgroundImage = bg.file ? `url('${bg.file}')` : "";
      trigLabel.textContent = bg.label;
      // État actif
      panel.querySelectorAll(".bg-dd-item").forEach(el => el.classList.remove("active"));
      item.classList.add("active");
      // Fermer
      panel.hidden    = true;
      trigArrow.textContent = "▾";
      // Callback
      setFn(bg.file);
    });

    panel.appendChild(item);
  });

  // Ouvrir / fermer
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = !panel.hidden;
    panel.hidden          = open;
    trigArrow.textContent = open ? "▾" : "▴";
  });

  // Fermer au clic extérieur
  document.addEventListener("click", () => {
    if (!panel.hidden) {
      panel.hidden          = true;
      trigArrow.textContent = "▾";
    }
  });

  wrap.appendChild(trigger);
  wrap.appendChild(panel);
  container.appendChild(wrap);

  // Sélection initiale
  setFn(initial.file);
}

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

/**
 * Charge une image depuis src.
 * Résout null si le fichier est absent ou en erreur (silencieux).
 * Chemins de ressources par convention :
 *   ressources/logo.png  — logo du club (fond transparent recommandé)
 *   ressources/fond.png  — image de fond (facultative)
 */
function _loadImg(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => {
      console.warn(`[local-render] Ressource absente ou inaccessible : ${src}`);
      resolve(null);
    };
    img.src = src;
  });
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

async function generatePlanningImageLocal(domicileList, exterieurList, weekLabel, exemptList = [], bgPath = null) {
  const C   = _LC.C;
  const F   = _LC.F;
  const W   = _LC.W;
  const PAD = _LC.PAD;
  const GAP = _LC.GAP;

  const domGroups = _computeGroups(domicileList);
  const extGroups = _computeGroups(exterieurList);

  // Hauteur des blocs (hors exempt)
  const EXEMPT_ROW_H = 30;
  const EXEMPT_GAP   = 10;
  const EXEMPT_ROWS  = exemptList.length;
  const exemptSecH   = EXEMPT_ROWS > 0 ? EXEMPT_GAP + EXEMPT_ROWS * EXEMPT_ROW_H + 8 : 0;

  const domBlockH  = _LC.SEC_H + _blockContentHeight(domGroups);
  const extBlockH  = _LC.SEC_H + _blockContentHeight(extGroups);
  // La colonne la plus courte reçoit les exempts (égalité → domicile)
  const exemptIsDOM = domBlockH <= extBlockH;
  const domTotalH   = domBlockH + (exemptIsDOM  ? exemptSecH : 0);
  const extTotalH   = extBlockH + (!exemptIsDOM ? exemptSecH : 0);
  const H           = _LC.HDR_H + 12 + Math.max(domTotalH, extTotalH) + 12;

  // Chargement des ressources optionnelles (silencieux si absentes)
  const [logoImg, bgImg] = await Promise.all([
    _loadImg("ressources/logo.png"),
    bgPath ? _loadImg(bgPath) : Promise.resolve(null),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width  = W;
  canvas.height = H;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D non support\u00e9 par ce navigateur.");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Fond
  _fill(ctx, 0, 0, W, H, C.BG);

  // Image de fond (optionnelle — cover centré, sans déformation)
  if (bgImg) {
    const scale = Math.max(W / bgImg.width, H / bgImg.height);
    const bW    = bgImg.width  * scale;
    const bH    = bgImg.height * scale;
    const bX    = (W - bW) / 2;
    const bY    = (H - bH) / 2;
    ctx.save();
    ctx.drawImage(bgImg, bX, bY, bW, bH);
    ctx.restore();
  }

  // Header dégradé
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, C.PRIMARY);
  grad.addColorStop(1, C.PRIMARY2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, _LC.HDR_H);

  // Logo du club (optionnel — ressources/logo.png) — ancré à droite dans le header
  if (logoImg) {
    // Scaling "contain" : tient dans MAX_LOGO_W × MAX_LOGO_H sans déformation
    const MAX_LOGO_H = _LC.HDR_H - 16;
    const MAX_LOGO_W = 180;
    const scale = Math.min(MAX_LOGO_W / logoImg.width, MAX_LOGO_H / logoImg.height);
    const lW    = Math.round(logoImg.width  * scale);
    const lH    = Math.round(logoImg.height * scale);
    const lX    = W - PAD - lW;
    const lY    = Math.round((_LC.HDR_H - lH) / 2);
    ctx.drawImage(logoImg, lX, lY, lW, lH);
  }

  // Titre & sous-titre alignés à gauche
  const txtX = PAD + 20;
  _txt(ctx, weekLabel.toUpperCase(),       txtX, _LC.HDR_H / 2 - 10, F.WEEK, C.WHITE,                  "left");
  _txt(ctx, "AMICALE BASKET PECQUENCOURT - MONTIGNY EN OSTREVENT", txtX, _LC.HDR_H / 2 + 22, F.CLUB, "rgba(255,255,255,0.72)", "left");

  // Bande accent
  _fill(ctx, 0, _LC.HDR_H - 5, W, 5, C.ACCENT);

  // Blocs DOM | EXT
  const colW = Math.floor((W - PAD * 2 - GAP) / 2);
  const yT   = _LC.HDR_H + 12;

  _drawBlock(ctx, true,  domGroups, PAD,             yT, colW);
  _drawBlock(ctx, false, extGroups, PAD + colW + GAP, yT, colW);

  // ── Section EXEMPT(S) ──
  if (exemptList.length > 0) {
    const EXEMPT_ROW_H = 30;
    const EXEMPT_GAP   = 10;
    const bx   = exemptIsDOM ? PAD : (PAD + colW + GAP);
    let   ey   = yT + (exemptIsDOM ? domBlockH : extBlockH) + EXEMPT_GAP;
    const accentColor = exemptIsDOM ? C.DOM_BG : C.EXT_BG;

    for (const cat of exemptList) {
      // Fond léger
      _fill(ctx, bx, ey, colW, EXEMPT_ROW_H, C.DAY_LABEL_BG);
      // Barre latérale
      _fill(ctx, bx, ey, 4, EXEMPT_ROW_H, C.ACCENT);
      // Bordure
      ctx.strokeStyle = C.BORDER;
      ctx.lineWidth   = 1;
      ctx.strokeRect(bx + 0.5, ey + 0.5, colW - 1, EXEMPT_ROW_H - 1);
      // Texte
      _txt(ctx, `EXEMPT : ${cat}`, bx + 18, ey + EXEMPT_ROW_H / 2, F.SECTION, C.ACCENT);
      ey += EXEMPT_ROW_H + 3;
    }
  }

  // Export PNG
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error("Export PNG \u00e9chou\u00e9."))),
      "image/png"
    );
  });
}

// ── Mode Portrait ─────────────────────────────────────────────────────────────

/**
 * Génère l'affiche planning en mode PORTRAIT (pleine largeur, blocs empilés).
 *
 * Layout :
 *   - Header identique au mode paysage
 *   - Bloc DOMICILE   → pleine largeur
 *   - Bloc EXTÉRIEUR  → pleine largeur, sous le précédent
 *   - Ligne EXEMPT    → une seule ligne "EXEMPT : U9F, U11F, …"
 *
 * @param {object[]} domicileList
 * @param {object[]} exterieurList
 * @param {string}   weekLabel
 * @param {string[]} exemptList
 * @returns {Promise<Blob>}
 */
async function generatePlanningImageLocalPortrait(domicileList, exterieurList, weekLabel, exemptList = [], bgPath = null) {
  const C = _LC.C;
  const F = _LC.F;

  // Constantes propres au mode portrait
  const W          = 900;
  const PAD        = 30;
  const BLOCK_GAP  = 16;   // espace vertical entre les deux blocs
  const EXEMPT_H   = 40;   // hauteur de la ligne exempt

  const colW = W - PAD * 2;

  const domGroups = _computeGroups(domicileList);
  const extGroups = _computeGroups(exterieurList);

  const domBlockH = _LC.SEC_H + _blockContentHeight(domGroups);
  const extBlockH = _LC.SEC_H + _blockContentHeight(extGroups);
  const exemptSecH = exemptList.length > 0 ? BLOCK_GAP + EXEMPT_H : 0;

  const H = _LC.HDR_H + 12
    + domBlockH + BLOCK_GAP
    + extBlockH
    + exemptSecH
    + 16;

  // Ressources optionnelles
  const [logoImg, bgImg] = await Promise.all([
    _loadImg("ressources/logo.png"),
    bgPath ? _loadImg(bgPath) : Promise.resolve(null),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width  = W;
  canvas.height = H;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D non support\u00e9 par ce navigateur.");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Fond
  _fill(ctx, 0, 0, W, H, C.BG);

  // Image de fond (optionnelle — cover centré, sans déformation)
  if (bgImg) {
    const scale = Math.max(W / bgImg.width, H / bgImg.height);
    const bW    = bgImg.width  * scale;
    const bH    = bgImg.height * scale;
    const bX    = (W - bW) / 2;
    const bY    = (H - bH) / 2;
    ctx.save();
    ctx.drawImage(bgImg, bX, bY, bW, bH);
    ctx.restore();
  }

  // Header dégradé
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, C.PRIMARY);
  grad.addColorStop(1, C.PRIMARY2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, _LC.HDR_H);

  // Logo (optionnel)
  if (logoImg) {
    const MAX_LOGO_H = _LC.HDR_H - 16;
    const MAX_LOGO_W = 160;
    const scale = Math.min(MAX_LOGO_W / logoImg.width, MAX_LOGO_H / logoImg.height);
    const lW    = Math.round(logoImg.width  * scale);
    const lH    = Math.round(logoImg.height * scale);
    const lX    = W - PAD - lW;
    const lY    = Math.round((_LC.HDR_H - lH) / 2);
    ctx.drawImage(logoImg, lX, lY, lW, lH);
  }

  // Titre
  const txtX = PAD + 10;
  _txt(ctx, weekLabel.toUpperCase(), txtX, _LC.HDR_H / 2 - 10, F.WEEK, C.WHITE, "left");
  _txt(ctx, "AMICALE BASKET PECQUENCOURT - MONTIGNY EN OSTREVENT", txtX, _LC.HDR_H / 2 + 22, F.CLUB, "rgba(255,255,255,0.72)", "left");

  // Bande accent
  _fill(ctx, 0, _LC.HDR_H - 5, W, 5, C.ACCENT);

  let yT = _LC.HDR_H + 12;

  // Bloc DOMICILE (pleine largeur)
  _drawBlock(ctx, true,  domGroups, PAD, yT, colW);
  yT += domBlockH + BLOCK_GAP;

  // Bloc EXTÉRIEUR (pleine largeur)
  _drawBlock(ctx, false, extGroups, PAD, yT, colW);
  yT += extBlockH;

  // Ligne EXEMPT (une seule ligne, toutes catégories sur la même ligne)
  if (exemptList.length > 0) {
    yT += BLOCK_GAP;
    _fill(ctx, PAD, yT, colW, EXEMPT_H, C.DAY_LABEL_BG);
    _fill(ctx, PAD, yT, 4,    EXEMPT_H, C.ACCENT);
    ctx.strokeStyle = C.BORDER;
    ctx.lineWidth   = 1;
    ctx.strokeRect(PAD + 0.5, yT + 0.5, colW - 1, EXEMPT_H - 1);
    _txt(
      ctx,
      `EXEMPT : ${exemptList.join(", ")}`,
      PAD + 18, yT + EXEMPT_H / 2,
      F.SECTION, C.ACCENT
    );
  }

  // Export PNG
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error("Export PNG \u00e9chou\u00e9."))),
      "image/png"
    );
  });
}
