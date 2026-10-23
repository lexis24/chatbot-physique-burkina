# Documentation technique — Prof Aïcha (physique, Burkina Faso)

Ce document décrit l'architecture réelle de l'application. L'installation et l'utilisation sont dans le
[README](../README.md).

## 1. Vue d'ensemble

```
Élève (navigateur, PWA)
   │  React + Vite : chat, exercices, prérequis, flashcards, cours, exports PDF/Word
   ▼
API FastAPI (backend/main.py)
   ├── RAGSystem (rag_system.py)
   │     ├── recherche vectorielle : LlamaIndex + PGVectorStore (table physique_burkina_embeddings)
   │     └── génération : API Claude (prompts de physique, schémas JSON, vérification des QCM)
   ├── database.py : comptes, conversations, messages, révisions de flashcards (schéma Postgres "app")
   └── fichiers statiques : data/documents (cours), data/summaries (fiches), data/flashcards (JSON)
   ▼
Postgres + pgvector (Neon) — base dédiée à la physique
```

## 2. Backend

| Fichier | Rôle |
|---|---|
| `main.py` | Endpoints `/api/*`, validation (classes et chapitres du programme), authentification, consentement, persistance best-effort, service du frontend compilé |
| `rag_system.py` | Recherche dans l'index, appels Claude (avec relance automatique si la réponse est tronquée), tous les prompts, analyse et validation des JSON d'exercices et de prérequis, contenus de secours hors ligne |
| `curriculum_data.py` | Programme : 5 classes, 72 chapitres, intitulés et ordre exacts des manuels |
| `document_processor.py` | Extraction de texte (PDF/DOCX/TXT), correspondance classe/chapitre ↔ fichier (alias de dossiers, mots-clés, numéro de chapitre) |
| `ingest_documents.py` | Indexation : classement de chaque PDF par Claude (contenu), repli sur le numéro de chapitre, reconstruction de la table vectorielle |
| `database.py`, `auth.py`, `consent_text.py` | Données élèves, JWT, texte de consentement versionné |
| `config.py` | Paramètres (lus depuis `.env`) : modèle, budgets de tokens, `DATABASE_URL`, `VECTOR_TABLE_NAME`, dossiers de données |

### Prompts (rag_system.py)

Constantes partagées par tous les prompts :

- `OFF_TOPIC_INSTRUCTIONS` : portée limitée à la physique (chimie et maths déclinées, outils mathématiques au service
  de la physique acceptés).
- `FORMULA_FORMAT_INSTRUCTIONS` : formules, grandeurs et unités en LaTeX (`$U = R \times I$`, `$220\,\text{V}$`).
- `UNITS_INSTRUCTIONS` : SI, conversions explicites, expression littérale → application numérique → résultat avec
  unité, homogénéité, chiffres significatifs (exigés à partir de la 2nde), valeur de $g$.
- `FIGURE_SCHEMAS` / `FIGURE_FORMAT_INSTRUCTIONS` : formats JSON des schémas (voir §4).
- `NO_EMOJI_INSTRUCTIONS` : ton de manuel, tableaux Markdown avec unités dans les en-têtes.

Exercices : 5 niveaux (`STAR_DIFFICULTY_LABELS`) — 1★ QCM, 2★ application d'une loi, 3★ notions combinées,
4★ situation d'intégration, 5★ olympiades (analyse dimensionnelle, ordre de grandeur, conservation, cas limites...).
L'énoncé et la correction sont générés par deux appels distincts ; les QCM (exercices 1★ et prérequis) sont relus par
un appel de vérification à température 0.

Prérequis : les manuels de physique n'ont pas de ligne « Prérequis » ; le modèle les déduit des extraits du chapitre
et de la liste des chapitres antérieurs (même classe et classes précédentes).

### Recherche des fichiers d'un chapitre

`find_course_file` cherche d'abord `<dossier>/<classe>/<chapitre>/`, puis parcourt les dossiers de classe
(`4eme`, `3eme`, `2ndeC`, `1ereD`, `TleD`, reconnus via `CLASS_ALIASES`) et note chaque fichier selon les mots-clés
de l'intitulé, avec un demi-point si son numéro `Chapitre_N_` correspond au rang du chapitre dans le programme.
`/api/course` interroge d'abord l'index vectoriel (filtre exact classe + chapitre posé à l'ingestion).

## 3. Base de données

- **Table vectorielle** `data_physique_burkina_embeddings` (préfixe `data_` ajouté par PGVectorStore) : passages de
  700 tokens (recouvrement 150) des 72 chapitres, métadonnées `class`, `chapter`, `source`. Reconstruite à chaque
  exécution de `ingest_documents.py`.
- **Schéma `app`** : utilisateurs, conversations, messages (`MESSAGE_KINDS`), résultats de prérequis, signaux de
  difficulté, révisions de flashcards. Créé au démarrage (`database.init_db`).

## 4. Schémas de physique

Claude décrit un schéma en JSON (bloc ```` ```figure ```` dans le chat, champ `figure` d'un exercice) ; le frontend le
dessine en SVG. Types : `circuit` (composants entre nœuds d'une grille, fils, courants, tensions), `forces`
(solides, supports hachurés, vecteurs, angles), `optique` (axe, lentilles, miroirs, objets, images, rayons),
`graphique` (axes avec grandeur et unité, séries, repères) et `geometrie`.

- Backend : `FIGURE_SCHEMAS` (exemples testés par `tests/test_figures.py`), `RAGSystem._valid_figure`.
- Frontend : `components/PhysicsFigure.jsx` (aiguillage + barrière d'erreur), `components/figures/*`,
  `lib/figureSpec.js` (logique pure testée). Étiquettes en texte simple (`U_AB`, `m/s^2`, Ω) ; pointes de flèches en
  polygones pour un export PDF fidèle. L'export Word remplace un schéma par « [Schéma — voir dans l'application] ».

## 5. Frontend

| Élément | Rôle |
|---|---|
| `App.jsx` | État global, sessions invité (`localStorage`, clés `chatphysique-*`), exports |
| `components/RichContent.jsx` | Rendu Markdown + KaTeX + schémas, partagé par tous les contenus |
| `components/ExerciseCard.jsx`, `RemediationQuiz.jsx`, `FlashcardsViewer.jsx`, `CourseViewer.jsx` | Exercices, prérequis, flashcards, lecteur PDF |
| `lib/pdf.js`, `lib/docx.js`, `lib/docxModel.js` | Exports PDF (html2canvas) et Word |
| `tailwind.config.js` | Thèmes daisyUI `chatphysique-light` / `chatphysique-dark` (indigo `#4f46e5`, bleu `#0284c7`, ambre `#d97706`) |

## 6. Tests

- Backend (`pytest`) : programme et couverture des PDF, correspondance des fichiers, schémas, réparation des JSON
  d'exercices, API, base de données (comptes de test préfixés `pytest_`, supprimés en fin de test).
- Frontend (`vitest`) : schémas, exports Word, validations, messages serveur.
