/**
 * slides.js
 * Port JavaScript de core/drive.py + core/slides_planning.py
 *
 * Toutes les fonctions font des appels REST directs via fetch() avec le Bearer token
 * stocké dans window.googleAccessToken (initialisé par app.js via Google Identity Services).
 *
 * API publique :
 *   generatePlanningImage(domicileList, exterieurList, weekLabel, config, onLog)
 *     → Promise<{ blob: Blob, driveUrl: string|null }>
 */

// ── Constantes ───────────────────────────────────────────────────────────────

const MAX_MATCHES   = 20;
const SLIDES_BASE   = "https://slides.googleapis.com/v1";
const DRIVE_BASE    = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD  = "https://www.googleapis.com/upload/drive/v3";

// ── Helpers auth ─────────────────────────────────────────────────────────────

function _authHeaders(extra) {
  return { Authorization: `Bearer ${window.googleAccessToken}`, ...extra };
}

async function _checkResponse(resp, label) {
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`${label} — HTTP ${resp.status}: ${body.slice(0, 300)}`);
  }
  return resp;
}

// ── Drive ────────────────────────────────────────────────────────────────────

/**
 * Duplique une présentation Google Slides.
 * Retourne l'ID de la copie.
 */
async function copyPresentation(templateId, tempName) {
  const resp = await fetch(`${DRIVE_BASE}/files/${encodeURIComponent(templateId)}/copy`, {
    method: "POST",
    headers: _authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ name: tempName }),
  });
  await _checkResponse(resp, "Copie du template");
  const data = await resp.json();
  return data.id;
}

/**
 * Supprime une présentation (fichier Drive).
 */
async function deletePresentation(presentationId) {
  await fetch(`${DRIVE_BASE}/files/${encodeURIComponent(presentationId)}`, {
    method: "DELETE",
    headers: _authHeaders(),
  });
  // On ignore les erreurs ici (nettoyage best-effort)
}

/**
 * Upload (ou mise à jour si le fichier existe déjà) d'un Blob PNG dans un dossier Drive.
 * Retourne l'URL de visualisation Drive.
 */
async function uploadToDrive(blob, folderId, filename) {
  // ── Vérification si le fichier existe déjà ──
  const q = `name='${filename}' and '${folderId}' in parents and trashed=false`;
  const checkResp = await fetch(
    `${DRIVE_BASE}/files?q=${encodeURIComponent(q)}&fields=files(id)`,
    { headers: _authHeaders() }
  );
  await _checkResponse(checkResp, "Recherche fichier Drive");
  const checkData = await checkResp.json();
  const existing  = checkData.files || [];

  let fileId;

  if (existing.length > 0) {
    // ── Mise à jour du fichier existant (contenu seulement) ──
    fileId = existing[0].id;
    const updResp = await fetch(
      `${DRIVE_UPLOAD}/files/${encodeURIComponent(fileId)}?uploadType=media`,
      {
        method: "PATCH",
        headers: _authHeaders({ "Content-Type": "image/png" }),
        body: blob,
      }
    );
    await _checkResponse(updResp, "Mise à jour fichier Drive");
  } else {
    // ── Création avec métadonnées (multipart) ──
    const metadata  = { name: filename, parents: [folderId] };
    const boundary  = "bct_boundary_" + Date.now();
    const metaStr   = JSON.stringify(metadata);

    // Construction manuelle du corps multipart/related
    const encoder   = new TextEncoder();
    const part1     = encoder.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaStr}\r\n`
    );
    const part2hdr  = encoder.encode(
      `--${boundary}\r\nContent-Type: image/png\r\n\r\n`
    );
    const ending    = encoder.encode(`\r\n--${boundary}--`);
    const imgBytes  = new Uint8Array(await blob.arrayBuffer());

    const body = new Uint8Array(
      part1.length + part2hdr.length + imgBytes.length + ending.length
    );
    let offset = 0;
    body.set(part1,    offset); offset += part1.length;
    body.set(part2hdr, offset); offset += part2hdr.length;
    body.set(imgBytes, offset); offset += imgBytes.length;
    body.set(ending,   offset);

    const createResp = await fetch(
      `${DRIVE_UPLOAD}/files?uploadType=multipart`,
      {
        method: "POST",
        headers: _authHeaders({
          "Content-Type": `multipart/related; boundary=${boundary}`,
        }),
        body: body.buffer,
      }
    );
    await _checkResponse(createResp, "Création fichier Drive");
    const createData = await createResp.json();
    fileId = createData.id;

    // Partage public en lecture (quiconque a le lien)
    await fetch(`${DRIVE_BASE}/files/${encodeURIComponent(fileId)}/permissions`, {
      method: "POST",
      headers: _authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ type: "anyone", role: "reader" }),
    });
  }

  return `https://drive.google.com/file/d/${fileId}/view`;
}

// ── Slides ───────────────────────────────────────────────────────────────────

/**
 * Remplace tous les placeholders {{KEY}} dans la présentation.
 * replacements = { "{{SEMAINE}}": "Semaine du 28 avril 2026", ... }
 */
async function replacePlaceholders(presentationId, replacements) {
  const requests = Object.entries(replacements).map(([placeholder, value]) => ({
    replaceAllText: {
      containsText: { text: placeholder, matchCase: true },
      replaceText: String(value ?? ""),
    },
  }));
  if (requests.length === 0) return;

  const resp = await fetch(
    `${SLIDES_BASE}/presentations/${encodeURIComponent(presentationId)}:batchUpdate`,
    {
      method: "POST",
      headers: _authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ requests }),
    }
  );
  await _checkResponse(resp, "Remplacement placeholders");
}

/**
 * Supprime les lignes de tableau dont TOUTES les cellules sont vides.
 * Suppression de bas en haut pour éviter le décalage d'index.
 * Retourne le nombre de lignes supprimées.
 */
async function deleteEmptyTableRows(presentationId) {
  const presResp = await fetch(
    `${SLIDES_BASE}/presentations/${encodeURIComponent(presentationId)}`,
    { headers: _authHeaders() }
  );
  await _checkResponse(presResp, "Lecture présentation");
  const pres  = await presResp.json();
  const slide = pres.slides?.[0];
  if (!slide) return 0;

  const requests = [];

  for (const element of (slide.pageElements || [])) {
    const table = element.table;
    if (!table) continue;

    const tableId = element.objectId;
    const rows    = table.tableRows || [];
    const emptyIndices = [];

    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const cells = rows[rowIdx].tableCells || [];
      const allEmpty = cells.every(cell => {
        const text = (cell.text?.textElements || [])
          .map(e => e.textRun?.content ?? "")
          .join("")
          .trim();
        return text === "";
      });
      if (allEmpty) emptyIndices.push(rowIdx);
    }

    // Supprimer de bas en haut (évite le décalage d'index)
    for (const rowIdx of [...emptyIndices].reverse()) {
      requests.push({
        deleteTableRow: {
          tableObjectId: tableId,
          cellLocation: { rowIndex: rowIdx },
        },
      });
    }
  }

  if (requests.length === 0) return 0;

  const batchResp = await fetch(
    `${SLIDES_BASE}/presentations/${encodeURIComponent(presentationId)}:batchUpdate`,
    {
      method: "POST",
      headers: _authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ requests }),
    }
  );
  await _checkResponse(batchResp, "Suppression lignes vides");
  return requests.length;
}

/**
 * Exporte la première slide en PNG.
 * Retourne un Blob image/png.
 *
 * L'URL thumbnail de l'API Slides est une URL signée temporaire accessible
 * directement (sans en-tête auth). En cas d'échec, on retente avec le token.
 */
async function exportSlideAsPng(presentationId) {
  // Récupère l'ID de la première slide
  const presResp = await fetch(
    `${SLIDES_BASE}/presentations/${encodeURIComponent(presentationId)}`,
    { headers: _authHeaders() }
  );
  await _checkResponse(presResp, "Lecture présentation (export PNG)");
  const pres        = await presResp.json();
  const firstPageId = pres.slides?.[0]?.objectId;
  if (!firstPageId) throw new Error("Impossible de trouver la première slide.");

  // Demande le thumbnail LARGE (≈ 1600 px de large)
  const thumbResp = await fetch(
    `${SLIDES_BASE}/presentations/${encodeURIComponent(presentationId)}/pages/${encodeURIComponent(firstPageId)}/thumbnail` +
    `?thumbnailProperties.mimeType=PNG&thumbnailProperties.thumbnailSize=LARGE`,
    { headers: _authHeaders() }
  );
  await _checkResponse(thumbResp, "Export thumbnail PNG");
  const thumbData = await thumbResp.json();
  const imgUrl    = thumbData.contentUrl;
  if (!imgUrl) throw new Error("L'API Slides n'a pas retourné d'URL d'image.");

  // Téléchargement de l'image (URL signée — ne nécessite pas le token Bearer)
  let imgResp = await fetch(imgUrl);
  if (!imgResp.ok) {
    // Retry avec le token (au cas où l'URL n'est pas auto-signée)
    imgResp = await fetch(imgUrl, { headers: _authHeaders() });
  }
  if (!imgResp.ok) {
    throw new Error(
      `Impossible de télécharger l'image PNG (HTTP ${imgResp.status}).\n` +
      `Cause probable : restriction CORS du CDN Google.\n` +
      `→ Ouvre cette URL manuellement : ${imgUrl}`
    );
  }
  return imgResp.blob();
}

// ── API publique ─────────────────────────────────────────────────────────────

/**
 * Génère l'affiche planning complète :
 *   1. Copie le template Slides
 *   2. Remplace les placeholders
 *   3. Supprime les lignes vides
 *   4. Exporte en PNG
 *   5. Upload sur Drive (si driveFolderId configuré)
 *   6. Supprime la présentation temporaire
 *
 * @param {object[]} domicileList   - matchs à domicile (depuis loadPlanningData)
 * @param {object[]} exterieurList  - matchs à l'extérieur
 * @param {string}   weekLabel      - ex: "Semaine du 28 avril 2026"
 * @param {object}   config         - { templatePlanningId, driveFolderId }
 * @param {Function} onLog          - callback(message, type) pour journalisation UI
 * @returns {Promise<{ blob: Blob, driveUrl: string|null }>}
 */
async function generatePlanningImage(domicileList, exterieurList, weekLabel, config, onLog) {
  const templateId = (config.templatePlanningId || "").trim();
  if (!templateId) {
    throw new Error(
      "ID du template planning non configuré.\n" +
      "Ouvre les paramètres (⚙) et renseigne « ID Template Slides — Planning »."
    );
  }

  const tempName = `_tmp_planning_${Date.now()}`;
  let presId = null;

  try {
    onLog?.("Copie du template Google Slides…", "info");
    presId = await copyPresentation(templateId, tempName);

    // ── Construction du dictionnaire de remplacement ──
    const replacements = { "{{SEMAINE}}": weekLabel };

    for (let i = 1; i <= MAX_MATCHES; i++) {
      if (i <= domicileList.length) {
        const m = domicileList[i - 1];
        replacements[`{{DOM_${i}_EQUIPE1}}`] = m.equipe;
        replacements[`{{DOM_${i}_EQUIPE2}}`] = m.adversaire;
        replacements[`{{DOM_${i}_DATE}}`]    = m.dateAffiche;
      } else {
        replacements[`{{DOM_${i}_EQUIPE1}}`] = "";
        replacements[`{{DOM_${i}_EQUIPE2}}`] = "";
        replacements[`{{DOM_${i}_DATE}}`]    = "";
      }
    }

    for (let i = 1; i <= MAX_MATCHES; i++) {
      if (i <= exterieurList.length) {
        const m = exterieurList[i - 1];
        // En extérieur : EQUIPE1 = adversaire, EQUIPE2 = ABP (convention template)
        replacements[`{{EXT_${i}_EQUIPE1}}`] = m.adversaire;
        replacements[`{{EXT_${i}_EQUIPE2}}`] = m.equipe;
        replacements[`{{EXT_${i}_DATE}}`]    = m.dateAffiche;
      } else {
        replacements[`{{EXT_${i}_EQUIPE1}}`] = "";
        replacements[`{{EXT_${i}_EQUIPE2}}`] = "";
        replacements[`{{EXT_${i}_DATE}}`]    = "";
      }
    }

    onLog?.("Remplacement des placeholders…", "info");
    await replacePlaceholders(presId, replacements);

    onLog?.("Suppression des lignes vides dans les tableaux…", "info");
    const deleted = await deleteEmptyTableRows(presId);
    if (deleted > 0) onLog?.(`${deleted} ligne(s) vide(s) supprimée(s).`, "ok");

    onLog?.("Export de la slide en PNG…", "info");
    const blob = await exportSlideAsPng(presId);

    // ── Upload Drive ──
    let driveUrl = null;
    const folderId = (config.driveFolderId || "").trim();
    if (folderId) {
      const filename = `affiche_planning_${new Date().toISOString().slice(0, 10)}.png`;
      onLog?.(`Upload vers Google Drive (${filename})…`, "info");
      driveUrl = await uploadToDrive(blob, folderId, filename);
      onLog?.(`Fichier disponible sur Drive : ${driveUrl}`, "ok");
    }

    return { blob, driveUrl };

  } finally {
    // Nettoyage : supprime toujours la présentation temporaire
    if (presId) {
      try {
        await deletePresentation(presId);
        onLog?.("Présentation temporaire supprimée.", "info");
      } catch (_) {
        // Silencieux — nettoyage best-effort
      }
    }
  }
}
