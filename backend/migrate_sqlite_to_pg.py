"""
Migration ponctuelle SQLite -> Postgres (Neon).

    python migrate_sqlite_to_pg.py --sqlite chatmaths.db --dry-run
    python migrate_sqlite_to_pg.py --sqlite chatmaths.db

Idempotent : relancer le script ne duplique rien (les comptes déjà présents
sont ignorés, les conversations déjà migrées sont reconnues par leur ancien id).

Ce que la migration NE PEUT PAS reconstituer : les champs de la nouvelle fiche
d'inscription (genre, année de naissance, école, consentement) n'existaient pas.
Les comptes migrés arrivent donc avec ces colonnes à NULL et consent_version à
NULL — il faut leur demander de compléter à la prochaine connexion.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path

import database as db


def _table_exists(cur, name: str) -> bool:
    cur.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    )
    return cur.fetchone() is not None


def _cols(cur, table: str) -> set[str]:
    cur.execute(f"PRAGMA table_info({table})")
    return {r[1] for r in cur.fetchall()}


def migrate(sqlite_path: Path, dry_run: bool = False) -> None:
    if not sqlite_path.exists():
        sys.exit(f"Base SQLite introuvable : {sqlite_path}")

    src = sqlite3.connect(str(sqlite_path))
    src.row_factory = sqlite3.Row
    cur = src.cursor()

    db.init_db()

    # ------------------------------------------------------------------
    # 1. Utilisateurs — l'ancien id entier est mappé vers le nouvel UUID
    # ------------------------------------------------------------------
    id_map: dict[int, str] = {}
    stats = {"users": 0, "users_skipped": 0, "conversations": 0,
             "messages": 0, "remediation": 0, "struggles": 0}

    cur.execute("SELECT * FROM users ORDER BY id")
    for row in cur.fetchall():
        existing = db.get_user_by_username(row["username"])
        if existing:
            id_map[row["id"]] = existing["id"]
            stats["users_skipped"] += 1
            continue

        if dry_run:
            id_map[row["id"]] = f"<uuid-{row['id']}>"
            stats["users"] += 1
            continue

        user = db.create_user(
            username=row["username"],
            password_hash=row["password_hash"],   # hash bcrypt repris tel quel
            role=row["role"] if "role" in row.keys() else "eleve",
        )
        if not user:
            print(f"  ! échec sur l'utilisateur {row['username']}")
            continue

        # created_at d'origine préservé
        if "created_at" in row.keys() and row["created_at"]:
            with db.get_connection() as conn, conn.cursor() as c:
                c.execute(
                    f"UPDATE {db.SCHEMA}.users SET created_at = %s WHERE id = %s",
                    (row["created_at"], user["id"]),
                )
        id_map[row["id"]] = user["id"]
        stats["users"] += 1

    # ------------------------------------------------------------------
    # 2. Conversations + messages
    # ------------------------------------------------------------------
    conv_map: dict[int, str] = {}

    if _table_exists(cur, "conversations"):
        cur.execute("SELECT * FROM conversations ORDER BY id")
        for row in cur.fetchall():
            new_user = id_map.get(row["user_id"])
            if not new_user or dry_run:
                stats["conversations"] += 1 if new_user else 0
                continue

            conv = db.create_conversation(
                new_user,
                row["class_code"] if "class_code" in row.keys() else "",
                row["chapter"] if "chapter" in row.keys() else "",
            )
            with db.get_connection() as conn, conn.cursor() as c:
                c.execute(
                    f"""UPDATE {db.SCHEMA}.conversations
                        SET title = %s, created_at = %s, updated_at = %s
                        WHERE id = %s""",
                    (row["title"], row["created_at"],
                     row["updated_at"] if "updated_at" in row.keys() else row["created_at"],
                     conv["id"]),
                )
            conv_map[row["id"]] = conv["id"]
            stats["conversations"] += 1

    if _table_exists(cur, "messages"):
        mcols = _cols(cur, "messages")
        order = "ORDER BY conversation_id, id"
        cur.execute(f"SELECT * FROM messages {order}")
        for row in cur.fetchall():
            new_conv = conv_map.get(row["conversation_id"])
            if not new_conv:
                continue
            stats["messages"] += 1
            if dry_run:
                continue

            # Le schéma réellement déployé (voir main.py historique, avant la migration Postgres)
            # utilise "type"/"text", pas "role"/"content"/"payload" — colonnes que ce script
            # supposait à tort ("role" ou "sender" n'ont jamais existé), d'où le mapping explicite
            # ci-dessous plutôt qu'une simple détection de colonne.
            if "role" in mcols:
                raw_role = row["role"]
            elif "sender" in mcols:
                raw_role = row["sender"]
            else:
                raw_role = row["type"]
            role = "user" if str(raw_role).lower() in ("user", "eleve", "human") else "assistant"

            content = row["content"] if "content" in mcols else row["text"]

            payload = None
            if "payload" in mcols and row["payload"]:
                try:
                    payload = json.loads(row["payload"])
                except (json.JSONDecodeError, TypeError):
                    payload = None
            elif "sources_json" in mcols or "data_json" in mcols:
                sources = None
                data = None
                try:
                    sources = json.loads(row["sources_json"]) if row["sources_json"] else None
                except (json.JSONDecodeError, TypeError):
                    sources = None
                try:
                    data = json.loads(row["data_json"]) if row["data_json"] else None
                except (json.JSONDecodeError, TypeError):
                    data = None
                if data is not None:
                    payload = data
                elif sources is not None:
                    payload = {"sources": sources}

            db.add_message(
                new_conv,
                id_map[row["user_id"]] if "user_id" in mcols else
                    _owner_of(new_conv),
                role,
                content or "",
                kind=row["kind"] if "kind" in mcols and row["kind"] else "chat",
                payload=payload,
            )

    # ------------------------------------------------------------------
    # 3. Signaux de lacune
    # ------------------------------------------------------------------
    if _table_exists(cur, "remediation_answers"):
        cur.execute("SELECT * FROM remediation_answers")
        rows = cur.fetchall()
        by_user: dict[str, list[dict]] = {}
        for row in rows:
            new_user = id_map.get(row["user_id"])
            if not new_user:
                continue
            by_user.setdefault(
                (new_user, row["class_code"], row["chapter"]), []
            ).append({
                "notion": row["notion"],
                "question": row["question"] if "question" in row.keys() else None,
                "is_correct": bool(row["is_correct"]),
            })
        for (uid, cls, chap), answers in by_user.items():
            stats["remediation"] += len(answers)
            if not dry_run:
                db.add_remediation_answers(uid, cls, chap, answers)

    if _table_exists(cur, "struggles"):
        cur.execute("SELECT * FROM struggles")
        for row in cur.fetchall():
            new_user = id_map.get(row["user_id"])
            if not new_user:
                continue
            stats["struggles"] += 1
            if not dry_run:
                db.add_struggle(
                    new_user, row["notion"],
                    row["class_code"] if "class_code" in row.keys() else "",
                    row["chapter"] if "chapter" in row.keys() else "",
                )

    src.close()

    print("\n--- Migration " + ("(SIMULATION)" if dry_run else "terminée") + " ---")
    for k, v in stats.items():
        print(f"  {k:<18} {v}")
    if dry_run:
        print("\nAucune écriture effectuée. Relancer sans --dry-run pour appliquer.")


def _owner_of(conversation_id: str) -> str:
    with db.get_connection() as conn, conn.cursor() as c:
        c.execute(
            f"SELECT user_id FROM {db.SCHEMA}.conversations WHERE id = %s",
            (conversation_id,),
        )
        return str(c.fetchone()["user_id"])


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--sqlite", default="chatmaths.db",
                    help="chemin de l'ancienne base SQLite")
    ap.add_argument("--dry-run", action="store_true",
                    help="compte les lignes sans rien écrire")
    args = ap.parse_args()
    migrate(Path(args.sqlite), dry_run=args.dry_run)
