/**
 * app.js
 * Contrôleur principal de l'interface Basket Club Tool (version Web).
 *
 * Responsabilités :
 *   - Gestion de la configuration (localStorage)
 *   - OAuth Google via Google Identity Services (GIS)
 *   - Drag-and-drop / sélection du fichier Excel
 *   - Orchestration de la génération (transform → slides)
 *   - Journal (log)
 *   - Modale Paramètres
 */

// ── Configuration ────────────────────────────────────────────────────────────

const CONFIG_KEYS = ["clientId", "templatePlanningId", "driveFolderId"];

function loadConfig() {
  return Object.fromEntries(
    CONFIG_KEYS.map(k => [k, localStorage.getItem(`bct_${k}`) || ""])
  );
}

function saveConfig(cfg) {
  CONFIG_KEYS.forEach(k => localStorage.setItem(`bct_${k}`, cfg[k] || ""));
}

/**
 * Tente de pré-remplir la configuration depuis les fichiers JSON existants du projet.
 * Ne survient que si le serveur est lancé depuis la racine du projet.
 */
async function tryAutoLoadConfig() {
  const cfg = loadConfig();
  let changed = false;

  try {
    const resp = await fetch("../config/settings.json");
    if (resp.ok) {
      const json = await resp.json();
      if (!cfg.templatePlanningId && json.template_planning_id) {
        cfg.templatePlanningId = json.template_planning_id;
        changed = true;
      }
      if (!cfg.driveFolderId && json.drive_folder_id) {
        cfg.driveFolderId = json.drive_folder_id;
        changed = true;
      }
    }
  } catch (_) {}

  // Tente de lire le client_id depuis credentials.json (Desktop ou Web app)
  if (!cfg.clientId) {
    try {
      const resp = await fetch("../config/credentials.json");
      if (resp.ok) {
        const creds = await resp.json();
        const clientId =
          creds.web?.client_id ||
          creds.installed?.client_id ||
          "";
        if (clientId) {
          cfg.clientId = clientId;
          changed = true;
        }
      }
    } catch (_) {}
  }

  if (changed) saveConfig(cfg);
}

// ── Journal ──────────────────────────────────────────────────────────────────

const _logEl = document.getElementById("log");

function log(msg, type = "info") {
  const div  = document.createElement("div");
  const time = new Date().toLocaleTimeString("fr-FR");
  div.className   = `log-${type}`;
  div.textContent = `[${time}] ${msg}`;
  _logEl.appendChild(div);
  _logEl.scrollTop = _logEl.scrollHeight;
}

// ── OAuth Google (Google Identity Services) ───────────────────────────────────

window.googleAccessToken = null;
let _tokenClient         = null;
let _tokenExpiry         = 0;   // timestamp (ms) d'expiration du token

function _isAuthenticated() {
  return window.googleAccessToken && Date.now() < _tokenExpiry;
}

function _initTokenClient(clientId) {
  _tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/presentations",
    ].join(" "),
    callback: _handleTokenResponse,
  });
}

function _handleTokenResponse(tokenResponse) {
  if (tokenResponse.error) {
    log(`Erreur d'authentification : ${tokenResponse.error_description || tokenResponse.error}`, "err");
    _updateAuthUI(false);
    return;
  }
  window.googleAccessToken = tokenResponse.access_token;
  // Les tokens GIS sont valides 3600 s — on prend une marge de 60 s
  _tokenExpiry = Date.now() + ((tokenResponse.expires_in || 3600) - 60) * 1000;
  log("Authentification Google réussie. ✓", "ok");
  _updateAuthUI(true);
}

function _updateAuthUI(ok) {
  const statusEl = document.getElementById("auth-status");
  const btnAuth  = document.getElementById("btn-auth");

  if (ok) {
    statusEl.textContent = "✓ Connecté à Google";
    statusEl.className   = "status ok";
    btnAuth.textContent  = "Se reconnecter";
  } else {
    statusEl.textContent = "";
    statusEl.className   = "status";
    btnAuth.textContent  = "Se connecter avec Google";
  }
  _updateGenerateButton();
}

function requestAuth() {
  const cfg = loadConfig();
  if (!cfg.clientId) {
    log(
      "Client ID Google manquant. Ouvre les paramètres ⚙ et renseigne-le.",
      "err"
    );
    return;
  }
  if (!_tokenClient) _initTokenClient(cfg.clientId);
  // prompt: "" → réutilise la session si possible, sinon demande la connexion
  _tokenClient.requestAccessToken({ prompt: "" });
}

// ── Sélection du fichier ──────────────────────────────────────────────────────

let _selectedFile = null;

function _setupFileHandling() {
  const zone       = document.getElementById("drop-zone");
  const input      = document.getElementById("file-input");
  const fileNameEl = document.getElementById("file-name");

  function setFile(file) {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["xlsx", "xls"].includes(ext)) {
      log(`Fichier ignoré : extension .${ext} non supportée. Utilise un fichier .xlsx`, "err");
      return;
    }
    _selectedFile = file;
    fileNameEl.textContent = `✓  ${file.name}`;
    zone.classList.add("has-file");
    log(`Fichier sélectionné : ${file.name}`, "ok");
    _updateGenerateButton();
  }

  zone.addEventListener("dragover", e => {
    e.preventDefault();
    zone.classList.add("over");
  });
  zone.addEventListener("dragleave", e => {
    e.preventDefault();
    zone.classList.remove("over");
  });
  zone.addEventListener("drop", e => {
    e.preventDefault();
    zone.classList.remove("over");
    setFile(e.dataTransfer.files?.[0]);
  });

  input.addEventListener("change", () => setFile(input.files?.[0]));
}

function _updateGenerateButton() {
  const btn     = document.getElementById("btn-generate");
  const hintEl  = document.getElementById("generate-hint");
  const ready   = _selectedFile && _isAuthenticated();

  btn.disabled = !ready;

  if (!_selectedFile && !_isAuthenticated()) {
    hintEl.textContent = "Connexion Google et fichier Excel requis.";
  } else if (!_isAuthenticated()) {
    hintEl.textContent = "Connexion Google requise.";
  } else if (!_selectedFile) {
    hintEl.textContent = "Sélectionne le fichier ProchainesRencontres.xlsx.";
  } else {
    hintEl.textContent = "Tout est prêt — clique pour générer.";
  }
}

// ── Génération ────────────────────────────────────────────────────────────────

async function handleGenerate() {
  if (!_selectedFile) { log("Aucun fichier sélectionné.", "err"); return; }
  if (!_isAuthenticated()) { log("Non connecté à Google.", "err"); return; }

  const btn = document.getElementById("btn-generate");
  btn.disabled = true;
  document.getElementById("result-area").classList.add("hidden");

  try {
    // ── 1. Parse Excel ──
    log("Lecture du fichier Excel…", "info");
    const { domicileList, exterieurList, weekLabel } = await loadPlanningData(_selectedFile);
    log(
      `${domicileList.length} match(s) domicile · ${exterieurList.length} extérieur · ${weekLabel}`,
      "ok"
    );

    if (domicileList.length + exterieurList.length === 0) {
      log(
        "Aucun match trouvé pour ABP dans ce fichier. Vérifie le contenu.",
        "warn"
      );
      return;
    }

    // ── 2. Génération affiche via Slides API ──
    const config = loadConfig();
    const { blob, driveUrl } = await generatePlanningImage(
      domicileList,
      exterieurList,
      weekLabel,
      config,
      log
    );

    // ── 3. Affichage du résultat ──
    const blobUrl    = URL.createObjectURL(blob);
    const imgEl      = document.getElementById("result-img");
    const dlBtn      = document.getElementById("btn-download");
    const driveBtn   = document.getElementById("btn-drive");
    const resultArea = document.getElementById("result-area");

    imgEl.src     = blobUrl;
    dlBtn.href    = blobUrl;
    dlBtn.download = `affiche_planning_${new Date().toISOString().slice(0, 10)}.png`;

    if (driveUrl) {
      driveBtn.href = driveUrl;
      driveBtn.classList.remove("hidden");
    } else {
      driveBtn.classList.add("hidden");
    }

    resultArea.classList.remove("hidden");
    resultArea.scrollIntoView({ behavior: "smooth" });
    log("Affiche générée avec succès !", "ok");

  } catch (err) {
    log(`Erreur : ${err.message || String(err)}`, "err");
    console.error("Erreur génération affiche planning :", err);
  } finally {
    btn.disabled = !(_selectedFile && _isAuthenticated());
  }
}

// ── Modale Paramètres ─────────────────────────────────────────────────────────

function openSettings() {
  const cfg = loadConfig();
  document.getElementById("cfg-client-id").value         = cfg.clientId || "";
  document.getElementById("cfg-template-planning").value = cfg.templatePlanningId || "";
  document.getElementById("cfg-drive-folder").value      = cfg.driveFolderId || "";
  document.getElementById("modal-settings").classList.remove("hidden");
  document.getElementById("cfg-client-id").focus();
}

function closeSettings() {
  document.getElementById("modal-settings").classList.add("hidden");
}

function saveSettings() {
  const newCfg = {
    clientId:           document.getElementById("cfg-client-id").value.trim(),
    templatePlanningId: document.getElementById("cfg-template-planning").value.trim(),
    driveFolderId:      document.getElementById("cfg-drive-folder").value.trim(),
  };
  saveConfig(newCfg);

  // Réinitialise le tokenClient si le clientId a changé
  _tokenClient = null;
  if (newCfg.clientId) _initTokenClient(newCfg.clientId);

  closeSettings();
  log("Paramètres enregistrés.", "ok");
}

// ── Initialisation ────────────────────────────────────────────────────────────

async function init() {
  // 1. Pré-chargement depuis les fichiers JSON du projet
  await tryAutoLoadConfig();

  const cfg = loadConfig();

  // 2. Initialisation auth si clientId disponible
  if (cfg.clientId) {
    // GIS se charge de manière asynchrone (async defer) — on attend sa disponibilité
    const waitForGIS = (resolve) => {
      if (typeof google !== "undefined") {
        resolve();
      } else {
        setTimeout(() => waitForGIS(resolve), 100);
      }
    };
    await new Promise(waitForGIS);
    _initTokenClient(cfg.clientId);
  }

  // 3. Mise en place des listeners
  _setupFileHandling();
  document.getElementById("btn-auth").addEventListener("click", requestAuth);
  document.getElementById("btn-generate").addEventListener("click", handleGenerate);
  document.getElementById("btn-settings").addEventListener("click", openSettings);
  document.getElementById("btn-settings-save").addEventListener("click", saveSettings);
  document.getElementById("btn-settings-cancel").addEventListener("click", closeSettings);

  // Fermeture modale en cliquant sur l'overlay
  document.getElementById("modal-settings").addEventListener("click", e => {
    if (e.target === e.currentTarget) closeSettings();
  });

  // Fermeture modale avec Escape
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeSettings();
  });

  // 4. État initial
  _updateGenerateButton();
  log("Application prête.", "info");

  if (!cfg.clientId) {
    log(
      "⚠ Client ID Google non configuré. Ouvre les paramètres ⚙ pour le renseigner.",
      "warn"
    );
  }
  if (!cfg.templatePlanningId) {
    log(
      "⚠ ID du template Slides non configuré. Ouvre les paramètres ⚙.",
      "warn"
    );
  }
}

init();
