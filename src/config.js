/**
 * config.js
 * Gestion CRUD de config/teams.json via l'API locale /api/teams.
 *
 * Structure de teams.json :
 *   divisions   : { "DFU9": "U9F", ... }
 *   adversaires : { "NOM LONG FEDERAL": "NOM COURT", ... }
 */

// ── État global ──────────────────────────────────────────────────────────────

const state = {
  data:       null,
  dirty:      false,
  activeTab:  "divisions",
  githubSha:  null,   // SHA du blob GitHub courant (requis pour le commit)
};

// ── Utilitaires HTML ─────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Storage key ──────────────────────────────────────────────────────────────

const STORAGE_KEY = "bct_teams";

// ── API (localStorage — aucun serveur requis) ─────────────────────────────────

async function apiLoad() {
  // 1. Si un token GitHub est disponible, lire depuis l'API (source de verite + SHA)
  if (ghToken()) {
    try {
      const { data, sha } = await ghReadFile();
      state.githubSha = sha;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); // cache local
      return data;
    } catch (e) {
      console.warn("[config] Lecture GitHub echouee, fallback local :", e.message);
    }
  }
  // 2. Cache localStorage
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try { return JSON.parse(stored); } catch (_) {}
  }
  // 3. Fichier statique du depot (GitHub Pages)
  try {
    const resp = await fetch("config/teams.json");
    if (resp.ok) return resp.json();
  } catch (_) {}
  return null;
}

async function apiSave(data) {
  // Toujours mettre a jour le cache localStorage
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

  if (ghToken()) {
    // Si le SHA n'est pas encore connu (ex: import depuis fichier), le recuperer
    if (!state.githubSha) {
      const { sha } = await ghReadFile();
      state.githubSha = sha;
    }
    const newSha    = await ghWriteFile(data, state.githubSha);
    state.githubSha = newSha;
    return { github: true };
  }

  return { github: false };
}

/** Déclenche le téléchargement de la configuration comme fichier teams.json. */
function exportTeamsJson(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = "teams.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── État dirty ───────────────────────────────────────────────────────────────

function markDirty(dirty = true) {
  state.dirty = dirty;
  document.getElementById("dirty-msg").classList.toggle("hidden", !dirty);
}

// ── Toast ────────────────────────────────────────────────────────────────────

let _toastTimer = null;

function showToast(msg, type = "ok") {
  const el   = document.getElementById("toast");
  el.textContent = msg;
  el.className   = `toast toast-${type} visible`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    el.classList.remove("visible");
    setTimeout(() => { el.className = "toast hidden"; }, 300);
  }, 3200);
}

// ── Onglets ──────────────────────────────────────────────────────────────────

function switchTab(name) {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    const active = btn.dataset.tab === name;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll(".tab-panel").forEach(panel => {
    panel.classList.toggle("hidden", panel.id !== `tab-${name}`);
  });
  state.activeTab = name;
}

// ── Compteurs ────────────────────────────────────────────────────────────────

function updateCounts() {
  if (!state.data) return;
  document.getElementById("count-divisions").textContent =
    Object.keys(state.data.divisions   || {}).length;
  document.getElementById("count-adversaires").textContent =
    Object.keys(state.data.adversaires || {}).length;
  const fondsEl = document.getElementById("count-fonds");
  if (fondsEl && typeof bgState !== "undefined") fondsEl.textContent = bgState.bgs.length;
  const fondsBadge = document.getElementById("count-fonds-badge");
  if (fondsBadge && typeof bgState !== "undefined") fondsBadge.textContent = bgState.bgs.length;
  const spEl = document.getElementById("count-sponsors");
  if (spEl && typeof spState !== "undefined") spEl.textContent = spState.items.length;
  const spBadge = document.getElementById("count-sponsors-badge");
  if (spBadge && typeof spState !== "undefined") spBadge.textContent = spState.items.length;
}

// ── Construction des lignes ──────────────────────────────────────────────────

const PLACEHOLDER_KEY = {
  divisions:   "Code fédéral (ex: DMU11)",
  adversaires: "Nom long fédéral (ex: GAYANT BASKET)",
};
const PLACEHOLDER_VAL = {
  divisions:   "Catégorie (ex: U11M)",
  adversaires: "Nom court affiche (ex: GAYANT)",
};

/** Ligne en mode lecture */
function buildNormalRow(key, val, type) {
  const tr = document.createElement("tr");
  tr.dataset.key = key;

  if (type === "divisions") {
    const cat      = escHtml(val?.categorie ?? "");
    const typematch = escHtml(val?.type      ?? "");
    tr.innerHTML = `
      <td title="${escHtml(key)}">${escHtml(key)}</td>
      <td>${cat}</td>
      <td><span class="type-badge type-${(val?.type ?? "").toLowerCase()}">${typematch}</span></td>
      <td class="col-actions">
        <div class="cell-actions">
          <button class="btn-edit"   data-action="edit"   data-key="${escHtml(key)}">Modifier</button>
          <button class="btn-delete" data-action="delete" data-key="${escHtml(key)}">Supprimer</button>
        </div>
      </td>`;
  } else {
    tr.innerHTML = `
      <td class="cell-long" title="${escHtml(key)}">${escHtml(key)}</td>
      <td>${escHtml(val)}</td>
      <td class="col-actions">
        <div class="cell-actions">
          <button class="btn-edit"   data-action="edit"   data-key="${escHtml(key)}">Modifier</button>
          <button class="btn-delete" data-action="delete" data-key="${escHtml(key)}">Supprimer</button>
        </div>
      </td>`;
  }
  return tr;
}

/** Ligne en mode édition inline */
function buildEditRow(key, val, type, isNew) {
  const tr = document.createElement("tr");
  tr.classList.add("editing");

  if (type === "divisions") {
    const cat     = escHtml(val?.categorie ?? "");
    const curType = val?.type ?? "CHAMPIONNAT";
    const opts    = ["CHAMPIONNAT", "COUPE", "AMICAL"]
      .map(t => `<option value="${t}"${t === curType ? " selected" : ""}>${t}</option>`)
      .join("");
    tr.innerHTML = `
      <td>
        <input class="input-inline input-key"
               value="${escHtml(key)}"
               placeholder="${escHtml(PLACEHOLDER_KEY[type])}"
               data-original-key="${escHtml(key)}"
               data-is-new="${isNew}"
               autocomplete="off" spellcheck="false">
      </td>
      <td>
        <input class="input-inline input-val"
               value="${cat}"
               placeholder="Catégorie (ex: U11M)"
               autocomplete="off" spellcheck="false">
      </td>
      <td>
        <select class="input-inline input-type">${opts}</select>
      </td>
      <td class="col-actions">
        <div class="cell-actions">
          <button class="btn-confirm" data-action="confirm" title="Valider (Entrée)">✓</button>
          <button class="btn-cancel"  data-action="cancel"
                  data-original-key="${escHtml(key)}"
                  data-is-new="${isNew}" title="Annuler (Échap)">✕</button>
        </div>
      </td>`;
  } else {
    tr.innerHTML = `
      <td>
        <input class="input-inline input-key"
               value="${escHtml(key)}"
               placeholder="${escHtml(PLACEHOLDER_KEY[type])}"
               data-original-key="${escHtml(key)}"
               data-is-new="${isNew}"
               autocomplete="off" spellcheck="false">
      </td>
      <td>
        <input class="input-inline input-val"
               value="${escHtml(val)}"
               placeholder="${escHtml(PLACEHOLDER_VAL[type])}"
               autocomplete="off" spellcheck="false">
      </td>
      <td class="col-actions">
        <div class="cell-actions">
          <button class="btn-confirm" data-action="confirm" title="Valider (Entrée)">✓</button>
          <button class="btn-cancel"  data-action="cancel"
                  data-original-key="${escHtml(key)}"
                  data-is-new="${isNew}" title="Annuler (Échap)">✕</button>
        </div>
      </td>`;
  }
  return tr;
}

// ── Rendu d'un tableau ───────────────────────────────────────────────────────

function renderTable(type, filter = "") {
  const tbody = document.getElementById(`tbody-${type}`);
  const dict  = state.data?.[type] || {};
  const term  = filter.toLowerCase().trim();

  tbody.innerHTML = "";

  const entries = Object.entries(dict).filter(([k, v]) => {
    if (!term) return true;
    if (k.toLowerCase().includes(term)) return true;
    const vStr = type === "divisions"
      ? `${v?.categorie ?? ""} ${v?.type ?? ""}`.toLowerCase()
      : String(v).toLowerCase();
    return vStr.includes(term);
  });

  if (entries.length === 0) {
    const tr = document.createElement("tr");
    tr.className = "empty-row";
    tr.innerHTML = `<td colspan="3">${
      term
        ? `Aucun résultat pour « ${escHtml(term)} »`
        : "Aucune entrée — cliquez sur <strong>+ Ajouter</strong>"
    }</td>`;
    tbody.appendChild(tr);
    return;
  }

  for (const [k, v] of entries) {
    tbody.appendChild(buildNormalRow(k, v, type));
  }
}

// ── Annulation d'une éventuelle édition en cours ──────────────────────────────

function cancelAnyEditing(tbody, dict, type) {
  const editing = tbody.querySelector("tr.editing");
  if (!editing) return;

  const keyInput  = editing.querySelector(".input-key");
  const isNew     = keyInput.dataset.isNew === "true";
  const origKey   = keyInput.dataset.originalKey;

  if (isNew) {
    editing.remove();
  } else {
    editing.replaceWith(buildNormalRow(origKey, dict[origKey] ?? "", type));
  }
}

// ── Gestionnaire de clics (délégation sur tbody) ──────────────────────────────

function tableClickHandler(e, type) {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;

  const tbody  = e.currentTarget;
  const dict   = state.data[type];
  const action = btn.dataset.action;

  // ── Modifier ──
  if (action === "edit") {
    const row = btn.closest("tr");
    const key = btn.dataset.key;
    cancelAnyEditing(tbody, dict, type);
    row.replaceWith(buildEditRow(key, dict[key] ?? "", type, false));
    tbody.querySelector(".input-key").focus();
    return;
  }

  // ── Supprimer ──
  if (action === "delete") {
    const key = btn.dataset.key;
    if (!confirm(`Supprimer "${key}" ?`)) return;
    delete dict[key];
    markDirty();
    updateCounts();
    renderTable(type, document.getElementById(`search-${type}`).value);
    return;
  }

  // ── Valider ──
  if (action === "confirm") {
    const row      = btn.closest("tr");
    const keyInput = row.querySelector(".input-key");
    const valInput = row.querySelector(".input-val");
    const origKey  = keyInput.dataset.originalKey;
    const isNew    = keyInput.dataset.isNew === "true";

    const newKey = keyInput.value.trim().toUpperCase();
    const newVal = valInput.value.trim().toUpperCase();

    // Validation
    keyInput.classList.remove("input-error");
    valInput.classList.remove("input-error");

    if (!newKey) {
      keyInput.classList.add("input-error");
      keyInput.focus();
      return;
    }
    if (!newVal) {
      valInput.classList.add("input-error");
      valInput.focus();
      return;
    }
    if ((isNew || newKey !== origKey) && Object.prototype.hasOwnProperty.call(dict, newKey)) {
      alert(`La clé "${newKey}" existe déjà.`);
      keyInput.classList.add("input-error");
      keyInput.focus();
      return;
    }

    // Mise à jour de l'objet
    if (!isNew && origKey !== newKey) delete dict[origKey];
    if (type === "divisions") {
      const typeEl = btn.closest("tr").querySelector(".input-type");
      dict[newKey] = { categorie: newVal, type: typeEl ? typeEl.value : "CHAMPIONNAT" };
    } else {
      dict[newKey] = newVal;
    }

    markDirty();
    if (isNew) updateCounts();
    renderTable(type, document.getElementById(`search-${type}`).value);
    return;
  }

  // ── Annuler ──
  if (action === "cancel") {
    const row    = btn.closest("tr");
    const isNew  = btn.dataset.isNew === "true";
    const orig   = btn.dataset.originalKey;
    if (isNew) {
      row.remove();
    } else {
      row.replaceWith(buildNormalRow(orig, dict[orig] ?? "", type));
    }
    return;
  }
}

// ── Ajouter une ligne ─────────────────────────────────────────────────────────

function addRow(type) {
  // Vide la recherche pour que la nouvelle ligne soit visible après confirm
  const searchInput = document.getElementById(`search-${type}`);
  if (searchInput.value) {
    searchInput.value = "";
    renderTable(type);
  }

  const tbody = document.getElementById(`tbody-${type}`);
  cancelAnyEditing(tbody, state.data[type], type);

  // Supprime l'éventuelle ligne "vide" placeholder
  tbody.querySelector(".empty-row")?.remove();

  const newRow = buildEditRow("", "", type, true);
  tbody.insertBefore(newRow, tbody.firstChild);
  newRow.querySelector(".input-key").focus();
}

// ── Sauvegarde ────────────────────────────────────────────────────────────────

async function handleSave() {
  const btn = document.getElementById("btn-save");
  btn.disabled    = true;
  btn.textContent = "⏳ Enregistrement…";

  try {
    const result = await apiSave(state.data);
    markDirty(false);
    if (result.github) {
      showToast("✓  Commité sur GitHub", "ok");
    } else {
      showToast("✓  Enregistré localement (token GitHub non configuré)", "ok");
    }
  } catch (err) {
    showToast(`Erreur : ${err.message}`, "err");
  } finally {
    btn.disabled    = false;
    btn.textContent = "💾\u00A0 Enregistrer";
  }
}

// ── Token GitHub ───────────────────────────────────────────────────────────────────

function _updateTokenUI() {
  const hasToken = !!ghToken();
  const statusEl = document.getElementById("gh-status");
  const formEl   = document.getElementById("gh-token-form");
  if (!statusEl) return;
  if (hasToken) {
    statusEl.textContent = "✓ Token configuré \u2014 cliquer pour modifier";
    statusEl.className   = "gh-status gh-status-ok";
    formEl.classList.add("hidden");
  } else {
    statusEl.textContent = "⚠ Token non configuré \u2014 enregistrement local uniquement";
    statusEl.className   = "gh-status gh-status-missing";
    formEl.classList.remove("hidden");
  }  // Met à jour le bouton d’ajout de fond
  if (typeof updateBgAddBtn === "function") updateBgAddBtn();
  // Met à jour le bouton d’ajout de sponsor
  if (typeof updateSpAddBtn === "function") updateSpAddBtn();}

function _setupTokenUI() {
  _updateTokenUI();

  // Clic sur le statut → toggler le formulaire
  document.getElementById("gh-status")?.addEventListener("click", () => {
    document.getElementById("gh-token-form")?.classList.toggle("hidden");
  });

  // Enregistrer le token
  document.getElementById("btn-gh-save-token")?.addEventListener("click", () => {
    const input = document.getElementById("gh-token-input");
    const val   = input.value.trim();
    if (!val) { input.focus(); return; }
    ghSetToken(val);
    input.value    = "";
    state.githubSha = null; // forcer relecture du SHA avec le nouveau token
    _updateTokenUI();
    showToast("✓ Token GitHub enregistré", "ok");
  });

  // Supprimer le token
  document.getElementById("btn-gh-clear-token")?.addEventListener("click", () => {
    if (!confirm("Supprimer le token GitHub ?\nL'enregistrement se fera uniquement en local.")) return;
    ghSetToken("");
    state.githubSha = null;
    _updateTokenUI();
    showToast("Token GitHub supprimé", "ok");
  });

  // Valider le token avec Entrée
  document.getElementById("gh-token-input")?.addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("btn-gh-save-token")?.click();
  });
}

// ── Initialisation ────────────────────────────────────────────────────────────

async function init() {
  _setupTokenUI();

  state.data = await apiLoad();

  if (!state.data) {
    document.getElementById("import-panel").classList.remove("hidden");
    document.getElementById("main-content").classList.add("hidden");
    return;
  }

  document.getElementById("main-content").classList.remove("hidden");
  await _setupUI();
}

init();

// ── Initialisation ────────────────────────────────────────────────────────────

/** Configure tous les listeners UI (appelé une fois les données disponibles). */
async function _setupUI() {
  renderTable("divisions");
  renderTable("adversaires");
  updateCounts();

  // Onglets
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // Délégation de clics sur les tableaux
  ["divisions", "adversaires"].forEach(type => {
    const tbody = document.getElementById(`tbody-${type}`);

    tbody.addEventListener("click", e => tableClickHandler(e, type));

    // Clavier dans les inputs inline : Entrée = valider, Échap = annuler
    tbody.addEventListener("keydown", e => {
      if (!e.target.matches(".input-inline")) return;
      if (e.key === "Enter") {
        e.preventDefault();
        e.target.closest("tr")?.querySelector("[data-action='confirm']")?.click();
      }
      if (e.key === "Escape") {
        e.target.closest("tr")?.querySelector("[data-action='cancel']")?.click();
      }
    });
  });

  // Boutons Ajouter
  document.getElementById("btn-add-division")
    .addEventListener("click", () => addRow("divisions"));
  document.getElementById("btn-add-adversaire")
    .addEventListener("click", () => addRow("adversaires"));

  // Recherche (filtre en temps réel)
  document.getElementById("search-divisions")
    .addEventListener("input", e => renderTable("divisions", e.target.value));
  document.getElementById("search-adversaires")
    .addEventListener("input", e => renderTable("adversaires", e.target.value));

  // Initialiser l'onglet Fonds
  await initFonds();
  // Initialiser l'onglet Sponsors
  await initSponsors();
}


