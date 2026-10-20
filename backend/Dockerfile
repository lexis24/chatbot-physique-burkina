FROM python:3.11-slim

# libgomp1 : requis par torch (sentence-transformers) au runtime.
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
# torch (dépendance de sentence-transformers) installe par défaut une roue CUDA de plusieurs Go,
# inutile ici (pas de GPU sur un hébergement gratuit) : la variante CPU seule pèse ~10x moins.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.txt

# Copie tout le dossier backend, y compris data/documents (PDF de cours, nécessaires pour "voir
# le cours") — voir .dockerignore : contrairement à .gitignore, il n'exclut pas data/. L'index
# vectoriel (embeddings), lui, n'est plus embarqué dans l'image : il vit à part sur Postgres/
# pgvector (Neon), accessible via la variable DATABASE_URL — voir DEPLOY.md.
COPY . .

# Le modèle d'embeddings HuggingFace (sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2)
# est téléchargé au premier import s'il n'est pas déjà en cache ; on le télécharge ici pour qu'il
# soit déjà présent dans l'image plutôt qu'à chaque démarrage à froid du conteneur. Le
# `cache_folder` DOIT être identique à EMBED_CACHE_DIR dans rag_system.py, sinon le conteneur
# cherche le modèle ailleurs au démarrage et retélécharge (échoue si le réseau sortant est
# indisponible à ce moment-là, au lieu d'utiliser ce cache déjà présent dans l'image).
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2', cache_folder='/app/hf_cache')"

# Railway (et la plupart des PaaS) injectent PORT dynamiquement ; 8000 est un repli pour un usage
# local (docker run sans -e PORT).
ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
