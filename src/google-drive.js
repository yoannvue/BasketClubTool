/**
 * google-drive.js
 * Upload automatique du fichier Excel d'organisation vers Google Drive.
 *
 * Flux :
 *   1. gdLoadSettings()  — charge config/google.drive.settings.json
 *   2. gdInit()          — initialise Google Identity Services (GIS)
 *   3. gdUploadWorkbook(wb, filename) — sérialise, upload, partage, retourne URL
 *
 * Dépendances :
 *   - Google Identity Services (GIS) : https://accounts.google.com/gsi/client
 *     chargé de façon asynchrone dans index.html
 *   - SheetJS (XLSX) : déjà chargé pour la génération Excel
 *
 * API publique :
 *   gdLoadSettings()              → Promise<object|null>
 *   gdInit()                      → void
 *   gdUploadWorkbook(wb, filename) → Promise<{ id, url, name }>
 *   gdUpdateUI(status, data)      → void
 *   gdIsConfigured()              → bool
 */

const _GD_SETTINGS_PATH = "config/google.drive.settings.json";
const _GD_SCOPE         = "https://www.googleapis.com/auth/drive.file";

const _gdState = {
  settings:       null,
  tokenClient:    null,
  token:          null,   // { access_token, expires_at }
  pendingResolve: null,
  pendingReject:  null,
};

// ── Paramètres ────────────────────────────────────────────────────────────────

async function gdLoadSettings() {
  try {
    const resp = await fetch(_GD_SETTINGS_PATH);
    if (!resp.ok) return null;
    const data = await resp.json();
    // Ignorer si client_id non renseigné
    if (!data.client_id || data.client_id.trim() === "") return null;
    _gdState.settings = data;
    return data;
  } catch (_) {
    return null;
  }
}

function gdIsConfigured() {
  return !!_gdState.settings?.client_id;
}

// ── Initialisation GIS ────────────────────────────────────────────────────────

/**
 * Initialise le client OAuth2 via Google Identity Services.
 * À appeler après que la librairie GIS soit chargée (callback onload ou setTimeout).
 */
function gdInit() {
  if (!gdIsConfigured()) {
    gdUpdateUI("unconfigured");
    return;
  }

  if (typeof google === "undefined" || !google?.accounts?.oauth2) {
    // GIS pas encore chargé — réessayer dans 500 ms
    setTimeout(gdInit, 500);
    return;
  }

  _gdState.tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: _gdState.settings.client_id,
    scope:     _GD_SCOPE,
    callback:  _gdOnToken,
  });

  gdUpdateUI("ready");
}

function _gdOnToken(resp) {
  if (resp.error) {
    const err = new Error(`Authentification Google échouée : ${resp.error}`);
    if (_gdState.pendingReject) _gdState.pendingReject(err);
    _gdState.pendingResolve = null;
    _gdState.pendingReject  = null;
    gdUpdateUI("error", resp.error);
    return;
  }
  _gdState.token = {
    access_token: resp.access_token,
    expires_at:   Date.now() + Math.max(0, (resp.expires_in ?? 3600) - 60) * 1000,
  };
  if (_gdState.pendingResolve) _gdState.pendingResolve(resp.access_token);
  _gdState.pendingResolve = null;
  _gdState.pendingReject  = null;
  gdUpdateUI("connected");
}

// ── Token ─────────────────────────────────────────────────────────────────────

function _gdEnsureToken() {
  // Token encore valide ?
  if (_gdState.token && Date.now() < _gdState.token.expires_at) {
    return Promise.resolve(_gdState.token.access_token);
  }
  if (!_gdState.tokenClient) {
    return Promise.reject(new Error("GIS non initialisé. Rechargez la page."));
  }
  return new Promise((resolve, reject) => {
    _gdState.pendingResolve = resolve;
    _gdState.pendingReject  = reject;
    // prompt: "" pour ne pas afficher le sélecteur de compte si déjà connecté
    _gdState.tokenClient.requestAccessToken({ prompt: "" });
  });
}

// ── Upload ────────────────────────────────────────────────────────────────────

/**
 * Sérialise le classeur SheetJS, l'uploade sur Drive et configure le partage.
 *
 * @param {object} wb       - Classeur SheetJS (objet retourné par buildOrganisationWorkbook)
 * @param {string} filename - Nom du fichier (ex: "organisation_matchs_2026-04-14.xlsx")
 * @returns {Promise<{ id: string, url: string, name: string }>}
 */
async function gdUploadWorkbook(wb, filename) {
  if (!gdIsConfigured()) throw new Error("Google Drive non configuré (client_id manquant).");

  gdUpdateUI("uploading");

  const token = await _gdEnsureToken();

  // ── 1. Sérialisation XLSX → ArrayBuffer ──────────────────────────────────
  const xlsxData = XLSX.write(wb, { bookType: "xlsx", type: "array", cellStyles: true });
  const fileBlob = new Blob(
    [xlsxData],
    { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
  );

  // ── 2. Métadonnées Drive ──────────────────────────────────────────────────
  const meta = { name: filename };
  if (_gdState.settings.target_folder_id?.trim()) {
    meta.parents = [_gdState.settings.target_folder_id.trim()];
  }

  // ── 3. Upload multipart ───────────────────────────────────────────────────
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(meta)], { type: "application/json" }));
  form.append("file", fileBlob, filename);

  const uploadResp = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files" +
    "?uploadType=multipart&fields=id%2Cname%2CwebViewLink",
    {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}` },
      body:    form,
    }
  );

  if (!uploadResp.ok) {
    const err = await uploadResp.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `Upload Drive échoué (HTTP ${uploadResp.status})`);
  }

  const fileInfo = await uploadResp.json();

  // ── 4. Partage ────────────────────────────────────────────────────────────
  const role = _gdState.settings.share_role || "writer";
  const type = _gdState.settings.share_type || "anyone";

  const permResp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileInfo.id}/permissions`,
    {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ role, type }),
    }
  );

  if (!permResp.ok) {
    console.warn("[gdrive] Permissions non appliquées :", await permResp.text().catch(() => ""));
  }

  // ── 5. Récupérer le lien de partage (webViewLink) ─────────────────────────
  const infoResp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileInfo.id}` +
    "?fields=id%2Cname%2CwebViewLink",
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const info = infoResp.ok ? await infoResp.json() : fileInfo;
  const url  = info.webViewLink ?? `https://drive.google.com/file/d/${info.id}/view`;

  gdUpdateUI("done", { url, name: info.name ?? filename });
  return { id: info.id, url, name: info.name ?? filename };
}

// ── UI ────────────────────────────────────────────────────────────────────────

function gdUpdateUI(status, data) {
  const statusEl  = document.getElementById("gd-status");
  const uploadBtn = document.getElementById("btn-upload-drive");

  if (uploadBtn) {
    uploadBtn.disabled = !["ready", "connected", "done", "error"].includes(status)
                         || !gdIsConfigured();
  }

  if (!statusEl) return;

  const s = {
    unconfigured: ["⚙ Non configuré — renseigner client_id dans google.drive.settings.json", "gd-warn"],
    ready:        ["🔑 Non connecté — cliquez sur « Envoyer » pour vous authentifier",        "gd-ready"],
    connected:    ["✓ Connecté à Google Drive",                                               "gd-ok"],
    uploading:    ["⬆ Upload en cours…",                                                      "gd-uploading"],
    done:         [null,                                                                        "gd-ok"],
    error:        [`✗ Erreur : ${data}`,                                                       "gd-err"],
  }[status];

  if (!s) return;

  if (status === "done") {
    statusEl.innerHTML =
      `✓ Partagé sur Drive — <a href="${data.url}" target="_blank" rel="noopener noreferrer">${data.name}</a>`;
  } else {
    statusEl.textContent = s[0];
  }

  statusEl.className = `gd-status ${s[1]}`;
}
