/**
 * sponsors.js
 * Gestion des sponsors (config/sponsors.json + images dans ressources/sponsors/).
 *
 * Dépend de : github-api.js (ghToken, ghReadJsonFile, ghWriteJsonFile, ghUploadFile)
 * Intégré dans config.html — le token UI et le toast sont fournis par config.js.
 * Point d'entrée : initSponsors() appelé depuis config.js.
 */

const SP_STORAGE_KEY = "bct_sponsors";
const SP_JSON_PATH   = "config/sponsors.json";
const SP_IMG_DIR     = "ressources/sponsors/";

const spState = {
  items: [],  // [{ label, file }, …]
  sha:   null,
  next:  0,   // champ "next" conservé dans sponsors.json
};

// ── Bouton « Ajouter » : état selon token ─────────────────────────────────────

function updateSpAddBtn() {
  const btn = document.getElementById("btn-add-sp");
  if (!btn) return;
  const ok = !!ghToken();
  btn.disabled = !ok;
  btn.title    = ok ? "Ajouter un sponsor" : "Token GitHub requis pour uploader des images";
}

// ── Chargement ────────────────────────────────────────────────────────────────

async function spLoad() {
  // 1. GitHub (source de vérité + SHA)
  if (ghToken()) {
    try {
      const { data, sha } = await ghReadJsonFile(SP_JSON_PATH);
      spState.sha  = sha;
      spState.next = data.next ?? 0;
      const items  = Array.isArray(data.sponsors) ? data.sponsors : [];
      localStorage.setItem(SP_STORAGE_KEY, JSON.stringify({ sponsors: items, next: spState.next }));
      return items;
    } catch (e) {
      console.warn("[sponsors] Lecture GitHub échouée, fallback local :", e.message);
    }
  }
  // 2. Cache localStorage
  const stored = localStorage.getItem(SP_STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      spState.next = parsed.next ?? 0;
      return Array.isArray(parsed.sponsors) ? parsed.sponsors : [];
    } catch (_) {}
  }
  // 3. Fichier statique du dépôt
  try {
    const resp = await fetch(SP_JSON_PATH);
    if (resp.ok) {
      const data   = await resp.json();
      spState.next = data.next ?? 0;
      return Array.isArray(data.sponsors) ? data.sponsors : [];
    }
  } catch (_) {}
  return [];
}

// ── Sauvegarde ────────────────────────────────────────────────────────────────

async function spSave() {
  const payload = { sponsors: spState.items, next: spState.next };
  localStorage.setItem(SP_STORAGE_KEY, JSON.stringify(payload));

  if (ghToken()) {
    if (!spState.sha) {
      try {
        const { sha } = await ghReadJsonFile(SP_JSON_PATH);
        spState.sha = sha;
      } catch (_) {}
    }
    spState.sha = await ghWriteJsonFile(
      SP_JSON_PATH,
      payload,
      spState.sha,
      `Mise a jour sponsors.json [${new Date().toLocaleDateString("fr-FR")}]`
    );
  }
}

// ── Rendu ─────────────────────────────────────────────────────────────────────

function renderSpGrid() {
  const grid = document.getElementById("sp-grid");
  grid.innerHTML = "";

  if (spState.items.length === 0) {
    grid.innerHTML =
      '<p class="bg-empty">Aucun sponsor configuré — cliquez sur « + Ajouter un sponsor » pour commencer.</p>';
    return;
  }

  spState.items.forEach((sp, i) => {
    const card = document.createElement("div");
    card.className = "bg-mgr-card";

    const thumb = document.createElement("div");
    thumb.className = "bg-mgr-thumb";
    if (sp.file) thumb.style.backgroundImage = `url('${sp.file}')`;

    const info = document.createElement("div");
    info.className = "bg-mgr-info";

    const lbl = document.createElement("div");
    lbl.className   = "bg-mgr-label";
    lbl.textContent = sp.label || "(sans nom)";

    const fname = document.createElement("div");
    fname.className   = "bg-mgr-filename";
    fname.textContent = sp.file ? sp.file.split("/").pop() : "";

    const actions = document.createElement("div");
    actions.className = "bg-mgr-actions";

    const delBtn = document.createElement("button");
    delBtn.className   = "btn-delete btn-sm";
    delBtn.textContent = "Supprimer";
    delBtn.disabled    = !ghToken();
    delBtn.title       = ghToken() ? "Supprimer ce sponsor" : "Token GitHub requis";
    delBtn.addEventListener("click", () => handleSpDelete(i));

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

function _setupSpLastBar() {
  const input   = document.getElementById("sp-last-input");
  const saveBtn = document.getElementById("btn-sp-save-last");

  saveBtn.addEventListener("click", async () => {
    let val = parseInt(input.value, 10);
    if (isNaN(val) || val < 0) {
      showToast("Valeur invalide pour next.", "err");
      return;
    }
    // Toujours dans les bornes : wrap si nécessaire
    if (spState.items.length > 0) {
      val = val % spState.items.length;
    } else {
      val = 0;
    }
    spState.next = val;
    input.value  = val;  // répercuter la valeur normalisée
    saveBtn.disabled = true;
    try {
      await spSave();
      _updateLastHint();
      showToast(`✓ next enregistré à ${val}`, "ok");
    } catch (err) {
      showToast(`Erreur : ${err.message}`, "err");
    } finally {
      saveBtn.disabled = false;
    }
  });

  input.addEventListener("keydown", e => {
    if (e.key === "Enter") saveBtn.click();
  });
}

function _updateLastHint() {
  const hint  = document.getElementById("sp-last-hint");
  const input = document.getElementById("sp-last-input");
  if (!hint || !input) return;
  const count = spState.items.length;
  // S'assurer que next est dans les bornes
  if (count > 0 && spState.next >= count) {
    spState.next = spState.next % count;
  }
  input.value = spState.next;
  const current = spState.items[spState.next];
  if (current) {
    const nextIdx   = (spState.next + 1) % count;
    const nextLabel = spState.items[nextIdx]?.label ?? "";
    hint.textContent = `→ prochain affiché : "${current.label}" — suivant : "${nextLabel}"`;
  } else {
    hint.textContent = count === 0 ? "(liste vide)" : "";
  }
}

function _setupSpAddPanel() {
  const addBtn    = document.getElementById("btn-add-sp");
  const panel     = document.getElementById("sp-add-panel");
  const cancelBtn = document.getElementById("btn-sp-add-cancel");
  const imgInput  = document.getElementById("sp-img-input");
  const preview   = document.getElementById("sp-img-preview");

  addBtn.addEventListener("click", () => {
    panel.classList.remove("hidden");
    addBtn.classList.add("hidden");
    document.getElementById("sp-label-input").value = "";
    imgInput.value = "";
    preview.style.backgroundImage = "";
    document.getElementById("sp-add-progress").classList.add("hidden");
    document.getElementById("sp-add-progress").textContent = "";
  });

  cancelBtn.addEventListener("click", () => {
    panel.classList.add("hidden");
    addBtn.classList.remove("hidden");
  });

  // Prévisualisation + pré-remplissage du nom
  imgInput.addEventListener("change", () => {
    const file = imgInput.files[0];
    if (!file) { preview.style.backgroundImage = ""; return; }
    preview.style.backgroundImage = `url('${URL.createObjectURL(file)}')`;
    const labelInput = document.getElementById("sp-label-input");
    if (!labelInput.value.trim()) {
      labelInput.value = file.name.replace(/\.[^.]+$/, "").replace(/[_\-]+/g, " ").replace(/^\d+\s*[-–.]\s*/, "").trim();
    }
  });

  document.getElementById("btn-sp-add-confirm").addEventListener("click", handleSpAdd);
}

async function handleSpAdd() {
  const imgInput   = document.getElementById("sp-img-input");
  const labelInput = document.getElementById("sp-label-input");
  const progress   = document.getElementById("sp-add-progress");
  const confirmBtn = document.getElementById("btn-sp-add-confirm");

  const file  = imgInput.files[0];
  const label = labelInput.value.trim();

  if (!file)  { showToast("Sélectionnez une image.", "err"); return; }
  if (!label) { showToast("Saisissez un nom pour ce sponsor.", "err"); labelInput.focus(); return; }
  if (!ghToken()) { showToast("Token GitHub requis pour uploader.", "err"); return; }

  const filename = _sanitizeFilename(file.name);
  const ghPath   = SP_IMG_DIR + filename;

  if (spState.items.some(s => s.file === ghPath)) {
    showToast(`Un sponsor avec le fichier "${filename}" existe déjà.`, "err");
    return;
  }

  confirmBtn.disabled  = true;
  progress.textContent = "⬆ Upload de l'image en cours…";
  progress.classList.remove("hidden");

  try {
    await ghUploadFile(ghPath, file);
    progress.textContent = "✓ Image uploadée — mise à jour du catalogue…";

    spState.items.push({ label, file: ghPath });
    await spSave();

    progress.classList.add("hidden");
    document.getElementById("sp-add-panel").classList.add("hidden");
    document.getElementById("btn-add-sp").classList.remove("hidden");
    renderSpGrid();
    updateCounts();
    showToast(`✓ "${label}" ajouté et committé sur GitHub`, "ok");
  } catch (err) {
    progress.textContent = "";
    progress.classList.add("hidden");
    showToast(`Erreur : ${err.message}`, "err");
    console.error("[sponsors] Upload échoué :", err);
    const idx = spState.items.findIndex(s => s.file === ghPath && s.label === label);
    if (idx !== -1) spState.items.splice(idx, 1);
  } finally {
    confirmBtn.disabled = false;
  }
}

// ── Suppression ───────────────────────────────────────────────────────────────

async function handleSpDelete(index) {
  const sp = spState.items[index];
  if (!confirm(
    `Supprimer "${sp.label}" de la liste ?\n\n` +
    `L'image (${sp.file.split("/").pop()}) reste dans le dépôt.`
  )) return;

  spState.items.splice(index, 1);
  try {
    await spSave();
    renderSpGrid();
    updateCounts();
    showToast(`"${sp.label}" supprimé de la liste.`, "ok");
  } catch (err) {
    spState.items.splice(index, 0, sp); // rollback
    renderSpGrid();
    showToast(`Erreur : ${err.message}`, "err");
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

/**
 * Appelé par config.js une fois les données principales chargées.
 * Met en place le panneau d'ajout et charge sponsors.json.
 */
async function initSponsors() {
  _setupSpLastBar();
  _setupSpAddPanel();
  updateSpAddBtn();

  const items     = await spLoad();
  spState.items   = items;
  renderSpGrid();
  _updateLastHint();
  updateCounts();
}
