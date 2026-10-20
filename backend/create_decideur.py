"""Crée un compte décideur (accès au tableau de bord de statistiques agrégées,
jamais au chat élève). Volontairement en ligne de commande, pas de route HTTP
publique : personne ne doit pouvoir s'auto-attribuer ce rôle depuis l'appli.

Usage :
    python create_decideur.py
"""
import getpass

import auth
import database

MIN_PASSWORD_LENGTH = 8  # aligné sur MIN_PASSWORD_LENGTH côté serveur (voir main.py)


def main():
    database.init_db()

    username = input("Nom d'utilisateur du décideur : ").strip()
    if not username:
        print("Nom d'utilisateur requis.")
        return

    password = getpass.getpass("Mot de passe : ")
    if len(password) < MIN_PASSWORD_LENGTH:
        print(f"Le mot de passe doit contenir au moins {MIN_PASSWORD_LENGTH} caractères.")
        return
    if getpass.getpass("Confirme le mot de passe : ") != password:
        print("Les deux mots de passe ne correspondent pas.")
        return

    # Un décideur n'a pas de fiche élève (classe/genre/consentement...) : create_user() sans ces
    # arguments les laisse à NULL, ce qui est attendu pour ce rôle.
    user = database.create_user(username, auth.hash_password(password), role="decideur")
    if not user:
        print(f"Le nom d'utilisateur « {username} » est déjà pris.")
        return

    print(
        f"Compte décideur « {username} » créé (code {user['public_code']}). "
        "Il peut se connecter via l'onglet Connexion de l'appli."
    )


if __name__ == "__main__":
    main()
