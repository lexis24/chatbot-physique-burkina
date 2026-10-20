# Déploiement de test — Railway (backend) + Vercel (frontend)

Guide pour déployer une version de test accessible par lien, gratuitement (essai Railway de 30
jours / 5$ de crédit, Vercel gratuit sans limite de temps pour un usage personnel/test).

Ce que Claude Code a préparé dans le repo : `backend/Dockerfile`, `backend/.dockerignore`. Les
étapes ci-dessous nécessitent tes propres comptes (Railway, Vercel) — impossibles à créer à ta
place.

## Pourquoi ces choix

- Railway a un vrai disque persistant (contrairement à Render en gratuit) : les comptes élèves ne
  sont pas perdus à chaque redémarrage.
- Le `Dockerfile` embarque directement `backend/data/documents` (les PDF de cours) tels qu'ils sont
  sur ton disque en ce moment. Les embeddings (index vectoriel), eux, ne sont **pas** embarqués :
  ils vivent à part sur Postgres/pgvector (Neon), accessible par le réseau via `DATABASE_URL` —
  pas besoin de refaire les ~20-30 min de ré-indexation à chaque déploiement, ni de se soucier
  d'une limite de taille sur l'image ou le dépôt Git.
- Le disque persistant Railway ne sert qu'à la base SQLite des comptes élèves (`app.db`) : il est
  monté sur un sous-dossier dédié pour ne pas écraser les documents embarqués dans l'image.

## 1. Backend sur Railway

### Installer et se connecter

```bash
npm install -g @railway/cli
railway login
```

`railway login` ouvre le navigateur pour te connecter avec ton compte Railway (à créer sur
railway.app si tu n'en as pas).

### Créer le projet et déployer

Depuis le dossier `backend/` du projet (important : c'est ce dossier qui sera envoyé tel quel, donc
avec `data/documents` même s'il est dans `.gitignore` — Railway ne passe pas par GitHub ici) :

```bash
cd backend
railway init
railway up
```

Le premier build prend plusieurs minutes (téléchargement de torch CPU + du modèle
d'embeddings). Les fois suivantes sont plus rapides.

### Ajouter un disque persistant

Dans le dashboard Railway (railway.app → ton projet → ton service) :
1. Clique droit sur le service → **Add Volume** (ou `⌘K` → "New Volume").
2. Monte-le sur `/app/data/db`.

### Variables d'environnement

Toujours dans le dashboard, onglet **Variables** :

| Variable | Valeur |
|---|---|
| `ANTHROPIC_API_KEY` | ta clé API Anthropic (celle de `backend/.env`) |
| `ANTHROPIC_MODEL` | `claude-sonnet-5` |
| `DATABASE_URL` | chaîne de connexion Postgres Neon (celle de `backend/.env`, dashboard Neon → Connection Details) — stocke l'index vectoriel (embeddings des cours) |
| `DB_PATH` | `/app/data/db/app.db` |
| `CORS_ORIGINS` | l'URL Vercel du frontend (étape 2) — met une valeur temporaire du style `https://placeholder.vercel.app` pour l'instant, à corriger après |
| `APP_ENV` | `production` |
| `JWT_SECRET` | un secret généré une fois (ex. `python -c "import secrets; print(secrets.token_hex(32))"`), à ne jamais regénérer ensuite — sinon toutes les sessions élèves sont invalidées. **Obligatoire** : avec `APP_ENV=production`, le serveur refuse de démarrer sans lui. |

`PORT` est injecté automatiquement par Railway, ne pas le définir toi-même.

### Récupérer l'URL publique

Dashboard → service → **Settings** → **Networking** → **Generate Domain**. Tu obtiens une URL du
style `https://ton-projet.up.railway.app`. Vérifie que ça répond :

```bash
curl https://ton-projet.up.railway.app/api/health
```

## 2. Frontend sur Vercel

### Option A — via le site (le plus simple)

1. Va sur [vercel.com](https://vercel.com), connecte ton compte GitHub (ou crée un compte Vercel
   si besoin), puis **Add New → Project** et importe le repo de ce projet.
2. Configuration du build (Vercel détecte Vite automatiquement, vérifie quand même) :
   - **Root Directory** : `frontend` (bouton "Edit" à côté de Root Directory)
   - **Framework Preset** : Vite
   - **Build Command** : `npm run build`
   - **Output Directory** : `dist`
3. Variable d'environnement à ajouter (**Settings → Environment Variables**, avant ou après le
   premier déploiement) :
   - `VITE_API_URL` = l'URL Railway obtenue à l'étape 1 (ex : `https://ton-projet.up.railway.app`)
4. Déploie. Tu obtiens une URL du style `https://ton-projet.vercel.app`.

`frontend/vercel.json` (déjà dans le repo) ajoute automatiquement des en-têtes de sécurité à toutes
les pages servies (Content-Security-Policy, X-Frame-Options, etc.). Le `connect-src` de la CSP
autorise par défaut `https://*.up.railway.app` : si tu utilises un domaine personnalisé pour le
backend plutôt que le sous-domaine Railway par défaut, ajoute-le dans `connect-src` sinon le
frontend ne pourra plus contacter l'API (bloqué par le navigateur, pas par le serveur — ça se
manifeste par des erreurs réseau silencieuses dans la console).

### Option B — en ligne de commande

```bash
npm install -g vercel
cd frontend
vercel login
vercel        # premier déploiement (répond aux questions : Root Directory déjà correct car lancé depuis frontend/)
vercel env add VITE_API_URL production   # colle l'URL Railway quand demandé
vercel --prod
```

## 3. Boucler la boucle : CORS

Retourne dans les variables Railway (étape 1) et remplace `CORS_ORIGINS` par l'URL Vercel réelle
obtenue à l'étape 2 (ex : `https://ton-projet.vercel.app`). Ça redéploie automatiquement le
service. Si tu gardes aussi un aperçu de branche/preview Vercel (URL différente à chaque déploiement
de preview), sépare plusieurs origines par une virgule dans `CORS_ORIGINS`.

## Vérifications avant de partager le lien

- [ ] `https://ton-projet.up.railway.app/api/health` répond `{"status":"healthy",...}`
- [ ] Le frontend Vercel charge bien la liste des classes (preuve que l'appel API + CORS
      fonctionnent)
- [ ] Un nouveau visiteur (navigation privée) tombe bien sur la page de connexion
- [ ] Créer un compte de test, poser une question, générer un exercice, vérifier "voir le cours"
- [ ] Redémarrer le service Railway (Settings → Restart) puis vérifier que le compte de test créé
      juste avant existe toujours (preuve que le disque persistant fonctionne)

## Limites connues de ce déploiement de test

- **Essai Railway limité** : 30 jours ou 5$ de crédit consommé, selon ce qui arrive en premier.
  Au-delà, il faut passer sur un plan payant pour continuer à faire tourner le service en continu.
- **Premier chargement après une période creuse** : si Railway met le service en veille (dépend du
  plan), la première requête relance le modèle d'embeddings (~15-20s, déjà observé en local).
- **Fichiers PDF ajoutés via l'upload admin après le déploiement** ne survivront pas à un
  redéploiement (ils ne sont écrits que dans la couche image, pas sur le volume persistant) — pour
  ajouter des documents durablement, il faut les remettre dans `backend/data/documents` en local,
  relancer `python ingest_documents.py` (indexation vers Neon) puis refaire `railway up`. Ceci ne
  concerne que les fichiers PDF eux-mêmes (utilisés pour "voir le cours") : l'index vectoriel, lui,
  vit sur Neon et n'est jamais affecté par un redéploiement.

## Note sur l'authentification (token de connexion)

Le token de connexion (JWT) est stocké côté navigateur dans `localStorage`, pas dans un cookie
`httpOnly`. Ce choix a été délibéré : Railway (backend) et Vercel (frontend) sont deux domaines
différents, et un cookie partagé entre deux domaines différents (`SameSite=None`) est bloqué ou
limité par certains navigateurs (Safari/iOS avec l'ITP en tête) — une partie des élèves aurait pu
se retrouver déconnectée en boucle sans qu'on comprenne pourquoi. À la place, la protection contre
le vol de token repose sur : l'absence de faille XSS trouvée dans l'audit de sécurité, la
Content-Security-Policy ajoutée dans `frontend/vercel.json` (bloque les scripts injectés), et une
expiration de session courte (`JWT_EXPIRE_DAYS=7`). Si un jour frontend et backend sont déployés
sous un même domaine parent (ex. `app.tondomaine.com` / `api.tondomaine.com`), le cookie `httpOnly`
redevient une option nettement plus simple et fiable à mettre en place.
