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

// Mode de generation : "local" (canvas) ou "slides" (Google Slides API)
let _genMode = "local";

/**
 * Lit la configuration Google directement depuis les fichiers du projet.
 * Ne stocke rien dans localStorage.
 * Retourne { clientId, templatePlanningId, driveFolderId }.
 */
async function _loadGoogleConfig() {
  const cfg = { clientId: "", templatePlanningId: "", driveFolderId: "" };
  try {
    const resp = await fetch("../config/settings.json");
    if (resp.ok) {
      const json = await resp.json();
      cfg.templatePlanningId = json.template_planning_id || "";
      cfg.driveFolderId      = json.drive_folder_id      || "";
    }
  } catch (_) {}
  try {
    const resp = await fetch("../config/credentials.json");
    if (resp.ok) {
      const creds = await resp.json();
      cfg.clientId = creds.web?.client_id || creds.installed?.client_id || "";
    }
  } catch (_) {}
  return cfg;
}

// ── Mode de génération ────────────────────────────────────────────────

function setGenMode(mode) {
  _genMode = mode;
  document.getElementById("btn-mode-local") .classList.toggle("active", mode === "local");
  document.getElementById("btn-mode-slides").classList.toggle("active", mode === "slides");
  document.getElementById("section-auth")   .classList.toggle("hidden", mode === "local");
  document.getElementById("mode-desc-local") .classList.toggle("hidden", mode !== "local");
  document.getElementById("mode-desc-slides").classList.toggle("hidden", mode !== "slides");
  _updateGenerateButton();
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

async function requestAuth() {
  const cfg = await _loadGoogleConfig();
  if (!cfg.clientId) {
    log(
      "Client ID Google introuvable dans config/credentials.json.",
      "err"
    );
    return;
  }
  if (!_tokenClient) _initTokenClient(cfg.clientId);
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

function _hasTeamsConfig() {
  return !!localStorage.getItem("bct_teams");
}

function _updateGenerateButton() {
  const btn    = document.getElementById("btn-generate");
  const hintEl = document.getElementById("generate-hint");

  const needsGoogle = _genMode === "slides";
  const authOk      = !needsGoogle || _isAuthenticated();
  const teamsOk     = _hasTeamsConfig();
  const ready       = !!_selectedFile && authOk && teamsOk;

  btn.disabled = !ready;

  if (!teamsOk) {
    hintEl.innerHTML = 'Configuration équipes manquante. <a href="config.html">Importer teams.json →</a>';
  } else if (!_selectedFile && needsGoogle && !_isAuthenticated()) {
    hintEl.textContent = "Connexion Google et fichier Excel requis.";
  } else if (needsGoogle && !_isAuthenticated()) {
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
  if (_genMode === "slides" && !_isAuthenticated()) { log("Non connecté à Google.", "err"); return; }

  const btn = document.getElementById("btn-generate");
  btn.disabled = true;
  document.getElementById("result-area").classList.add("hidden");

  try {
    // ── 1. Parse Excel ──
    log("Lecture du fichier Excel…", "info");
    const { domicileList, exterieurList, weekLabel, exemptList } = await loadPlanningData(_selectedFile);
    log(
      `${domicileList.length} match(s) domicile · ${exterieurList.length} extérieur · ${exemptList.length} exempt(s) · ${weekLabel}`,
      "ok"
    );

    if (domicileList.length + exterieurList.length === 0) {
      log(
        "Aucun match trouvé pour ABP dans ce fichier. Vérifie le contenu.",
        "warn"
      );
      return;
    }

    // ── 2. Génération de l'affiche ──
    let blob, driveUrl = null;

    if (_genMode === "local") {
      log("Génération locale (Canvas)…", "info");
      blob = await generatePlanningImageLocal(domicileList, exterieurList, weekLabel, exemptList);
      log("Affiche générée localement.", "ok");
    } else {
      const config = await _loadGoogleConfig();
      const result = await generatePlanningImage(
        domicileList, exterieurList, weekLabel, config, log
      );
      blob     = result.blob;
      driveUrl = result.driveUrl;
    }

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
    const authOk = _genMode === "local" || _isAuthenticated();
    btn.disabled = !(_selectedFile && authOk);
  }
}

// ── Modale Paramètres ─────────────────────────────────────────────────────────

async function init() {
  const cfg = await _loadGoogleConfig();

  if (cfg.clientId) {
    const waitForGIS = (resolve) => {
      if (typeof google !== "undefined") resolve();
      else setTimeout(() => waitForGIS(resolve), 100);
    };
    await new Promise(waitForGIS);
    _initTokenClient(cfg.clientId);
  }

  _setupFileHandling();
  document.getElementById("btn-auth")        .addEventListener("click", requestAuth);
  document.getElementById("btn-generate")    .addEventListener("click", handleGenerate);
  document.getElementById("btn-mode-local")  .addEventListener("click", () => setGenMode("local"));
  document.getElementById("btn-mode-slides") .addEventListener("click", () => setGenMode("slides"));

  setGenMode("local");
  log("Application pr\u00eate.", "info");

  if (!_hasTeamsConfig()) {
    log(
      "\u26a0 Configuration \u00e9quipes non charg\u00e9e \u2014 va dans \ud83d\udccb \u00c9quipes & Divisions et importe ton fichier teams.json.",
      "warn"
    );
  }
  if (!cfg.clientId) {
    log(
      "\u26a0 Mode Google Slides : credentials.json introuvable ou sans client_id (mode local non affect\u00e9).",
      "warn"
    );
  }
}

init();
