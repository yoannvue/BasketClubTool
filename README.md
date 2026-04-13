# BasketClubTool

Automatisation de la communication hebdomadaire pour l'**Amicale Basket Pecquencourt**.

Génère en un double-clic :
- ✅ Le fichier `MatchsSemaine_YYYYMMDD.xlsx` depuis `ProchainesRencontres.xlsx`
- 🖼 L'affiche planning de la semaine (image PNG depuis un template Google Slides)
- 🖼 L'affiche des résultats du weekend (image PNG depuis un template Google Slides)
- ☁️ Upload automatique sur Google Drive du club (lien partagé en écriture)

---

## Structure du projet

```
BasketClubTool/
├── main.py                   Point d'entrée
├── requirements.txt
├── config/
│   ├── settings.json         IDs Drive + Slides (à remplir)
│   ├── teams.json            Table de correspondance équipes/divisions
│   └── credentials.json      OAuth Google (à télécharger — ne pas commiter)
├── core/
│   ├── transform.py          Excel → MatchsSemaine
│   ├── results.py            Lecture résultats
│   ├── slides_planning.py    Génération affiche planning
│   ├── slides_results.py     Génération affiche résultats
│   └── drive.py              Auth OAuth + upload Drive
├── ui/
│   └── app.py                Interface Tkinter
└── scripts/
    └── build.bat             Compilation → .exe
```

---

## Installation (dev)

```bash
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
python main.py
```

---

## Configuration Google (à faire une seule fois)

### 1. Créer le projet Google Cloud

1. Va sur https://console.cloud.google.com/
2. Crée un nouveau projet (ex: "BasketClubTool")
3. Active les deux APIs :
   - **Google Drive API**
   - **Google Slides API**

### 2. Créer les credentials OAuth

1. Dans le menu → APIs & Services → **Credentials**
2. Clique **+ Create Credentials** → **OAuth client ID**
3. Type d'application : **Application de bureau**
4. Télécharge le JSON → renomme-le `credentials.json`
5. Place-le dans le dossier `config/`

### 3. Premier lancement

Lance l'application. Au premier clic sur une action, une fenêtre de navigateur s'ouvre pour autoriser l'accès Google. Après validation, un fichier `config/token.json` est créé automatiquement — les lancements suivants sont silencieux.

> **⚠ Sécurité** : ne partage jamais `credentials.json` ni `token.json` en dehors de l'équipe de confiance. Ne les commite pas dans git.

---

## Créer les templates Google Slides

### Template planning

1. Crée une nouvelle présentation Google Slides
2. Design ta diapositive librement (logo club, couleurs, typographie)
3. Place des zones de texte avec ces placeholders **exacts** :

| Placeholder | Contenu injecté |
|---|---|
| `{{SEMAINE}}` | Ex : `Semaine du 28 mars 2026` |
| `{{MATCH_1_EQUIPE}}` | Nom court de l'équipe ABP (ex: `U11F-1`) |
| `{{MATCH_1_ADVERSAIRE}}` | Nom court de l'adversaire (ex: `DENAIN`) |
| `{{MATCH_1_DATE}}` | Date (ex: `28/03/2026`) |
| `{{MATCH_1_HEURE}}` | Heure (ex: `14:00`) |
| `{{MATCH_1_SALLE}}` | Salle (ex: `JEAN DEGROS`) |
| `{{MATCH_2_EQUIPE}}` … | Idem pour le match suivant |

4. Copie l'**ID** de la présentation depuis l'URL :
   `https://docs.google.com/presentation/d/**TON_ID**/edit`
5. Dans l'app → Paramètres → colle cet ID dans "ID template Slides — Planning"

### Template résultats

Mêmes étapes. Placeholders :

| Placeholder | Contenu injecté |
|---|---|
| `{{SEMAINE}}` | Ex : `Weekend du 22 mars 2026` |
| `{{BILAN}}` | Ex : `9 victoires · 4 défaites` |
| `{{RES_1_EQUIPE}}` | Nom court équipe ABP |
| `{{RES_1_ADVERSAIRE}}` | Nom court adversaire |
| `{{RES_1_SCORE}}` | Ex : `72 - 60` |
| `{{RES_1_RESULTAT}}` | `V`, `D` ou `N` |
| `{{RES_2_EQUIPE}}` … | Idem pour le résultat suivant |

---

## Configurer le dossier Google Drive

1. Crée un dossier dans Google Drive (ex: "Com Basket Club")
2. Partage-le (droit d'écriture pour quiconque possède le lien)
3. Ouvre le dossier → copie l'**ID** depuis l'URL :
   `https://drive.google.com/drive/folders/**TON_ID**`
4. Dans l'app → Paramètres → colle cet ID dans "ID dossier Google Drive"

---

## Mettre à jour la table de correspondance (teams.json)

Ouvre `config/teams.json` avec le Bloc-notes. Deux sections :

### `divisions` — codes de division → catégorie

```json
"DFU11": "U11F",
"DMU13": "U13M",
```
Si un nouveau code de division apparaît dans les fichiers fédéraux, ajoute-le ici.

### `adversaires` — noms complets → noms courts

```json
"ASC DENAIN VOLTAIRE PORTE DU HAINAUT": "DENAIN",
"MOUVAUX ABC": "MOUVAUX ABC"
```
Si un adversaire inconnu apparaît, son nom complet sera affiché dans le fichier.
Ajoute-le ici pour qu'il soit raccourci automatiquement la fois suivante.

---

## Build .exe

```bat
scripts\build.bat
```

Le dossier `dist\` contiendra :
- `BasketClubTool.exe`
- `config\` (settings.json, teams.json, credentials.json, token.json)

**Livre ce dossier `dist\` entier** au membre du comité.
Il n'a rien à installer — il double-clique sur `BasketClubTool.exe`.

> **Note** : si tu recompiles sans `token.json`, le premier lancement sur le PC cible
> ouvrira le navigateur pour l'autorisation Google. C'est normal et unique.

---

## Dépannage

| Symptôme | Solution |
|---|---|
| `FileNotFoundError: credentials.json` | Télécharge les credentials OAuth depuis Google Cloud Console |
| `ValueError: L'ID du template…` | Va dans Paramètres et renseigne les IDs Slides |
| Nom adversaire non raccourci | Ajoute-le dans `config/teams.json` → section `adversaires` |
| Erreur 403 Drive | Le token est peut-être expiré : supprime `config/token.json` et relance |
| Placeholder non remplacé | Vérifie l'orthographe exacte `{{MATCH_1_EQUIPE}}` dans le template Slides |
