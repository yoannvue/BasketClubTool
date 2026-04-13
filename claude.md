# Projet Automatisation Club Basket — Amicale Basket Pecquencourt

> Dernière mise à jour : **2026-04-13**

## Contexte général

Automatisation de la communication hebdomadaire du club de basket autour de trois fichiers sources extraits de la plateforme fédérale :

- **`ProchainesRencontres.xlsx`** : planning des matchs de la semaine à venir
- **`ResultatsDeLasemaine.xlsx`** (aussi nommé `ResultatsDuWeekend.xlsx`) : résultats de la semaine écoulée

---

## Objectifs

| # | Objectif | Statut |
|---|---|---|
| 1 | Générer affiche planning (PNG) depuis `ProchainesRencontres.xlsx` | ✅ Fait |
| 2 | Mode local Canvas (offline, aucun serveur) | ✅ Fait |
| 3 | Mode Google Slides (copie template → export PNG → upload Drive) | ✅ Fait |
| 4 | Gérer les équipes exemptées dans l'affiche | ✅ Fait |
| 5 | Page de gestion `teams.json` (divisions + adversaires) | ✅ Fait |
| 6 | Application 100% HTML/JS sans serveur | ✅ Fait |

---

## Stack technique (état actuel)

| Composant | Choix |
|---|---|
| Application | HTML + CSS + JS pur (aucun framework) |
| Parsing Excel | SheetJS 0.20.3 (CDN) |
| Génération affiche locale | Canvas 2D API |
| Génération affiche en ligne | Google Slides API + Drive API (REST) |
| Auth Google | Google Identity Services (OAuth2 navigateur) |
| Stockage configuration | `localStorage` (clé `bct_teams`) |
| Lancement | Double-clic sur `web/index.html` — aucun serveur requis |

---

## Structure du projet

```
BasketClubTool/
├── README.md
├── config/
│   ├── teams.json          Divisions + adversaires (source de vérité)
│   ├── settings.json       IDs Drive + Slides (référence pour saisie manuelle)
│   └── credentials.json    OAuth Google (NE PAS commiter)
├── web/
│   ├── index.html          Page principale
│   ├── config.html         Page gestion teams.json
│   ├── style.css
│   ├── config.css
│   ├── app.js              Contrôleur UI + mode toggle local/slides
│   ├── transform.js        Parsing Excel + résolution divisions/adversaires
│   ├── local-render.js     Génération Canvas (mode local)
│   ├── slides.js           Génération via API Google Slides (mode cloud)
│   ├── config.js           CRUD teams.json via localStorage
│   └── ressources/
│       ├── logo.png        Logo du club (optionnel — fond transparent)
│       └── fond.png        Image de fond de l'affiche (optionnelle)
└── Tests/
```

---

## Configuration `config/teams.json`

Structure JSON :
```json
{
  "divisions": {
    "DFU11-8": { "categorie": "U11F", "type": "CHAMPIONNAT" },
    "CDSU11F 1er tour": { "categorie": "U11F", "type": "COUPE" },
    "AMILOISIRS": { "categorie": "LOISIRS", "type": "AMICAL" }
  },
  "adversaires": {
    "GAYANT BASKET": "GAYANT",
    "LILLE-EST BASKET": "LILLE-EST"
  },
  "abp_marker": "AMICALE BASKET PECQUENCOURT"
}
```

- **divisions** : code fédéral exact → `{ categorie, type }`. Types possibles : `CHAMPIONNAT`, `COUPE`, `AMICAL`.
- **adversaires** : nom long fédéral → nom court affiche.
- **abp_marker** : marqueur d'identification des équipes ABP dans le fichier Excel.
- `_resolveDivision` : correspondance exacte, puis fallback regex sur le préfixe si code inconnu.
- Les valeurs simples (string) sont acceptées en fallback (`typematch` = `CHAMPIONNAT`).

---

## Règles de transformation (ProchainesRencontres → affiche)

### Numéro d'équipe ABP
- `"AMICALE BASKET PECQUENCOURT"` → pas de suffixe (ex : `U13M`)
- `"AMICALE BASKET PECQUENCOURT - 2"` → suffixe `-2` (ex : `U13M-2`)

### Noms adversaires
Recherche exacte (insensible à la casse), puis correspondance partielle (plus long en premier). Fallback : nom brut tronqué à 25 caractères.

### Lignes ignorées / exemptées
- Si l'adversaire contient `"exempt"` (insensible à la casse) : la catégorie ABP est capturée dans `exemptList` et affichée séparément.
- `loadPlanningData()` retourne `{ domicileList, exterieurList, weekLabel, exemptList }`.

---

## Génération de l'affiche — mode local (Canvas)

Fichier : `web/local-render.js`

### Layout
- Canvas 1400 px de large, hauteur dynamique selon le nombre de matchs.
- **Header** : dégradé bleu, titre semaine aligné à gauche, logo club à droite (optionnel).
- **Image de fond** : `ressources/fond.png`, appliquée sur tout le canvas à 18 % d'opacité (optionnelle).
- **Deux colonnes** : DOMICILE (vert) | EXTÉRIEUR (rouge)
- **Regroupement par jour** : chaque groupe jour a un bandeau clair avec barre latérale colorée.
- **Alignement colonnes** : heure | ` | ` | Equipe1 | ` vs ` | Equipe2 — positions X fixes sur toute la colonne.
- **Section EXEMPT(S)** : affichée sous la colonne la moins haute.

### Ressources graphiques (toutes optionnelles)
| Fichier | Usage |
|---|---|
| `web/ressources/logo.png` | Logo en haut à droite du header — scaling contain dans 180×84 px |
| `web/ressources/fond.png` | Image de fond à faible opacité |

Si un fichier est absent → `console.warn` + ignoré silencieusement.

### Constantes `_LC`
| Constante | Valeur | Rôle |
|---|---|---|
| `LINE_H` | 32 px | Hauteur d'une ligne de match |
| `DAY_H` | 26 px | Hauteur d'un bandeau jour |
| `DAY_GAP` | 10 px | Espace entre groupes de jours |
| `MAX_LOGO_W/H` | 180 / 84 px | Contrainte logo |

---

## Génération de l'affiche — mode Google Slides

Fichier : `web/slides.js`

- Copie le template Drive, remplace les placeholders, supprime les lignes vides, exporte en PNG, upload Drive.
- Token OAuth géré en mémoire via Google Identity Services.
- `MAX_MATCHES = 20` par colonne.

### Placeholders template planning
```
{{SEMAINE}}
{{DOM_N_EQUIPE1}}  {{DOM_N_EQUIPE2}}  {{DOM_N_DATE}}  (N de 1 à 20)
{{EXT_N_EQUIPE1}}  {{EXT_N_EQUIPE2}}  {{EXT_N_DATE}}
```
Format `{{*_DATE}}` : `SAMEDI\n14H00`

---

## Page de gestion (config.html)

Fichier : `web/config.js` + `web/config.html` + `web/config.css`

### Fonctionnement sans serveur
- Toutes les données sont stockées dans `localStorage` (clé `bct_teams`).
- **Premier lancement** : panneau central "Importer teams.json" → choisir le fichier `config/teams.json`.
- **Usages suivants** : données chargées depuis `localStorage`.
- **Bouton 💾 Enregistrer** : persiste en `localStorage`.
- **Bouton 📥 Télécharger** : exporte le JSON modifié comme fichier `teams.json`.
- **Bouton 📂 Importer** : permet de réimporter un fichier pour remplacer les données.

### Onglet Divisions
- Colonnes : Code fédéral | Catégorie | Type (badge coloré CHAMPIONNAT/COUPE/AMICAL)
- Édition inline : input catégorie + select type.

### Onglet Adversaires
- Colonnes : Nom long fédéral | Nom court affiche
- Édition inline standard.

---

## Flux utilisateur

1. Ouvrir `web/index.html` dans le navigateur (double-clic).
2. La première fois : aller dans 📋 Équipes & Divisions → importer `config/teams.json`.
3. Déposer `ProchainesRencontres.xlsx` sur la zone de dépôt.
4. Choisir le mode **Local** (Canvas, offline) ou **Google Slides** (nécessite connexion Google).
5. Cliquer **Générer**.
6. Télécharger l'image PNG produite.

---

## Historique

| Date | Événement |
|---|---|
| 2026-03-22 | Analyse fichiers source, définition objectifs |
| 2026-03-22 | Choix stack Python + Google Slides + Tkinter |
| 2026-03-23 | Squelette Python complet et testé |
| 2026-03-23 | Conversion totale en HTML/JS pur |
| 2026-03-23 | Ajout mode Canvas local (offline) |
| 2026-03-23 | Page config CRUD teams.json (avec server.py) |
| 2026-04-13 | Refonte visuelle Canvas : regroupement par jour, interligne réduit, alignement colonnes |
| 2026-04-13 | Logo club + image de fond dans l'affiche (ressources optionnelles) |
| 2026-04-13 | Support équipes exemptées (affichage sous la colonne la plus courte) |
| 2026-04-13 | Page config : gestion objet `{categorie, type}` + badges visuels |
| 2026-04-13 | Suppression du serveur Python — application 100% offline via localStorage |
