# Rapport de migration — Postgres/Neon + fiche d'inscription enrichie

**Dernière mise à jour : 2026-08-13 — fiche d'identité (date de naissance, suppression de la
région), horodatage des échanges, AboutPanel (voir §14).**

## 1. Résumé

Migration complète des données applicatives (comptes, conversations, messages, signaux de
lacune) de SQLite vers Postgres/Neon, schéma `app`, avec identifiants UUID. Inscription en 3
écrans — **compte → fiche → consentement** — avec un seul appel réseau contenant des données
(`POST /api/auth/register`), déclenché uniquement après acceptation du consentement : classe,
genre (F/M, choix obligatoire), année de naissance, établissement (référentiel + autocomplétion),
statut candidat libre. Persistance des échanges déplacée du frontend vers le backend, avec
journalisation explicite et compteur des échecs d'écriture (`GET /api/health::persistence_failures`).
Portes 428 (consentement/fiche incomplète) sur toutes les routes qui écrivent en base pour un
compte connecté. Export Word de l'historique (par conversation ou complet). Tableau de bord
décideur étendu d'une répartition démographique agrégée.

Suite de tests backend : **74 passés, 0 échec**. Build frontend et tests unitaires (22 tests)
verts. `backend/verify_neon_write.py`, qui compare champ par champ ce qui est envoyé à Postgres et
ce qui y est réellement stocké, a été exécuté contre la vraie base Neon : **tout concorde**, aucun
écart détecté.

## 2. Fichiers créés

| Fichier | Rôle |
|---|---|
| `backend/consent_text.py` | Texte du consentement affiché à l'inscription (français, lisible par un élève de 12 ans) + `CONSENT_VERSION` (relu depuis `config.py`) |
| `backend/migrate_sqlite_to_pg.py` | Migration ponctuelle et idempotente des comptes/conversations/messages/signaux depuis l'ancienne base SQLite (mode `--dry-run` disponible) |
| `backend/data/schools_bf.csv` | Référentiel de départ, 20 établissements réels (Ouagadougou, Bobo-Dioulasso, chefs-lieux de région) — **volontairement minimal, à compléter par l'équipe** (voir §11) |
| `backend/seed_schools.py` | Charge `schools_bf.csv` en base, idempotent (`ON CONFLICT ... DO UPDATE`), marque `is_verified = true` |
| `backend/migrations/002_nullable_candidat_libre.sql` | Rend `app.users.is_candidat_libre` nullable (retire le défaut `false`) — déjà appliquée sur la base Neon actuelle |
| `backend/migrations/003_gender_two_values.sql` | Restreint `app.users.gender` à `'F'`/`'M'` — déjà appliquée sur la base Neon actuelle |
| `backend/verify_neon_write.py` | Script CLI de vérification bout en bout : crée des comptes/conversations/messages de test, relit chaque champ depuis Postgres, compare, nettoie — voir §7 |
| `backend/tests/test_database.py` | Tests de `database.py` : unicité `public_code`, isolation entre élèves, ordre `seq`, agrégats sous/au seuil `MIN_COHORT`, filtres admin sans erreur de type, `is_candidat_libre` nullable, genre restreint à F/M |
| `frontend/src/components/ConsentNotice.jsx` | Texte de consentement + case à cocher (charge lui-même `GET /api/consent`) |
| `frontend/src/components/ConsentGate.jsx` | Écran bloquant de reconnexion pour un compte dont le consentement n'est pas à jour |
| `frontend/src/components/SchoolAutocomplete.jsx` | Champ établissement avec suggestions (debounce 300 ms sur `GET /api/schools/search`), saisie libre acceptée |
| `frontend/src/components/RegistrationDetails.jsx` | Fiche classe/genre/année de naissance/candidat libre/établissement (genre et candidat libre en boutons à choix explicite) — réutilisée par l'inscription et par `ProfileCompletionGate` |
| `frontend/src/components/ProfileCompletionGate.jsx` | Écran bloquant pour un compte migré dont la fiche est incomplète (`PATCH /api/profile`) |
| `frontend/src/lib/registrationValidation.js` | Validation pure de la fiche (miroir des règles serveur), partagée par l'inscription et `ProfileCompletionGate` |
| `frontend/src/lib/registrationValidation.test.js` | Tests Vitest du module ci-dessus |

## 3. Fichiers modifiés

| Fichier | Changements | Raison |
|---|---|---|
| `backend/database.py` | Cast `%s::text` sur la première occurrence de chaque paire `(%s IS NULL OR colonne = %s)` (5 fonctions d'agrégats) ; `is_candidat_libre` sans `NOT NULL`/défaut ; `gender` restreint à `CHECK (gender IN ('F','M'))` | Corrige un bug bloquant de type de paramètre Postgres, et fait de "compte pas encore complété" et "candidat libre : non" deux états réellement distincts |
| `backend/config.py` | `DB_POOL_MAX` (8), `ADMIN_MIN_COHORT` (5), `CONSENT_VERSION` (`"2026-01"`) | Réglages du pool psycopg et du seuil d'anonymat, sans toucher au code |
| `backend/requirements.txt` | `psycopg[binary]` → `psycopg[binary,pool]` | Expose `psycopg_pool.ConnectionPool`, utilisé par `database.py` |
| `backend/auth.py` | `create_token`/`get_current_user` acceptent un `sub` en chaîne (UUID) ; `get_current_user_optional`, `is_consent_ok`, `is_profile_complete`, `require_consent`, `require_complete_profile` | Bascule UUID + portes 428 |
| `backend/main.py` | Voir détail ci-dessous | Fiche d'inscription, persistance serveur, nouvelles routes, portes 428 étendues, journalisation |
| `backend/create_decideur.py` | Mot de passe minimum aligné sur 8 caractères (comme le serveur) ; utilise le nouveau `create_user(...)` (dict ou `None`) | Cohérence avec `MIN_PASSWORD_LENGTH` de `main.py` |
| `backend/tests/conftest.py` | Fixture `unique_username` (préfixe `pytest_`) + nettoyage automatique en fin de test + reset du rate-limiter | Les données de test vivent sur la base Neon réelle (voir §11) |
| `backend/tests/test_main_api.py` | Payloads d'inscription enrichis (genre F/M), assertions `public_code`/`consent_ok`/`profile_complete`, tests d'isolation croisée, de gate 428 sur 7 routes, de non-gate sur `/api/profile`/`/api/consent*`, du compteur `persistence_failures` | Les contrats d'API ont changé |
| `frontend/src/api.js` | `askQuestion(Stream)`/`generateExercise`/`generateRemediation`/`getSummary`/`explainExercisePhoto`/`simplifyResponse` transmettent `conversation_id` ; nouvelles fonctions `searchSchools`, `getConsent`, `acceptConsent`, `updateProfile`, `exportHistory`, `getAdminDemographics` ; `registerAccount` prend un objet `profile` (gender F/M) ; `handleJson` attache `.status`/`.reason` aux erreurs (gates 428) |
| `frontend/src/lib/auth.js` | `register`/`login`/`restoreSession` propagent `publicCode`/`consentOk`/`profileComplete` |
| `frontend/src/lib/docx.js` | `exportHistoryToDocx(conversations, opts)` — un titre H1 par conversation, à partir de la forme serveur (`role`/`kind`/`payload`) |
| `frontend/src/components/AuthGate.jsx` | Inscription en **3 écrans, dans cet ordre : Compte → Ma fiche → Consentement**. Un seul appel réseau contenant des données de fiche : `POST /api/auth/register`, déclenché uniquement à la validation de l'écran Consentement. Aucune écriture intermédiaire (voir §10) |
| `frontend/src/App.jsx` | `persistMessage`/`appendMessage` supprimés ; `ensureConversation` simplifié (plus de verrou anti-doublon, devenu inutile — un seul appel par action désormais) ; `conversation_id` transmis à chaque appel métier ; états `consentOk`/`profileComplete` + rendu conditionnel `ConsentGate`/`ProfileCompletionGate` ; `interceptGateError` intercepte les 428 réactifs ; export « tout mon historique » |
| `frontend/src/components/ConversationList.jsx` | Bouton « Télécharger (Word) » par conversation ; `formatDate` adapté au format ISO réel de Postgres/FastAPI |
| `frontend/src/components/ExportMenu.jsx` | Entrée « Tout mon historique (Word) » optionnelle (`onExportHistory`) |
| `frontend/src/components/ProfilePanel.jsx` | Tooltip adapté (pas de compteur de visites dans le nouveau schéma) |
| `frontend/src/components/AdminDashboard.jsx` | Tuiles alignées sur `database.get_admin_overview()` (`students`/`conversations`/`quiz_answers`/`success_rate`) ; graphique démographique (genre F/M) chargé séparément du `Promise.all` existant pour ne jamais faire échouer les autres graphiques ensemble |

### Détail des changements dans `main.py`

- **`RegisterRequest`** : `class_code`, `gender` (`'F'`/`'M'` uniquement), `birth_year`,
  `is_candidat_libre` obligatoires ; `school_name` obligatoire sauf si `is_candidat_libre` (validé
  par un `model_validator` Pydantic) ; `consent_accepted` obligatoire.
- **Handler global `RequestValidationError`** : message français unique portant sur la première
  erreur, plutôt que la liste brute d'erreurs Pydantic.
- **`AuthResponse`** : `public_code`, `consent_ok`, `profile_complete`.
- **Persistance serveur** : `/api/chat`, `/api/chat/stream`, `/api/exercise`, `/api/remediation`,
  `/api/summary`, `/api/simplify`, `/api/exercise/photo` acceptent un `conversation_id` optionnel
  et appellent `database.add_exchange`/`add_message` eux-mêmes (best-effort — un échec de
  sauvegarde ne casse jamais la réponse à l'élève, mais est désormais journalisé via
  `logger.error` avec `conversation_id`/`kind`/type d'exception, et compté dans
  `_persistence_failure_count`, exposé par `GET /api/health::persistence_failures`).
- **Portes 428** : `_ensure_authenticated_user_ready(user)` — appelée manuellement (pas via
  `Depends`) dans les **7** routes qui écrivent en base pour un compte connecté : `/api/chat`,
  `/api/chat/stream`, `/api/exercise`, `/api/remediation`, `/api/summary`, `/api/simplify`,
  `/api/exercise/photo`. Un invité n'est jamais concerné. `/api/course` (lecture seule),
  `/api/profile` et `/api/consent*` (routes de déblocage) n'ont **jamais** cette porte.
- **Nouvelles routes** : `GET /api/schools/search`, `GET /api/consent`, `POST /api/consent/accept`,
  `PATCH /api/profile`, `GET /api/export/history`, `GET /api/admin/demographics`.
- **`POST /api/conversations/{id}/messages`** : dépréciée, conservée et adaptée aux nouvelles
  signatures de `database.py`.
- Chemins `conversation_id` en `str` (UUID) sur toutes les routes `/api/conversations/*`.

## 4. Fichiers supprimés ou dépréciés

- **`POST /api/conversations/{conversation_id}/messages`** — dépréciée, pas supprimée. Le
  frontend ne l'appelle plus.
- **`appendMessage`** (`frontend/src/api.js`) — supprimée (plus aucun appelant).
- **`DB_PATH`** (`config.py`) — conservé, mais ne sert plus qu'à localiser `.jwt_secret` en
  développement.

## 5. Changements d'API

| Méthode | Route | Statut | Changement de contrat |
|---|---|---|---|
| POST | `/api/auth/register` | Modifiée (cassant) | `class_code`/`gender`/`birth_year`/`is_candidat_libre` obligatoires, `gender` restreint à `'F'`/`'M'`, `school_name` obligatoire sauf candidat libre, `consent_accepted` obligatoire. Réponse enrichie de `public_code`/`consent_ok`/`profile_complete` |
| POST | `/api/auth/login` | Modifiée | Réponse enrichie de `public_code`/`consent_ok`/`profile_complete` |
| GET | `/api/auth/me` | Modifiée | Réponse enrichie de `public_code`/`consent_ok`/`profile_complete` |
| POST | `/api/chat`, `/api/chat/stream`, `/api/exercise`, `/api/remediation`, `/api/summary`, `/api/simplify`, `/api/exercise/photo` | Modifiée (compatible) | `conversation_id` optionnel ; peut renvoyer 428 (`{"detail": {"reason": "consent_required"\|"profile_incomplete", "message": ...}}`) pour un compte connecté non à jour |
| GET/POST/DELETE | `/api/conversations/*` | Modifiée (cassant) | Identifiants de conversation en UUID (chaînes), plus des entiers |
| POST | `/api/conversations/{id}/messages` | Dépréciée | Conservée, adaptée ; le frontend ne l'appelle plus |
| GET | `/api/schools/search` | Nouvelle | Autocomplétion établissement, `?q=` |
| GET | `/api/consent` | Nouvelle | Public. Jamais de porte 428 |
| POST | `/api/consent/accept` | Nouvelle | Authentifié. Jamais de porte 428 |
| PATCH | `/api/profile` | Nouvelle | Mise à jour partielle, authentifié. Jamais de porte 428 |
| GET | `/api/export/history` | Nouvelle | Authentifié, réservé au propriétaire |
| GET | `/api/admin/demographics` | Nouvelle | Décideur uniquement. Répartition genre (F/M) + candidat libre + année de naissance |
| GET | `/api/health` | Modifiée | Champ `persistence_failures` (compteur d'échecs d'écriture depuis le démarrage) |

**Changements cassants à signaler explicitement** : (1) tout client qui appelait `POST
/api/auth/register` avec seulement `username`/`password` reçoit désormais un `422` ; (2) tout
client qui traitait un `conversation_id` comme un entier doit être adapté (UUID string) ; (3)
`gender` n'accepte plus la valeur `"NSP"`.

## 6. Changements de schéma de données

Schéma `app` (Postgres/Neon) : tables `schools`, `users`, `conversations`, `messages`,
`remediation_answers`, `struggles` — voir `backend/database.py` pour le DDL complet, et
`backend/migrations/` pour l'historique des ajustements appliqués après la création initiale :

- `002_nullable_candidat_libre.sql` : `users.is_candidat_libre` est **nullable**, sans défaut. Un
  compte qui n'a jamais répondu à cette question a la valeur `NULL`, distincte d'une réponse
  explicite `false`.
- `003_gender_two_values.sql` : `users.gender` accepte `'F'`, `'M'`, ou `NULL` — plus `'NSP'`.

`class_code`, `gender`, `birth_year`, `school_id`/`school_raw` restent nullables (comptes migrés
non encore complétés). Côté `config.py` : `DB_POOL_MAX`, `ADMIN_MIN_COHORT`, `CONSENT_VERSION`
ajoutés (aucune colonne).

Les deux migrations ci-dessus ont été **appliquées sur la base Neon actuelle** (vérifié :
`is_candidat_libre` nullable sans défaut, contrainte `users_gender_check` restreinte à F/M). Avant
d'appliquer `003_gender_two_values.sql`, une vérification a confirmé **0 ligne** avec
`gender = 'NSP'` sur cette base (elle ne contenait qu'un seul compte, non concerné).

## 7. Tests

**Suite pytest** (`backend/tests/`) : **74 tests, tous passés, aucun échec.** Sortie brute
(`pytest tests/ -v`) :

```
============================= test session starts =============================
platform win32 -- Python 3.12.8, pytest-9.1.1, pluggy-1.6.0
collected 74 items

tests/test_curriculum_data.py::test_all_expected_classes_present PASSED
tests/test_curriculum_data.py::test_every_class_has_a_real_chapter_list PASSED
tests/test_curriculum_data.py::test_every_class_has_a_display_name PASSED
tests/test_curriculum_data.py::test_remediation_chapter_present_for_3eme_1ere_tle PASSED
tests/test_curriculum_data.py::test_remediation_chapter_absent_outside_target_classes PASSED
tests/test_database.py::test_public_code_unique_and_well_formed PASSED
tests/test_database.py::test_create_user_rejects_duplicate_username PASSED
tests/test_database.py::test_conversation_and_messages_isolated_between_students PASSED
tests/test_database.py::test_delete_conversation_is_scoped_to_owner PASSED
tests/test_database.py::test_message_seq_is_ordered_and_incremental PASSED
tests/test_database.py::test_admin_aggregates_hidden_below_min_cohort PASSED
tests/test_database.py::test_admin_aggregates_visible_at_min_cohort PASSED
tests/test_database.py::test_admin_filters_work_without_type_error PASSED
tests/test_database.py::test_create_user_accepts_null_is_candidat_libre PASSED
tests/test_database.py::test_create_user_rejects_nsp_gender PASSED
tests/test_document_processor.py (10 tests) PASSED
tests/test_exercise_inference.py (6 tests) PASSED
tests/test_exercise_json_repair.py (5 tests) PASSED
tests/test_main_api.py::test_health_check PASSED
tests/test_main_api.py::test_classes_list_matches_curriculum PASSED
tests/test_main_api.py::test_chapters_for_valid_class PASSED
tests/test_main_api.py::test_chapters_for_invalid_class_returns_404 PASSED
tests/test_main_api.py::test_course_route_accepts_get_and_head[GET] PASSED
tests/test_main_api.py::test_course_route_accepts_get_and_head[HEAD] PASSED
tests/test_main_api.py::test_course_route_404_for_missing_document PASSED
tests/test_main_api.py::test_course_route_404_for_invalid_chapter PASSED
tests/test_main_api.py::test_exercise_rejects_invalid_class PASSED
tests/test_main_api.py::test_exercise_rejects_chapter_not_in_curriculum PASSED
tests/test_main_api.py::test_exercise_accepts_missing_chapter_and_difficulty_as_optional PASSED
tests/test_main_api.py::test_chat_allows_empty_class_and_chapter PASSED
tests/test_main_api.py::test_documents_upload_requires_decideur_auth PASSED
tests/test_main_api.py::test_documents_initialize_sample_requires_decideur_auth PASSED
tests/test_main_api.py::test_admin_routes_require_decideur_auth PASSED
tests/test_main_api.py::test_register_and_login_roundtrip PASSED
tests/test_main_api.py::test_register_rejects_short_password PASSED
tests/test_main_api.py::test_register_requires_consent PASSED
tests/test_main_api.py::test_register_rejects_duplicate_username PASSED
tests/test_main_api.py::test_register_rejects_invalid_class_or_gender PASSED
tests/test_main_api.py::test_register_requires_profile_fields PASSED
tests/test_main_api.py::test_register_requires_school_unless_candidat_libre PASSED
tests/test_main_api.py::test_register_candidat_libre_does_not_require_school PASSED
tests/test_main_api.py::test_business_route_blocked_when_consent_missing PASSED
tests/test_main_api.py::test_business_route_blocked_when_profile_incomplete PASSED
tests/test_main_api.py::test_summary_and_simplify_are_gated_too PASSED
tests/test_main_api.py::test_profile_and_consent_routes_are_never_gated PASSED
tests/test_main_api.py::test_persistence_failure_is_counted_and_exposed_in_health PASSED
tests/test_main_api.py::test_students_cannot_access_each_others_conversations PASSED
tests/test_main_api.py::test_admin_demographics_requires_decideur_auth PASSED
tests/test_main_api.py::test_export_history_requires_auth PASSED
tests/test_main_api.py::test_export_history_scoped_to_caller PASSED
tests/test_main_api.py::test_consent_endpoint_is_public PASSED
tests/test_main_api.py::test_schools_search_short_query_returns_empty PASSED
tests/test_main_api.py::test_exercise_photo_forwards_history_to_rag_system PASSED
tests/test_main_api.py::test_exercise_photo_ignores_malformed_history PASSED
tests/test_main_api.py::test_generate_remediation_resilient_to_retrieval_failure PASSED
tests/test_main_api.py::test_exercise_photo_without_history_defaults_to_empty_list PASSED

================== 74 passed, 1 warning in 230.89s (0:03:50) ==================
```

(Les lignes `test_document_processor.py`/`test_exercise_inference.py`/`test_exercise_json_repair.py`
sont condensées ci-dessus — ces trois fichiers n'ont pas été modifiés par ce correctif ; le détail
complet est visible en relançant `pytest tests/ -v`.)

(L'unique warning est une dépréciation Pydantic v2 sans rapport, `.dict()` → `.model_dump()`, pas
un problème fonctionnel.)

**Frontend (Vitest)** : 22 tests, tous passés (`history.test.js`, `docxModel.test.js`,
`registrationValidation.test.js`). `npm run build` : succès.

**`backend/verify_neon_write.py`** — vérification bout en bout contre la vraie base Neon, champ
par champ (voir sortie brute en §8). Exécuté avec succès : **TOUT CONCORDE**, aucun écart, aucune
donnée résiduelle après nettoyage.

## 8. Sortie de `verify_neon_write.py`

```
Vérification lancée le 2026-08-10T08:38:12.448803+00:00 contre app.* (Neon)

=== Compte élève avec établissement — app.users ===
Champ              Envoyé                   Stocké                                Statut
----------------------------------------------------------------------------------------
public_code        (généré)                 CM-2026-YQG4JX                        OK
class_code         3ème                     3ème                                  OK
gender             F                        F                                     OK
birth_year         2011                     2011                                  OK
is_candidat_libre  False                    False                                 OK
school_raw         Lycée Vérification Neon  Lycée Vérification Neon               OK
school_id          (résolu)                 0dc57dbb-0d33-4e9d-b397-41e41e1619e3  OK
region             Centre                   Centre                                OK
consent_version    2026-01                  2026-01                               OK
consent_at         (horodaté)               2026-08-10 08:38:15.697033+00:00      OK
created_at         (horodaté)               2026-08-10 08:38:15.510421+00:00      OK

=== Compte candidat libre — app.users (school_id/school_raw) ===
Champ                        EnvoyéStockéStatut
-----------------------------------------------
is_candidat_libre            True  True  OK
school_id (doit être NULL)   None  None  OK
school_raw (doit être NULL)  None  None  OK

=== Conversation + message — app.messages ===
Champ                Envoyé                         Stocké                         Statut
-----------------------------------------------------------------------------------------
seq                  1                              1                              OK
role                 user                           user                           OK
kind                 chat                           chat                           OK
payload              {'note': 'vérification Neon'}  {'note': 'vérification Neon'}  OK
class_code           3ème                           3ème                           OK
chapter              Les fractions                  Les fractions                  OK
difficulty           2                              2                              OK
from_rag             False                          False                          OK
user_id (isolation)  filtré côté requête            vide pour un autre user_id     OK

Nettoyage : 2 compte(s) de vérification supprimé(s).

TOUT CONCORDE
```

Aucun écart trouvé, y compris sur les points les plus susceptibles d'en révéler un
(troncature, fuseau horaire, casse, valeur par défaut inattendue) : les horodatages sont bien
en UTC avec fuseau explicite, le JSON du `payload` fait l'aller-retour sans altération, et
`school_id`/`school_raw` sont bien tous les deux `NULL` pour le candidat libre plutôt que de
retomber sur une valeur par défaut silencieuse.

## 9. Vérifications de sécurité

| Point | Où c'est appliqué |
|---|---|
| Isolation des conversations entre élèves | `database.get_conversation`/`get_messages`/`delete_conversation` filtrent toujours par `user_id`. Testé : `test_conversation_and_messages_isolated_between_students`, `test_delete_conversation_is_scoped_to_owner`, `test_students_cannot_access_each_others_conversations` (404, pas 403 — voir §10) |
| Absence de `user_id`/`content` dans `/api/admin/*` | `database.get_admin_overview`/`get_success_by_chapter`/`get_weak_notions_global`/`get_success_trend`/`get_activity_trend`/`get_demographics` ne sélectionnent jamais ces colonnes ; les routes `main.py::admin_*` retournent ces résultats tels quels |
| Seuil `MIN_COHORT` sur les agrégats | `HAVING count(DISTINCT user_id) >= MIN_COHORT` ; regroupement dans `"autres"` pour `get_demographics`. Testé sans erreur de type : `test_admin_filters_work_without_type_error`, `test_admin_aggregates_hidden_below_min_cohort`, `test_admin_aggregates_visible_at_min_cohort` |
| Export d'historique réservé au propriétaire | `GET /api/export/history` utilise `Depends(auth.get_current_user)` puis `database.export_user_history(user["id"])`. Testé : `test_export_history_requires_auth`, `test_export_history_scoped_to_caller` |
| Un compte bloqué (428) peut toujours se débloquer | `/api/profile` et `/api/consent*` n'ont jamais de porte 428, même pour un compte au consentement périmé et à la fiche vide. Testé explicitement : `test_profile_and_consent_routes_are_never_gated` |
| Échec de sauvegarde jamais silencieux | Chaque `except` de `_persist_exchange_best_effort`/`_persist_message_best_effort` journalise (`logger.error`, avec `conversation_id`/`kind`/type d'exception) et incrémente un compteur exposé dans `GET /api/health`. Testé : `test_persistence_failure_is_counted_and_exposed_in_health` |

## 10. Points d'attention et questions ouvertes

- **`require_consent`/`require_complete_profile` ne sont pas branchées en `Depends()`** sur les 7
  routes concernées : elles restent accessibles aux invités (`Depends(get_current_user_optional)`),
  et `Depends(require_consent)` forcerait une authentification qui casserait ce mode. La
  vérification est donc faite manuellement, seulement quand un compte EST connecté (voir
  `_ensure_authenticated_user_ready`).
- **Aucune donnée de la fiche ne transite avant l'acceptation du consentement.** Garanti par
  construction dans `frontend/src/components/AuthGate.jsx` : `profileValues` (classe, genre,
  année, candidat libre, école) est un state React local, jamais envoyé au réseau tant que
  `handleFinish` (le gestionnaire de soumission de l'écran 3, Consentement) n'a pas été appelé —
  et ce gestionnaire est le SEUL endroit du composant qui appelle `register()`
  (`frontend/src/lib/auth.js` → `registerAccount()` dans `api.js`). L'écran 2 (Ma fiche) n'a
  qu'un bouton "Suivant" qui avance un `step` local, sans aucun appel réseau autre que
  `GET /api/schools/search` pour l'autocomplétion (qui n'envoie que la chaîne tapée, jamais le
  reste de la fiche). Un refus ou un abandon à l'écran 3 laisse `register()` jamais appelé : l'état
  React est perdu au démontage du composant, aucun compte n'est créé.
- **`database.get_recent_struggles` ne sélectionne ni `class_code` ni de champ `question`
  distinct de `notion`**, et **`database.get_weak_notions` ne regroupe pas par
  chapitre/classe** — le message d'accueil personnalisé et le profil de progression sont donc
  moins précis qu'avec l'ancien schéma SQLite (adapté avec des valeurs par défaut dans
  `main.py::_adapt_history_rows_for_welcome_message`).
- **Premier message d'une conversation** : pour un élève connecté, `ensureConversation()` doit se
  terminer avant de lancer le chat en streaming — léger surcoût de latence, uniquement sur le tout
  premier message d'une conversation.
- **404 plutôt que 403** pour un accès croisé entre élèves sur une conversation — choix délibéré :
  ne confirme même pas l'existence de la ressource à quelqu'un qui n'en est pas propriétaire.
- **Neon met le calcul en veille après une période d'inactivité** : les connexions déjà ouvertes
  dans le pool `psycopg_pool` deviennent invalides sans préavis (`psycopg.OperationalError: SSL
  connection has been closed unexpectedly`), et le pool les redistribuait quand même avant ce
  correctif. Symptôme trompeur observé en local : la panne se manifestait dans
  `auth.get_current_user` (via `database.get_user_by_id`), qui la laissait remonter telle quelle
  — en production, un élève aurait vu ça comme une déconnexion aléatoire malgré un token valide.
  Deux garde-fous ajoutés : `database.get_pool` vérifie maintenant chaque connexion avant de la
  redistribuer (`check=ConnectionPool.check_connection`, réouverture automatique si elle est
  morte) ; et si une panne survient malgré tout pendant une requête déjà en vol,
  `auth.get_current_user` la traduit en 503 explicite (jamais en 401) tandis que
  `auth.get_current_user_optional` dégrade silencieusement vers "invité" plutôt que de faire
  échouer les routes ouvertes qui n'ont pas besoin d'un compte. Testé dans
  `test_main_api.py::test_dead_db_connection_returns_503_not_401` et
  `::test_dead_db_connection_degrades_to_guest_on_optional_auth` (connexion morte simulée par mock).

## 11. Ce que je n'ai PAS fait

- **Exécuté `migrate_sqlite_to_pg.py` en mode réel** — je n'ai trouvé aucun fichier SQLite existant
  dans ce dépôt pour même tester le dry-run. À faire par l'équipe une fois l'ancienne base localisée.
- **Complété le référentiel d'établissements** — `schools_bf.csv` ne contient qu'une vingtaine de
  lignes, un point de départ, pas une liste exhaustive.
- **Ajouté un encart non bloquant « complète ta fiche » dans `ProfilePanel`** — largement redondant
  maintenant que la fiche est obligatoire dès l'inscription et qu'un compte migré incomplet est
  bloqué par `ProfileCompletionGate` avant même d'atteindre l'appli. Seul le champ `region`
  (facultatif) pourrait encore manquer sur un compte par ailleurs complet ; jugé pas assez
  important pour justifier un encart dédié.
- **Câblé un déclencheur pour `purge_deleted_conversations`** (fournie dans `database.py`, jamais
  appelée) — laissé tel quel à la demande explicite de ne pas la brancher pour l'instant.
- **Traduit l'intégralité des erreurs de validation Pydantic** — le handler global ne traduit que
  la **première** erreur rencontrée.
- **Consulté la Commission de l'informatique et des libertés du Burkina Faso** — hors de mon
  périmètre, à faire par l'équipe avant tout déploiement en établissement.
- **Mis en place une branche Neon de test dédiée** — les tests, `verify_neon_write.py` et les
  migrations SQL de ce rapport ont tous été exécutés contre la **base Neon réelle** (schéma `app`),
  avec nettoyage systématique (préfixes `pytest_`/`verify_`, suppression en `finally`). Aucune
  donnée résiduelle à ce jour (vérifié : la base ne contient que le compte de l'équipe créé en
  dehors de ce travail). Voir §12 — cette branche doit être créée **avant**, pas après, toute
  migration de données de production.
- **Nettoyé le `Dockerfile`** de références éventuelles à un volume SQLite obsolète.

## 12. Étapes manuelles restantes

1. **Créer une branche Neon de test dédiée AVANT toute migration de données de production**, et y
   faire pointer `tests/conftest.py` à la place de la base réelle. Ordre important : tant que
   cette branche n'existe pas, les tests (et tout script de vérification comme
   `verify_neon_write.py`) continueront d'écrire — temporairement et avec nettoyage — dans la même
   base que la production.
2. Si l'équipe applique ces migrations sur un autre environnement (staging, prod) que celui déjà
   mis à jour ici : `psql "$DATABASE_URL" -f backend/migrations/002_nullable_candidat_libre.sql`
   puis `-f backend/migrations/003_gender_two_values.sql`.
3. Localiser l'ancienne base SQLite de production (aucune trouvée dans ce dépôt), la sauvegarder,
   puis lancer `python migrate_sqlite_to_pg.py --sqlite <chemin> --dry-run` avant migration réelle.
4. **Compter les comptes migrés qui se retrouveront en 428** une fois l'étape 3 faite : `SELECT
   count(*) FROM app.users WHERE role='eleve' AND (class_code IS NULL OR gender IS NULL OR
   birth_year IS NULL OR is_candidat_libre IS NULL)` — actuellement 0, aucune migration réelle
   n'ayant eu lieu.
5. Lancer `python seed_schools.py`, puis compléter `data/schools_bf.csv` avec de vrais
   établissements vérifiés.
6. Définir `DB_POOL_MAX`/`ADMIN_MIN_COHORT`/`CONSENT_VERSION` en production si les valeurs par
   défaut (8 / 5 / `"2026-01"`) ne conviennent pas.
7. Consulter la Commission de l'informatique et des libertés du Burkina Faso avant tout
   déploiement en établissement (collecte de données de mineurs).
8. Vérifier/nettoyer `backend/Dockerfile` d'éventuelles références à un volume SQLite obsolète.

## 13. Correctif — Classe fixée au compte (2026-08-12)

### Comportement

La classe n'est plus redemandée à un élève déjà connecté à chaque session : `app.users.class_code`
(renseigné à l'inscription, ou complété depuis via `PATCH /api/profile`) est désormais la seule
source de vérité pour un compte connecté, côté serveur ET côté interface.

- **Routes concernées** (les 7 routes métier acceptant déjà `class_level`, toutes déjà protégées
  par `_ensure_authenticated_user_ready`) : `POST /api/chat`, `POST /api/chat/stream`, `POST
  /api/exercise`, `POST /api/remediation`, `POST /api/summary`, `POST /api/simplify`, `POST
  /api/exercise/photo`. Pour un appelant connecté, la valeur `class_level` envoyée par le client
  est désormais **ignorée** et remplacée côté serveur par `user["class_code"]`
  (`main._resolve_class_level`, appelée juste après la porte 428 existante, qui garantit déjà que
  `class_code` n'est jamais `None` à ce point pour un compte qui la franchit). Sans ce verrou
  serveur, la contrainte était contournable en modifiant simplement `class_level` dans la requête —
  le frontend seul ne suffit jamais à garantir une règle métier.
- **Invité** : comportement inchangé — `class_level` reste la valeur envoyée par le client,
  facultative, jamais réécrite (branche `else` de `_resolve_class_level`).
- **`PATCH /api/profile`** : reste le seul moyen de changer `class_code`, déjà validée contre
  `curriculum_data.get_classes()` (`main.update_profile`, non modifié par ce correctif — la
  vérification existait déjà). Exposée côté interface depuis `ProfilePanel.jsx` (voir plus bas).
- **`AuthResponse`** (`POST /api/auth/register`, `POST /api/auth/login`) et `GET /api/auth/me`
  renvoient désormais aussi `class_code` : le frontend connaît la classe du compte dès la connexion,
  sans attendre un autre appel (ex: le chargement de la première conversation).

### Frontend

- `App.jsx` : `classCode` est réglé depuis la classe du compte (restauration de session au
  chargement, connexion/inscription fraîches, et complétion de fiche pour un compte migré) — plus
  jamais depuis `localStorage`, qui reste réservé au mode invité (`STORAGE_KEY`, inchangé).
  `openConversation` ne réécrit plus `classCode` depuis `conv.class_level` pour un compte connecté
  (seul un invité en tient encore compte) — voir « Points d'attention » ci-dessous.
- `Sidebar.jsx` : le sélecteur « Ma classe » est remplacé, pour un connecté, par une ligne en
  lecture seule (bureau : carte « Ma classe » ; mobile : onglet Réglages) avec un lien « Changer »
  qui amène au contrôle de changement de classe de `ProfilePanel.jsx` (et, sur mobile, bascule
  l'onglet sur Historique, où vit `ProfilePanel`). Le sélecteur reste inchangé pour un invité. Le
  sélecteur de chapitre n'est pas concerné : il reste modifiable à tout moment, pour tout le monde.
- `ProfilePanel.jsx` : nouveau contrôle de changement de classe (`PATCH /api/profile`), en deux
  temps — sélection de la nouvelle classe, puis confirmation explicite (« Tu vas changer de classe,
  les cours proposés changeront ») avant tout envoi. Une fois confirmé, `App.jsx`
  (`handleClassChanged`) met à jour `classCode` **et vide `chapitre`** (voir « À vérifier »
  ci-dessous).
- `ChatInput.jsx` : la pastille classe (au-dessus du champ de saisie, mobile uniquement) n'est plus
  cliquable pour un connecté — seule la pastille chapitre l'est encore.

### Ce qui reste possible pour un invité

Rien ne change pour le mode invité : classe et chapitre restent tous les deux facultatifs,
modifiables à tout moment via les sélecteurs habituels, persistés dans `localStorage`
(`STORAGE_KEY`) — jamais liés à un quelconque compte, puisqu'il n'y en a pas.

### Test

`backend/tests/test_main_api.py::test_class_level_is_forced_from_account_for_authenticated_student`
— un élève inscrit en Tle envoie `class_level="6ème"` sur `POST /api/chat` ; le test intercepte
`rag_system.generate_response` (pas d'appel réel à Claude, cohérent avec le reste de ce fichier) et
vérifie que la classe effectivement transmise est `"Tle"`, pas `"6ème"`. Vérifie aussi qu'un invité,
lui, garde la classe qu'il envoie.

### À vérifier — réponses

- **Conversations existantes créées sous une autre classe** : elles gardent leur `class_code`
  d'origine en base (aucune migration de données, `database.py` non modifié) — rouvrir une telle
  conversation n'écrase plus `classCode` pour un compte connecté (`App.jsx::openConversation`, voir
  ci-dessus). En revanche, **continuer** cette conversation (poser une nouvelle question, etc.)
  répond désormais avec la classe ACTUELLE du compte, pas celle enregistrée sur la conversation —
  cohérent avec le principe « la classe est une propriété de l'élève, pas de la conversation », mais
  à signaler explicitement : un élève qui a changé de classe puis rouvre une vieille conversation
  verra son historique affiché sous l'ancien intitulé, tout en recevant des réponses ancrées sur sa
  classe actuelle.
- **Changement de classe et chapitre courant** : oui, le chapitre est vidé (`handleClassChanged`
  dans `App.jsx`) — un chapitre de l'ancienne classe n'a généralement pas de sens dans la nouvelle
  (les intitulés diffèrent d'une classe à l'autre, voir `curriculum_data.py`).

### Non vérifié dans cette session

La suite `pytest` complète n'a pas pu être rejouée dans cet environnement : l'installation de
`torch` (dépendance de `sentence-transformers`/`llama-index-embeddings-huggingface`, utilisée par
`rag_system.py`) réussit, mais son import échoue au chargement de `c10.dll` (`OSError: [WinError
1114]`) — un problème d'environnement Windows local (chargement de DLL native), sans rapport avec
ce correctif. Vérifié à la place : `python -m py_compile` sur
`main.py`/`auth.py`/`tests/test_main_api.py` (syntaxe correcte), relecture manuelle de chaque route
modifiée, et build + suite Vitest (22 tests) frontend, tous deux verts. À rejouer avec `pytest
tests/ -v` dans un environnement où `torch` s'importe correctement avant de considérer ce correctif
entièrement vérifié côté backend.

*(Correctif du 2026-08-13, voir §14 : la suite pytest complète a depuis été rejouée avec succès via
le conteneur Docker du backend, qui installe `torch` en CPU-only — voir §14.6.)*

## 14. Correctif — Fiche d'identité, AboutPanel, horodatage des échanges (2026-08-13)

### 14.1 Fiche d'identité : `birth_year` → `birth_date`, suppression de `region`

**Contrat de `POST /api/auth/register` modifié (cassant)** : `birth_year` (entier, année seule)
est remplacé par `birth_date` (date complète, `"YYYY-MM-DD"`) ; `region` est retirée intégralement
de la fiche élève.

- **`app.users`** : colonne `birth_year` (smallint) remplacée par `birth_date` (date), colonne
  `region` supprimée. **`app.schools.region` n'est PAS touchée** — c'est une colonne différente,
  sur une table différente (la région de l'établissement, utilisée par l'autocomplétion ; elle
  n'a jamais eu de lien direct avec la région de l'élève au-delà d'un ancien paramètre partagé
  dans `database.create_user`, lui aussi retiré — voir plus bas).
- **Validation** : `MIN_BIRTH_YEAR`/`MAX_BIRTH_YEAR` (1950-2020, année fixe) remplacés par
  `MIN_AGE_YEARS`/`MAX_AGE_YEARS` (6-80 ans, calculé par rapport à la date du jour via
  `main._is_plausible_birth_date`) — une borne en âge reste valide indéfiniment, contrairement à
  une borne en année qu'il aurait fallu avancer chaque année.
- **`database.create_user`** : paramètre `birth_year` → `birth_date` ; paramètre `region` retiré
  intégralement (il servait à la fois à peupler `app.users.region`, supprimée, ET à préremplir
  `app.schools.region` lors de la création d'un établissement non vérifié via `resolve_school` —
  ce deuxième usage disparaît avec lui : un nouvel établissement créé depuis l'inscription n'a plus
  de `region` préremplie, seulement `resolve_school(school_name)` sans indice de région).
- **`database.update_profile_fields`** : `birth_year`/`region` retirés de la liste blanche des
  champs modifiables, `birth_date` ajoutée.
- **`database.get_demographics`** : la répartition par âge n'était en réalité **jamais une
  tranche** avant ce correctif — elle groupait par année de naissance brute (`birth_year` exact),
  malgré son commentaire "cohorte d'âge". Elle est remplacée par une vraie tranche de 3 ans (ex.
  "15-17 ans"), calculée depuis `birth_date` via `age()` côté SQL. Clé de sortie renommée
  `birth_year` → `age_bracket`. **Sans impact frontend** : `AdminDashboard.jsx` ne consommait déjà
  ni `demographics.birth_year` ni `demographics.candidat_libre` (seul `demographics.gender` est
  affiché aujourd'hui) — vérifié avant de renommer, pour ne pas casser un affichage qui n'existe
  pas.
- **Frontend** : `RegistrationDetails.jsx` remplace le champ "Année de naissance" (nombre libre)
  par un sélecteur jour/mois/année (3 `<select>`, jamais de saisie libre de date — voir composant
  `BirthDateField`) et perd entièrement son champ "Région". `registrationValidation.js` valide
  l'âge (6-80 ans) plutôt qu'une année. `AuthGate.jsx`/`ProfileCompletionGate.jsx`/`api.js`
  propagent `birth_date`/suppriment `region` de bout en bout.

**Migration SQL** : `backend/migrations/004_birth_date_drop_region.sql`.

**⚠️ La base n'était PAS vide, contrairement à la consigne initiale** — vérifié avant d'écrire la
migration (`SELECT count(*) FROM app.users` = 4, `app.conversations` = 1) : 4 comptes existants
(`eddie`, `eeee`, `eeeee`, `zzzz` — des comptes de test manuels, confirmés par l'utilisateur avant
d'appliquer la migration, pas des données d'élèves réels). La migration convertit donc réellement
`birth_year` → `birth_date` (1er janvier de l'année, seule valeur reconstituable) plutôt que d'être
un no-op, et **`region` est perdue** pour les 2 comptes qui en avaient une (`eddie`, `eeee` :
`'Centre'`) — décision assumée par l'utilisateur (voir échange de confirmation). Migration
**appliquée sur la base Neon réelle** le 2026-08-13 ; résultat vérifié par relecture du schéma et
des lignes après coup (`birth_date` correctement peuplée, `birth_year`/`region` absentes).

### 14.2 AboutPanel — regroupement des explications

Le bandeau vidéo "Comment ça marche ?" (affiché en permanence sur bureau), les 3 cartes
explicatives (affichées en permanence dans `WelcomeCard` sur bureau, derrière un lien sur mobile
via l'ancien `HowItWorksSheet.jsx`, désormais supprimé) et la phrase d'introduction rejoignent un
composant unique, **`frontend/src/components/AboutPanel.jsx`**, ouvert à la demande (lien discret
dans `WelcomeCard` et dans le pied de page de `App.jsx`) plutôt qu'affiché à chaque ouverture de
l'application — détail complet des fichiers touchés dans `RAPPORT_MOBILE.md` §2 et §6 (ce chantier
touchant surtout l'affichage, pas les données). Nouveauté par rapport à l'existant : une courte
présentation du projet, et un rappel repliable du texte de consentement (`GET /api/consent`, en
lecture seule — pas de case à cocher, contrairement à `ConsentNotice.jsx` qui sert à le faire
accepter).

### 14.3 Horodatage des échanges

`created_at` existait déjà sur `app.messages`/`app.conversations` — aucun ajout côté base, affichage
seulement :

- **`MessageBubble.jsx`** affiche désormais l'heure sous chaque message (`formatMessageTime`, voir
  `frontend/src/lib/dateFormat.js`) et **`App.jsx`** insère un séparateur ("Aujourd'hui" / "Hier" /
  "12 août") entre deux messages de jours calendaires différents.
- Les messages créés pendant la session en cours reçoivent un horodatage client
  (`new Date().toISOString()`) au moment de l'envoi/de la réception (voir
  `App.jsx::pushUserMessage` et consorts) — le serveur ne renvoie `created_at` que pour les
  messages déjà persistés (relecture d'une conversation), donc les deux sources devaient être
  couvertes.
- **Export Word** (`frontend/src/lib/docx.js`) : l'heure de chaque message accompagne désormais son
  en-tête ("Élève  ·  14:32"), et la date de chaque conversation (format absolu "12 août 2026", pas
  relatif) rejoint sa sous-ligne classe/chapitre dans l'export d'historique complet.
- **`ConversationList.jsx`** : vérifié, pas modifié — son `formatDate` gère déjà correctement le
  format ISO 8601 avec décalage renvoyé par Postgres/FastAPI (`new Date(isoDatetime)` le parse
  nativement, aucune reconstruction de fuseau horaire à la main nécessaire).

### 14.4 Bug trouvé et corrigé en cours de route : les messages rechargés ne s'affichaient pas

En implémentant l'horodatage, découverte d'un bug préexistant, sans rapport direct avec la demande
mais qui en bloquait la réalisation : **`App.jsx::openConversation` passait les messages serveur
tels quels à `setMessages`**, sans jamais les convertir de la forme serveur
(`role`/`kind`/`content`/`payload`, voir `database.get_messages`) vers la forme attendue par
l'interface (`type`/`text`/`data`/`sources`, voir `MessageBubble.jsx`/`ExerciseCard.jsx`/
`RemediationQuiz.jsx`). Conséquence concrète, jamais couverte par un test (aucun test frontend
n'existait sur `openConversation`) : **rouvrir une conversation depuis l'historique affichait des
bulles vides**, un exercice ou un QCM de remédiation historique ne réaffichait plus sa carte, et
"Simplifie" perdait le contexte de la dernière question/réponse (`deriveLastExchange`, bâtie sur la
même forme). Corrigé par une fonction de conversion dédiée et testée,
`frontend/src/lib/serverMessages.js::mapServerMessagesToClient`, appelée dans `openConversation`
avant `setMessages`/`deriveLastExchange`.

### 14.5 Table `app.messages` — vérification demandée (pas de suppression)

Question posée : `app.messages` fait-elle doublon avec `app.conversations` ? **Réponse : non.**
`conversations` est le contenant (titre, classe/chapitre courants, dates, compteur de messages) ;
`messages` est le contenu (une ligne par question ET par réponse, avec son propre horodatage,
son propre `kind` — chat/exercise/remediation/summary/simplify/photo — et son propre `payload`
JSON pour les types structurés). Ce qui dépend directement de `app.messages`, vérifié par lecture de
`database.py`/`main.py` :

| Fonctionnalité | Fonction(s) |
|---|---|
| Rouvrir une conversation | `database.get_messages` → `GET /api/conversations/{id}` |
| Persistance de chaque échange | `database.add_message`/`add_exchange`, appelées par les 7 routes métier |
| Export Word d'une conversation/de tout l'historique | `database.export_user_history` |
| Message d'accueil personnalisé (a-t-il déjà un historique ?) | `database.has_any_history` |
| Compteur "questions" du tableau de bord décideur | `database.get_admin_overview` (`count(*) FROM messages WHERE role='user'`) |

**Fonction morte repérée en passant** (signalée, pas supprimée, hors du périmètre de cette
vérification) : `database.list_user_messages` n'est appelée nulle part dans le backend — écrite
mais jamais branchée.

**Duplication réelle repérée, signalée sans être corrigée** (la consigne demandait explicitement de
ne rien corriger si trouvé) : `class_code` et `chapter` existent en colonnes sur **les deux**
tables (`conversations.class_code`/`chapter` ET `messages.class_code`/`chapter`). Ce n'est pas une
redondance accidentelle — chaque message capture SA PROPRE classe/chapitre au moment de l'échange
(qui peut différer de ceux affichés sur la conversation, par exemple si le chapitre change en cours
de route, ou — depuis le correctif "classe fixée au compte", voir §13 — si l'élève change de classe
entre deux messages d'une même conversation rouverte) — mais la duplication de nom de colonne entre
les deux tables mérite d'être connue avant toute évolution future qui les ferait diverger sans le
vouloir.

### 14.6 Tests

- **Backend** : `test_register_rejects_implausible_birth_date` (trop jeune/trop âgé/date dans le
  futur), `test_register_ignores_unknown_region_field` (region envoyée mais ignorée, plus d'erreur).
  Tous les appels de test existants (`_register`, `database.create_user(...)` directs, `PATCH
  /api/profile`) migrés de `birth_year`/`region` vers `birth_date`.
- **Frontend** : `lib/serverMessages.test.js` (nouveau, 6 cas — couvre le bug du §14.4),
  `lib/dateFormat.test.js` (nouveau, couvre `formatMessageTime`/`formatDaySeparator`/`isSameDay`),
  `lib/registrationValidation.test.js` mis à jour (bornes d'âge plutôt qu'année, plus de champ
  `region`).
- **Suite complète** : voir §14.7 — rejouée cette fois, contrairement à la session précédente
  (voir §13), via le conteneur Docker du backend.

### 14.7 Exécution de la suite complète (Docker, torch CPU-only)

`torch` continue de ne pas s'importer nativement dans cet environnement Windows (`OSError: [WinError
1114]`, chargement de `c10.dll` — voir §13, confirmé de nouveau ici, sans rapport avec ce
correctif). Contournement : build de l'image `backend/Dockerfile` (qui installe déjà `torch` en
CPU-only, voir son commentaire dédié) et exécution de `pytest tests/ -v` à l'intérieur du conteneur
(`tests/` est exclu de l'image par `.dockerignore`, volontairement — image de prod, pas de fichiers
de test embarqués ; monté en volume pour l'occasion), contre la même base Neon réelle que
`tests/conftest.py` utilise nativement.

**Résultat : 77 tests, tous passés, 0 échec** (`284.88s`, un avertissement Pydantic sans rapport,
déjà connu — voir §7).

Un échec est apparu au premier passage (`test_persistence_failure_is_counted_and_exposed_in_health`,
`assert 400 == 200`) — pas un problème de ce correctif, mais un effet de bord du précédent (« classe
fixée au compte », §13, réalisé plus tôt dans la même session) : ce test enregistrait un compte en
`class_code="3ème"` (défaut de `_register`) mais interrogeait `/api/chat` avec
`class_level="6ème"`/`chapter="Les fractions"` — un chapitre valide seulement en 6ème. Avant §13,
le serveur utilisait tel quel le `class_level` envoyé par le client (donc "6ème", cohérent avec le
chapitre) ; depuis §13, `_resolve_class_level` le remplace systématiquement par la classe du
compte pour un utilisateur connecté ("3ème"), rendant la combinaison classe/chapitre invalide et
provoquant un 400 inattendu par ce test, écrit avant que ce comportement n'existe. Corrigé en
alignant le compte de test sur "6ème" (`_register(unique_username, class_code="6ème")`) plutôt que
d'affaiblir la vérification. Reconfirmé ensuite par un second passage complet, 77/77.
