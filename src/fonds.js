/**
 * fonds.js
 * Gestion des fonds d'affiche (config/backgrounds.json + images dans ressources/fonds/).
 *
 * Dépend de : github-api.js (ghToken, ghReadJsonFile, ghWriteJsonFile, ghUploadFile)
 * Intégré dans config.html — le token UI et le toast sont fournis par config.js.
 * Point d'entrée : initFonds() appelé depuis config.js.
 */

const BG_STORAGE_KEY = "bct_backgrounds";
const BG_JSON_PATH   = "config/backgrounds.json";
const BG_IMG_DIR     = "ressources/fonds/";

const bgState = {
  bgs: [],    // [{ label, file }, …]
  sha: null,  // SHA du blob backgrounds.json sur GitHub
};

// ── Bouton « Ajouter » : état selon token ─────────────────────────────────────

function updateBgAddBtn() {
  const btn = document.getElementById("btn-add-bg");
  if (!btn) return;
  const ok = !!ghToken();
  btn.disabled = !ok;
  btn.title    = ok ? "Ajouter un fond" : "Token GitHub requis pour uploader des images";
}

// ── Chargement ────────────────────────────────────────────────────────────────

async function bgLoad() {
  // 1. GitHub (source de vérité + SHA)
  if (ghToken()) {
    try {
      const { data, sha } = await ghReadJsonFile(BG_JSON_PATH);
      bgState.sha = sha;
      localStorage.setItem(BG_STORAGE_KEY, JSON.stringify(data));
      return data;
    } catch (e) {
      console.warn("[fonds] Lecture GitHub échouée, fallback local :", e.message);
    }
  }
  // 2. Cache localStorage
  const stored = localStorage.getItem(BG_STORAGE_KEY);
  if (stored) {
    try { return JSON.parse(stored); } catch (_) {}
  }
  // 3. Fichier statique du dépôt
  try {
    const resp = await fetch(BG_JSON_PATH);
    if (resp.ok) return resp.json();
  } catch (_) {}
  return [];
}

// ── Sauvegarde ────────────────────────────────────────────────────────────────

async function bgSave() {
  localStorage.setItem(BG_STORAGE_KEY, JSON.stringify(bgState.bgs));

  if (ghToken()) {
    if (!bgState.sha) {
      try {
        const { sha } = await ghReadJsonFile(BG_JSON_PATH);
        bgState.sha = sha;
      } catch (_) {}
    }
    bgState.sha = await ghWriteJsonFile(
      BG_JSON_PATH,
      bgState.bgs,
      bgState.sha,
      `Mise a jour backgrounds.json [${new Date().toLocaleDateString("fr-FR")}]`
    );
  }
}

// ── Rendu ─────────────────────────────────────────────────────────────────────

function renderBgGrid() {
  const grid    = document.getElementById("bg-grid");
  const countEl = document.getElementById("bg-count");
  grid.innerHTML = "";

  if (countEl) countEl.textContent = bgState.bgs.length;

  if (bgState.bgs.length === 0) {
    grid.innerHTML =
      '<p class="bg-empty">Aucun fond configuré — cliquez sur « + Ajouter un fond » pour commencer.</p>';
    return;
  }

  bgState.bgs.forEach((bg, i) => {
    const card = document.createElement("div");
    card.className = "bg-mgr-card";

    const thumb = document.createElement("div");
    thumb.className = "bg-mgr-thumb";
    if (bg.file) thumb.style.backgroundImage = `url('${bg.file}')`;

    const info = document.createElement("div");
    info.className = "bg-mgr-info";

    const lbl = document.createElement("div");
    lbl.className   = "bg-mgr-label";
    lbl.textContent = bg.label || "(sans nom)";

    const fname = document.createElement("div");
    fname.className   = "bg-mgr-filename";
    fname.textContent = bg.file ? bg.file.split("/").pop() : "";

    const actions = document.createElement("div");
    actions.className = "bg-mgr-actions";

    const delBtn = document.createElement("button");
    delBtn.className   = "btn-delete btn-sm";
    delBtn.textContent = "Supprimer";
    delBtn.disabled    = !ghToken();
    delBtn.title       = ghToken() ? "Supprimer ce fond" : "Token GitHub requis";
    delBtn.addEventListener("click", () => handleBgDelete(i));

    actions.appendChild(delBtn);
    info.appendChild(lbl);
    info.appendChild(fname);
    info.appendChild(actions);
    card.appendChild(thumb);
    card.appendChild(info);
    grid.appendChild(card);
  });
}

// ── Panneau d'ajout ───────────────────────────────────────────────────────────

function _sanitizeFilename(name) {
  return name
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // supprime les accents
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_.\-]/g, "")
    .toLowerCase();
}

function _setupAddPanel() {
  const addBtn    = document.getElementById("btn-add-bg");
  const panel     = document.getElementById("bg-add-panel");
  const cancelBtn = document.getElementById("btn-add-cancel");
  const imgInput  = document.getElementById("add-img-input");
  const preview   = document.getElementById("add-img-preview");

  addBtn.addEventListener("click", () => {
    panel.classList.remove("hidden");
    addBtn.classList.add("hidden");
    document.getElementById("add-label-input").value = "";
    imgInput.value = "";
    preview.style.backgroundImage = "";
    document.getElementById("add-progress").classList.add("hidden");
    document.getElementById("add-progress").textContent = "";
  });

  cancelBtn.addEventListener("click", () => {
    panel.classList.add("hidden");
    addBtn.classList.remove("hidden");
  });

  // Prévisualisation + pré-remplissage du nom
  imgInput.addEventListener("change", () => {
    const file = imgInput.files[0];
    if (!file) { preview.style.backgroundImage = ""; return; }
    const objUrl = URL.createObjectURL(file);
    preview.style.backgroundImage = `url('${objUrl}')`;
    const labelInput = document.getElementById("add-label-input");
    if (!labelInput.value.trim()) {
      labelInput.value = file.name.replace(/\.[^.]+$/, "").replace(/[_\-]+/g, " ");
    }
  });

  document.getElementById("btn-add-confirm").addEventListener("click", handleBgAdd);
}

async function handleBgAdd() {
  const imgInput   = document.getElementById("add-img-input");
  const labelInput = document.getElementById("add-label-input");
  const progress   = document.getElementById("add-progress");
  const confirmBtn = document.getElementById("btn-add-confirm");

  const file  = imgInput.files[0];
  const label = labelInput.value.trim();

  if (!file)  { showToast("Sélectionnez une image.", "err"); return; }
  if (!label) { showToast("Saisissez un nom pour ce fond.", "err"); labelInput.focus(); return; }
  if (!ghToken()) { showToast("Token GitHub requis pour uploader.", "err"); return; }

  const filename = _sanitizeFilename(file.name);
  const ghPath   = BG_IMG_DIR + filename;

  // Vérifier doublon de nom de fichier
  if (bgState.bgs.some(b => b.file === ghPath)) {
    showToast(`Un fond avec le fichier "${filename}" existe déjà.`, "err");
    return;
  }

  confirmBtn.disabled = true;
  progress.textContent = "⬆ Upload de l'image en cours…";
  progress.classList.remove("hidden");

  try {
    await ghUploadFile(ghPath, file);
    progress.textContent = "✓ Image uploadée — mise à jour du catalogue…";

    bgState.bgs.push({ label, file: ghPath });
    await bgSave();

    progress.classList.add("hidden");
    document.getElementById("bg-add-panel").classList.add("hidden");
    document.getElementById("btn-add-bg").classList.remove("hidden");
    renderBgGrid();
    showToast(`✓ "${label}" ajouté et committé sur GitHub`, "ok");
  } catch (err) {
    progress.textContent = "";
    progress.classList.add("hidden");
    showToast(`Erreur : ${err.message}`, "err");
    console.error("[fonds] Upload échoué :", err);
    // Rollback si le push backgrounds.json a échoué après l'upload image
    const idx = bgState.bgs.findIndex(b => b.file === ghPath && b.label === label);
    if (idx !== -1) bgState.bgs.splice(idx, 1);
  } finally {
    confirmBtn.disabled = false;
  }
}

// ── Suppression ───────────────────────────────────────────────────────────────

async function handleBgDelete(index) {
  const bg = bgState.bgs[index];
  if (!confirm(
    `Supprimer "${bg.label}" de la liste ?\n\n` +
    `L'image (${bg.file.split("/").pop()}) reste dans le dépôt.`
  )) return;

  bgState.bgs.splice(index, 1);
  try {
    await bgSave();
    renderBgGrid();
    showToast(`"${bg.label}" supprimé de la liste.`, "ok");
  } catch (err) {
    bgState.bgs.splice(index, 0, bg); // rollback
    renderBgGrid();
    showToast(`Erreur : ${err.message}`, "err");
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

/**
 * Appelé par config.js une fois les données principales chargées.
 * Met en place le panneau d'ajout et charge backgrounds.json.
 */
async function initFonds() {
  _setupAddPanel();
  updateBgAddBtn();

  const data  = await bgLoad();
  bgState.bgs = Array.isArray(data) ? data : [];
  renderBgGrid();
  updateCounts(); // met à jour le badge du tab Fonds
}
