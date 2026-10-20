# Documentation Technique - Chatbot Maths Burkina Faso

## 1. Architecture Technique

### 1.1 Vue d'ensemble

Le chatbot repose sur une architecture RAG (Retrieval-Augmented Generation) qui combine :
- Un système de retrieval pour rechercher des passages pertinents dans la base documentaire
- Un modèle de langage (LLM) pour générer des réponses pédagogiques

### 1.2 Stack Technologique

#### Backend
- **FastAPI** : Framework web moderne et performant pour l'API
- **LlamaIndex** : Framework d'orchestration RAG
- **ChromaDB** : Base vectorielle pour le stockage des embeddings
- **Ollama** : Runtime local pour les LLM (modèle Mistral)
- **Sentence Transformers** : Modèle d'embeddings multilingue
- **Python** : Langage principal (version 3.9+)

#### Frontend
- **React 18** : Bibliothèque UI moderne
- **Vite** : Build tool rapide
- **TailwindCSS** : Framework CSS utilitaire
- **KaTeX** : Rendu des formules mathématiques
- **Lucide React** : Icônes modernes
- **Axios** : Client HTTP

### 1.3 Flux de Traitement

```
Utilisateur → Sélection Classe/Chapitre → Question
         ↓
    API FastAPI
         ↓
    RAG System
         ↓
    Embedding de la question
         ↓
    Recherche vectorielle (ChromaDB)
         ↓
    Filtrage par métadonnées (classe, chapitre)
         ↓
    Récupération des top-k passages
         ↓
    LLM (Ollama Mistral)
         ↓
    Génération de réponse
         ↓
    Affichage avec sources
```

## 2. Composants du Backend

### 2.1 main.py - API FastAPI

**Rôle** : Point d'entrée de l'application, expose les endpoints REST

**Endpoints principaux** :
- `GET /api/classes` : Liste des classes disponibles
- `GET /api/classes/{code}/chapters` : Chapitres d'une classe
- `POST /api/chat` : Poser une question
- `POST /api/exercise` : Générer un exercice
- `POST /api/simplify` : Simplifier une réponse
- `POST /api/documents/upload` : Uploader un document
- `POST /api/documents/initialize-sample` : Initialiser avec documents exemples

**Choix techniques** :
- FastAPI pour sa performance et sa documentation automatique
- Pydantic pour la validation des données
- CORS middleware pour la communication avec le frontend

### 2.2 rag_system.py - Système RAG

**Rôle** : Cœur du système, gère l'indexation et la recherche

**Classes principales** :
- `RAGSystem` : Classe principale orchestrant le pipeline RAG

**Méthodes clés** :
- `initialize_vector_store()` : Initialise ou charge la base vectorielle
- `add_documents()` : Ajoute des documents à l'index
- `query()` : Recherche des passages pertinents
- `search_internet()` : Fallback via DuckDuckGo
- `generate_response()` : Génère une réponse complète
- `generate_exercise()` : Génère des exercices

**Paramètres RAG** :
- Chunk size : 700 tokens
- Chunk overlap : 150 tokens
- Top-K : 4 documents
- Modèle d'embeddings : paraphrase-multilingual-MiniLM-L12-v2

**Choix techniques** :
- LlamaIndex pour son abstraction simplifiée du pipeline RAG
- ChromaDB pour le stockage local et persistant
- HuggingFace embeddings pour le support multilingue (français)
- Ollama pour un LLM gratuit et local (pas de coûts API)

### 2.3 document_processor.py - Traitement des Documents

**Rôle** : Extraction et traitement des documents pédagogiques

**Formats supportés** :
- PDF via pypdf
- DOCX via python-docx
- TXT natif

**Méthodes** :
- `process_pdf()` : Extraction de texte depuis PDF
- `process_docx()` : Extraction depuis Word
- `process_txt()` : Lecture de fichiers texte
- `create_sample_documents()` : Génération de documents exemples basés sur le curriculum

**Choix techniques** :
- pypdf pour sa robustesse avec les PDF
- python-docx pour les documents Word
- Structure de métadonnées pour le filtrage (classe, chapitre)

### 2.4 curriculum_data.py - Données du Programme

**Rôle** : Définition du programme officiel burkinabè

**Structure** :
- Dictionnaire `CURRICULUM` avec toutes les classes et chapitres
- Fonctions utilitaires pour accéder aux données

**Contenu** :
- Classes : 6ème, 5ème, 4ème, 3ème, 2nde, 1ère, Tle
- Chapitres alignés sur le programme officiel du Ministère de l'Éducation

**Choix techniques** :
- Structure en dictionnaire pour un accès rapide
- Séparation des données pour faciliter les mises à jour

### 2.5 config.py - Configuration

**Rôle** : Centralisation de la configuration

**Paramètres** :
- URLs et modèles Ollama
- Chemins ChromaDB
- Configuration serveur
- Paramètres RAG

**Choix techniques** :
- python-dotenv pour la gestion des variables d'environnement
- Classe Config pour un accès typé

## 3. Composants du Frontend

### 3.1 App.jsx - Composant Principal

**Rôle** : Orchestration de l'interface utilisateur

**États** :
- `selectedClass` : Classe sélectionnée
- `selectedChapter` : Chapitre sélectionné
- `classes` : Liste des classes chargées
- `chapters` : Liste des chapitres de la classe
- `messages` : Historique de conversation

**Flux utilisateur** :
1. Sélection de classe
2. Chargement des chapitres correspondants
3. Sélection du chapitre
4. Interface de chat

**Choix techniques** :
- React Hooks pour la gestion d'état
- Axios pour les appels API
- Design modulaire avec composants séparés

### 3.2 ClassSelector.jsx

**Rôle** : Interface de sélection de classe

**Fonctionnalités** :
- Affichage des classes sous forme de grille
- Feedback visuel sur la sélection
- Icônes pour l'expérience utilisateur

**Choix techniques** :
- Grid layout responsive
- Couleurs conditionnelles pour l'état actif

### 3.3 ChapterSelector.jsx

**Rôle** : Interface de sélection de chapitre

**Fonctionnalités** :
- Liste des chapitres de la classe sélectionnée
- Bouton de retour
- Scroll pour les longues listes

**Choix techniques** :
- Liste verticale avec icônes
- Gestion du scroll pour l'accessibilité

### 3.4 ChatInterface.jsx

**Rôle** : Interface de conversation principale

**Fonctionnalités** :
- Affichage des messages (utilisateur/bot)
- Rendu des formules mathématiques (KaTeX)
- Bouton de simplification
- Génération d'exercices
- Affichage des sources
- Copie des réponses
- Historique de conversation

**Choix techniques** :
- KaTeX pour le rendu LaTeX
- Auto-scroll vers les nouveaux messages
- Gestion de l'état de chargement
- Design responsive mobile-first

## 4. Base de Données et Stockage

### 4.1 ChromaDB

**Type** : Base vectorielle locale

**Stockage** :
- Persistant sur disque
- Chemin configurable via `CHROMA_PERSIST_DIR`

**Structure** :
- Collection : "maths_burkina"
- Métadonnées par document : classe, chapitre, source

**Avantages** :
- Pas de serveur externe requis
- Performance locale
- Persistance automatique

### 4.2 Documents

**Stockage** :
- Répertoire `data/documents/`
- Formats : PDF, DOCX, TXT

**Métadonnées** :
- Classe (ex: "3ème")
- Chapitre (ex: "Théorème de Thalès")
- Source (nom du fichier)

## 5. Sécurité

### 5.1 Protection des Données

- Aucun stockage permanent des conversations
- Pas de données personnelles collectées
- Documents traités localement

### 5.2 CORS

- Origines autorisées configurables
- Protection contre les requêtes cross-origin non autorisées

### 5.3 Validation

- Pydantic pour la validation des entrées
- Vérification des classes et chapitres valides

## 6. Performance

### 6.1 Optimisations

- Chunking optimal des documents (700 tokens)
- Overlap pour maintenir le contexte (150 tokens)
- Top-K limité à 4 pour la rapidité
- Embeddings multilingues optimisés pour le français

### 6.2 Objectifs

- Temps de réponse < 5 secondes
- Chargement initial < 3 secondes
- Compatible 3G

## 7. Déploiement

### 7.1 Requirements

- Python 3.9+
- Node.js 18+
- Ollama avec modèle Mistral
- 4GB RAM minimum
- 10GB disque

### 7.2 Processus

1. Installation des dépendances backend
2. Installation des dépendances frontend
3. Configuration des variables d'environnement
4. Lancement d'Ollama
5. Lancement du backend
6. Lancement du frontend
7. Initialisation des documents

## 8. Maintenance

### 8.1 Mises à jour du Curriculum

- Modifier `curriculum_data.py`
- Ajouter les nouveaux documents correspondants
- Réindexer la base vectorielle

### 8.2 Ajout de Documents

- Via l'endpoint `/api/documents/upload`
- Ou directement dans `data/documents/`
- Avec métadonnées appropriées

### 8.3 Monitoring

- Endpoint `/api/health` pour le statut
- Logs du backend pour les erreurs
- Monitoring de la performance

## 9. Tests

### 9.1 Tests Fonctionnels

- Sélection de classe et chapitre
- Pose de questions
- Génération d'exercices
- Simplification de réponses
- Upload de documents

### 9.2 Tests de Performance

- Temps de réponse
- Charge concurrente
- Utilisation mémoire

## 10. Évolutions Possibles

### 10.1 Court terme

- Authentification utilisateurs
- Historique persistant
- Mode hors-ligne complet
- Application mobile native

### 10.2 Long terme

- Voix pour les questions
- Génération de quiz complets
- Suivi de progression
- Intégration avec les systèmes scolaires

## Conclusion

Cette architecture a été conçue pour être :
- **Simple** : Technologies éprouvées et bien documentées
- **Performante** : Optimisée pour les contraintes de connectivité
- **Maintenable** : Code modulaire et documenté
- **Évolutive** : Facile à étendre avec de nouvelles fonctionnalités
- **Gratuite** : Utilisation exclusive d'outils open-source et gratuits

Le choix d'Ollama pour le LLM permet d'éviter les coûts d'API tout en maintenant une qualité de génération satisfaisante pour un usage éducatif.
