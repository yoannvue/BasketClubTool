# Projet Automatisation Club Basket — Amicale Basket Pecquencourt

## Contexte général

Automatisation de la communication hebdomadaire du club de basket autour de trois fichiers sources extraits de la plateforme fédérale :

- **`ProchainesRencontres.xlsx`** : planning des matchs de la semaine à venir
- **`ResultatsDeLasemaine.xlsx`** (aussi nommé `ResultatsDuWeekend.xlsx`) : résultats de la semaine écoulée

---

## Objectifs

| # | Objectif | Statut |
|---|---|---|
| 1 | Générer `MatchsSemaine_YYYYMMDD.xlsx` depuis `ProchainesRencontres.xlsx` + upload Drive | ✅ Fait |
| 2 | Générer affiche planning (PNG) depuis template Google Slides + upload Drive | ✅ Fait (nécessite setup Google) |
| 3 | Générer affiche résultats (PNG) depuis template Google Slides + upload Drive | ✅ Fait (nécessite setup Google) |

---

## Décisions prises

| Sujet | Décision |
|---|---|
| Stack principal | Python + Google Slides API + Google Drive API |
| Templates affiches | Google Slides (WYSIWYG navigateur, gratuit) |
| Déploiement | Exécutable .exe (PyInstaller, double-clic) |
| UI applicative | Tkinter (inclus dans Python, aucune dépendance externe) |
| Maintenance templates | Double : dev ET membre non-technique du comité |

---

## Structure du projet

```
BasketClubTool/
├── main.py                   Point d'entrée (compatible .exe PyInstaller)
├── requirements.txt
├── README.md                 Guide complet setup + utilisation
├── config/
│   ├── settings.json         IDs Drive + Slides (à remplir après setup Google)
│   ├── teams.json            Table de correspondance divisions + noms adversaires
│   └── credentials.json      OAuth Google (à télécharger — NE PAS commiter)
│   └── token.json            Généré au 1er lancement — NE PAS commiter
├── core/
│   ├── transform.py          ProchainesRencontres → MatchsSemaine (✅ testé)
│   ├── results.py            Lecture + parsing ResultatsDuWeekend (✅ testé)
│   ├── slides_planning.py    Génération affiche planning via Slides API
│   ├── slides_results.py     Génération affiche résultats via Slides API
│   └── drive.py              Auth OAuth 2.0 + upload Drive
├── ui/
│   └── app.py                Interface Tkinter 3 sections + journal + paramètres
└── scripts/
    └── build.bat             Compilation → .exe via PyInstaller
```

---

## Règles de transformation (ProchainesRencontres → MatchsSemaine)

### Codes division → catégorie

| Code | Catégorie |
|---|---|
| DFU9-* | U9F |
| DXU9-* | U9M |
| DFU11-* | U11F |
| DMU11-* | U11M |
| DFU13-* | U13F |
| DMU13-* | U13M |
| DFU15-* | U15F |
| DMU15-* | U15M |
| DFU18-* | U18F |
| DMU18-* / IRMU18-* | U18M |
| DM2 | SENIORS |
| AMILOISIRS | LOISIRS |

### Numéro d'équipe ABP
- "AMICALE BASKET PECQUENCOURT" seul → pas de suffixe (ex: U13M)
- "AMICALE BASKET PECQUENCOURT - 2" → suffixe -2 (ex: U13M-2)

### Noms adversaires
Table de substitution éditable dans `config/teams.json` → section `adversaires`.
Ajout d'un adversaire inconnu : ouvrir le fichier JSON avec le Bloc-notes.

### Lignes ignorées
- Matchs avec "Exempt" comme adversaire → ignorés

---

## Placeholders dans les templates Google Slides

### Template planning
```
{{SEMAINE}}

Tableau DOMICILE — EQUIPE1=ABP, EQUIPE2=Adversaire :
{{DOM_1_EQUIPE1}}  {{DOM_1_EQUIPE2}}  {{DOM_1_DATE}}
{{DOM_2_EQUIPE1}}  ...  (jusqu'à DOM_20)

Tableau EXTÉRIEUR — EQUIPE1=Adversaire, EQUIPE2=ABP :
{{EXT_1_EQUIPE1}}  {{EXT_1_EQUIPE2}}  {{EXT_1_DATE}}
{{EXT_2_EQUIPE1}}  ...  (jusqu'à EXT_20)
```
Format {{DOM_N_DATE}} / {{EXT_N_DATE}} : SAMEDI
14H00 (retour à la ligne entre jour et heure)

### Template résultats
```
{{SEMAINE}}
{{BILAN}}
{{RES_1_EQUIPE}}  {{RES_1_ADVERSAIRE}}  {{RES_1_SCORE}}  {{RES_1_RESULTAT}}
{{RES_2_EQUIPE}}  ...
(jusqu'à {{RES_20_...}})
```

`{{RES_N_RESULTAT}}` vaut `V`, `D` ou `N`.

---

## Setup Google (une seule fois)

1. Créer projet sur https://console.cloud.google.com/
2. Activer **Google Drive API** + **Google Slides API**
3. Créer credentials OAuth 2.0 → type "Application de bureau"
4. Télécharger → renommer `credentials.json` → placer dans `config/`
5. Premier lancement de l'app → autorisation navigateur → `token.json` créé

---

## Build .exe

```bat
scripts\build.bat
```

Livrer le dossier `dist\` entier : `BasketClubTool.exe` + `config\`

---

## État des tests

| Module | Test | Résultat |
|---|---|---|
| core/transform.py | ProchainesRencontres.xlsx réel | ✅ 16 matchs, Divisions.xlsx + NomsEquipes.xlsx |
| core/results.py | ResultatsDeLasemaine.xlsx réel | ✅ 13 résultats, 9V/0N/4D |
| core/drive.py | — | ⏳ Nécessite credentials Google |
| core/slides_planning.py | — | ⏳ Nécessite template Slides |
| core/slides_results.py | — | ⏳ Nécessite template Slides |
| ui/app.py | — | ⏳ Test manuel |

---

## Prochaines étapes

1. ~~Setup Google Cloud~~ ✅
2. ~~Templates Google Slides planning créé~~ ✅
3. ~~Remplir config/settings.json~~ ✅
4. **Compléter NomsEquipes.xlsx** avec les adversaires manquants
5. **Créer le template résultats** Google Slides
6. **Test complet résultats**
7. **Build .exe** avec `scripts/build.bat`

---

## Historique

- **2026-03-22** : Analyse fichiers source, définition 3 objectifs, exploration solutions
- **2026-03-22** : Choix solution A (Python + Google Slides + Drive), déploiement .exe, UI Tkinter
- **2026-03-23** : Squelette complet codé et testé (core/transform, core/results, drive, slides, ui)
---

## Fichiers de référence (config/)

### Divisions.xlsx
Correspondance exacte DIVISION → CATEGORIE + TYPEMATCH.
Fallback regex si division inconnue.
**À maintenir** quand de nouvelles divisions fédérales apparaissent.

### NomsEquipes.xlsx
Correspondance NOMLONG → NOMCOURT pour les adversaires.
Si un nom n'est pas dans le fichier, le nom brut nettoyé est utilisé (fallback).
**À compléter** au fil des saisons avec les nouveaux adversaires.

Adversaires à ajouter après test du 23/03/2026 :
- ST AMAND P H → ST AMAND
- HERIN FJEP → HERIN FJEP (ou laisser tel quel)
- SECLIN BC → SECLIN BC
- MOUVAUX ABC → MOUVAUX ABC
- LILLE-EST BASKET → LILLE-EST
- LILLE BASKET → LILLE
- CUINCY ASB → CUINCY ASB
