"""Comptes partagés avec les maths (ACCOUNTS_DATABASE_URL, voir config.py et database.py).

Ces tests tournent sur la base locale de la physique (DATABASE_URL), jamais sur la base des maths :
un compte des maths peut porter une classe hors du programme de physique (6ème, 5ème) ou aucune
classe, cas simulés ici en modifiant directement la classe d'un compte de test.
"""
from fastapi.testclient import TestClient

import auth
import database
import main
from config import config

client = TestClient(main.app)


def _register_with_account_class(unique_username, account_class):
    username = unique_username("partage")
    res = client.post("/api/auth/register", json={
        "username": username, "password": "motdepasse123", "class_code": "3ème", "gender": "M",
        "birth_date": "2013-03-01", "is_candidat_libre": True, "consent_accepted": True,
    })
    assert res.status_code == 200
    with database.get_connection() as conn, conn.cursor() as cur:
        cur.execute(f"UPDATE {database.ACCOUNTS}.users SET class_code = %s WHERE username = %s",
                    (account_class, username))
    return username


def _login(username):
    res = client.post("/api/auth/login", json={"username": username, "password": "motdepasse123"})
    assert res.status_code == 200
    return res.json()


def test_class_in_programme_stays_fixed(unique_username):
    body = _login(_register_with_account_class(unique_username, "Tle"))
    assert body["class_code"] == "Tle"
    assert body["class_free"] is False
    assert main._resolve_class_level({"class_code": "Tle"}, "4ème") == "Tle"


def test_class_outside_programme_is_free_and_kept_in_account(unique_username):
    username = _register_with_account_class(unique_username, "6ème")
    body = _login(username)
    assert body["class_code"] is None
    assert body["class_free"] is True
    assert body["account_class_code"] == "6ème"
    # L'élève choisit son niveau : c'est la classe envoyée par le client qui sert.
    assert main._resolve_class_level({"class_code": "6ème"}, "4ème") == "4ème"

    # Renvoyer la fiche avec la classe inchangée (6ème) ne doit pas être refusé...
    headers = {"Authorization": f"Bearer {body['token']}"}
    res = client.patch("/api/profile", json={"class_code": "6ème", "gender": "F"}, headers=headers)
    assert res.status_code == 200
    assert res.json()["class_code"] == "6ème"
    # ...mais une AUTRE classe hors programme, si.
    res = client.patch("/api/profile", json={"class_code": "5ème"}, headers=headers)
    assert res.status_code == 400


def test_account_without_class_is_complete_only_with_shared_accounts(monkeypatch):
    user = {"class_code": None, "gender": "F", "birth_date": "2012-01-01", "is_candidat_libre": False}
    monkeypatch.setattr(config, "SHARED_ACCOUNTS", False)
    assert auth.is_profile_complete(user) is False
    monkeypatch.setattr(config, "SHARED_ACCOUNTS", True)
    assert auth.is_profile_complete(user) is True
    assert auth.is_profile_complete({**user, "gender": None}) is False
