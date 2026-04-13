/**
 * app.js
 * Contrôleur principal de l'interface Basket Club Tool (version Web).
 *
 * Responsabilités :
 *   - Drag-and-drop / sélection du fichier Excel
 *   - Orchestration de la génération Canvas (local, hors-ligne)
 *   - Journal (log)
 */

// ── Mise en page ──────────────────────────────────────────────────────────────

// "paysage" ou "portrait"
let _localLayout = undefined;

// Fichier de fond sélectionné (null = aucun)
let _selectedBg = null;

function setLocalLayout(layout) {
  _localLayout = layout;
  document.getElementById("btn-layout-paysage") .classList.toggle("active", layout === "paysage");
  document.getElementById("btn-layout-portrait").classList.toggle("active", layout === "portrait");
}

function _buildBgPicker() {
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
      _selectedBg = bg.file;
      container.querySelectorAll(".bg-option").forEach(el => el.classList.remove("active"));
      btn.classList.add("active");
    });
    container.appendChild(btn);
  });
}

// ── Journal ───────────────────────────────────────────────────────────────────

const _logEl = document.getElementById("log");

function log(msg, type = "info") {
  const div  = document.createElement("div");
  const time = new Date().toLocaleTimeString("fr-FR");
  div.className   = `log-${type}`;
  div.textContent = `[${time}] ${msg}`;
  _logEl.appendChild(div);
  _logEl.scrollTop = _logEl.scrollHeight;
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

  zone.addEventListener("dragover",  e => { e.preventDefault(); zone.classList.add("over"); });
  zone.addEventListener("dragleave", e => { e.preventDefault(); zone.classList.remove("over"); });
  zone.addEventListener("drop", e => {
    e.preventDefault();
    zone.classList.remove("over");
    setFile(e.dataTransfer.files?.[0]);
  });
  input.addEventListener("change", () => setFile(input.files?.[0]));
}

function _updateGenerateButton() {
  const btn    = document.getElementById("btn-generate");
  const hintEl = document.getElementById("generate-hint");
  btn.disabled       = !_selectedFile;
  hintEl.textContent = _selectedFile
    ? "Tout est prêt \u2014 clique pour générer."
    : "Sélectionne le fichier ProchainesRencontres.xlsx.";
}

// ── Génération ────────────────────────────────────────────────────────────────

async function handleGenerate() {
  if (!_selectedFile) { log("Aucun fichier sélectionné.", "err"); return; }

  const btn = document.getElementById("btn-generate");
  btn.disabled = true;
  document.getElementById("result-area").classList.add("hidden");

  try {
    // 1. Parse Excel
    log("Lecture du fichier Excel\u2026", "info");
    const { domicileList, exterieurList, weekLabel, exemptList } = await loadPlanningData(_selectedFile);
    log(
      `${domicileList.length} match(s) domicile \u00b7 ${exterieurList.length} extérieur \u00b7 ${exemptList.length} exempt(s) \u00b7 ${weekLabel}`,
      "ok"
    );

    if (domicileList.length + exterieurList.length === 0) {
      log("Aucun match trouvé pour ABP dans ce fichier. Vérifie le contenu.", "warn");
      return;
    }

    // 2. Génération Canvas
    const isPortrait = _localLayout === "portrait";
    log(`Génération Canvas \u2014 ${isPortrait ? "Portrait" : "Paysage"}\u2026`, "info");
    const blob = isPortrait
      ? await generatePlanningImageLocalPortrait(domicileList, exterieurList, weekLabel, exemptList, _selectedBg)
      : await generatePlanningImageLocal(domicileList, exterieurList, weekLabel, exemptList, _selectedBg);

    // 3. Affichage du résultat
    const blobUrl    = URL.createObjectURL(blob);
    const resultArea = document.getElementById("result-area");

    document.getElementById("result-img").src  = blobUrl;
    const dlBtn        = document.getElementById("btn-download");
    dlBtn.href         = blobUrl;
    dlBtn.download     = `affiche_planning_${new Date().toISOString().slice(0, 10)}.png`;

    resultArea.classList.remove("hidden");
    resultArea.scrollIntoView({ behavior: "smooth" });
    log("Affiche générée avec succès !", "ok");

  } catch (err) {
    log(`Erreur : ${err.message || String(err)}`, "err");
    console.error("Erreur génération affiche planning :", err);
  } finally {
    btn.disabled = !_selectedFile;
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

function init() {
  _setupFileHandling();
  _buildBgPicker();
  document.getElementById("btn-generate")     .addEventListener("click", handleGenerate);
  document.getElementById("btn-layout-paysage") .addEventListener("click", () => setLocalLayout("paysage"));
  document.getElementById("btn-layout-portrait").addEventListener("click", () => setLocalLayout("portrait"));

  setLocalLayout("portrait");
  _updateGenerateButton();
  log("Application prête.", "info");
}

init();
