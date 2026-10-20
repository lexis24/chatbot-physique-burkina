-- Rend app.users.is_candidat_libre nullable : un compte migré depuis l'ancienne base SQLite
-- (voir migrate_sqlite_to_pg.py) n'a jamais répondu à cette question, ce que le défaut précédent
-- (NOT NULL DEFAULT false) masquait silencieusement en le confondant avec une vraie réponse
-- "non". auth.is_profile_complete() (backend/auth.py) considère NULL sur ce champ comme un
-- compte à compléter — cette migration est ce qui rend cette vérification réellement possible.
--
-- Idempotent : DROP DEFAULT / DROP NOT NULL sur une colonne qui n'a déjà plus l'un ou l'autre
-- ne lève pas d'erreur.
--
--     psql "$DATABASE_URL" -f backend/migrations/002_nullable_candidat_libre.sql

ALTER TABLE app.users
    ALTER COLUMN is_candidat_libre DROP DEFAULT,
    ALTER COLUMN is_candidat_libre DROP NOT NULL;
