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
  data:      null,   // objet chargé depuis /api/teams
  dirty:     false,
  activeTab: "divisions",
};

// ── Utilitaires HTML ─────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── API ──────────────────────────────────────────────────────────────────────

async function apiLoad() {
  const resp = await fetch("/api/teams");
  if (!resp.ok) throw new Error(`Lecture teams.json impossible (HTTP ${resp.status})`);
  return resp.json();
}

async function apiSave(data) {
  const resp = await fetch("/api/teams", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(data),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || `Sauvegarde échouée (HTTP ${resp.status})`);
  }
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

  const colCls = type === "adversaires" ? " cell-long" : "";
  tr.innerHTML = `
    <td class="${colCls}" title="${escHtml(key)}">${escHtml(key)}</td>
    <td>${escHtml(val)}</td>
    <td class="col-actions">
      <div class="cell-actions">
        <button class="btn-edit"   data-action="edit"   data-key="${escHtml(key)}">Modifier</button>
        <button class="btn-delete" data-action="delete" data-key="${escHtml(key)}">Supprimer</button>
      </div>
    </td>`;
  return tr;
}

/** Ligne en mode édition inline */
function buildEditRow(key, val, type, isNew) {
  const tr = document.createElement("tr");
  tr.classList.add("editing");

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
  return tr;
}

// ── Rendu d'un tableau ───────────────────────────────────────────────────────

function renderTable(type, filter = "") {
  const tbody = document.getElementById(`tbody-${type}`);
  const dict  = state.data?.[type] || {};
  const term  = filter.toLowerCase().trim();

  tbody.innerHTML = "";

  const entries = Object.entries(dict).filter(([k, v]) =>
    !term || k.toLowerCase().includes(term) || v.toLowerCase().includes(term)
  );

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
    dict[newKey] = newVal;

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
  btn.disabled   = true;
  btn.textContent = "⏳ Enregistrement…";

  try {
    await apiSave(state.data);
    markDirty(false);
    showToast("✓  Enregistré dans config/teams.json", "ok");
  } catch (err) {
    showToast(`Erreur : ${err.message}`, "err");
  } finally {
    btn.disabled    = false;
    btn.textContent = "💾\u00A0 Enregistrer";
  }
}

// ── Navigation quittée avec modifications non sauvegardées ───────────────────

window.addEventListener("beforeunload", e => {
  if (state.dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});

// ── Initialisation ────────────────────────────────────────────────────────────

async function init() {
  // 1. Chargement de teams.json
  try {
    state.data = await apiLoad();
  } catch (err) {
    document.querySelector("main").innerHTML = `
      <div style="max-width:600px;margin:40px auto;background:#fff;border:1px solid var(--border);
                  border-radius:10px;padding:28px;box-shadow:var(--shadow);">
        <h2 style="color:var(--error);margin-bottom:12px;">⚠ Impossible de charger teams.json</h2>
        <p style="margin-bottom:10px;">${escHtml(err.message)}</p>
        <p class="hint">
          Assure-toi que le serveur est lancé via <strong>serve.bat</strong>
          et non en ouvrant le fichier HTML directement dans le navigateur.
        </p>
      </div>`;
    return;
  }

  // 2. Rendu initial
  renderTable("divisions");
  renderTable("adversaires");
  updateCounts();

  // 3. Onglets
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // 4. Délégation de clics sur les tableaux
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

  // 5. Boutons Ajouter
  document.getElementById("btn-add-division")
    .addEventListener("click", () => addRow("divisions"));
  document.getElementById("btn-add-adversaire")
    .addEventListener("click", () => addRow("adversaires"));

  // 6. Recherche (filtre en temps réel)
  document.getElementById("search-divisions")
    .addEventListener("input", e => renderTable("divisions", e.target.value));
  document.getElementById("search-adversaires")
    .addEventListener("input", e => renderTable("adversaires", e.target.value));

  // 7. Sauvegarde
  document.getElementById("btn-save").addEventListener("click", handleSave);
}

init();
