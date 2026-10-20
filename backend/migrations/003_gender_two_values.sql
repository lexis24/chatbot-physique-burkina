-- Restreint app.users.gender à 'F'/'M' : l'option "NSP" (préfère ne pas répondre) est retirée,
-- le genre devient un choix obligatoire à deux valeurs (voir le correctif de spécification —
-- backend/main.py::VALID_GENDERS, frontend/src/components/RegistrationDetails.jsx).
--
-- Étape défensive : aucune ligne 'NSP' ne devrait exister à ce stade (vérifié manuellement avant
-- cette migration : 0 ligne sur la base actuelle). Si l'équipe l'exécute plus tard sur une base
-- qui en contient malgré tout, ces lignes passent à NULL ("genre non renseigné") plutôt que de
-- faire échouer la migration — NULL reste une valeur valide pour cette colonne (voir le CHECK
-- ci-dessous, qui n'interdit que 'NSP', pas NULL).
--
--     psql "$DATABASE_URL" -f backend/migrations/003_gender_two_values.sql

UPDATE app.users SET gender = NULL WHERE gender = 'NSP';

ALTER TABLE app.users DROP CONSTRAINT IF EXISTS users_gender_check;
ALTER TABLE app.users ADD CONSTRAINT users_gender_check CHECK (gender IN ('F', 'M'));
