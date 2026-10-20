"""Texte du consentement affiché à l'inscription (et aux comptes migrés depuis l'ancienne
base SQLite, voir migrate_sqlite_to_pg.py). Isolé dans ce fichier pour que toute modification
du texte oblige à changer CONSENT_VERSION (voir config.py) — ce qui redemande l'accord de
chaque élève au lieu de faire silencieusement comme si l'ancien accord couvrait le nouveau texte.

CONSENT_VERSION est lu depuis config.py (donc depuis la variable d'environnement CONSENT_VERSION
si définie) plutôt que codé en dur ici, pour qu'il n'existe qu'une seule source de vérité.
"""
from config import config

CONSENT_VERSION = config.CONSENT_VERSION

CONSENT_TEXT = """\
Avant de créer ton compte, voici ce qu'il faut savoir.

**Quelles informations sont enregistrées ?**
Ton nom d'utilisateur et ton mot de passe (le mot de passe est enregistré de façon chiffrée,
personne ne peut le lire, même nous). Si tu choisis de les renseigner : ta classe, ton genre,
ton année de naissance et ton établissement. Ensuite, au fil de ton utilisation : tes questions,
les exercices que tu fais et tes réponses aux quiz de révision.

**Pourquoi ces informations ?**
Pour te proposer des exercices adaptés à ton niveau, garder ton historique de conversation d'une
fois sur l'autre, et te dire quelles notions revoir en priorité.

**Qui peut voir ces informations ?**
Tes questions et tes réponses ne sont visibles que par toi. L'équipe qui gère l'application peut
voir des statistiques globales (par exemple : "30% des élèves de 3ème se trompent souvent sur le
théorème de Pythagore") mais jamais tes questions précises ni qui tu es — ces statistiques ne sont
calculées que si assez d'élèves sont concernés, pour qu'on ne puisse jamais deviner qui a répondu
quoi.

**Comment demander la suppression de mes données ?**
Tu peux demander la suppression complète de ton compte et de tout ton historique à tout moment,
en écrivant à l'équipe de l'application. Tes données sont alors définitivement effacées.

En créant ton compte, tu acceptes que ces informations soient enregistrées comme décrit ci-dessus.
"""
