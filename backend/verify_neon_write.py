"""Vérification bout en bout de l'écriture vers Neon, champ par champ.

Contrairement aux tests pytest (qui vérifient un comportement), ce script vérifie des VALEURS :
pour chaque champ envoyé à database.create_user()/add_message(), il relit la ligne réellement
stockée en base et compare, plutôt que de faire confiance à la valeur de retour de la fonction
elle-même (qui pourrait masquer une troncature, un problème de fuseau horaire, une conversion de
casse... si elle retournait simplement ce qu'on lui a passé en entrée au lieu de relire la base).

Crée deux comptes de test (préfixe "verify_", nettoyés en fin de script, y compris en cas
d'échec) : un élève avec établissement, un candidat libre — pour vérifier aussi que school_id/
school_raw restent bien NULL dans ce second cas plutôt que de recevoir une valeur par défaut
inattendue.

Usage :
    python verify_neon_write.py
"""
from __future__ import annotations

import sys
import uuid
from datetime import date, datetime, timezone

import auth
import database as db
from consent_text import CONSENT_VERSION

PREFIX = "verify_"

created_user_ids: list[str] = []


def _unique(base: str) -> str:
    return f"{PREFIX}{base}_{uuid.uuid4().hex[:8]}"


class Row:
    """Une ligne du tableau de vérification : un champ, sa valeur envoyée, sa valeur relue en
    base, et si elles concordent."""

    def __init__(self, field: str, sent, stored, ok: bool):
        self.field = field
        self.sent = sent
        self.stored = stored
        self.ok = ok


def _check(rows: list[Row], field: str, sent, stored, comparator=None) -> None:
    if comparator is None:
        ok = sent == stored
    else:
        ok = comparator(sent, stored)
    rows.append(Row(field, sent, stored, ok))


def print_table(title: str, rows: list[Row]) -> bool:
    print(f"\n=== {title} ===")
    field_w = max(len(r.field) for r in rows) + 2
    sent_w = max(len(str(r.sent)) for r in rows) + 2
    stored_w = max(len(str(r.stored)) for r in rows) + 2
    header = f"{'Champ':<{field_w}}{'Envoyé':<{sent_w}}{'Stocké':<{stored_w}}Statut"
    print(header)
    print("-" * len(header))
    all_ok = True
    for r in rows:
        status = "OK" if r.ok else "ÉCART"
        if not r.ok:
            all_ok = False
        print(f"{r.field:<{field_w}}{str(r.sent):<{sent_w}}{str(r.stored):<{stored_w}}{status}")
    return all_ok


def verify_student_with_school() -> bool:
    sent = {
        "username": _unique("eleve"),
        "class_code": "3ème",
        "gender": "F",
        "birth_date": date(2011, 6, 15),
        "is_candidat_libre": False,
        "school_name": "Lycée Vérification Neon",
        "consent_version": CONSENT_VERSION,
    }
    user = db.create_user(
        sent["username"], auth.hash_password("motdepasse-verif"),
        class_code=sent["class_code"], gender=sent["gender"], birth_date=sent["birth_date"],
        is_candidat_libre=sent["is_candidat_libre"], school_name=sent["school_name"],
        consent_version=sent["consent_version"],
    )
    assert user is not None, "création du compte élève échouée"
    created_user_ids.append(user["id"])

    reread = db.get_user_by_id(user["id"])
    assert reread is not None, "relecture du compte élève échouée (ligne introuvable)"

    rows: list[Row] = []
    _check(rows, "public_code", "(généré)", reread["public_code"],
           comparator=lambda s, st: bool(st) and st.startswith("CM-"))
    _check(rows, "class_code", sent["class_code"], reread["class_code"])
    _check(rows, "gender", sent["gender"], reread["gender"])
    _check(rows, "birth_date", sent["birth_date"], reread["birth_date"])
    _check(rows, "is_candidat_libre", sent["is_candidat_libre"], reread["is_candidat_libre"])
    _check(rows, "school_raw", sent["school_name"], reread["school_raw"])
    _check(rows, "school_id", "(résolu)", reread["school_id"],
           comparator=lambda s, st: st is not None)
    _check(rows, "consent_version", sent["consent_version"], reread["consent_version"])
    _check(rows, "consent_at", "(horodaté)", reread["consent_at"],
           comparator=lambda s, st: st is not None)
    _check(rows, "created_at", "(horodaté)", reread["created_at"],
           comparator=lambda s, st: st is not None)

    return print_table("Compte élève avec établissement — app.users", rows)


def verify_candidat_libre() -> bool:
    sent = {
        "username": _unique("candlibre"),
        "class_code": "Tle",
        "gender": "M",
        "birth_date": date(2007, 3, 2),
        "is_candidat_libre": True,
    }
    user = db.create_user(
        sent["username"], auth.hash_password("motdepasse-verif"),
        class_code=sent["class_code"], gender=sent["gender"], birth_date=sent["birth_date"],
        is_candidat_libre=sent["is_candidat_libre"], school_name=None,
        consent_version=CONSENT_VERSION,
    )
    assert user is not None, "création du compte candidat libre échouée"
    created_user_ids.append(user["id"])

    reread = db.get_user_by_id(user["id"])
    assert reread is not None, "relecture du compte candidat libre échouée (ligne introuvable)"

    rows: list[Row] = []
    _check(rows, "is_candidat_libre", sent["is_candidat_libre"], reread["is_candidat_libre"])
    _check(rows, "school_id (doit être NULL)", None, reread["school_id"])
    _check(rows, "school_raw (doit être NULL)", None, reread["school_raw"])

    return print_table("Compte candidat libre — app.users (school_id/school_raw)", rows)


def verify_conversation_and_message() -> bool:
    user_id = created_user_ids[0]
    conv = db.create_conversation(user_id, "3ème", "Les fractions")

    sent = {
        "role": "user",
        "content": "Combien font 1/2 + 1/3 ?",
        "kind": "chat",
        "payload": {"note": "vérification Neon"},
        "class_code": "3ème",
        "chapter": "Les fractions",
        "difficulty": 2,
        "from_rag": False,
    }
    message = db.add_message(
        conv["id"], user_id, sent["role"], sent["content"],
        kind=sent["kind"], payload=sent["payload"], class_code=sent["class_code"],
        chapter=sent["chapter"], difficulty=sent["difficulty"], from_rag=sent["from_rag"],
    )
    assert message is not None, "écriture du message échouée"

    reread_messages = db.get_messages(conv["id"], user_id)
    assert len(reread_messages) == 1, f"attendu 1 message, trouvé {len(reread_messages)}"
    reread = reread_messages[0]

    rows: list[Row] = []
    _check(rows, "seq", 1, reread["seq"])
    _check(rows, "role", sent["role"], reread["role"])
    _check(rows, "kind", sent["kind"], reread["kind"])
    _check(rows, "payload", sent["payload"], reread["payload"])
    _check(rows, "class_code", sent["class_code"], reread["class_code"])
    _check(rows, "chapter", sent["chapter"], reread["chapter"])
    _check(rows, "difficulty", sent["difficulty"], reread["difficulty"])
    _check(rows, "from_rag", sent["from_rag"], reread["from_rag"])

    # user_id n'est pas renvoyé par get_messages (voir RAPPORT_MIGRATION.md, la fonction ne
    # sélectionne pas cette colonne) : vérifié indirectement — le message n'est lisible qu'avec
    # LE BON user_id, un mauvais renverrait une liste vide (voir database.get_messages, filtré
    # par user_id ET conversation_id).
    isolated_from_wrong_user = db.get_messages(conv["id"], str(uuid.uuid4()))
    _check(rows, "user_id (isolation)", "filtré côté requête", "vide pour un autre user_id",
           comparator=lambda s, st: isolated_from_wrong_user == [])

    return print_table("Conversation + message — app.messages", rows)


def cleanup() -> None:
    if not created_user_ids:
        return
    with db.get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"DELETE FROM {db.SCHEMA}.users WHERE id = ANY(%s)",
            (created_user_ids,),
        )
    print(f"\nNettoyage : {len(created_user_ids)} compte(s) de vérification supprimé(s).")


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    print(f"Vérification lancée le {datetime.now(timezone.utc).isoformat()} contre {db.SCHEMA}.* (Neon)")
    ok = True
    try:
        ok &= verify_student_with_school()
        ok &= verify_candidat_libre()
        ok &= verify_conversation_and_message()
    finally:
        cleanup()

    print("\n" + ("TOUT CONCORDE" if ok else "AU MOINS UN ÉCART DÉTECTÉ — voir le détail ci-dessus"))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
