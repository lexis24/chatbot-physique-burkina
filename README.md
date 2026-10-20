# Chat'Maths Burkina Faso 📐

Assistant IA de mathématiques pour les élèves et enseignants du Burkina Faso, basé sur **Claude (Anthropic)** et une
architecture **RAG** (Retrieval-Augmented Generation), de la 6ème à la Terminale.

## 🎯 Ce que fait le projet

- Répond aux questions de maths avec des explications structurées, adaptées au niveau de la classe
- Utilise en priorité les documents officiels indexés (RAG) et complète avec les connaissances de Claude
- Garde la mémoire de la conversation (questions/réponses précédentes) pour rester cohérent
- Génère des exercices structurés (énoncé, indices progressifs, solution détaillée, réponse finale)
- Reformule une réponse de façon plus simple à la demande ("Simplifie")
- Permet de télécharger n'importe quelle réponse ou exercice en **PDF**, formules mathématiques comprises
- Interface moderne (thème clair/sombre, animations, mise en page en blocs)

## 🏗️ Architecture

### Backend — `backend/`
- **Framework** : FastAPI
- **LLM** : Claude (Anthropic API) — génération des réponses, exercices, simplifications
- **RAG** : LlamaIndex + ChromaDB (base vectorielle locale) + embeddings HuggingFace multilingues
- **Mémoire de conversation** : historique envoyé à chaque requête, tronqué aux N derniers échanges
- **Repli hors-ligne** : si Claude est indisponible, un petit socle de connaissances locales prend le relais

### Frontend — `frontend/`
- **Framework** : React 18 + Vite
- **UI** : TailwindCSS + daisyUI (thèmes clair/sombre), composants inspirés de shadcn/ui
- **Animations** : Framer Motion
- **Icônes** : lucide-react
- **Rendu mathématique** : react-markdown + KaTeX (formules LaTeX `$...$` / `$$...$$`)
- **Export PDF** : jsPDF + html2canvas (chargés à la demande, pas dans le bundle principal)

## 📋 Prérequis

- **Python** 3.10 – 3.12 (recommandé : évitez 3.13+ pour l'instant, certaines libs RAG ne sont pas encore compatibles)
- **Node.js** 18 ou supérieur
- Une **clé API Anthropic** : https://console.anthropic.com/settings/keys

> ⚠️ Le LLM (Claude) est **obligatoire** pour avoir de vraies réponses de qualité. Sans clé API, l'application
> fonctionne quand même mais ne renvoie que des réponses génériques de secours très limitées.

## 🚀 Installation

### 1. Backend

Ouvrez un terminal dans VS Code (`Terminal > New Terminal`) :

```bash
cd backend
python -m venv venv

# Windows (PowerShell)
.\venv\Scripts\Activate.ps1
# Linux/Mac
source venv/bin/activate

pip install -r requirements.txt
```

Copiez `.env.example` vers `.env` et renseignez votre clé :

```bash
copy .env.example .env      # Windows
# cp .env.example .env      # Linux/Mac
```

Éditez `backend/.env` :

```env
ANTHROPIC_API_KEY=sk-ant-votre-cle-ici
ANTHROPIC_MODEL=claude-sonnet-5
```



### 2. Frontend

Ouvrez un **second terminal** dans VS Code :

```bash
cd frontend
npm install
```

## ▶️ Lancer l'application

**Terminal 1 — Backend** (dans `backend/`, venv activé) :

```bash
python main.py
```
ou, équivalent avec rechargement automatique :
```bash
python -m uvicorn main:app --reload
```
→ API disponible sur `http://127.0.0.1:8000` (documentation interactive sur `/docs`)

**Terminal 2 — Frontend** (dans `frontend/`) :

```bash
npm run dev
```
→ Application disponible sur `http://localhost:5173`

Ouvrez `http://localhost:5173` dans votre navigateur : c'est l'application.

### Astuce VS Code

Vous pouvez garder les deux terminaux ouverts côte à côte (icône "Split Terminal") pour voir les logs backend et
frontend en même temps, ou utiliser les scripts fournis à la racine :

```bash
npm run install:all   # installe tout (racine + frontend + backend)
npm run dev           # lance backend + frontend en parallèle (nécessite npm install à la racine)
```

## 📦 Dépendances clés

### Backend (`backend/requirements.txt`)
| Paquet | Rôle |
|---|---|
| `fastapi`, `uvicorn` | Serveur API |
| `anthropic` | Appel au LLM Claude |
| `llama-index`, `llama-index-embeddings-huggingface`, `llama-index-vector-stores-chroma` | Pipeline RAG |
| `chromadb` | Base vectorielle locale persistante |
| `sentence-transformers` | Génération des embeddings (modèle multilingue) |
| `pypdf`, `python-docx`, `beautifulsoup4` | Extraction de texte des documents (PDF/DOCX) |

### Frontend (`frontend/package.json`)
| Paquet | Rôle |
|---|---|
| `tailwindcss`, `daisyui`, `@tailwindcss/typography` | Design système et thèmes |
| `framer-motion` | Animations |
| `lucide-react` | Icônes |
| `react-markdown`, `remark-math`, `rehype-katex`, `katex` | Rendu Markdown + formules mathématiques |
| `jspdf`, `html2canvas` | Export PDF des réponses (chargement différé) |

## 📁 Structure du projet

```
chatbot-maths-burkina/
├── backend/
│   ├── main.py                 # API FastAPI (endpoints /api/*)
│   ├── config.py                # Configuration (clé Claude, RAG, CORS...)
│   ├── rag_system.py            # RAG + appels Claude + prompts + exercices structurés
│   ├── document_processor.py    # Extraction de texte (PDF/DOCX/TXT)
│   ├── curriculum_data.py       # Programme officiel (classes/chapitres)
│   ├── requirements.txt
│   ├── .env.example
│   └── data/
│       ├── documents/           # Vos PDF/DOCX à indexer, organisés par classe/chapitre
│       └── chroma_db/           # Base vectorielle (générée automatiquement)
├── frontend/
│   ├── src/
│   │   ├── components/          # Header, Sidebar, MessageBubble, ExerciseCard, ChatInput, ui/*
│   │   ├── lib/                 # utils.js (classnames), pdf.js (export PDF)
│   │   ├── api.js                # Appels à l'API backend
│   │   ├── App.jsx
│   │   └── styles/main.css
│   ├── tailwind.config.js
│   └── package.json
└── docs/
```

## 📚 Ajouter vos propres documents (RAG)

1. Placez vos fichiers PDF/DOCX/TXT dans `backend/data/documents/`
2. Uploadez-les via l'API (ou copiez-les manuellement puis appelez `/index`) :
   ```bash
   curl -X POST "http://localhost:8000/api/documents/upload" \
     -F "file=@votre_document.pdf" -F "class_level=4ème" -F "chapter=Théorème de Pythagore"
   ```
3. Le système les découpe en chunks, les indexe dans ChromaDB, et les utilise en priorité dans les réponses.

## 🔧 Endpoints API principaux

| Endpoint | Description |
|---|---|
| `GET /api/classes` | Liste des classes (6ème → Terminale) |
| `GET /api/classes/{code}/chapters` | Chapitres d'une classe |
| `POST /api/chat` | Pose une question (avec historique de conversation) |
| `POST /api/exercise` | Génère un exercice structuré (énoncé/indices/solution/difficulté) |
| `POST /api/simplify` | Reformule une réponse plus simplement |
| `POST /api/documents/upload` | Ajoute un document à la base RAG |
| `GET /api/health` | Vérifie l'état du serveur et du LLM |

## 🐛 Dépannage

- **"Hors ligne" dans l'interface**  → vérifiez que le backend tourne bien sur le port 8000 (`http://127.0.0.1:8000/api/health`).
- **Réponses génériques/répétitives, jamais de vraies réponses de Claude** → vérifiez que `ANTHROPIC_API_KEY` est bien
  renseignée dans `backend/.env` et que le modèle configuré (`ANTHROPIC_MODEL`) existe encore (les modèles Anthropic
  sont régulièrement mis à jour ; consultez https://docs.anthropic.com/en/docs/about-claude/models si une erreur
  "model not found" apparaît dans les logs du backend).
- **Erreur d'installation `sentence-transformers`/`chromadb`** → utilisez Python 3.10–3.12 dans un environnement virtuel dédié.
- **CORS bloqué** → vérifiez `CORS_ORIGINS` dans `backend/.env` (doit inclure `http://localhost:5173`).

## 🚀 Idées de fonctionnalités pour aller plus loin

Le cœur LLM/RAG est maintenant solide. Voici des pistes pour continuer à enrichir le projet :

- **Streaming des réponses** (Server-Sent Events) pour afficher le texte de Claude au fur et à mesure, comme ChatGPT
- **Authentification élève/enseignant** + historique de conversation persistant (base de données)
- **Tableau de bord enseignant** : suivi de la progression, chapitres les plus posés en question, export de rapports
- **Mode "quiz" à répétition espacée** (spaced repetition) pour réviser avant les examens (BEPC/BAC)
- **OCR de photos d'exercices manuscrits** (l'élève prend en photo son cahier, Claude corrige)
- **Génération d'un QCM/contrôle complet** en PDF à partir d'un chapitre
- **Mode hors-ligne partiel** (cache des dernières réponses via service worker / PWA installable)
- **Multi-modèle** : fallback automatique Claude → autre fournisseur en cas de panne prolongée
- **Textes vocaux** (Text-to-Speech) pour l'accessibilité

---

**Version** : 2.0
**Statut** : Prototype fonctionnel propulsé par Claude + RAG
