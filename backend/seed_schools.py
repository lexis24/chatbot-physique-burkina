"""Charge le référentiel d'établissements de data/schools_bf.csv dans la base.

Idempotent : relancer le script ne crée pas de doublons (upsert sur le nom
normalisé, voir database.resolve_school). Les établissements chargés depuis
ce fichier sont marqués is_verified = true (contrairement à une saisie libre
à l'inscription, qui crée un établissement non vérifié).

Usage :
    python seed_schools.py [--csv data/schools_bf.csv]
"""
import argparse
import csv
import sys
from pathlib import Path

import database as db
from database import SCHEMA, get_connection, normalize_key


def seed(csv_path: Path) -> None:
    if not csv_path.exists():
        sys.exit(f"Fichier introuvable : {csv_path}")

    db.init_db()

    created = 0
    updated = 0
    with csv_path.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = (row.get("name") or "").strip()
            if not name:
                continue
            city = (row.get("city") or "").strip() or None
            region = (row.get("region") or "").strip() or None
            key = normalize_key(name)

            with get_connection() as conn, conn.cursor() as cur:
                cur.execute(
                    f"SELECT id FROM {SCHEMA}.schools WHERE name_normalized = %s",
                    (key,),
                )
                exists = cur.fetchone() is not None

                cur.execute(
                    f"""INSERT INTO {SCHEMA}.schools
                        (name, name_normalized, city, region, is_verified)
                        VALUES (%s, %s, %s, %s, true)
                        ON CONFLICT (name_normalized) DO UPDATE
                        SET name = EXCLUDED.name, city = EXCLUDED.city,
                            region = EXCLUDED.region, is_verified = true""",
                    (name, key, city, region),
                )
            if exists:
                updated += 1
            else:
                created += 1

    print(f"Établissements créés : {created}, mis à jour : {updated}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--csv",
        default=str(Path(__file__).parent / "data" / "schools_bf.csv"),
        help="chemin du CSV name,city,region",
    )
    args = ap.parse_args()
    seed(Path(args.csv))
