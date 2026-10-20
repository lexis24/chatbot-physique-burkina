"""
Couche d'accès Postgres (Neon) — comptes élèves, conversations, messages,
signaux de lacune et agrégats du tableau de bord décideur.

Remplace l'ancienne implémentation SQLite. Les signatures publiques sont
conservées autant que possible pour limiter l'impact sur main.py / auth.py.

Changement majeur : les identifiants sont des UUID (str) et non plus des
entiers. Le payload JWT doit donc transporter une chaîne.
"""

from __future__ import annotations

import logging
import re
import secrets
import unicodedata
from contextlib import contextmanager
from datetime import date, datetime, timezone
from typing import Any, Iterable, Optional

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool

from config import config

logger = logging.getLogger(__name__)

SCHEMA = "app"

# Alphabet sans caractères ambigus (ni 0/O, ni 1/I/L) : le code public est
# destiné à être lu à voix haute ou recopié à la main par un élève.
_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
_CODE_LENGTH = 6

MESSAGE_KINDS = (
    "chat", "exercise", "prerequis", "remediation", "summary",
    "simplify", "photo", "course",
)

# --------------------------------------------------------------------------
# Pool de connexions
# --------------------------------------------------------------------------

_pool: Optional[ConnectionPool] = None


def _dsn() -> str:
    """
    Utiliser de préférence l'endpoint *pooler* de Neon (…-pooler.…neon.tech).
    sslmode=require est exigé par Neon.
    """
    dsn = config.DATABASE_URL
    if not dsn:
        raise RuntimeError("DATABASE_URL absent : impossible d'initialiser la base.")
    if "sslmode=" not in dsn:
        dsn += ("&" if "?" in dsn else "?") + "sslmode=require"
    return dsn


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            conninfo=_dsn(),
            min_size=1,
            max_size=getattr(config, "DB_POOL_MAX", 8),
            timeout=30,
            max_idle=300,
            # Neon met le calcul en veille après une période d'inactivité : sans ce contrôle, le
            # pool distribue une connexion déjà morte côté serveur (le client ne le découvre qu'à
            # la prochaine requête, avec `psycopg.OperationalError: SSL connection has been closed
            # unexpectedly`). check_connection teste la connexion avant de la remettre en
            # circulation et en ouvre une neuve si besoin — un aller-retour réseau négligeable.
            check=ConnectionPool.check_connection,
            kwargs={"row_factory": dict_row},
            open=True,
        )
    return _pool


@contextmanager
def get_connection():
    """
    Remplace l'ancien context manager SQLite. Commit automatique en sortie,
    rollback si une exception remonte.
    """
    with get_pool().connection() as conn:
        yield conn


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


# --------------------------------------------------------------------------
# Utilitaires
# --------------------------------------------------------------------------

def normalize_key(value: str) -> str:
    """
    Normalisation ASCII / minuscule / sans ponctuation.
    Même logique que document_processor.normalize_key — dupliquée ici pour
    éviter une dépendance circulaire, à factoriser si besoin.
    """
    if not value:
        return ""
    text = unicodedata.normalize("NFKD", value)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return " ".join(text.split())


def generate_public_code(year: Optional[int] = None) -> str:
    """Identifiant lisible communiqué à l'élève : CM-2026-K7F3M2."""
    year = year or datetime.now(timezone.utc).year
    body = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(_CODE_LENGTH))
    return f"CM-{year}-{body}"


def _now() -> datetime:
    return datetime.now(timezone.utc)


# --------------------------------------------------------------------------
# Schéma
# --------------------------------------------------------------------------

_DDL = f"""
CREATE SCHEMA IF NOT EXISTS {SCHEMA};
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS {SCHEMA}.schools (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL,
    name_normalized text NOT NULL UNIQUE,
    city            text,
    region          text,
    is_verified     boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS {SCHEMA}.users (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    public_code       text UNIQUE NOT NULL,
    username          text UNIQUE NOT NULL,
    username_key      text UNIQUE NOT NULL,
    password_hash     text NOT NULL,
    role              text NOT NULL DEFAULT 'eleve'
                      CHECK (role IN ('eleve', 'decideur')),

    class_code        text,
    gender            text CHECK (gender IN ('F', 'M')),
    birth_date        date CHECK (birth_date IS NULL OR birth_date <= CURRENT_DATE),
    is_candidat_libre boolean,
    school_id         uuid REFERENCES {SCHEMA}.schools(id) ON DELETE SET NULL,
    school_raw        text,

    consent_version   text,
    consent_at        timestamptz,

    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    last_login_at     timestamptz
);

CREATE INDEX IF NOT EXISTS users_class_idx   ON {SCHEMA}.users (class_code);
CREATE INDEX IF NOT EXISTS users_school_idx  ON {SCHEMA}.users (school_id);
CREATE INDEX IF NOT EXISTS users_created_idx ON {SCHEMA}.users (created_at);

CREATE TABLE IF NOT EXISTS {SCHEMA}.conversations (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES {SCHEMA}.users(id) ON DELETE CASCADE,
    title         text,
    class_code    text,
    chapter       text,
    message_count integer NOT NULL DEFAULT 0,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    deleted_at    timestamptz
);

CREATE INDEX IF NOT EXISTS conv_user_idx
    ON {SCHEMA}.conversations (user_id, updated_at DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS {SCHEMA}.messages (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES {SCHEMA}.conversations(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES {SCHEMA}.users(id) ON DELETE CASCADE,
    seq             integer NOT NULL,
    role            text NOT NULL CHECK (role IN ('user', 'assistant')),
    kind            text NOT NULL DEFAULT 'chat',
    content         text NOT NULL,
    payload         jsonb,
    class_code      text,
    chapter         text,
    difficulty      smallint,
    from_rag        boolean,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (conversation_id, seq)
);

CREATE INDEX IF NOT EXISTS msg_user_idx ON {SCHEMA}.messages (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS msg_conv_idx ON {SCHEMA}.messages (conversation_id, seq);

CREATE TABLE IF NOT EXISTS {SCHEMA}.remediation_answers (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid NOT NULL REFERENCES {SCHEMA}.users(id) ON DELETE CASCADE,
    class_code   text,
    chapter      text,
    notion       text,
    question     text,
    is_correct   boolean NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rem_user_idx    ON {SCHEMA}.remediation_answers (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rem_chapter_idx ON {SCHEMA}.remediation_answers (class_code, chapter);

CREATE TABLE IF NOT EXISTS {SCHEMA}.struggles (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES {SCHEMA}.users(id) ON DELETE CASCADE,
    class_code  text,
    chapter     text,
    notion      text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS struggle_user_idx ON {SCHEMA}.struggles (user_id, created_at DESC);

-- Répétition espacée pour les flashcards (voir /api/flashcards, /api/flashcards/review côté
-- main.py) : une ligne par carte déjà revue par un élève connecté (les invités gardent l'usage
-- normal des flashcards mais sans mémoire d'une session à l'autre, faute de compte). card_key
-- est un hash stable du recto de la carte (voir _flashcard_card_key côté main.py) — les fichiers
-- JSON déposés par l'équipe pédagogique n'ont pas d'identifiant propre, et on ne veut pas leur
-- en imposer un.
CREATE TABLE IF NOT EXISTS {SCHEMA}.flashcard_reviews (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES {SCHEMA}.users(id) ON DELETE CASCADE,
    class_code    text NOT NULL,
    chapter       text NOT NULL,
    card_key      text NOT NULL,
    repetitions   integer NOT NULL DEFAULT 0,
    ease_factor   real NOT NULL DEFAULT 2.5,
    interval_days integer NOT NULL DEFAULT 0,
    due_at        timestamptz NOT NULL DEFAULT now(),
    last_correct  boolean,
    updated_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, class_code, chapter, card_key)
);

CREATE INDEX IF NOT EXISTS flashcard_review_due_idx
    ON {SCHEMA}.flashcard_reviews (user_id, class_code, chapter, due_at);
"""


def init_db() -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(_DDL)
    logger.info("Schéma %s initialisé.", SCHEMA)


# --------------------------------------------------------------------------
# Établissements
# --------------------------------------------------------------------------

def resolve_school(name: Optional[str], city: Optional[str] = None,
                   region: Optional[str] = None) -> Optional[str]:
    """
    Rattache une saisie libre à un établissement du référentiel, ou en crée un
    nouveau marqué is_verified = false (à fusionner plus tard côté admin).
    Retourne l'id de l'école, ou None si la saisie est vide.
    """
    if not name or not name.strip():
        return None
    key = normalize_key(name)
    if not key:
        return None

    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"SELECT id FROM {SCHEMA}.schools WHERE name_normalized = %s",
            (key,),
        )
        row = cur.fetchone()
        if row:
            return str(row["id"])

        cur.execute(
            f"""INSERT INTO {SCHEMA}.schools (name, name_normalized, city, region, is_verified)
                VALUES (%s, %s, %s, %s, false)
                ON CONFLICT (name_normalized) DO UPDATE SET name = EXCLUDED.name
                RETURNING id""",
            (name.strip(), key, city, region),
        )
        return str(cur.fetchone()["id"])


def search_schools(term: str, limit: int = 10) -> list[dict]:
    """Autocomplétion du champ établissement à l'inscription."""
    key = normalize_key(term or "")
    if len(key) < 2:
        return []
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"""SELECT id, name, city, region, is_verified
                FROM {SCHEMA}.schools
                WHERE name_normalized LIKE %s
                ORDER BY is_verified DESC, name
                LIMIT %s""",
            (f"%{key}%", limit),
        )
        return [dict(r) | {"id": str(r["id"])} for r in cur.fetchall()]


# --------------------------------------------------------------------------
# Utilisateurs
# --------------------------------------------------------------------------

def create_user(
    username: str,
    password_hash: str,
    role: str = "eleve",
    *,
    class_code: Optional[str] = None,
    gender: Optional[str] = None,
    birth_date: Optional[date] = None,
    is_candidat_libre: bool = False,
    school_name: Optional[str] = None,
    consent_version: Optional[str] = None,
) -> Optional[dict]:
    """
    Crée un compte. Retourne le dict utilisateur, ou None si le nom est pris.
    Le champ école est ignoré si l'élève est candidat libre.
    """
    school_id = None
    if not is_candidat_libre:
        school_id = resolve_school(school_name)

    key = normalize_key(username)
    consent_at = _now() if consent_version else None

    for _ in range(5):  # collision improbable sur public_code, mais bornée
        code = generate_public_code()
        try:
            with get_connection() as conn, conn.cursor() as cur:
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.users
                        (public_code, username, username_key, password_hash, role,
                         class_code, gender, birth_date, is_candidat_libre,
                         school_id, school_raw, consent_version, consent_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        RETURNING *""",
                    (code, username.strip(), key, password_hash, role,
                     class_code, gender, birth_date, is_candidat_libre,
                     school_id, (school_name or None),
                     consent_version, consent_at),
                )
                return _user_row(cur.fetchone())
        except psycopg.errors.UniqueViolation as exc:
            if "public_code" in str(exc):
                continue          # on retente avec un autre code
            return None           # username déjà pris
    logger.error("Impossible de générer un public_code unique.")
    return None


def _user_row(row) -> Optional[dict]:
    if row is None:
        return None
    d = dict(row)
    d["id"] = str(d["id"])
    if d.get("school_id"):
        d["school_id"] = str(d["school_id"])
    return d


def get_user_by_username(username: str) -> Optional[dict]:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"SELECT * FROM {SCHEMA}.users WHERE username_key = %s",
            (normalize_key(username),),
        )
        return _user_row(cur.fetchone())


def get_user_by_id(user_id: str) -> Optional[dict]:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(f"SELECT * FROM {SCHEMA}.users WHERE id = %s", (user_id,))
        return _user_row(cur.fetchone())


def touch_last_login(user_id: str) -> None:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"UPDATE {SCHEMA}.users SET last_login_at = now() WHERE id = %s",
            (user_id,),
        )


def update_profile_fields(user_id: str, **fields) -> Optional[dict]:
    """
    Complétion différée de la fiche (rappel non bloquant dans ProfilePanel).
    Seuls les champs de la liste blanche sont modifiables.
    """
    allowed = {"class_code", "gender", "birth_date",
               "is_candidat_libre", "school_raw"}
    updates = {k: v for k, v in fields.items() if k in allowed}

    if "school_name" in fields:
        updates["school_id"] = resolve_school(fields["school_name"])
        updates["school_raw"] = fields["school_name"]

    if not updates:
        return get_user_by_id(user_id)

    cols = ", ".join(f"{k} = %s" for k in updates)
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"UPDATE {SCHEMA}.users SET {cols}, updated_at = now() "
            f"WHERE id = %s RETURNING *",
            (*updates.values(), user_id),
        )
        return _user_row(cur.fetchone())


# --------------------------------------------------------------------------
# Conversations
# --------------------------------------------------------------------------

def create_conversation(user_id: str, class_code: str = "",
                        chapter: str = "") -> dict:
    # Titre neutre à la création : remplacé au premier message par la vraie question de l'élève,
    # ou à défaut (conversation démarrée par un exercice/prérequis, sans question tapée) par un
    # titre déduit du chapitre — voir add_message/_fallback_conversation_title. Un titre "classe ·
    # chapitre" fixe dès la création n'aiderait pas à distinguer les conversations d'une même
    # classe/chapitre entre elles.
    title = "Nouvelle conversation"
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"""INSERT INTO {SCHEMA}.conversations (user_id, title, class_code, chapter)
                VALUES (%s, %s, %s, %s) RETURNING *""",
            (user_id, title, class_code or None, chapter or None),
        )
        row = dict(cur.fetchone())
        row["id"] = str(row["id"])
        row["user_id"] = str(row["user_id"])
        return row


def list_conversations(user_id: str, limit: int = 50) -> list[dict]:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"""SELECT id, title, class_code, chapter, message_count,
                       created_at, updated_at
                FROM {SCHEMA}.conversations
                WHERE user_id = %s AND deleted_at IS NULL
                ORDER BY updated_at DESC
                LIMIT %s""",
            (user_id, limit),
        )
        return [dict(r) | {"id": str(r["id"])} for r in cur.fetchall()]


def get_conversation(conversation_id: str, user_id: str) -> Optional[dict]:
    """Le user_id est TOUJOURS dans le WHERE : pas d'accès croisé entre élèves."""
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"""SELECT * FROM {SCHEMA}.conversations
                WHERE id = %s AND user_id = %s AND deleted_at IS NULL""",
            (conversation_id, user_id),
        )
        row = cur.fetchone()
        if not row:
            return None
        d = dict(row)
        d["id"] = str(d["id"])
        d["user_id"] = str(d["user_id"])
        return d


def get_messages(conversation_id: str, user_id: str) -> list[dict]:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"""SELECT m.id, m.seq, m.role, m.kind, m.content, m.payload,
                       m.class_code, m.chapter, m.difficulty, m.from_rag, m.created_at
                FROM {SCHEMA}.messages m
                JOIN {SCHEMA}.conversations c ON c.id = m.conversation_id
                WHERE m.conversation_id = %s
                  AND m.user_id = %s
                  AND c.deleted_at IS NULL
                ORDER BY m.seq""",
            (conversation_id, user_id),
        )
        return [dict(r) | {"id": str(r["id"])} for r in cur.fetchall()]


def delete_conversation(conversation_id: str, user_id: str) -> bool:
    """Suppression logique : réversible, purgée séparément après 30 jours."""
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"""UPDATE {SCHEMA}.conversations SET deleted_at = now()
                WHERE id = %s AND user_id = %s AND deleted_at IS NULL""",
            (conversation_id, user_id),
        )
        return cur.rowcount > 0


def purge_deleted_conversations(days: int = 30) -> int:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"""DELETE FROM {SCHEMA}.conversations
                WHERE deleted_at IS NOT NULL
                  AND deleted_at < now() - make_interval(days => %s)""",
            (days,),
        )
        return cur.rowcount


# --------------------------------------------------------------------------
# Messages
# --------------------------------------------------------------------------

# Titre de repli quand le tout premier message d'une conversation est de l'assistant (exercice ou
# prérequis généré sans qu'aucune question n'ait été tapée, voir /api/exercise et /api/prerequis
# côté main.py) : sans ça, "Titre auto = première question de l'élève" ne s'applique jamais et le
# titre neutre "Nouvelle conversation" reste collé pour toujours, même après de vrais échanges —
# c'était le bug remonté par l'utilisatrice ("l'historique ne marche pas vraiment"). On ne reprend
# pas `content` tel quel pour ces kind-là : c'est l'énoncé complet de l'exercice (un paragraphe),
# pas un titre court.
_ASSISTANT_FIRST_MESSAGE_LABELS = {"exercise": "Exercice", "prerequis": "Prérequis"}


def _fallback_conversation_title(kind: str, chapter: Optional[str]) -> Optional[str]:
    label = _ASSISTANT_FIRST_MESSAGE_LABELS.get(kind)
    if not label:
        return None
    return f"{label} : {chapter}" if chapter else label


def add_message(
    conversation_id: str,
    user_id: str,
    role: str,
    content: str,
    *,
    kind: str = "chat",
    payload: Optional[dict] = None,
    class_code: Optional[str] = None,
    chapter: Optional[str] = None,
    difficulty: Optional[int] = None,
    from_rag: Optional[bool] = None,
) -> Optional[dict]:
    """
    Insère un message. Le numéro d'ordre (seq) est calculé côté base dans la
    même instruction : deux requêtes concurrentes ne peuvent pas obtenir le
    même seq (contrainte UNIQUE), on retente une fois en cas de collision.
    """
    if kind not in MESSAGE_KINDS:
        kind = "chat"

    for attempt in range(2):
        try:
            with get_connection() as conn, conn.cursor() as cur:
                cur.execute(
                    f"""INSERT INTO {SCHEMA}.messages
                        (conversation_id, user_id, seq, role, kind, content,
                         payload, class_code, chapter, difficulty, from_rag)
                        SELECT %s, %s,
                               COALESCE((SELECT MAX(seq) FROM {SCHEMA}.messages
                                         WHERE conversation_id = %s), 0) + 1,
                               %s, %s, %s, %s, %s, %s, %s, %s
                        WHERE EXISTS (
                            SELECT 1 FROM {SCHEMA}.conversations
                            WHERE id = %s AND user_id = %s AND deleted_at IS NULL
                        )
                        RETURNING *""",
                    (conversation_id, user_id, conversation_id,
                     role, kind, content,
                     Jsonb(payload) if payload is not None else None,
                     class_code, chapter, difficulty, from_rag,
                     conversation_id, user_id),
                )
                row = cur.fetchone()
                if row is None:
                    return None   # conversation inexistante ou pas la sienne

                # Titre auto = première question de l'élève, ou à défaut (premier message de
                # l'assistant, ex: exercice/prérequis généré sans question tapée) un titre déduit
                # du chapitre — voir _fallback_conversation_title. Jamais appliqué après le tout
                # premier message (message_count = 0, lu AVANT l'incrément ci-dessus) : on ne veut
                # pas écraser un titre déjà fixé par la suite de la conversation.
                fallback_title = None if role == "user" else _fallback_conversation_title(kind, chapter)
                cur.execute(
                    f"""UPDATE {SCHEMA}.conversations
                        SET message_count = message_count + 1,
                            updated_at = now(),
                            title = CASE
                                WHEN message_count != 0 THEN title
                                WHEN %s = 'user' THEN left(%s, 80)
                                WHEN %s::text IS NOT NULL THEN %s::text
                                ELSE title
                            END
                        WHERE id = %s""",
                    (role, content, fallback_title, fallback_title, conversation_id),
                )
                d = dict(row)
                d["id"] = str(d["id"])
                return d
        except psycopg.errors.UniqueViolation:
            if attempt == 0:
                continue
            logger.warning("Collision de seq persistante sur %s", conversation_id)
            return None
    return None


def add_exchange(
    conversation_id: str,
    user_id: str,
    question: str,
    answer: str,
    **meta,
) -> None:
    """
    Écrit la question ET la réponse du tuteur en une seule fois.
    Appelé par main.py à la fin du traitement (y compris fin de stream),
    ce qui remplace le persistMessage best-effort du frontend.
    """
    add_message(conversation_id, user_id, "user", question, **meta)
    add_message(conversation_id, user_id, "assistant", answer, **meta)


def list_user_messages(user_id: str, limit: int = 1000,
                       before: Optional[datetime] = None) -> list[dict]:
    """
    Historique complet d'un élève, toutes conversations confondues.
    Sert à l'export global et au profil de progression.
    """
    clause = "AND m.created_at < %s" if before else ""
    params: list[Any] = [user_id] + ([before] if before else []) + [limit]
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"""SELECT m.id, m.conversation_id, c.title AS conversation_title,
                       m.seq, m.role, m.kind, m.content, m.payload,
                       m.class_code, m.chapter, m.created_at
                FROM {SCHEMA}.messages m
                JOIN {SCHEMA}.conversations c ON c.id = m.conversation_id
                WHERE m.user_id = %s AND c.deleted_at IS NULL {clause}
                ORDER BY m.created_at DESC
                LIMIT %s""",
            params,
        )
        return [dict(r) | {"id": str(r["id"]),
                           "conversation_id": str(r["conversation_id"])}
                for r in cur.fetchall()]


def export_user_history(user_id: str) -> list[dict]:
    """
    Toutes les conversations d'un élève, ordonnées, prêtes pour l'export Word.
    Réservé à l'élève lui-même — jamais exposé au rôle décideur.
    """
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"""SELECT c.id, c.title, c.class_code, c.chapter, c.created_at,
                       json_agg(json_build_object(
                           'seq', m.seq, 'role', m.role, 'kind', m.kind,
                           'content', m.content, 'payload', m.payload,
                           'created_at', m.created_at
                       ) ORDER BY m.seq) AS messages
                FROM {SCHEMA}.conversations c
                LEFT JOIN {SCHEMA}.messages m ON m.conversation_id = c.id
                WHERE c.user_id = %s AND c.deleted_at IS NULL
                GROUP BY c.id
                HAVING count(m.id) > 0
                ORDER BY c.created_at""",
            (user_id,),
        )
        return [dict(r) | {"id": str(r["id"])} for r in cur.fetchall()]


# --------------------------------------------------------------------------
# Signaux de lacune
# --------------------------------------------------------------------------

def add_remediation_answers(user_id: str, class_code: str, chapter: str,
                            answers: Iterable[dict]) -> int:
    rows = [
        (user_id, class_code, chapter,
         a.get("notion"), a.get("question"), bool(a.get("is_correct")))
        for a in answers
    ]
    if not rows:
        return 0
    with get_connection() as conn, conn.cursor() as cur:
        cur.executemany(
            f"""INSERT INTO {SCHEMA}.remediation_answers
                (user_id, class_code, chapter, notion, question, is_correct)
                VALUES (%s, %s, %s, %s, %s, %s)""",
            rows,
        )
    return len(rows)


def add_struggle(user_id: str, notion: str, class_code: str = "",
                 chapter: str = "") -> None:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"""INSERT INTO {SCHEMA}.struggles (user_id, class_code, chapter, notion)
                VALUES (%s, %s, %s, %s)""",
            (user_id, class_code or None, chapter or None, notion),
        )


def get_weak_notions(user_id: str, limit: int = 5) -> list[dict]:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"""SELECT notion,
                       count(*) FILTER (WHERE NOT is_correct) AS misses,
                       count(*) AS total
                FROM {SCHEMA}.remediation_answers
                WHERE user_id = %s AND notion IS NOT NULL
                GROUP BY notion
                HAVING count(*) FILTER (WHERE NOT is_correct) > 0
                ORDER BY misses DESC, total DESC
                LIMIT %s""",
            (user_id, limit),
        )
        return [dict(r) for r in cur.fetchall()]


def get_recent_struggles(user_id: str, limit: int = 5) -> list[dict]:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"""SELECT DISTINCT ON (notion) notion, chapter, created_at
                FROM {SCHEMA}.struggles
                WHERE user_id = %s
                ORDER BY notion, created_at DESC
                LIMIT %s""",
            (user_id, limit),
        )
        return [dict(r) for r in cur.fetchall()]


def get_recent_topics(user_id: str, limit: int = 5) -> list[dict]:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"""SELECT DISTINCT ON (chapter) chapter, class_code, updated_at
                FROM {SCHEMA}.conversations
                WHERE user_id = %s AND chapter IS NOT NULL AND deleted_at IS NULL
                ORDER BY chapter, updated_at DESC
                LIMIT %s""",
            (user_id, limit),
        )
        return [dict(r) for r in cur.fetchall()]


# --------------------------------------------------------------------------
# Flashcards (répétition espacée)
# --------------------------------------------------------------------------

def get_flashcard_review_state(user_id: str, class_code: str, chapter: str) -> dict[str, dict]:
    """État de révision de chaque carte déjà vue par CET élève pour ce chapitre, indexé par
    card_key — sert à faire remonter en priorité les cartes en retard ou jamais vues devant
    celles déjà bien maîtrisées (voir get_flashcards côté main.py, qui trie sur "due_at")."""
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"""SELECT card_key, due_at, repetitions, last_correct
                FROM {SCHEMA}.flashcard_reviews
                WHERE user_id = %s AND class_code = %s AND chapter = %s""",
            (user_id, class_code, chapter),
        )
        return {r["card_key"]: dict(r) for r in cur.fetchall()}


def upsert_flashcard_review(user_id: str, class_code: str, chapter: str, card_key: str, correct: bool) -> None:
    """Enregistre le résultat d'une carte et recalcule son échéance de révision — variante
    simplifiée de SM-2 (l'algorithme d'Anki/SuperMemo), adaptée à un signal binaire correct/
    incorrect plutôt qu'une note de qualité 0-5 (voir POST /api/flashcards/review, qui ne
    recueille que "je savais"/"à revoir") :
    - mémorisée : l'intervalle grandit (1 jour, puis 3, puis multiplié par le facteur de
      facilité à chaque répétition suivante), le facteur de facilité augmente légèrement ;
    - ratée : on repart de zéro (revoir dès demain), le facteur de facilité diminue un peu mais
      jamais sous 1.3 (comme dans SM-2), pour ne pas s'effondrer après plusieurs échecs d'affilée."""
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"""SELECT repetitions, ease_factor, interval_days
                FROM {SCHEMA}.flashcard_reviews
                WHERE user_id = %s AND class_code = %s AND chapter = %s AND card_key = %s""",
            (user_id, class_code, chapter, card_key),
        )
        row = cur.fetchone()
        repetitions = row["repetitions"] if row else 0
        ease_factor = row["ease_factor"] if row else 2.5
        interval_days = row["interval_days"] if row else 0

        if correct:
            repetitions += 1
            if repetitions == 1:
                interval_days = 1
            elif repetitions == 2:
                interval_days = 3
            else:
                interval_days = max(1, round(interval_days * ease_factor))
            ease_factor = min(2.8, ease_factor + 0.1)
        else:
            repetitions = 0
            interval_days = 1
            ease_factor = max(1.3, ease_factor - 0.2)

        cur.execute(
            f"""INSERT INTO {SCHEMA}.flashcard_reviews
                    (user_id, class_code, chapter, card_key, repetitions, ease_factor,
                     interval_days, due_at, last_correct, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, now() + make_interval(days => %s), %s, now())
                ON CONFLICT (user_id, class_code, chapter, card_key) DO UPDATE SET
                    repetitions = EXCLUDED.repetitions,
                    ease_factor = EXCLUDED.ease_factor,
                    interval_days = EXCLUDED.interval_days,
                    due_at = EXCLUDED.due_at,
                    last_correct = EXCLUDED.last_correct,
                    updated_at = now()""",
            (user_id, class_code, chapter, card_key, repetitions, ease_factor,
             interval_days, interval_days, correct),
        )


def has_any_history(user_id: str) -> bool:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"""SELECT EXISTS (
                    SELECT 1 FROM {SCHEMA}.messages WHERE user_id = %s
                ) AS ok""",
            (user_id,),
        )
        return bool(cur.fetchone()["ok"])


# --------------------------------------------------------------------------
# Tableau de bord décideur — TOUJOURS agrégé
# --------------------------------------------------------------------------
# Règle invariante : aucune de ces fonctions ne retourne user_id ni content.
# MIN_COHORT masque les cellules dont l'effectif est trop faible pour rester
# anonyme (classe + école + genre suffisent souvent à identifier un élève).

MIN_COHORT = getattr(config, "ADMIN_MIN_COHORT", 5)


def get_admin_overview() -> dict:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"""SELECT
                (SELECT count(*) FROM {SCHEMA}.users WHERE role = 'eleve') AS students,
                (SELECT count(*) FROM {SCHEMA}.conversations WHERE deleted_at IS NULL) AS conversations,
                (SELECT count(*) FROM {SCHEMA}.messages WHERE role = 'user') AS questions,
                (SELECT count(*) FROM {SCHEMA}.remediation_answers) AS quiz_answers,
                (SELECT round(100.0 * avg(CASE WHEN is_correct THEN 1 ELSE 0 END), 1)
                 FROM {SCHEMA}.remediation_answers) AS success_rate"""
        )
        return dict(cur.fetchone())


def get_success_by_chapter(class_code: Optional[str] = None) -> list[dict]:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"""SELECT class_code, chapter,
                       count(DISTINCT user_id) AS cohort,
                       round(100.0 * avg(CASE WHEN is_correct THEN 1 ELSE 0 END), 1) AS success_rate
                FROM {SCHEMA}.remediation_answers
                WHERE (%s::text IS NULL OR class_code = %s)
                GROUP BY class_code, chapter
                HAVING count(DISTINCT user_id) >= %s
                ORDER BY success_rate ASC""",
            (class_code, class_code, MIN_COHORT),
        )
        return [dict(r) for r in cur.fetchall()]


def get_weak_notions_global(class_code: Optional[str] = None,
                            limit: int = 10) -> list[dict]:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"""SELECT notion, class_code,
                       count(DISTINCT user_id) AS cohort,
                       count(*) FILTER (WHERE NOT is_correct) AS misses,
                       count(*) AS total
                FROM {SCHEMA}.remediation_answers
                WHERE notion IS NOT NULL AND (%s::text IS NULL OR class_code = %s)
                GROUP BY notion, class_code
                HAVING count(DISTINCT user_id) >= %s
                ORDER BY misses DESC
                LIMIT %s""",
            (class_code, class_code, MIN_COHORT, limit),
        )
        return [dict(r) for r in cur.fetchall()]


def get_success_trend(class_code: Optional[str] = None) -> list[dict]:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"""SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
                       count(DISTINCT user_id) AS cohort,
                       round(100.0 * avg(CASE WHEN is_correct THEN 1 ELSE 0 END), 1) AS success_rate
                FROM {SCHEMA}.remediation_answers
                WHERE (%s::text IS NULL OR class_code = %s)
                GROUP BY 1
                HAVING count(DISTINCT user_id) >= %s
                ORDER BY 1""",
            (class_code, class_code, MIN_COHORT),
        )
        return [dict(r) for r in cur.fetchall()]


def get_activity_trend(class_code: Optional[str] = None) -> list[dict]:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"""SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
                       count(*) AS conversations,
                       count(DISTINCT user_id) AS cohort
                FROM {SCHEMA}.conversations
                WHERE deleted_at IS NULL AND (%s::text IS NULL OR class_code = %s)
                GROUP BY 1
                HAVING count(DISTINCT user_id) >= %s
                ORDER BY 1""",
            (class_code, class_code, MIN_COHORT),
        )
        return [dict(r) for r in cur.fetchall()]


def get_demographics(class_code: Optional[str] = None) -> dict:
    """
    Répartition genre / candidat libre / tranche d'âge (par pas de 3 ans, calculée depuis
    birth_date — plus de birth_year, voir migrations/004_birth_date_drop_region.sql).
    Chaque cellule sous MIN_COHORT est regroupée dans "autres" plutôt
    qu'affichée telle quelle.
    """
    out: dict[str, list[dict]] = {}
    with get_connection() as conn, conn.cursor() as cur:
        for label, column in (("gender", "gender"),
                              ("candidat_libre", "is_candidat_libre")):
            cur.execute(
                f"""SELECT {column}::text AS value, count(*) AS n
                    FROM {SCHEMA}.users
                    WHERE role = 'eleve' AND (%s::text IS NULL OR class_code = %s)
                    GROUP BY 1""",
                (class_code, class_code),
            )
            rows = [dict(r) for r in cur.fetchall()]
            visible = [r for r in rows if r["n"] >= MIN_COHORT]
            hidden = sum(r["n"] for r in rows if r["n"] < MIN_COHORT)
            if hidden:
                visible.append({"value": "autres", "n": hidden})
            out[label] = visible

        # Tranches de 3 ans (ex: "12-14 ans") plutôt que l'année de naissance brute affichée telle
        # quelle avant ce correctif : birth_date permet de calculer un âge réel (age()), contrairement
        # à birth_year qui ne donnait qu'une année sans jour/mois de référence.
        cur.execute(
            f"""SELECT bracket_start, count(*) AS n FROM (
                    SELECT (date_part('year', age(birth_date))::int / 3) * 3 AS bracket_start
                    FROM {SCHEMA}.users
                    WHERE role = 'eleve' AND birth_date IS NOT NULL
                      AND (%s::text IS NULL OR class_code = %s)
                ) t
                GROUP BY bracket_start""",
            (class_code, class_code),
        )
        age_rows = [dict(r) for r in cur.fetchall()]
        age_visible = [
            {"value": f"{r['bracket_start']}-{r['bracket_start'] + 2} ans", "n": r["n"]}
            for r in age_rows if r["n"] >= MIN_COHORT
        ]
        age_hidden = sum(r["n"] for r in age_rows if r["n"] < MIN_COHORT)
        if age_hidden:
            age_visible.append({"value": "autres", "n": age_hidden})
        out["age_bracket"] = age_visible
    return out
