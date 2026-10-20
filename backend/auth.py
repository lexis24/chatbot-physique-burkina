"""Authentification des comptes élèves : hash de mot de passe (bcrypt) et
tokens de connexion (JWT bearer, pas de session serveur)."""
import logging
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path

import bcrypt
import jwt
import psycopg
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from config import config
import database

logger = logging.getLogger(__name__)

JWT_ALGORITHM = "HS256"
JWT_SECRET_FILE = Path(config.DB_PATH).parent / ".jwt_secret"

# En production, un JWT_SECRET auto-généré est dangereux : s'il n'est pas persisté sur un disque
# durable (ou si l'instance change), il change silencieusement et invalide toutes les sessions en
# cours sans le moindre message d'erreur. On préfère refuser de démarrer plutôt que de laisser ce
# risque passer inaperçu. En développement local, la génération automatique reste pratique.
if config.APP_ENV == "production" and not config.JWT_SECRET:
    raise RuntimeError(
        "JWT_SECRET doit être défini explicitement quand APP_ENV=production (variable "
        "d'environnement manquante). Génère-en un (ex: `python -c \"import secrets; "
        "print(secrets.token_hex(32))\"`) et configure-le sur le serveur."
    )

_security = HTTPBearer(auto_error=False)


def _get_jwt_secret() -> str:
    """Utilise JWT_SECRET si configuré, sinon génère un secret une seule fois et le
    persiste sur disque pour que les sessions survivent aux redémarrages du serveur."""
    if config.JWT_SECRET:
        return config.JWT_SECRET

    JWT_SECRET_FILE.parent.mkdir(parents=True, exist_ok=True)
    if JWT_SECRET_FILE.exists():
        return JWT_SECRET_FILE.read_text(encoding="utf-8").strip()

    secret = secrets.token_hex(32)
    JWT_SECRET_FILE.write_text(secret, encoding="utf-8")
    return secret


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


# Hash "factice" utilisé quand le nom d'utilisateur n'existe pas (voir POST /api/auth/login) :
# sans lui, `verify_password` n'est jamais appelé pour un compte inexistant, ce qui rend la
# réponse mesurablement plus rapide que pour un mauvais mot de passe (verify_password fait
# tourner bcrypt, ~100ms) — un canal auxiliaire permettant à un attaquant de deviner quels noms
# d'utilisateur existent par simple mesure du temps de réponse, avant même de tenter les mots de
# passe. Toujours comparer contre CE hash (jamais le hash réel d'un autre compte) neutralise le
# canal en gardant un coût bcrypt constant, sans jamais faire correspondre un mot de passe.
DUMMY_PASSWORD_HASH = hash_password(secrets.token_hex(32))


def create_token(user_id: str, username: str) -> str:
    # user_id est un UUID (str) depuis la migration vers Postgres/Neon (voir database.py) —
    # str() est un no-op si l'appelant passe déjà une chaîne, gardé pour tolérer un appelant
    # qui passerait encore un uuid.UUID non converti.
    payload = {
        "sub": str(user_id),
        "username": username,
        "exp": datetime.now(timezone.utc) + timedelta(days=config.JWT_EXPIRE_DAYS),
    }
    return jwt.encode(payload, _get_jwt_secret(), algorithm=JWT_ALGORITHM)


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(_security)):
    """Dépendance FastAPI : 401 si le token est absent, invalide, expiré, ou si
    l'utilisateur correspondant n'existe plus."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentification requise")

    try:
        payload = jwt.decode(credentials.credentials, _get_jwt_secret(), algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Token invalide ou expiré")

    # payload["sub"] est un UUID en chaîne (voir create_token) : les tokens émis avant la
    # migration Postgres (sub = entier SQLite) ne correspondront plus à aucun utilisateur et
    # échoueront proprement ici avec 401, forçant une reconnexion.
    try:
        user = database.get_user_by_id(payload["sub"])
    except psycopg.OperationalError as exc:
        # Neon met le calcul en veille après une période d'inactivité : une connexion morte peut
        # remonter jusqu'ici malgré le contrôle du pool (voir database.get_pool, check_connection)
        # — ex: la veille survient pendant que la requête est déjà en vol. Sans ce garde-fou,
        # l'exception se propageait telle quelle et l'élève se retrouvait renvoyé à l'écran de
        # connexion pour une panne base qui n'a rien à voir avec son token : trompeur en
        # production (« ça me déconnecte tout le temps », alors que le token est valide).
        logger.error("Base de données indisponible pendant l'authentification: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="Service temporairement indisponible, réessaie dans un instant.",
        ) from exc
    if not user:
        raise HTTPException(status_code=401, detail="Utilisateur introuvable")
    return user


def get_current_user_optional(credentials: HTTPAuthorizationCredentials = Depends(_security)):
    """Variante non bloquante de get_current_user, pour les routes ouvertes (chat, exercice,
    remédiation, résumé, simplification, photo) qui restent utilisables sans compte, mais qui
    persistent l'échange côté serveur quand l'appelant EST connecté (voir main.py,
    _persist_exchange_best_effort). Retourne None plutôt que de lever 401 si le token est absent,
    invalide ou expiré — dans ce dernier cas, la requête se comporte comme un invité plutôt que
    d'échouer. Contrairement à get_current_user (authentification stricte, voir plus haut) : une
    base indisponible (réveil Neon, voir database.get_pool) dégrade ici aussi vers "invité"
    plutôt que de lever 503 — ces routes doivent rester utilisables par un élève sans compte même
    pendant une panne base, elles n'ont justement pas besoin d'un compte pour fonctionner."""
    if not credentials:
        return None
    try:
        payload = jwt.decode(credentials.credentials, _get_jwt_secret(), algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
    try:
        return database.get_user_by_id(payload["sub"])
    except psycopg.OperationalError as exc:
        logger.warning(
            "Base de données indisponible pendant la résolution optionnelle de l'utilisateur, "
            "requête traitée comme invité: %s", exc,
        )
        return None


def require_decideur(user=Depends(get_current_user)):
    """Dépendance FastAPI pour les routes /api/admin/* : réservées aux comptes décideur
    (créés hors inscription publique, voir create_decideur.py)."""
    if user["role"] != "decideur":
        raise HTTPException(status_code=403, detail="Accès réservé aux comptes décideur")
    return user


def is_consent_ok(user: dict) -> bool:
    return user.get("consent_version") == config.CONSENT_VERSION


def require_consent(user=Depends(get_current_user)):
    """Dépendance FastAPI : 428 (Precondition Required) si le compte n'a pas accepté la version
    courante du consentement (config.CONSENT_VERSION, voir consent_text.py). Couvre deux cas :
    les comptes migrés depuis l'ancienne base SQLite (consent_version = NULL, voir
    migrate_sqlite_to_pg.py) et les comptes déjà inscrits sous un texte de consentement antérieur
    si celui-ci a changé depuis. Le frontend distingue ce cas de require_complete_profile via le
    champ "reason" du detail (voir POST /api/consent/accept, ConsentNotice.jsx)."""
    if not is_consent_ok(user):
        raise HTTPException(
            status_code=428,
            detail={"reason": "consent_required", "message": "Consentement requis avant de continuer."},
        )
    return user


# Champs de la fiche d'inscription rendus obligatoires à l'inscription (voir RegisterRequest
# dans main.py) mais qui restent NULLABLES en base (voir database.py, non modifié) : les comptes
# migrés depuis l'ancienne base SQLite (migrate_sqlite_to_pg.py) les ont à NULL, l'obligation
# n'étant appliquée qu'à l'API et à l'interface, jamais par une contrainte NOT NULL.
# is_candidat_libre a NOT NULL DEFAULT false dans le schéma fourni : cette colonne ne peut donc
# jamais valoir NULL, y compris pour un compte migré (voir RAPPORT_MIGRATION.md — la sous-condition
# ci-dessous est incluse pour rester fidèle à la spécification mais ne peut pas se déclencher
# en pratique tant que database.py garde ce défaut).
_PROFILE_REQUIRED_FIELDS = ("class_code", "gender", "birth_date", "is_candidat_libre")


def is_profile_complete(user: dict) -> bool:
    return all(user.get(field) is not None for field in _PROFILE_REQUIRED_FIELDS)


def require_complete_profile(user=Depends(get_current_user)):
    """Dépendance FastAPI : 428 si la fiche d'inscription n'est pas complète. Utilisable telle
    quelle sur une route qui exige déjà l'authentification (ex: un futur /api/profile/complete).
    Les routes "métier" ouvertes aux invités (chat, exercice, remédiation — voir main.py) ne
    PEUVENT PAS utiliser cette dépendance directement : Depends() force get_current_user, donc
    l'authentification, ce qui casserait le mode invité. Elles appellent à la place
    is_profile_complete(user) après avoir résolu l'utilisateur via get_current_user_optional,
    et ne lèvent le 428 QUE si un compte est effectivement connecté (voir
    main._ensure_authenticated_user_ready)."""
    if not is_profile_complete(user):
        raise HTTPException(
            status_code=428,
            detail={
                "reason": "profile_incomplete",
                "message": "Complète ta fiche d'inscription avant de continuer.",
            },
        )
    return user
