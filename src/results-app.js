/**
 * results-app.js
 * Contrôleur de la page Résultats (resultats.html).
 * Dépend de : transform.js, local-render.js (BACKGROUNDS, _loadImg…),
 *             results-transform.js, results-render.js
 */

// ── État ──────────────────────────────────────────────────────────────────────

let _resultsFile = null;
let _resultsBg   = null;  // chemin de fond sélectionné (null = aucun)

// ── Sponsors ──────────────────────────────────────────────────────────────

const _SP_JSON_PATH   = "config/sponsors.json";
const _SP_STORAGE_KEY = "bct_sponsors";

const _sp = { items: [], next: 0, sha: null };

function _spClamp() {
  const len = _sp.items.length;
  if (len === 0) { _sp.next = 0; return; }
  _sp.next = ((_sp.next % len) + len) % len;
}

async function _loadSponsors() {
  // Priorité au fichier statique (toujours à jour sur GitHub Pages)
  try {
    const resp = await fetch(_SP_JSON_PATH + "?_=" + Date.now());
    if (resp.ok) {
      const data  = await resp.json();
      _sp.items   = Array.isArray(data.sponsors) ? data.sponsors : [];
      _sp.next    = typeof data.next === "number" ? data.next : 0;
      localStorage.setItem(_SP_STORAGE_KEY, JSON.stringify({ sponsors: _sp.items, next: _sp.next }));
      _spClamp();
      return;
    }
  } catch (_) {}
  // Fallback : cache localStorage
  try {
    const stored = localStorage.getItem(_SP_STORAGE_KEY);
    if (stored) {
      const p = JSON.parse(stored);
      _sp.items = Array.isArray(p.sponsors) ? p.sponsors : [];
      _sp.next  = typeof p.next === "number" ? p.next : 0;
      _spClamp();
    }
  } catch (_) {}
}

async function _advanceSponsor() {
  const len = _sp.items.length;
  if (len === 0) return;
  _sp.next = (_sp.next + 1) % len;
  const payload = { sponsors: _sp.items, next: _sp.next };
  localStorage.setItem(_SP_STORAGE_KEY, JSON.stringify(payload));
  // Commit GitHub si token disponible
  if (typeof ghToken === "function" && ghToken()) {
    try {
      if (!_sp.sha) {
        const { sha } = await ghReadJsonFile(_SP_JSON_PATH);
        _sp.sha = sha;
      }
      _sp.sha = await ghWriteJsonFile(
        _SP_JSON_PATH, payload, _sp.sha,
        `Sponsor next: ${_sp.next} [auto]`
      );
    } catch (err) {
      console.warn("[results-app] Sauvegarde GitHub sponsors échouée :", err.message);
    }
  }
}

function _updateSponsorInfo() {
  const el = document.getElementById("sponsor-next-info");
  if (!el) return;
  if (_sp.items.length === 0) {
    el.textContent = "Aucun sponsor configuré";
    el.className   = "sponsor-next-info sponsor-next-empty";
  } else {
    const sp = _sp.items[_sp.next];
    el.textContent = sp ? `🤝  ${sp.label}  (${_sp.next + 1}\xA0/\xA0${_sp.items.length})` : "";
    el.className   = "sponsor-next-info";
  }
}

// ── Journal ───────────────────────────────────────────────────────────────────

const _rLogEl = document.getElementById("log");

function rLog(msg, type = "info") {
  const div  = document.createElement("div");
  const time = new Date().toLocaleTimeString("fr-FR");
  div.className   = `log-${type}`;
  div.textContent = `[${time}] ${msg}`;
  _rLogEl.appendChild(div);
  _rLogEl.scrollTop = _rLogEl.scrollHeight;
}

// ── Sélecteur de fond ─────────────────────────────────────────────────────────

function _buildResultsBgPicker() {
  _buildBgDropdown("bg-picker", file => { _resultsBg = file; });
}

// ── Sélection du fichier ──────────────────────────────────────────────────────

function _setupResultsFileHandling() {
  const zone       = document.getElementById("drop-zone");
  const input      = document.getElementById("file-input");
  const fileNameEl = document.getElementById("file-name");

  function setFile(file) {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["xlsx", "xls"].includes(ext)) {
      rLog(`Fichier ignoré : extension .${ext} non supportée.`, "err");
      return;
    }
    _resultsFile = file;
    fileNameEl.textContent = `\u2713  ${file.name}`;
    zone.classList.add("has-file");
    rLog(`Fichier sélectionné : ${file.name}`, "ok");
    _updateResultsButton();
  }

  zone.addEventListener("dragover",  e => { e.preventDefault(); zone.classList.add("over"); });
  zone.addEventListener("dragleave", e => { e.preventDefault(); zone.classList.remove("over"); });
  zone.addEventListener("drop", e => {
    e.preventDefault();
    zone.classList.remove("over");
    setFile(e.dataTransfer.files?.[0]);
  });
  input.addEventListener("change", () => setFile(input.files?.[0]));
}

function _updateResultsButton() {
  const btn    = document.getElementById("btn-generate");
  const hintEl = document.getElementById("generate-hint");
  btn.disabled       = !_resultsFile;
  hintEl.textContent = _resultsFile
    ? "Tout est pr\u00eat \u2014 clique pour g\u00e9n\u00e9rer."
    : "S\u00e9lectionne le fichier Excel des r\u00e9sultats.";
}

// ── Génération ────────────────────────────────────────────────────────────────

async function handleResultsGenerate() {
  if (!_resultsFile) { rLog("Aucun fichier sélectionné.", "err"); return; }

  const btn = document.getElementById("btn-generate");
  btn.disabled = true;
  document.getElementById("result-area").classList.add("hidden");

  try {
    rLog("Lecture du fichier Excel\u2026", "info");
    const { matchList, weekLabel } = await loadResultsData(_resultsFile);
    rLog(`${matchList.length} résultat(s) trouvé(s) \u00b7 ${weekLabel}`, "ok");

    if (matchList.length === 0) {
      rLog("Aucun résultat trouvé pour ABP dans ce fichier. Vérifie le contenu.", "warn");
      return;
    }

    const sponsorPath = _sp.items.length > 0 ? (_sp.items[_sp.next]?.file ?? null) : null;
    rLog(`Sponsor : ${sponsorPath ? _sp.items[_sp.next].label : "(aucun)"}`, "info");
    rLog("Génération de l'affiche résultats…", "info");
    const blob = await generateResultsImage(matchList, weekLabel, _resultsBg, sponsorPath);

    const blobUrl    = URL.createObjectURL(blob);
    const resultArea = document.getElementById("result-area");

    document.getElementById("result-img").src = blobUrl;
    const dlBtn    = document.getElementById("btn-download");
    dlBtn.href     = blobUrl;
    dlBtn.download = `affiche_resultats_${new Date().toISOString().slice(0, 10)}.png`;

    resultArea.classList.remove("hidden");
    resultArea.scrollIntoView({ behavior: "smooth" });
    rLog("Affiche générée avec succès !", "ok");

    // Avancer au prochain sponsor
    await _advanceSponsor();
    _updateSponsorInfo();
    rLog(`Prochain sponsor : ${_sp.items[_sp.next]?.label ?? "(aucun)"}`, "info");

  } catch (err) {
    rLog(`Erreur : ${err.message || String(err)}`, "err");
    console.error("Erreur génération affiche résultats :", err);
  } finally {
    btn.disabled = !_resultsFile;
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function initResults() {
  await _loadBackgrounds();
  await _loadSponsors();
  _setupResultsFileHandling();
  _buildResultsBgPicker();
  _updateSponsorInfo();
  document.getElementById("btn-generate").addEventListener("click", handleResultsGenerate);
  _updateResultsButton();
  rLog("Application prête.", "info");
}

initResults();
