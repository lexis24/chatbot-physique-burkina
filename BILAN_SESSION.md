# Bilan de session — création de l'application de physique

> Document de passation pour la prochaine session qui reprend ce dossier. Rédigé le 2026-10-23.

## Contexte

- Ce dépôt (`lexis24/chatbot-physique-burkina`) part d'une copie de l'application de l'assistant de
  l'autre matière (commit `99121fa`), transformée en assistant de **physique** « Prof Aïcha », avec les mêmes
  fonctionnalités. La chimie a sa propre application (`../chatbot-chimie-burkina`, non modifiée ici).
- **Aucun déploiement** n'a été fait. Aucun serveur, aucune URL de production pour l'instant. Ne pas réutiliser les
  scripts, serveurs ou bases de l'application d'origine.
- Base de données : projet Neon **dédié** `chatbot-physique-burkina` (région Frankfurt, extension `vector`
  activée). `DATABASE_URL` et la clé Anthropic sont uniquement dans `backend/.env` (non versionné). Sur la machine
  de développement, une variable d'environnement Windows `ANTHROPIC_API_KEY` prend le pas sur le `.env`.

## Ce qui a été fait (étapes validées une à une)

1. **Identité** : nom « Prof Aïcha », palette indigo `#4f46e5` / bleu `#0284c7` / ambre `#d97706`, logo atome,
   icônes PWA régénérées, clés `localStorage` `chatphysique-*`, thèmes `chatphysique-light/dark`, fichiers exportés
   `chatphysique-*`, table vectorielle `physique_burkina_embeddings`.
2. **Programme** : `curriculum_data.py` = 72 chapitres (4ème 18, 3ème 19, 2nde C 11, 1ère D 8, Tle D 16), intitulés
   vérifiés un par un contre les manuels. `data/documents/` = 72 PDF de chapitres. Correction dans
   `document_processor.py` : départage par numéro de chapitre (le chapitre 4 de 4ème recevait le cours du chapitre 2).
3. **Prompts** (`rag_system.py`) : persona, portée physique, consignes LaTeX et rigueur sur les unités, niveau
   olympiades de physique, prérequis déduits du contenu (les manuels de physique n'ont pas de ligne « Prérequis »),
   contenus de secours hors ligne.
4. **Schémas** : composant `PhysicsFigure` (circuits, forces, optique, graphiques, géométrie) et consignes JSON
   associées (`FIGURE_SCHEMAS`).
5. **Contenus** : 72 fiches de révision PDF et 72 paquets de flashcards (2 506 cartes) importés tels quels depuis les
   sources de l'équipe pédagogique ; index vectoriel construit avec `ingest_documents.py`.
6. **Vérification** : tests mis à jour, README et documentation technique réécrits.

Documents bruts fournis (livres complets, guides enseignant, annexes, sources) : `sources_physique/`, ignoré par git.

## Points d'attention

- Réseau : certains réseaux bloquent le port 5432 (Postgres) ; l'application et les tests backend ne démarrent
  alors pas (`PoolTimeout`). Changer de réseau.
- Ne pas lancer les tests backend pendant une indexation (ils initialisent l'index vectoriel au démarrage).
- Les schémas sont dessinés à partir de coordonnées fournies par Claude : à surveiller sur les constructions
  optiques (position des images) et les circuits à branches parallèles serrées.

## À faire ensuite

- Déploiement (hors périmètre de cette session) : prévoir la clé Anthropic et `DATABASE_URL` dans l'environnement du
  serveur, et `JWT_SECRET` + `APP_ENV=production`.
- `DEPLOY.md` décrit un déploiement Railway + Vercel générique ; à relire avant usage.
