import os
from pathlib import Path
from dotenv import load_dotenv

# Charger le .env en utilisant le chemin absolu
env_path = Path(__file__).resolve().parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()  # fallback

class Config:
    # Anthropic Claude Configuration
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
    ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5")
    ANTHROPIC_TEMPERATURE = float(os.getenv("ANTHROPIC_TEMPERATURE", "0.4"))
    # Ce modèle raisonne avant de répondre (blocs "thinking" qui consomment le même budget de
    # tokens que la réponse) et la part de raisonnement varie fortement d'un appel à l'autre :
    # sur un budget serré, il arrive qu'elle consomme la totalité des tokens sans laisser de
    # place à la moindre réponse texte. Une marge confortable réduit la fréquence de ce cas
    # (voir aussi le repli automatique dans _call_claude/_stream_claude, qui relance la requête
    # depuis zéro si jamais ça se produit malgré tout).
    MAX_TOKENS_CHAT = int(os.getenv("MAX_TOKENS_CHAT", "6144"))
    # Les exercices 4★ (figure géométrique incluse) sortent facilement 3000+ tokens de JSON :
    # une marge confortable évite de dépendre de la relance automatique (fragile en mode JSON,
    # le modèle ne reprenant pas toujours la chaîne exactement où elle a été coupée).
    MAX_TOKENS_EXERCISE = int(os.getenv("MAX_TOKENS_EXERCISE", "6144"))
    # Niveau 5 (olympiades) : raisonnement créatif + solution qui explique l'astuce, pas seulement
    # le calcul — plus long qu'un exercice standard. Avec MAX_TOKENS_EXERCISE, le budget était
    # souvent englouti par le raisonnement interne du modèle avant la moindre sortie JSON, ce qui
    # déclenchait un repli silencieux vers l'exercice de secours générique (bien plus facile que
    # prévu : "olympiades" affiché, mais contenu basique).
    MAX_TOKENS_EXERCISE_OLYMPIAD = int(os.getenv("MAX_TOKENS_EXERCISE_OLYMPIAD", "8192"))
    MAX_TOKENS_SIMPLIFY = int(os.getenv("MAX_TOKENS_SIMPLIFY", "1500"))
    MAX_TOKENS_BASICS = int(os.getenv("MAX_TOKENS_BASICS", "2000"))
    MAX_TOKENS_REMEDIATION = int(os.getenv("MAX_TOKENS_REMEDIATION", "6144"))
    # Second appel de relecture des QCM générés (exercices 1★, prérequis/remédiation) : vérifie
    # que reponse_correcte_index pointe vraiment vers la bonne réponse avant de la servir à
    # l'élève (voir RAGSystem._verify_qcm_batch) — juste des verdicts courts, pas de rédaction.
    MAX_TOKENS_QCM_VERIFICATION = int(os.getenv("MAX_TOKENS_QCM_VERIFICATION", "2048"))
    MAX_TOKENS_EXERCISE_PHOTO = int(os.getenv("MAX_TOKENS_EXERCISE_PHOTO", "3000"))
    # Photo d'exercice envoyée par l'élève : au-delà, on refuse plutôt que de laisser l'upload
    # traîner (mobile en 3G) ou de gonfler inutilement le payload envoyé à l'API Claude.
    MAX_EXERCISE_PHOTO_SIZE_BYTES = int(os.getenv("MAX_EXERCISE_PHOTO_SIZE_BYTES", str(8 * 1024 * 1024)))
    # Document de cours déposé par un décideur (voir /api/documents/upload) : réservé à ce rôle,
    # donc pas un vecteur d'abus anonyme, mais borné quand même pour éviter qu'un envoi
    # malencontreux ne remplisse le disque du serveur.
    MAX_DOCUMENT_UPLOAD_SIZE_BYTES = int(os.getenv("MAX_DOCUMENT_UPLOAD_SIZE_BYTES", str(50 * 1024 * 1024)))
    # Nombre maximal de "continuations" automatiques si Claude tronque une réponse
    # (relance transparente pour ne jamais couper une explication en plein milieu).
    MAX_AUTO_CONTINUATIONS = int(os.getenv("MAX_AUTO_CONTINUATIONS", "3"))

    # Conversation memory (multi-turn)
    HISTORY_MAX_TURNS = int(os.getenv("HISTORY_MAX_TURNS", "6"))

    # Base vectorielle (Postgres + pgvector, ex. Neon) : les embeddings ne sont plus embarqués
    # dans le déploiement (fichiers ChromaDB locaux) mais stockés à part, accessibles par le
    # réseau — voir DEPLOY.md. Chaîne de connexion complète (postgresql://user:pass@host/db).
    DATABASE_URL = os.getenv("DATABASE_URL", "")
    VECTOR_TABLE_NAME = os.getenv("VECTOR_TABLE_NAME", "maths_burkina_embeddings")
    # Taille du pool de connexions Postgres pour les données applicatives (schéma "app" — voir
    # database.py), distinct des connexions ponctuelles utilisées par le RAG sur le même DATABASE_URL.
    DB_POOL_MAX = int(os.getenv("DB_POOL_MAX", "8"))
    # Seuil minimal d'élèves distincts en dessous duquel une cellule du tableau de bord décideur
    # est masquée plutôt qu'affichée : une cohorte trop petite (ex: 1 élève) redevient identifiable
    # même dans un agrégat. Voir database.py (MIN_COHORT) et les fonctions get_admin_*.
    ADMIN_MIN_COHORT = int(os.getenv("ADMIN_MIN_COHORT", "5"))
    # Version du texte de consentement (voir consent_text.py) : tout changement du texte doit
    # s'accompagner d'un changement de cette valeur pour redemander l'accord de chaque élève
    # (y compris les comptes migrés depuis l'ancienne base SQLite, voir migrate_sqlite_to_pg.py).
    CONSENT_VERSION = os.getenv("CONSENT_VERSION", "2026-01")

    # Comptes élèves (auth JWT). DB_PATH ne sert plus qu'à localiser .jwt_secret en développement
    # (voir auth.py) — les données applicatives elles-mêmes vivent désormais dans Postgres/Neon
    # (DATABASE_URL, schéma "app", voir database.py), plus dans un fichier SQLite local.
    DB_PATH = os.getenv("DB_PATH", "./data/app.db")
    JWT_SECRET = os.getenv("JWT_SECRET", "")
    # Volontairement court : réduit la fenêtre d'exploitation d'un token volé (pas de révocation
    # côté serveur pour l'instant, voir auth.py).
    JWT_EXPIRE_DAYS = int(os.getenv("JWT_EXPIRE_DAYS", "7"))

    # Application Configuration
    # "production" active des vérifications strictes au démarrage (voir auth.py : refuse de
    # démarrer sans JWT_SECRET explicite plutôt que d'en générer un silencieusement).
    APP_ENV = os.getenv("APP_ENV", "development")
    APP_HOST = os.getenv("APP_HOST", "0.0.0.0")
    APP_PORT = int(os.getenv("APP_PORT", "8000"))
    CORS_ORIGINS = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")

    # RAG Parameters
    CHUNK_SIZE = 700
    CHUNK_OVERLAP = 150
    TOP_K = 4

    # Data Directory
    DATA_DIR = os.getenv("DATA_DIR", "./data/documents")

    # PDF de résumé par chapitre (voir /api/summary/file, même convention de dossiers que
    # DATA_DIR : <classe>/<chapitre>/fichier.pdf), fournis par l'équipe pédagogique — distinct
    # de DATA_DIR pour ne jamais les faire remonter dans le RAG (ce sont des résumés à
    # télécharger, pas des extraits à retrouver par similarité).
    SUMMARIES_DIR = os.getenv("SUMMARIES_DIR", "./data/summaries")

    # Flashcards par chapitre (voir /api/flashcards, même convention de dossiers que DATA_DIR :
    # <classe>/<chapitre>/fichier.json), un fichier JSON par chapitre fourni par l'équipe
    # pédagogique (voir get_flashcards côté main.py pour le format attendu).
    FLASHCARDS_DIR = os.getenv("FLASHCARDS_DIR", "./data/flashcards")

config = Config()