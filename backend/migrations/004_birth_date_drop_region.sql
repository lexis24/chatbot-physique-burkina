-- Remplace app.users.birth_year (année seule, smallint) par birth_date (date complète) et
-- supprime app.users.region (jamais utilisée pour un ciblage utile côté élève — seule
-- app.schools.region, qui reste INCHANGÉE, sert à ça : ne pas confondre les deux colonnes de
-- même nom sur des tables différentes).
--
-- Vérifié avant d'écrire cette migration (2026-08-12) : contrairement à ce qui était supposé,
-- app.users N'ÉTAIT PAS vide — 4 comptes existants (eddie, eeee, eeeee, zzzz), tous avec
-- birth_year renseigné, 2 avec region='Centre'. La conversion ci-dessous n'est donc PAS un
-- no-op sur cette base : birth_year est converti en 1er janvier de l'année (seule valeur
-- reconstituable, le jour/mois exact n'a jamais été collecté) avant suppression de la colonne ;
-- region est perdue (aucune conversion possible, la colonne n'a pas d'équivalent dans le nouveau
-- schéma — comptes concernés : eddie, eeee).
--
--     psql "$DATABASE_URL" -f backend/migrations/004_birth_date_drop_region.sql

ALTER TABLE app.users ADD COLUMN IF NOT EXISTS birth_date date;

UPDATE app.users
    SET birth_date = make_date(birth_year, 1, 1)
    WHERE birth_year IS NOT NULL AND birth_date IS NULL;

-- Garde-fou léger (miroir de l'ancien CHECK birth_year BETWEEN 1950 AND 2020) : une date de
-- naissance ne peut pas être dans le futur. La plausibilité fine (6-80 ans) reste vérifiée côté
-- application (main.py), pas en CHECK SQL — elle dépend de CURRENT_DATE, donc évoluerait chaque
-- année si elle était figée ici.
ALTER TABLE app.users DROP CONSTRAINT IF EXISTS users_birth_date_not_future;
ALTER TABLE app.users ADD CONSTRAINT users_birth_date_not_future
    CHECK (birth_date IS NULL OR birth_date <= CURRENT_DATE);

ALTER TABLE app.users DROP COLUMN IF EXISTS birth_year;
ALTER TABLE app.users DROP COLUMN IF EXISTS region;
