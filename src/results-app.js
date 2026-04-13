/**
 * results-app.js
 * Contrôleur de la page Résultats (resultats.html).
 * Dépend de : transform.js, local-render.js (BACKGROUNDS, _loadImg…),
 *             results-transform.js, results-render.js
 */

// ── État ──────────────────────────────────────────────────────────────────────

let _resultsFile = null;
let _resultsBg   = null;  // chemin de fond sélectionné (null = aucun)

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
  const container = document.getElementById("bg-picker");
  BACKGROUNDS.forEach((bg, i) => {
    const btn = document.createElement("button");
    btn.className = "bg-option" + (i === 0 ? " active" : "");
    btn.title     = bg.label;
    btn.type      = "button";

    const thumb = document.createElement("div");
    thumb.className = "bg-thumb";
    if (bg.file) thumb.style.backgroundImage = `url('${bg.file}')`;

    const label = document.createElement("span");
    label.className   = "bg-label";
    label.textContent = bg.label;

    btn.appendChild(thumb);
    btn.appendChild(label);
    btn.addEventListener("click", () => {
      _resultsBg = bg.file;
      container.querySelectorAll(".bg-option").forEach(el => el.classList.remove("active"));
      btn.classList.add("active");
    });
    container.appendChild(btn);
  });
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

    const sponsor = document.getElementById("sponsor-input")?.value?.trim() || "";
    rLog("Génération de l'affiche résultats\u2026", "info");
    const blob = await generateResultsImage(matchList, weekLabel, _resultsBg, sponsor);

    const blobUrl    = URL.createObjectURL(blob);
    const resultArea = document.getElementById("result-area");

    document.getElementById("result-img").src = blobUrl;
    const dlBtn    = document.getElementById("btn-download");
    dlBtn.href     = blobUrl;
    dlBtn.download = `affiche_resultats_${new Date().toISOString().slice(0, 10)}.png`;

    resultArea.classList.remove("hidden");
    resultArea.scrollIntoView({ behavior: "smooth" });
    rLog("Affiche générée avec succès !", "ok");

  } catch (err) {
    rLog(`Erreur : ${err.message || String(err)}`, "err");
    console.error("Erreur génération affiche résultats :", err);
  } finally {
    btn.disabled = !_resultsFile;
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

function initResults() {
  _setupResultsFileHandling();
  _buildResultsBgPicker();
  document.getElementById("btn-generate").addEventListener("click", handleResultsGenerate);
  _updateResultsButton();
  rLog("Application prête.", "info");
}

initResults();
