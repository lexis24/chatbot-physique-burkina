# Documentation RAG et Intégration Drive

## 1. Comment le RAG est Intégré dans le Projet

### 1.1 Architecture RAG Complète

Le système RAG (Retrieval-Augmented Generation) est intégré via **LlamaIndex**, qui orchestre l'ensemble du pipeline :

```
Documents → Extraction → Chunking → Embeddings → Vector Store → Retrieval → LLM → Réponse
```

### 1.2 Composants Principaux

#### A. Système d'Embeddings (rag_system.py)
```python
self.embed_model = HuggingFaceEmbedding(
    model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
)
```

**Rôle** : Convertit le texte en vecteurs numériques
- Modèle multilingue optimisé pour le français
- Chaque chunk de texte devient un vecteur de 384 dimensions
- Permet la recherche sémantique (compréhension du sens, pas juste mots-clés)

#### B. Base Vectorielle (ChromaDB)
```python
self.chroma_client = chromadb.PersistentClient(path=config.CHROMA_PERSIST_DIR)
```

**Rôle** : Stocke et indexe les embeddings
- Stockage persistant sur disque (pas de serveur externe)
- Recherche vectorielle optimisée (similarité cosinus)
- Filtrage par métadonnées (classe, chapitre)

#### C. LLM (Hugging Face Inference API)
```python
LlamaSettings.llm = HuggingFaceInferenceAPI(
    model_name="mistralai/Mistral-7B-Instruct-v0.2",
    token=config.HUGGINGFACE_API_KEY
)
```

**Rôle** : Génère les réponses pédagogiques
- Utilise le contexte récupéré pour formuler des réponses
- Modèle Mistral-7B (gratuit via Hugging Face)
- Adapté au français et aux explications pédagogiques

### 1.3 Flux de Traitement Complet

#### Étape 1 : Indexation des Documents
```python
def add_documents(self, documents, metadata=None):
    # 1. Création des objets Document avec métadonnées
    docs = []
    for doc in documents:
        docs.append(Document(
            text=doc.get("text", ""),
            metadata={"class": class_level, "chapter": chapter, "source": filename}
        ))
    
    # 2. Chunking intelligent
    splitter = SentenceSplitter(
        chunk_size=700,      # 700 tokens par chunk
        chunk_overlap=150   # Chevauchement pour le contexte
    )
    
    # 3. Génération des embeddings et insertion
    for doc in docs:
        nodes = splitter.get_nodes_from_documents([doc])
        self.index.insert_nodes(nodes)  # Auto-embedding + stockage
```

**Ce qui se passe :**
1. Chaque document est découpé en chunks de 700 tokens
2. Chaque chunk est converti en vecteur par le modèle d'embeddings
3. Les vecteurs sont stockés dans ChromaDB avec les métadonnées
4. Le chevauchement (overlap) maintient le contexte entre chunks

#### Étape 2 : Recherche (Retrieval)
```python
def query(self, question, class_level=None, chapter=None, top_k=4):
    # 1. Filtrage par métadonnées AVANT la recherche vectorielle
    filters = {}
    if class_level:
        filters["class"] = class_level
    if chapter:
        filters["chapter"] = chapter
    
    # 2. Recherche vectorielle sur les chunks filtrés
    query_engine = self.index.as_query_engine(
        similarity_top_k=top_k,  # Récupère les 4 chunks les plus similaires
        filters=filters if filters else None
    )
    
    # 3. La question est aussi convertie en embedding
    response = query_engine.query(question)
    return response
```

**Ce qui se passe :**
1. La question de l'utilisateur est convertie en embedding
2. Le système filtre d'abord par classe et chapitre (réduit l'espace de recherche)
3. Il cherche les 4 chunks les plus similaires (similarité cosinus)
4. Il retourne les chunks avec leur score de similarité

#### Étape 3 : Génération (Generation)
```python
def generate_response(self, question, class_level, chapter):
    # 1. RAG retrieval
    response = self.query(question, class_level, chapter)
    
    # 2. Les chunks récupérés sont passés au LLM avec la question
    # Prompt interne de LlamaIndex :
    # "Voici des informations contextuelles : {chunks}
    #  Question : {question}
    #  Réponds en t'appuyant sur ces informations."
    
    return {
        "answer": str(response),  # Réponse générée par le LLM
        "sources": [node.metadata for node in response.source_nodes],
        "from_rag": True
    }
```

**Ce qui se passe :**
1. LlamaIndex construit un prompt avec les chunks récupérés
2. Le prompt inclut la question et le contexte documentaire
3. Le LLM génère une réponse basée sur ce contexte
4. Les sources sont citées pour la transparence

## 2. Intégration des Fichiers depuis Google Drive

### 2.1 Méthode Actuelle (Upload Manuel)

Le système actuel permet d'uploader des documents via l'API :

```python
@app.post("/api/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    class_level: str = None,
    chapter: str = None
):
    # 1. Sauvegarde du fichier
    file_path = os.path.join(config.DATA_DIR, file.filename)
    with open(file_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)
    
    # 2. Traitement selon le format
    if file.filename.endswith('.pdf'):
        doc = processor.process_pdf(file_path, metadata)
    elif file.filename.endswith('.docx'):
        doc = processor.process_docx(file_path, metadata)
    
    # 3. Indexation dans le RAG
    rag_system.add_documents([doc], metadata)
```

### 2.2 Intégration Google Drive (À Implémenter)

Pour intégrer directement les fichiers depuis Google Drive, voici l'approche :

#### Option A : Google Drive API (Recommandée)

```python
# À ajouter dans requirements.txt
google-api-python-client==2.108.0
google-auth-httplib2==0.2.0
google-auth-oauthlib==1.1.0

# Nouveau fichier : drive_integration.py
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials
import io

class DriveIntegration:
    def __init__(self, credentials_path):
        self.credentials = Credentials.from_authorized_user_file(credentials_path)
        self.service = build('drive', 'v3', credentials=self.credentials)
    
    def list_math_documents(self, folder_id):
        """Liste les documents mathématiques dans un folder Drive"""
        results = self.service.files().list(
            q=f"'{folder_id}' in parents and (mimeType contains 'pdf' or mimeType contains 'document')",
            fields="files(id, name, mimeType)"
        ).execute()
        return results.get('files', [])
    
    def download_document(self, file_id):
        """Télécharge un document depuis Drive"""
        request = self.service.files().get_media(fileId=file_id)
        file_io = io.BytesIO()
        downloader = request.execute()
        file_io.write(downloader)
        file_io.seek(0)
        return file_io
```

#### Option B : Google Drive Downloader (Plus Simple)

```python
# À ajouter dans requirements.txt
gdown==5.1.0

import gdown

def download_from_drive(drive_url, output_path):
    """Télécharge un fichier depuis un lien Drive partagé"""
    gdown.download(drive_url, output_path, fuzzy=True)
```

### 2.3 Workflow d'Intégration Drive Complet

```python
# Dans document_processor.py
class DocumentProcessor:
    def process_drive_folder(self, drive_folder_url):
        """
        Traite tous les documents d'un folder Drive
        Structure attendue :
        drive_folder/
        ├── 6ème/
        │   ├── Chapitre1.pdf
        │   └── Chapitre2.pdf
        ├── 5ème/
        │   └── ...
        """
        # 1. Télécharger le folder Drive
        gdown.download_folder(drive_folder_url, output="./data/drive_docs")
        
        # 2. Parcourir la structure
        for class_dir in os.listdir("./data/drive_docs"):
            class_level = class_dir  # ex: "6ème"
            class_path = os.path("./data/drive_docs", class_dir)
            
            for file_name in os.listdir(class_path):
                file_path = os.path.join(class_path, file_name)
                
                # 3. Extraire le chapitre du nom de fichier
                chapter = file_name.replace(".pdf", "").replace(".docx", "")
                
                # 4. Traiter et indexer
                if file_name.endswith('.pdf'):
                    doc = self.process_pdf(file_path, {
                        "class": class_level,
                        "chapter": chapter,
                        "source": f"Drive: {file_name}"
                    })
                    rag_system.add_documents([doc], doc["metadata"])
```

### 2.4 Structure Recommandée pour Drive

Organisez vos documents Drive ainsi :

```
Maths Burkina Faso/
├── 6ème/
│   ├── Nombres entiers et décimaux.pdf
│   ├── Opérations.pdf
│   ├── Fractions.pdf
│   └── ...
├── 5ème/
│   ├── Calcul littéral.pdf
│   ├── Nombres relatifs.pdf
│   └── ...
├── 4ème/
│   ├── Théorème de Pythagore.pdf
│   ├── Théorème de Thalès.pdf
│   └── ...
├── 3ème/
│   ├── PGCD.pdf
│   ├── Équations second degré.pdf
│   └── ...
├── 2nde/
│   ├── Suites numériques.pdf
│   └── ...
├── 1ère/
│   └── ...
└── Tle/
    └── ...
```

### 2.5 API Endpoint pour Drive (À Ajouter)

```python
# Dans main.py
@app.post("/api/documents/sync-drive")
async def sync_drive_folder(drive_url: str):
    """
    Synchronise les documents depuis un folder Drive
    """
    try:
        processor = DocumentProcessor(config.DATA_DIR)
        
        # Télécharger et traiter
        documents = processor.process_drive_folder(drive_url)
        
        # Indexer
        rag_system.add_documents(documents)
        
        return {
            "message": f"Synchronisé {len(documents)} documents depuis Drive",
            "documents_count": len(documents)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

## 3. Pourquoi Cette Architecture RAG ?

### 3.1 Avantages par Rapport à un LLM Seul

| Approche | Avantages RAG | Inconvénients LLM seul |
|----------|---------------|----------------------|
| **Hallucinations** | Réponses ancrées dans les documents | Peut inventer des informations |
| **Programme** | Strictement conforme au programme burkinabè | Connaissances génériques internationales |
| **Sources** | Citations transparentes | Pas de traçabilité |
| **Mises à jour** | Ajouter de nouveaux documents = facile | Attendre mise à jour du modèle |
| **Coût** | Embeddings locaux + API gratuite | API payante pour modèles performants |

### 3.2 Paramètres RAG Optimisés

```python
CHUNK_SIZE = 700        # Taille optimale pour les manuels scolaires
CHUNK_OVERLAP = 150     # Maintient le contexte entre chunks
TOP_K = 4               # 4 passages suffisants pour une réponse complète
```

**Justification :**
- **700 tokens** : Correspond à ~1-2 pages d'un manuel, assez pour un concept complet
- **150 overlap** : Garantit que les idées importantes ne sont pas coupées
- **TOP_K = 4** : Équilibre entre pertinence et temps de réponse

### 3.3 Filtrage par Métadonnées

```python
filters = {"class": "4ème", "chapter": "Théorème de Pythagore"}
```

**Avantages :**
- Réduit l'espace de recherche (plus rapide)
- Garantit la pertinence (pas de réponses d'autres classes)
- Améliore la précision (contexte approprié)

## 4. Processus d'Indexation Détaillé

### 4.1 Pipeline d'Indexation

```
Document PDF/DOCX
    ↓
Extraction de texte (pypdf / python-docx)
    ↓
Division en chunks (700 tokens + 150 overlap)
    ↓
Assignation des métadonnées (classe, chapitre, source)
    ↓
Génération d'embeddings (sentence-transformers)
    ↓
Stockage dans ChromaDB (vecteurs + métadonnées)
    ↓
Index prêt pour la recherche
```

### 4.2 Exemple Concret

**Document :** "Théorème de Pythagore - 4ème.pdf"

**Contenu :**
```
Le théorème de Pythagore stipule que dans un triangle rectangle,
le carré de l'hypoténuse est égal à la somme des carrés des deux
autres côtés. Si on a un triangle ABC rectangle en A, alors :
BC² = AB² + AC²
```

**Après Chunking :**
- Chunk 1 : "Le théorème de Pythagore stipule que dans un triangle rectangle, le carré de l'hypoténuse est égal à la somme des carrés des deux autres côtés."
- Chunk 2 : "Si on a un triangle ABC rectangle en A, alors : BC² = AB² + AC²"

**Après Embedding :**
- Chunk 1 → Vecteur [0.23, -0.45, 0.67, ...] (384 dimensions)
- Chunk 2 → Vecteur [0.31, -0.52, 0.71, ...] (384 dimensions)

**Métadonnées :**
```python
{
    "class": "4ème",
    "chapter": "Théorème de Pythagore",
    "source": "Théorème de Pythagore - 4ème.pdf"
}
```

**Stockage ChromaDB :**
```
Collection: maths_burkina
├── Document 1
│   ├── Chunk 1 (vecteur + métadonnées)
│   └── Chunk 2 (vecteur + métadonnées)
└── ...
```

## 5. Recherche et Génération

### 5.1 Exemple de Recherche

**Question utilisateur :** "Qu'est-ce que le théorème de Pythagore ?"

**Processus :**
1. **Embedding de la question** : Vecteur [0.28, -0.48, 0.69, ...]
2. **Filtrage** : Seuls les chunks de "4ème" et "Théorème de Pythagore"
3. **Recherche vectorielle** : Trouve les chunks les plus similaires
4. **Résultat** : Chunk 1 (similarité: 0.92), Chunk 2 (similarité: 0.88)

### 5.2 Prompt Envoyé au LLM

```
Contexte information:
Le théorème de Pythagore stipule que dans un triangle rectangle,
le carré de l'hypoténuse est égal à la somme des carrés des deux
autres côtés. Si on a un triangle ABC rectangle en A, alors :
BC² = AB² + AC²

Question: Qu'est-ce que le théorème de Pythagore ?

Réponds en t'appuyant sur ces informations.
```

### 5.3 Réponse Générée

```
Le théorème de Pythagore est un résultat fondamental en géométrie.
Il stipule que dans un triangle rectangle, le carré de la longueur
de l'hypoténuse (le côté opposé à l'angle droit) est égal à la somme
des carrés des longueurs des deux autres côtés.

Formule : Si ABC est un triangle rectangle en A, alors BC² = AB² + AC²

Source : Théorème de Pythagore - 4ème.pdf
```

## 6. Conclusion

L'intégration RAG dans ce projet offre :

1. **Fiabilité** : Réponses basées sur les documents officiels burkinabè
2. **Transparence** : Sources citées pour chaque réponse
3. **Adaptabilité** : Facile d'ajouter de nouveaux documents
4. **Performance** : Recherche optimisée avec filtrage par métadonnées
5. **Gratuité** : Embeddings locaux + API Hugging Face gratuite

Pour intégrer Google Drive, vous pouvez soit :
- Utiliser l'API Google Drive (plus robuste)
- Utiliser gdown (plus simple pour les dossiers partagés)
- Télécharger manuellement et uploader via l'interface existante
