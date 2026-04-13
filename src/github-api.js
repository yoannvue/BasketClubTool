/**
 * github-api.js
 * Couche d'acces a l'API REST GitHub pour lire/ecrire config/teams.json.
 *
 * Depot cible : yoannvue/BasketClubTool
 * Authentification : Personal Access Token (PAT) stocke dans localStorage
 *   sous la cle "bct_gh_token".
 *
 * API publique :
 *   ghToken()                → string (token courant ou "")
 *   ghSetToken(token)        → void
 *   ghReadFile()             → Promise<{ data: Object, sha: string }>
 *   ghWriteFile(data, sha)   → Promise<string>  (SHA du nouveau blob)
 */

const GH_OWNER     = "yoannvue";
const GH_REPO      = "BasketClubTool";
const GH_FILE_PATH = "config/teams.json";
const GH_TOKEN_KEY = "bct_gh_token";
const GH_API_URL   =
  `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_FILE_PATH}`;

// ── Token ─────────────────────────────────────────────────────────────────────

/** Retourne le PAT stocke dans localStorage, ou chaine vide. */
function ghToken() {
  return localStorage.getItem(GH_TOKEN_KEY) || "";
}

/** Enregistre ou efface le PAT. */
function ghSetToken(token) {
  if (token && token.trim()) {
    localStorage.setItem(GH_TOKEN_KEY, token.trim());
  } else {
    localStorage.removeItem(GH_TOKEN_KEY);
  }
}

// ── Helpers internes ──────────────────────────────────────────────────────────

function _ghHeaders() {
  const h = {
    Accept:               "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (ghToken()) h.Authorization = `Bearer ${ghToken()}`;
  return h;
}

/** Encode une chaine UTF-8 en base64 (compatible Unicode). */
function _toBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

/** Decode du base64 vers une chaine UTF-8. */
function _fromBase64(b64) {
  return decodeURIComponent(escape(atob(b64.replace(/\s/g, ""))));
}

// ── Lecture ───────────────────────────────────────────────────────────────────

/**
 * Lit config/teams.json depuis l'API GitHub.
 * Fonctionne meme sans token pour les depots publics.
 * Retourne { data: Object, sha: string }.
 * Leve une erreur si la requete echoue.
 */
async function ghReadFile() {
  const resp = await fetch(GH_API_URL, { headers: _ghHeaders() });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(
      body.message ||
      `Lecture GitHub echouee (HTTP ${resp.status}).`
    );
  }
  const json    = await resp.json();
  const content = JSON.parse(_fromBase64(json.content));
  return { data: content, sha: json.sha };
}

// ── Ecriture ──────────────────────────────────────────────────────────────────

/**
 * Commit config/teams.json sur GitHub (PUT /contents).
 * sha : SHA du blob courant, obtenu lors du dernier ghReadFile().
 * Retourne le SHA du nouveau blob apres commit.
 * Necessite un token avec la permission "Contents: Read & Write".
 */
async function ghWriteFile(data, sha) {
  if (!ghToken()) {
    throw new Error(
      "Token GitHub non configure. " +
      "Renseignez votre PAT dans la section GitHub de la page config."
    );
  }

  const content = _toBase64(JSON.stringify(data, null, 2));
  const now     = new Date().toLocaleDateString("fr-FR");

  const resp = await fetch(GH_API_URL, {
    method:  "PUT",
    headers: { ..._ghHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Mise a jour teams.json [${now}]`,
      content,
      sha,
    }),
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(
      body.message ||
      `Commit GitHub echoue (HTTP ${resp.status}).`
    );
  }

  const result = await resp.json();
  return result.content.sha;
}
