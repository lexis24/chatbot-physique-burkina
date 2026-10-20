"""Rend le dossier backend/ importable (main.py, rag_system.py, ... utilisent des imports plats
comme `from config import config`, qui supposent que backend/ est sur sys.path).

Les données applicatives (comptes, conversations...) vivent maintenant dans Postgres/Neon
(voir database.py), sur la MÊME base que la production — il n'existe pas de branche Neon de
test dédiée pour l'instant (voir RAPPORT_MIGRATION.md, section « étapes manuelles restantes »).
Pour ne jamais polluer de vraies données : tout compte créé par un test DOIT avoir un nom
d'utilisateur préfixé par TEST_USERNAME_PREFIX (voir unique_username()) ; un fixture autouse
supprime en fin de test tous les comptes portant ce préfixe (la suppression d'un utilisateur
entraîne, par ON DELETE CASCADE, celle de ses conversations/messages/réponses de remédiation/
signaux de lacune — voir le schéma dans database.py)."""
import sys
import uuid
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

TEST_USERNAME_PREFIX = "pytest_"


@pytest.fixture
def unique_username():
    """Fabrique de noms d'utilisateur jetables garantis uniques, reconnus par le fixture de
    nettoyage ci-dessous. Fixture (plutôt qu'un simple helper importé) : `tests/` est un package
    avec son propre `__init__.py`, donc `from conftest import ...` échoue depuis un module de
    test ; les fixtures, elles, sont automatiquement partagées par pytest sans import explicite.
    À utiliser pour TOUT compte créé dans un test."""
    def _make(base: str = "user") -> str:
        return f"{TEST_USERNAME_PREFIX}{base}_{uuid.uuid4().hex[:10]}"
    return _make


@pytest.fixture(scope="session", autouse=True)
def _init_schema():
    """Crée le schéma applicatif (CREATE TABLE IF NOT EXISTS...) une fois pour la session
    de tests. Sans effet si le schéma existe déjà (voir database.init_db)."""
    import database
    database.init_db()
    yield


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """/api/auth/register et /api/auth/login sont limités à 5/minute (anti brute-force, voir
    main.py::AUTH_RATE_LIMIT) — un vrai atout en production, mais plusieurs tests de ce fichier
    appellent /api/auth/register plusieurs fois en quelques secondes et déclenchaient un 429
    inattendu selon l'ordre d'exécution. Reset du compteur avant chaque test plutôt que
    d'affaiblir la limite elle-même. N'importe `main` (lourd : instancie RAGSystem au chargement)
    que s'il est déjà chargé, pour ne pas ralentir les fichiers de test qui n'en ont pas besoin."""
    main_module = sys.modules.get("main")
    if main_module is not None:
        main_module.limiter.reset()
    yield


@pytest.fixture(autouse=True)
def _cleanup_test_users():
    """Supprime, après chaque test, tous les comptes créés par les tests (préfixe
    TEST_USERNAME_PREFIX) — quel que soit le test qui les a créés, y compris en cas
    d'échec en cours de test."""
    yield
    import database
    with database.get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"DELETE FROM {database.SCHEMA}.users WHERE username LIKE %s",
            (f"{TEST_USERNAME_PREFIX}%",),
        )
