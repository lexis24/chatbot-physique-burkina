import os
import re
import json
import base64
from urllib.parse import urlparse
from typing import Optional
from llama_index.core import VectorStoreIndex, StorageContext, Document, Settings as LlamaSettings
from llama_index.core.node_parser import SentenceSplitter
from llama_index.core.vector_stores import MetadataFilters, ExactMatchFilter
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.vector_stores.postgres import PGVectorStore
from config import config
from curriculum_data import CURRICULUM
import anthropic

EMBED_DIM = 384  # sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2

# Dossier explicite pour le cache du modèle d'embeddings — SANS ce `cache_folder` explicite,
# HuggingFaceEmbedding retombe sur llama_index.core.utils.get_cache_dir() (/tmp/llama_index),
# alors que le Dockerfile le pré-télécharge dans le cache HuggingFace par défaut (~/.cache/
# huggingface/hub) pour éviter tout accès réseau au démarrage (voir Dockerfile) : les deux
# chemins ne correspondaient pas, donc le conteneur re-téléchargeait (et échouait si le réseau
# sortant était bloqué/instable) à chaque démarrage au lieu d'utiliser le cache déjà présent
# dans l'image. Ce chemin doit rester identique à celui utilisé dans le Dockerfile.
EMBED_CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hf_cache")


FIGURE_SCHEMAS = """SCHÉMAS DE PHYSIQUE — un schéma est un objet JSON dont le champ "type" vaut "circuit", "forces", \
"optique", "graphique" ou "geometrie". Coordonnées libres (pas d'échelle réaliste imposée), axe y vers le HAUT. \
Étiquettes en TEXTE SIMPLE, jamais de LaTeX ni de $ dans le JSON : indices avec _ (U_AB, F_1, E_pp), exposants avec \
^ (m/s^2, 10^-3), lettres grecques et unités directement en Unicode (Ω, α, λ, μ, °C) — c'est la seule exception à la \
règle LaTeX, propre au JSON des schémas. N'inclus une clé facultative que si elle sert au schéma.

1. "circuit" — schéma électrique sur une grille (nœuds aux coordonnées entières) :
{"type": "circuit",
 "composants": [{"type": "pile", "de": [0,0], "vers": [0,2], "label": "E = 12 V"},
                {"type": "lampe", "de": [0,2], "vers": [3,2], "label": "L"},
                {"type": "amperemetre", "de": [3,2], "vers": [3,0]}],
 "fils": [[[3,0], [0,0]]],
 "noeuds": [[3,2]],
 "courants": [{"de": [0,2], "vers": [3,2], "label": "I"}],
 "tensions": [{"de": [3,2], "vers": [0,2], "label": "U_AB"}],
 "points": [{"id": "A", "position": [0,2]}]}
Types de composants : pile, generateur, generateur_alternatif, lampe, resistance, interrupteur_ouvert, \
interrupteur_ferme, moteur, amperemetre, voltmetre, ohmmetre, diode, del, condensateur, bobine, fusible. \
Chaque composant occupe UN segment de grille de longueur au moins 1 ; pour une pile, "de" = borne -, "vers" = borne + ; \
pour une diode/DEL, "de" -> "vers" = sens passant. "fils" = lignes brisées reliant les extrémités des composants \
(le circuit doit être fermé si le courant circule). Laisse au moins 2 unités de grille entre deux branches parallèles, \
sinon les étiquettes et les flèches de tension se chevauchent. Un voltmètre est un composant posé EN DÉRIVATION (entre deux nœuds \
déjà reliés au dipôle). "noeuds" = points de dérivation (gros points). "courants" = flèche de sens du courant sur un \
fil ; "tensions" = flèche de tension parallèle au dipôle (convention française : la flèche de U_AB pointe vers A).

2. "forces" — schéma de mécanique (bilan des forces, équilibre, plan incliné, pendule, poulie) :
{"type": "forces",
 "solides": [{"forme": "rectangle", "centre": [0,0.5], "largeur": 2, "hauteur": 1, "angle": 0}],
 "supports": [{"de": [-3,0], "vers": [3,0]}],
 "fils": [{"de": [0,1], "vers": [0,3]}],
 "forces": [{"nom": "P", "origine": [0,0.5], "vecteur": [0,-2]},
            {"nom": "R", "origine": [0,0], "vecteur": [0,2]}],
 "points": [{"id": "G", "position": [0,0.5]}],
 "angles": [{"sommet": [-3,0], "debut": 0, "fin": 30, "label": "α"}],
 "axes": {"origine": [-2.5,2], "x": "x", "y": "y"}}
Formes de solides : rectangle (avec "angle" en degrés pour un solide posé sur un plan incliné), cercle ou sphere \
("centre", "rayon"), polygone ("points" : liste de [x,y], par exemple pour dessiner le plan incliné lui-même). \
"supports" = surfaces hachurées (sol, mur, plafond, plan incliné). Chaque force part de son point d'application \
("origine") ; "vecteur" = composantes du vecteur, avec des longueurs PROPORTIONNELLES aux intensités quand elles sont \
connues ; "nom" sans flèche ni LaTeX (« P », « T_1 ») : la flèche du vecteur est ajoutée automatiquement. Angles en \
degrés, sens trigonométrique.

3. "optique" — axe optique horizontal en y = 0 :
{"type": "optique",
 "elements": [{"type": "lentille_convergente", "x": 0, "hauteur": 4, "nom": "L"}],
 "foyers": [{"nom": "F", "x": -2}, {"nom": "F'", "x": 2}],
 "points": [{"id": "O", "position": [0,0]}],
 "objets": [{"nom": "AB", "x": -5, "hauteur": 1.5}],
 "images": [{"nom": "A'B'", "x": 3.33, "hauteur": -1, "virtuelle": false}],
 "rayons": [{"points": [[-5,1.5], [0,1.5], [3.33,-1]]}, {"points": [[-5,1.5], [3.33,-1]]}]}
Types d'éléments : lentille_convergente, lentille_divergente ("x", "hauteur"), miroir_plan ("x" et "hauteur", ou \
"de"/"vers" pour un miroir incliné), ecran et obstacle ("x", "bas", "haut"), source ("position", "nom"). Objets et \
images = flèches perpendiculaires à l'axe (hauteur négative = renversée) ; "virtuelle": true -> pointillés. Rayons = \
lignes brisées dans le sens de propagation de la lumière ; "virtuel": true -> prolongement en pointillés. Les rayons \
doivent être physiquement exacts (rayon parallèle à l'axe -> passe par F' ; rayon par O -> non dévié ; rayon par F -> \
ressort parallèle à l'axe) et l'image doit être là où ils se croisent. Pour les ombres : source, obstacle, ecran, \
rayons issus de la source rasant les bords de l'obstacle ; mets "axe": false s'il n'y a pas d'axe optique.

4. "graphique" — courbe ou caractéristique avec axes gradués :
{"type": "graphique",
 "x": {"grandeur": "I", "unite": "mA", "min": 0, "max": 50, "pas": 10},
 "y": {"grandeur": "U", "unite": "V", "min": 0, "max": 6, "pas": 1},
 "series": [{"nom": "mesures", "points": [[0,0], [10,1.2], [20,2.4], [30,3.6], [40,4.8]], "style": "points+ligne"}],
 "reperes": [{"axe": "x", "valeur": 25, "label": "I_max"}],
 "annotations": [{"texte": "U = 120 × I", "position": [30,5]}]}
TOUJOURS une grandeur ET son unité sur chaque axe. "style" : points (mesures expérimentales), ligne (courbe \
théorique) ou points+ligne. Pour une courbe (sinusoïde, exponentielle, parabole...), donne une vingtaine de points \
calculés exactement. "reperes" = droite en pointillés (période, asymptote, valeur lue).

5. "geometrie" — construction géométrique simple, si aucun type ci-dessus ne convient :
{"type": "geometrie", "points": [{"id": "A", "x": 0, "y": 0}, {"id": "B", "x": 4, "y": 0}],
 "segments": [{"from": "A", "to": "B"}], "labels": [{"text": "4 cm", "x": 2, "y": -0.4}]}
(clés facultatives : "angles" [{"vertex","from","to","right"}], "polygons", "circles" [{"center","radius"}])."""

FIGURE_FORMAT_INSTRUCTIONS = f"""SCHÉMAS — RÈGLE ABSOLUE, PRIORITAIRE SUR TOUT LE RESTE :
Dès qu'un schéma serait utile (circuit électrique, bilan des forces, marche de rayons lumineux, graphique ou courbe), \
tu DOIS le produire EXCLUSIVEMENT avec un bloc de code étiqueté `figure` contenant UN objet JSON valide, placé \
directement au bon endroit dans ta réponse :
```figure
{{"type": "circuit", "composants": [...], "fils": [...]}}
```
INTERDICTIONS STRICTES, sans AUCUNE exception, même si on te le demande explicitement : jamais de schéma en ASCII art \
(jamais de caractères `|`, `/`, `\\`, `-`, `_`, `+` alignés pour représenter des fils, des rayons ou des forces), \
jamais un bloc de code sans l'étiquette `figure`, jamais une description uniquement textuelle à la place du schéma, \
jamais un pseudo-schéma en LaTeX (`\\begin{{array}}`, suites de `\\text{{...}}` reliées par des tirets ou des flèches). \
Un circuit esquissé avec des barres et des tirets est un ÉCHEC : utilise TOUJOURS le JSON à la place.

{FIGURE_SCHEMAS}"""

FORMULA_FORMAT_INSTRUCTIONS = """FORMULES, GRANDEURS ET UNITÉS EN LaTeX — RÈGLE ABSOLUE : toute formule, relation, \
grandeur physique ou valeur numérique accompagnée de son unité s'écrit en LaTeX : `$...$` en ligne, `$$...$$` pour \
une formule isolée. N'écris JAMAIS une formule en texte brut (écris $U = R \\times I$, jamais U = R x I ; écris \
$E_c = \\dfrac{1}{2} m v^{2}$, jamais Ec = 1/2 m v^2). L'unité s'écrit en romain avec `\\text{}`, séparée de la \
valeur par une espace fine `\\,`, et la virgule décimale s'écrit `{,}` : $9{,}8\\,\\text{m/s}^2$, \
$220\\,\\text{V}$, $1{,}5\\,\\text{k}\\Omega$, $25\\,^{\\circ}\\text{C}$, $3{,}0 \\times 10^{8}\\,\\text{m/s}$. \
Lettres grecques ($\\Omega$, $\\lambda$, $\\mu$, $\\Delta$, $\\rho$), vecteurs ($\\vec{F}$, $\\vec{v}$), \
indices ($U_{AB}$, $E_{pp}$) et puissances de dix : toujours en LaTeX, jamais en Unicode brut (Ω, μ, λ, →) ni épelés \
en toutes lettres (écris $\\Omega$, jamais « ohms » à la place du symbole dans une valeur)."""

UNITS_INSTRUCTIONS = """RIGUEUR SUR LES UNITÉS — RÈGLE ABSOLUE (c'est l'erreur la plus fréquente des élèves en physique) :
- Travaille dans le Système international (SI) : m, kg, s, A, K, mol et unités dérivées (N, J, W, V, $\\Omega$, Pa, \
Hz, C, T...). Les unités usuelles du programme (km/h, g, L, mL, cm³, °C, kWh, mA...) sont permises dans un énoncé, \
mais convertis-les explicitement en unités SI AVANT tout calcul, en montrant la conversion \
(ex : $72\\,\\text{km/h} = \\dfrac{72\\,000\\,\\text{m}}{3\\,600\\,\\text{s}} = 20\\,\\text{m/s}$).
- Tout calcul se fait en trois temps : expression littérale d'abord, puis application numérique (valeurs ET unités), \
puis résultat. Un résultat numérique SANS unité est faux : chaque résultat porte son unité.
- Vérifie l'homogénéité d'une relation quand c'est utile (les deux membres ont la même unité).
- Chiffres significatifs : le résultat garde autant de chiffres significatifs que la donnée la moins précise \
(souvent 2 ou 3), en écriture scientifique si besoin ; garde plus de chiffres dans les calculs intermédiaires et \
n'arrondis qu'à la fin. En 4ème/3ème, insiste surtout sur l'unité et les conversions ; à partir de la 2nde, exige \
aussi les chiffres significatifs.
- Utilise la valeur de l'intensité de la pesanteur donnée par l'énoncé ; à défaut, $g = 9{,}8\\,\\text{N/kg}$ \
(signale-le si tu arrondis à $10\\,\\text{N/kg}$, valeur souvent utilisée dans les manuels de 4ème/3ème)."""

NO_EMOJI_INSTRUCTIONS = """TON ET MISE EN FORME — RÈGLE ABSOLUE : N'utilise JAMAIS d'emoji ni de pictogramme (aucun symbole \
du type ✅, ⚠️, 💡, 🎉, 👋, 💪, ⚡, 🚀, ✨, etc.), nulle part dans ta réponse, même pour marquer une réussite, un \
conseil ou un encouragement. Marque l'importance uniquement avec la mise en forme Markdown : **gras** pour les \
notions clés, `##`/`###` pour les titres, `>` pour une remarque importante. Écris comme un professeur ou un manuel \
scolaire soigné, jamais comme un assistant conversationnel générique.

TABLEAUX (tableau de mesures, bilan des forces, tableau de conversions...) : utilise TOUJOURS un vrai tableau \
Markdown (syntaxe standard avec des `|` pour séparer les colonnes ET une ligne `|---|---|` juste sous l'en-tête), \
jamais des tirets ou des espaces alignés à la main pour simuler des colonnes. Indique l'unité dans l'en-tête de \
chaque ligne ou colonne. Exemple pour un tableau de mesures :
| $U$ (V) | $0$ | $1{,}5$ | $3{,}0$ | $4{,}5$ |
|---|---|---|---|---|
| $I$ (mA) | $0$ | $15$ | $30$ | $45$ |"""

OFF_TOPIC_INSTRUCTIONS = """PORTÉE — RÈGLE ABSOLUE : tu es une professeure de PHYSIQUE, rien d'autre. Si l'élève pose \
une question qui ne relève pas de la physique (une autre matière scolaire — y compris la CHIMIE et les MATHÉMATIQUES, qui \
ont chacune leur propre assistant Hakili Lab —, la culture générale, l'actualité, des conseils personnels, de l'aide en \
programmation, écrire un texte/une histoire, etc.), décline poliment et brièvement : dis que tu es spécialisée en \
physique et invite-le à reformuler une question de physique. Ne réponds JAMAIS à la question hors-sujet elle-même, \
même partiellement, même « pour rendre service ». EXCEPTIONS à cette règle : les salutations, remerciements, et \
questions sur le fonctionnement de l'outil (« comment ça marche ? », « c'est quoi ce site ? ») ne sont pas concernées, \
réponds-y normalement et brièvement. Un outil mathématique utilisé POUR résoudre un problème de physique \
(proportionnalité, puissances de dix, vecteurs, trigonométrie, dérivée d'une équation horaire...) fait partie de la \
physique : aide l'élève sur ce calcul. Un exercice de physique mis en contexte (moto, panneau solaire, forage, marché, \
cuisine, sport...) reste une question de physique : ce n'est PAS hors-sujet, ne le décline surtout pas."""

# Certains modèles récents (dont celui configuré ici) refusent qu'une conversation se termine
# par un tour "assistant" (pas de préremplissage) : la relance automatique en cas de réponse
# tronquée doit donc se terminer par ce message utilisateur plutôt que par le texte déjà généré.
CONTINUE_INSTRUCTION = ("Continue exactement là où tu t'es arrêté ci-dessus, sans rien répéter de ce qui "
                        "précède et sans rien ajouter avant (ni préambule, ni excuse) : je recolle ta "
                        "réponse précédente et cette suite bout à bout.")

# \b \f \r \t sont des échappements JSON valides à part entière, mais dans CE contexte (texte
# scientifique LaTeX) ce sont presque toujours le début d'une commande cassée (\frac, \times,
# \text, \to, \tan, \forall, \boxed, \begin...), jamais un vrai caractère de contrôle voulu — les
# exclure du jeu "sûr" pour qu'ils soient réparés. \n reste sûr (sauts de ligne très fréquents et
# légitimes dans les solutions), au prix d'un résidu rare (\neq/\nabla cassés seraient mal réparés).
_JSON_VALID_ESCAPE_CHARS = '"\\/nu'


def _repair_latex_json_escapes(text: str) -> str:
    """Double tout backslash qui ne fait pas déjà partie d'un échappement JSON jugé sûr ici (\\",
    \\\\, \\/, \\n, \\uXXXX). Répare les commandes LaTeX (\\vec, \\frac, \\det...) écrites en JSON
    avec un seul backslash au lieu de deux — un backslash simple suivi d'une lettre quelconque
    n'est pas un échappement JSON valide et fait échouer json.loads()."""
    return re.sub(r"\\(.)", lambda m: m.group(0) if m.group(1) in _JSON_VALID_ESCAPE_CHARS else "\\\\" + m.group(1),
                  text, flags=re.DOTALL)

# Échelle de difficulté des exercices, en étoiles (1 à 5) : le niveau 4 correspond aux
# "situations d'intégration" du programme burkinabè (énoncé contextualisé, plusieurs notions),
# le niveau 5 sort volontairement du programme direct (type olympiades/concours) — voir
# generate_exercise, qui le traite à part (jamais ancré sur les documents de cours déposés :
# aucun contenu de ce type dedans, vérifié).
STAR_DIFFICULTY_LABELS = {
    1: "1 ÉTOILE — QCM D'APPLICATION DIRECTE (questions de cours)",
    2: "2 ÉTOILES — APPLICATION DIRECTE DES DÉFINITIONS, LOIS ET RELATIONS DU COURS (une formule, une conversion)",
    3: "3 ÉTOILES — NOTIONS COMBINÉES (plusieurs étapes et relations enchaînées, proche d'une évaluation de classe)",
    4: "4 ÉTOILES — SITUATION D'INTÉGRATION (énoncé contextualisé complexe, plusieurs notions combinées, niveau examen)",
    5: "5 ÉTOILES — TYPE OLYMPIADES (problème de concours : astuce ou idée non standard, hors du cadre direct du "
       "programme, difficulté nettement au-dessus d'une situation d'intégration)",
}


class RAGSystem:
    def __init__(self):
        self.embed_model = HuggingFaceEmbedding(
            model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
            cache_folder=EMBED_CACHE_DIR,
        )
        LlamaSettings.embed_model = self.embed_model

        # Configuration Anthropic Claude
        self.anthropic_api_key = config.ANTHROPIC_API_KEY
        self.anthropic_model = config.ANTHROPIC_MODEL
        self.anthropic_client = None
        # `claude-sonnet-5` rejette `temperature` ("deprecated for this model") — détecté au premier
        # appel (voir _create_message/_stream_claude) puis mémorisé ici pour éviter de retenter à
        # chaque appel un paramètre qu'on sait déjà refusé par le modèle configuré.
        self._temperature_supported = True
        if self.anthropic_api_key:
            try:
                self.anthropic_client = anthropic.Anthropic(api_key=self.anthropic_api_key)
                print(f"[OK] Anthropic Claude API configuree avec le modele {self.anthropic_model}")
            except Exception as e:
                print(f"[WARN] Erreur initialisation Anthropic: {e}")
        else:
            print("[WARN] ANTHROPIC_API_KEY manquante : le mode local degrade sera utilise.")

        # Embeddings stockés à part (Postgres + pgvector, ex. Neon), pas embarqués dans le
        # déploiement : voir DEPLOY.md::DATABASE_URL. `psql_url` parsée une fois ici, réutilisée
        # par from_params() (host/port/... séparés, pas juste connection_string) : c'est ce qui
        # laisse from_params() construire à la fois l'URL sync (psycopg2) ET async (asyncpg)
        # requises par PGVectorStore, sans les construire à la main.
        url = urlparse(config.DATABASE_URL)
        self._pg_params = dict(
            host=url.hostname,
            port=str(url.port or 5432),
            database=url.path.lstrip("/"),
            user=url.username,
            password=url.password,
        )
        self.table_name = config.VECTOR_TABLE_NAME
        self.index = None
        self.storage_context = None

    def _create_vector_store(self):
        return PGVectorStore.from_params(
            **self._pg_params,
            table_name=self.table_name,
            embed_dim=EMBED_DIM,
        )

    def _build_index(self, vector_store):
        self.storage_context = StorageContext.from_defaults(vector_store=vector_store)
        self.index = VectorStoreIndex.from_vector_store(
            vector_store=vector_store,
            embed_model=self.embed_model
        )

    def _reset_store(self):
        """Supprime la table d'embeddings pour la reconstruire de zéro (voir ingest_documents.py).
        PGVectorStore préfixe le nom de table donné par "data_" pour la vraie table SQL — vérifié
        empiriquement (pas documenté), ce préfixe est stable tant qu'on ne change pas de version
        du connecteur."""
        import psycopg
        with psycopg.connect(config.DATABASE_URL) as conn:
            with conn.cursor() as cur:
                cur.execute(f'DROP TABLE IF EXISTS "data_{self.table_name}"')
            conn.commit()

    def initialize_vector_store(self):
        try:
            vector_store = self._create_vector_store()
            self._build_index(vector_store)
            print("Vector store loaded successfully")
        except Exception as e:
            print(f"Existing vector store is incompatible, resetting it: {e}")
            self._reset_store()
            vector_store = self._create_vector_store()
            self._build_index(vector_store)
            print("Vector store initialized")

    def add_documents(self, documents, metadata=None):
        if metadata is None:
            metadata = {}

        docs = []
        for doc in documents:
            doc_metadata = metadata.copy()
            if isinstance(doc, dict):
                docs.append(Document(
                    text=doc.get("text", ""),
                    metadata=doc.get("metadata", doc_metadata)
                ))
            else:
                docs.append(Document(text=doc, metadata=doc_metadata))

        splitter = SentenceSplitter(
            chunk_size=config.CHUNK_SIZE,
            chunk_overlap=config.CHUNK_OVERLAP
        )

        for doc in docs:
            nodes = splitter.get_nodes_from_documents([doc])
            self.index.insert_nodes(nodes)

        print(f"Added {len(docs)} documents to vector store")

    @staticmethod
    def _exact_filter(key: str, value: str) -> ExactMatchFilter:
        """Construit un ExactMatchFilter sûr pour du texte contenant une apostrophe (ex: chapitre
        "Racine carrée d'un nombre réel positif"). llama-index-vector-stores-postgres construit le
        WHERE en interpolant la valeur brute dans du SQL littéral (`f"'{filter_.value}'"`, voir
        _build_filter_clause dans postgres/base.py) sans l'échapper : une apostrophe non doublée y
        casse la requête (psycopg2.errors.SyntaxError), faisant silencieusement échouer le filtre
        exact et retomber sur des correspondances moins fiables (repli par nom de fichier, voire
        aucun résultat — "Voir le cours" 404 sur ces chapitres). Doubler l'apostrophe est l'échappement
        SQL standard d'un littéral, sans changer la valeur réellement comparée."""
        return ExactMatchFilter(key=key, value=value.replace("'", "''"))

    def _retrieve_with_filters(self, question, filters, top_k):
        metadata_filters = MetadataFilters(filters=filters) if filters else None
        retriever = self.index.as_retriever(
            similarity_top_k=top_k,
            filters=metadata_filters
        )
        return retriever.retrieve(question)

    def query(self, question, class_level=None, chapter=None, top_k=None):
        if top_k is None:
            top_k = config.TOP_K

        exact_filters = []
        if class_level:
            exact_filters.append(self._exact_filter("class", class_level))
        if chapter:
            exact_filters.append(self._exact_filter("chapter", chapter))

        nodes = self._retrieve_with_filters(question, exact_filters, top_k)
        if nodes or not (class_level and chapter):
            return nodes

        # Les documents importes depuis des exports ZIP/Drive n'ont pas toujours un
        # libelle de chapitre identique au curriculum. On garde alors la classe, mais
        # on relache le filtre chapitre pour ne pas ignorer les manuels disponibles.
        class_only_filters = [self._exact_filter("class", class_level)]
        return self._retrieve_with_filters(question, class_only_filters, top_k)

    def find_course_file_from_index(self, class_level: str, chapter: str) -> Optional[str]:
        """Cherche un document de cours via un filtre EXACT classe+chapitre dans l'index vectoriel,
        plutôt que par correspondance de noms de fichiers (voir document_processor.find_course_file).
        Fiable — contrairement à une recherche par similarité — car il s'agit d'une égalité stricte
        sur les métadonnées : ne peut renvoyer un document que si l'ingestion l'a explicitement classé
        sous ce couple (classe, chapitre) exact, ce qu'elle fait désormais en lisant le CONTENU des
        documents (voir ingest_documents.py::classify_chapter_from_content), pas leur nom de fichier."""
        try:
            nodes = self._retrieve_with_filters(
                chapter,
                [self._exact_filter("class", class_level), self._exact_filter("chapter", chapter)],
                top_k=1,
            )
        except Exception as e:
            print(f"[WARN] Recherche du cours dans l'index echouee: {e}")
            return None
        if not nodes:
            return None
        source = nodes[0].metadata.get("source")
        return source if source and os.path.isfile(source) else None

    def collection_count(self):
        try:
            import psycopg
            # Délai borné : /api/health appelle cette méthode à chaque fois, et ne doit jamais
            # rester bloqué sur une connexion lente ou un port 5432 filtré.
            with psycopg.connect(config.DATABASE_URL, connect_timeout=10) as conn:
                with conn.cursor() as cur:
                    cur.execute(f'SELECT COUNT(*) FROM "data_{self.table_name}"')
                    return cur.fetchone()[0]
        except Exception as e:
            print(f"Postgres count failed: {e}")
            return 0

    # ========================================================================
    # APPEL CLAUDE (support multi-tours)
    # ========================================================================

    def _create_message(self, system_prompt: str, messages: list, max_tokens: int, temperature: float,
                         tools: list = None):
        """Un seul appel bas niveau à l'API Messages, avec repli si le modèle rejette `temperature`.

        `temperature` passe par `extra_body` plutôt qu'en paramètre nommé direct : le SDK anthropic
        (>=1.x) a retiré `temperature` de la signature typée de `create()`/`stream()`, ce qui lève un
        TypeError côté client avant même la requête HTTP — `extra_body` la transmet telle quelle à
        l'API, qui répond alors par un vrai BadRequestError si le modèle la refuse, rattrapable ici."""
        kwargs = {
            "model": self.anthropic_model,
            "max_tokens": max_tokens,
            "system": system_prompt,
            "messages": messages,
        }
        if tools:
            kwargs["tools"] = tools
        if self._temperature_supported:
            kwargs["extra_body"] = {"temperature": temperature}
        try:
            return self.anthropic_client.messages.create(**kwargs)
        except anthropic.BadRequestError as e:
            # Certains modèles récents (ex: reasoning models) rejettent un temperature
            # personnalisé. On retente sans ce paramètre plutôt que de tout faire échouer.
            if "temperature" in str(e).lower():
                self._temperature_supported = False
                kwargs.pop("extra_body", None)
                return self.anthropic_client.messages.create(**kwargs)
            raise

    @staticmethod
    def _extract_text(response) -> str:
        text = ""
        for block in response.content:
            if hasattr(block, 'text'):
                text += block.text
            elif isinstance(block, dict) and 'text' in block:
                text += block['text']
        return text

    def _call_claude(self, system_prompt: str, messages: list, max_tokens: int = 1024,
                      temperature: float = None, tools: list = None) -> str:
        """Appelle l'API Claude d'Anthropic avec un historique de messages et retourne le texte.

        Si la réponse est coupée par la limite de tokens (stop_reason == "max_tokens"), relance
        automatiquement la génération (en lui redonnant le texte déjà produit et en lui demandant
        de continuer directement à la suite) pour que l'élève reçoive toujours une réponse complète."""
        if not self.anthropic_client:
            print("[WARN] Anthropic client non initialise (cle API manquante ?)")
            return None

        temp = temperature if temperature is not None else config.ANTHROPIC_TEMPERATURE
        try:
            current_messages = list(messages)
            accumulated = ""
            for attempt in range(config.MAX_AUTO_CONTINUATIONS + 1):
                response = self._create_message(system_prompt, current_messages, max_tokens, temp, tools=tools)
                accumulated += self._extract_text(response)

                if response.stop_reason == "max_tokens" and attempt < config.MAX_AUTO_CONTINUATIONS:
                    if accumulated.strip():
                        # Reponse partielle : on demande de continuer directement a la suite.
                        current_messages = list(messages) + [
                            {"role": "assistant", "content": accumulated},
                            {"role": "user", "content": CONTINUE_INSTRUCTION},
                        ]
                    else:
                        # Le budget de tokens a ete integralement consomme par le raisonnement
                        # interne du modele (frequent sur les exercices complexes/schemas
                        # detailles), sans laisser une seule reponse textuelle : impossible de
                        # "continuer" un tour assistant vide (l'API le refuse), donc on relance la
                        # meme requete depuis le debut plutot que d'abandonner silencieusement.
                        current_messages = list(messages)
                    continue
                break

            return accumulated.strip() if accumulated.strip() else None

        except anthropic.APIError as e:
            print(f"[ERREUR] API Anthropic: {e}")
            return None
        except anthropic.RateLimitError as e:
            print(f"[ERREUR] Rate limit Anthropic: {e}")
            return None
        except Exception as e:
            print(f"[ERREUR] Anthropic: {e}")
            return None

    def _verify_qcm_batch(self, class_level: str, chapter: Optional[str], qcm_items: list) -> list:
        """Filet de sécurité contre une réponse marquée correcte à tort : les parseurs JSON
        (_parse_exercise_json, _parse_prerequis_json) ne valident QUE la forme d'un QCM généré
        (4 choix, un index entre 0 et 3), jamais si cet index pointe VRAIMENT vers la bonne
        réponse — un exercice de physique qui affirme une mauvaise réponse avec la même assurance
        qu'une bonne est le pire scénario pour un tuteur (l'élève apprend l'erreur en confiance).

        Un second appel Claude, dédié UNIQUEMENT à la relecture (température 0, pas de rédaction
        de question), résout chaque question lui-même puis confirme ou corrige l'index — un seul
        appel pour tout le lot plutôt qu'un par question, pour ne pas multiplier la latence. En
        cas d'échec (API indisponible, JSON non parsable...), on sert le lot ORIGINAL tel quel :
        mieux vaut un exercice non revérifié qu'aucun exercice — ce n'est qu'un filet de sécurité
        additionnel, pas une condition pour servir une réponse."""
        if not qcm_items:
            return qcm_items

        try:
            payload = json.dumps(
                [
                    {"index": i, "question": it["question"], "choix": it["choix"],
                     "reponse_marquee": it["reponse_correcte_index"]}
                    for i, it in enumerate(qcm_items)
                ],
                ensure_ascii=False,
            )
            system_prompt = f"""Tu es un correcteur de physique rigoureux, pas un rédacteur. On te \
soumet une liste de questions à choix multiples de niveau {class_level}{f" ({chapter})" if chapter else ""}, \
chacune avec l'index (0 à 3) actuellement marqué comme la bonne réponse. Pour CHAQUE question, résous-la \
intégralement par toi-même AVANT de comparer au marquage — ne te contente jamais de faire confiance à \
"reponse_marquee". Vérifie en particulier les conversions d'unités, les puissances de dix et l'unité de chaque choix : \
un choix numériquement juste mais avec une mauvaise unité est FAUX.

QUESTIONS :
{payload}

Réponds UNIQUEMENT avec un objet JSON (aucun texte avant/après, pas de bloc de code) : \
{{"verdicts": [{{"index": 0, "reponse_correcte_index": 0}}, ...]}} — un verdict par question, dans n'importe \
quel ordre (identifié par "index"), où "reponse_correcte_index" est TOUJOURS le bon index selon TA propre \
résolution, que le marquage initial soit juste ou faux."""

            response = self._call_claude(
                system_prompt, [{"role": "user", "content": "Vérifie ces questions."}],
                max_tokens=config.MAX_TOKENS_QCM_VERIFICATION, temperature=0,
            )
            if not response:
                return qcm_items

            text = response.strip()
            text = re.sub(r"^```(json)?", "", text, flags=re.IGNORECASE).strip()
            text = re.sub(r"```$", "", text).strip()
            start, end = text.find("{"), text.rfind("}")
            if start == -1 or end == -1 or end <= start:
                return qcm_items
            data = json.loads(text[start:end + 1])

            verdicts = data.get("verdicts")
            if not isinstance(verdicts, list):
                return qcm_items

            corrected = list(qcm_items)
            for verdict in verdicts:
                if not isinstance(verdict, dict):
                    continue
                i = verdict.get("index")
                idx = verdict.get("reponse_correcte_index")
                if not isinstance(i, int) or not (0 <= i < len(corrected)):
                    continue
                if not isinstance(idx, int) or not (0 <= idx < len(corrected[i]["choix"])):
                    continue
                if idx != corrected[i]["reponse_correcte_index"]:
                    print(f"[INFO] Vérification QCM : correction {corrected[i]['reponse_correcte_index']} -> "
                          f"{idx} pour « {corrected[i]['question'][:60]}... »")
                    corrected[i] = {**corrected[i], "reponse_correcte_index": idx}
            return corrected
        except Exception as e:
            print(f"[WARN] Vérification QCM échouée, réponse originale conservée: {e}")
            return qcm_items

    def _stream_claude(self, system_prompt: str, messages: list, max_tokens: int = 1024,
                        temperature: float = None):
        """Version streaming de `_call_claude` : yield des fragments de texte au fur et à mesure,
        avec la même logique de continuation automatique si la réponse est tronquée."""
        if not self.anthropic_client:
            return

        temp = temperature if temperature is not None else config.ANTHROPIC_TEMPERATURE
        current_messages = list(messages)
        accumulated = ""

        for attempt in range(config.MAX_AUTO_CONTINUATIONS + 1):
            stop_reason = None

            # `messages.stream(...)` ne fait la requête HTTP qu'à l'entrée du context manager
            # (__enter__), donc le repli "sans temperature" doit être tenté à ce moment-là,
            # pas au moment de la simple construction de l'objet stream. Voir _create_message pour
            # pourquoi `temperature` passe par `extra_body` plutôt qu'en paramètre nommé direct.
            stream_kwargs = {
                "model": self.anthropic_model, "max_tokens": max_tokens,
                "system": system_prompt, "messages": current_messages,
            }
            if self._temperature_supported:
                stream_kwargs["extra_body"] = {"temperature": temp}
            stream_ctx = self.anthropic_client.messages.stream(**stream_kwargs)
            try:
                stream = stream_ctx.__enter__()
            except anthropic.BadRequestError as e:
                if "temperature" not in str(e).lower():
                    raise
                self._temperature_supported = False
                stream_kwargs.pop("extra_body", None)
                stream_ctx = self.anthropic_client.messages.stream(**stream_kwargs)
                stream = stream_ctx.__enter__()

            try:
                for text in stream.text_stream:
                    accumulated += text
                    yield text
                stop_reason = stream.get_final_message().stop_reason
            finally:
                stream_ctx.__exit__(None, None, None)

            if stop_reason == "max_tokens" and attempt < config.MAX_AUTO_CONTINUATIONS:
                if accumulated.strip():
                    current_messages = list(messages) + [
                        {"role": "assistant", "content": accumulated},
                        {"role": "user", "content": CONTINUE_INSTRUCTION},
                    ]
                else:
                    # Meme cas que dans _call_claude : rien de textuel produit du tout (budget
                    # entierement consomme par le raisonnement interne) — on relance depuis zero.
                    current_messages = list(messages)
                continue
            break

    @staticmethod
    def _build_history_messages(history: list, current_user_message: str) -> list:
        """Convertit l'historique frontend ([{role, content}, ...]) en messages Anthropic,
        tronque aux N derniers échanges et ajoute le message courant."""
        messages = []
        if history:
            max_messages = config.HISTORY_MAX_TURNS * 2
            trimmed = history[-max_messages:]
            for turn in trimmed:
                role = turn.get("role")
                content = turn.get("content", "")
                if role in ("user", "assistant") and content:
                    messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": current_user_message})
        return messages

    # ========================================================================
    # GÉNÉRATION DE RÉPONSES (chat)
    # ========================================================================

    def generate_response(self, question, class_level, chapter, history=None):
        """Génère une réponse pédagogique via Claude + RAG, avec mémoire de conversation."""
        try:
            context = ""
            sources = []

            try:
                nodes = self.query(question, class_level, chapter)
                if nodes:
                    context = "\n".join([node.get_content()[:500] for node in nodes])
                    sources = [node.metadata for node in nodes]
            except Exception as e:
                print(f"RAG retrieval failed: {e}")

            answer = self._generate_with_claude(question, context, class_level, chapter, history)

            return {
                "answer": answer,
                "sources": sources,
                "from_rag": len(sources) > 0
            }
        except Exception as e:
            print(f"Error generating response: {e}")
            return {
                "answer": f"Une erreur s'est produite. Erreur: {str(e)}",
                "sources": [],
                "from_rag": False,
                "error": str(e)
            }

    def _build_chat_prompt(self, question, context, class_level, chapter):
        """Construit (system_prompt, user_message) pour une question de chat.
        Partagé entre la génération classique et la génération en streaming."""

        classe_txt = class_level if class_level else \
            "non précisée par l'élève — déduis un niveau de langage raisonnable à partir de la question elle-même"
        chapitre_txt = chapter if chapter else \
            "non précisé par l'élève — identifie toi-même le thème de physique concerné"

        if chapter:
            # Le chapitre sélectionné dans la barre latérale est un CONTEXTE, pas une contrainte :
            # une question hors-sujet mais toujours de physique doit recevoir une vraie réponse,
            # pas une tentative forcée de rattachement à ce chapitre (source de réponses confuses
            # et lentes, le modèle passant du temps à chercher un lien qui n'existe pas).
            mission = (
                f"Aider un élève {f'de {class_level} ' if class_level else ''}à réellement comprendre ses "
                f"questions de physique, pas seulement lui donner un résultat. Il suit actuellement le "
                f"chapitre « {chapter} », mais si sa question porte sur un tout autre sujet, réponds quand "
                "même complètement à SA question réelle, sans essayer de forcer artificiellement un lien "
                f"avec « {chapter} »."
            )
        elif class_level:
            mission = (
                f"Aider un élève de {class_level} à réellement comprendre sa question de physique, "
                "pas seulement lui donner un résultat."
            )
        else:
            mission = (
                "Aider un élève du Burkina Faso à réellement comprendre sa question de physique, "
                "pas seulement lui donner un résultat, même s'il n'a pas précisé sa classe ni son chapitre."
            )

        system_prompt = f"""Tu es « Prof Aïcha », une professeure de physique expérimentée et bienveillante, \
experte du programme officiel du Burkina Faso (de la 4ème à la Terminale D).

MISSION
{mission}

{OFF_TOPIC_INSTRUCTIONS}

{FIGURE_FORMAT_INSTRUCTIONS}

{NO_EMOJI_INSTRUCTIONS}

RÈGLES À SUIVRE ABSOLUMENT :
1. Utilise en priorité le CONTEXTE DOCUMENTAIRE fourni ci-dessous (extraits de manuels officiels). S'il est vide ou \
insuffisant, réponds quand même avec tes connaissances solides en physique (sauf si la question est hors-sujet, \
voir la règle de PORTÉE ci-dessus). NE DIS JAMAIS que tu ne peux pas répondre à une question de physique.
2. N'invente jamais un fait, une source précise (page, numéro) que tu ne peux pas justifier avec le contexte fourni.
3. Adapte le niveau de langue et la profondeur des explications à la classe : {classe_txt} \
(vocabulaire simple et expériences concrètes en 4ème/3ème, formalisme rigoureux — vecteurs, équations horaires, \
dérivées — en Terminale).
4. Structure TOUJOURS ta réponse en Markdown clair : titres courts avec ##, **gras** sur les notions clés, \
listes numérotées pour les étapes de résolution.
5. Applique strictement les règles FORMULES/UNITÉS et RIGUEUR SUR LES UNITÉS ci-dessous dans toute ta réponse.
6. Si l'élève demande d'expliquer une notion, une loi ou un principe (question de cours), explique-la normalement : \
énoncé précis, signification de chaque grandeur avec son unité SI, conditions de validité, puis un exemple chiffré \
complet et entièrement résolu. Quand c'est utile, décris une expérience simple qui met la notion en évidence. En revanche, si l'élève te soumet SON PROPRE exercice ou calcul à résoudre, \
NE DONNE PAS directement le résultat final : rappelle la méthode/formule à utiliser, détaille la première étape, \
donne une piste sur la suivante, puis invite-le à continuer et à te dire où il en est. Donne la résolution \
complète, étape par étape jusqu'au résultat, UNIQUEMENT si l'élève la demande explicitement (« donne-moi la \
solution », « corrige mon calcul », « je suis bloqué, montre-moi », « je ne trouve pas »), ou s'il te montre déjà \
sa propre tentative et te demande de la vérifier.
7. Illustre avec un exemple concret et réaliste du quotidien burkinabè (moto et circulation, panneau solaire, \
forage et pompe, canari qui rafraîchit l'eau, cuisine au gaz ou au charbon, radio, éclairage...) quand c'est \
pertinent pour la notion, avec des ordres de grandeur réalistes.
8. Termine ta réponse par une courte question de compréhension ou une invitation à s'entraîner \
(« Essaie maintenant avec... », « Est-ce plus clair ou veux-tu un autre exemple ? »).
9. Si un historique de conversation est fourni, reste parfaitement cohérent avec les échanges précédents.
10. Reste toujours encourageant et bienveillant, jamais condescendant.

{FORMULA_FORMAT_INSTRUCTIONS}

{UNITS_INSTRUCTIONS}

CONTEXTE DOCUMENTAIRE (programme officiel burkinabè, peut être vide) :
{context if context else "(Aucun document indexé pour ce chapitre — appuie-toi sur tes connaissances.)"}
"""

        user_message = f"""Chapitre : {chapitre_txt}
Classe : {classe_txt}

Question de l'élève : {question}"""

        return system_prompt, user_message

    def _generate_with_claude(self, question, context, class_level, chapter, history=None):
        """Utilise Claude pour générer une réponse pédagogique de qualité, avec contexte RAG et historique.
        class_level et chapter peuvent être vides : l'élève a le droit de poser une question sans les préciser."""

        system_prompt, user_message = self._build_chat_prompt(question, context, class_level, chapter)
        messages = self._build_history_messages(history, user_message)
        response = self._call_claude(system_prompt, messages, max_tokens=config.MAX_TOKENS_CHAT)
        if response:
            return response

        print("[WARN] Claude indisponible, utilisation du fallback local...")
        return self._generate_local_response(question, class_level, chapter, context)

    def generate_response_stream(self, question, class_level, chapter, history=None):
        """Génère la réponse en streaming : yield des dicts d'événements.
        {"delta": "..."} pour chaque fragment de texte, puis un événement final
        {"done": True, "sources": [...], "from_rag": bool} une fois la génération terminée."""
        context = ""
        sources = []

        try:
            nodes = self.query(question, class_level, chapter)
            if nodes:
                context = "\n".join([node.get_content()[:500] for node in nodes])
                sources = [node.metadata for node in nodes]
        except Exception as e:
            print(f"RAG retrieval failed: {e}")

        system_prompt, user_message = self._build_chat_prompt(question, context, class_level, chapter)
        messages = self._build_history_messages(history, user_message)

        got_any = False
        if self.anthropic_client:
            try:
                for chunk in self._stream_claude(system_prompt, messages, max_tokens=config.MAX_TOKENS_CHAT):
                    if chunk:
                        got_any = True
                        yield {"delta": chunk}
            except Exception as e:
                print(f"[ERREUR] streaming Claude: {e}")

        if not got_any:
            print("[WARN] Claude indisponible, utilisation du fallback local...")
            text = self._generate_local_response(question, class_level, chapter, context)
            yield {"delta": text}

        yield {"done": True, "sources": sources, "from_rag": len(sources) > 0}

    # ========================================================================
    # SIMPLIFICATION
    # ========================================================================

    def simplify_answer(self, question: str, original_answer: str, class_level: str, chapter: str = "") -> str:
        """Utilise Claude pour reformuler une réponse de façon nettement plus simple."""

        system_prompt = f"""Tu es « Prof Aïcha », professeure de physique au Burkina Faso. \
Un élève de {class_level} n'a PAS compris ta première explication sur « {chapter or "ce chapitre"} ». \
Tu dois RÉEXPLIQUER, pas répéter.

RÈGLES :
- N'utilise PAS les mêmes phrases ni le même ordre que l'explication originale : change vraiment d'angle.
- Utilise des mots TRÈS SIMPLES, comme si tu parlais à un enfant de 10-12 ans, quelle que soit la classe réelle.
- Donne un exemple concret et imagé du quotidien au Burkina Faso (marché, terrain de foot, famille, etc.).
- Sois chaleureux et rassurant : commence par une phrase du type « Pas de souci, on reprend autrement. »
- Découpe en 2 à 4 étapes très courtes, une idée par étape.
- Formules en LaTeX (`$...$`) si nécessaire, mais garde-les minimales ; chaque valeur garde son unité \
(ex : $12\\,\\text{{V}}$), écrite en LaTeX.
- Termine par une phrase d'encouragement.

{NO_EMOJI_INSTRUCTIONS}
"""

        user_message = f"""Question initiale de l'élève : {question or "(non précisée)"}

Explication originale à simplifier :
{original_answer[:1500]}

Réécris cette explication de façon beaucoup plus simple et différente dans la formulation :"""

        response = self._call_claude(system_prompt, [{"role": "user", "content": user_message}],
                                      max_tokens=config.MAX_TOKENS_SIMPLIFY)
        if response:
            return response

        return self._local_simplify(question, original_answer, class_level)

    # ========================================================================
    # PHOTO D'EXERCICE (vision Claude : explication + correction à partir d'une image)
    # ========================================================================

    def explain_exercise_photo(self, file_bytes: bytes, media_type: str, class_level: str = "",
                                chapter: str = "", user_prompt: str = "", history: list = None) -> str:
        """Analyse la photo (ou le PDF scanné) d'un exercice envoyé par l'élève et renvoie la
        méthode à suivre puis la correction détaillée. Claude lit le fichier directement (vision
        pour une image, lecture native pour un PDF) : plus fiable qu'un OCR classique pour des
        notations scientifiques (formules, unités, schémas). `chapter` est le chapitre actuellement suivi dans la discussion,
        pas nécessairement celui de l'exercice photographié (l'élève peut envoyer une photo sans
        rapport avec la discussion en cours) : c'est un indice, jamais une contrainte."""
        classe_txt = f"un élève de {class_level}" if class_level else "un élève"
        chapitre_txt = (
            f" Il suit actuellement le chapitre « {chapter} », mais l'exercice photographié peut "
            "porter sur un tout autre sujet : identifie le VRAI sujet à partir du document, sans "
            f"te forcer à le rattacher à « {chapter} »."
            if chapter else ""
        )
        support_txt = "le PDF" if media_type == "application/pdf" else "la photo"
        is_followup = bool(history)
        followup_txt = (
            "\n8. Un historique de conversation est fourni ci-dessous : l'élève continue à te parler du "
            "MÊME exercice, déjà présenté plus haut dans l'échange (l'image jointe à ce message est "
            "TOUJOURS celle de cet exercice). Ne redemande pas de recopier l'énoncé ni de le renvoyer : "
            "réponds directement à sa nouvelle question, en te basant sur l'image et sur ce qui a déjà été dit."
            if is_followup else ""
        )

        system_prompt = f"""Tu es « Prof Aïcha », professeure de physique au Burkina Faso, experte du \
programme officiel (de la 4ème à la Terminale D). Un élève t'envoie {support_txt} d'un exercice de physique \
(papier, manuscrit ou imprimé) et attend ton aide.

MISSION
1. Identifie précisément l'énoncé de l'exercice à partir du document fourni (recopie-le brièvement \
pour confirmer à l'élève que tu l'as bien lu, y compris s'il est manuscrit ou de mauvaise qualité).
2. Si le document est illisible, flou, ou ne contient pas d'exercice de physique exploitable, dis-le \
clairement et demande un envoi plus net plutôt que d'inventer un énoncé.
3. Explique la méthode à suivre (quelle loi, quelle démarche, quelle relation, quelles conversions d'unités) \
pour cet exercice précis. Relève les données de l'énoncé avec leurs unités.
4. NE DONNE PAS directement la correction complète et le résultat final de cet exercice. Donne des pistes \
progressives : détaille la première étape à faire, ce qu'il faut calculer ou chercher, un point de vigilance \
fréquent sur ce type d'exercice (souvent une conversion d'unités oubliée) — juste assez pour que l'élève puisse continuer seul. Termine en l'invitant à \
essayer et à te dire où il en est (son résultat, ou l'étape où il bloque).
5. EXCEPTION à la règle 4 : donne la correction complète, détaillée étape par étape jusqu'au résultat, si (a) \
l'élève le demande explicitement (« donne-moi la solution/correction/réponse », « je suis bloqué, montre-moi »), \
ou (b) il te montre sa propre tentative/son résultat et te demande de vérifier — dans ce cas corrige-le en \
détail, en indiquant précisément où est l'erreur s'il y en a une.
6. Si l'élève a ajouté une consigne ou une question précise avec son envoi, réponds D'ABORD à cette \
demande précise (ex: "seulement la question 2", "vérifie juste mon calcul") plutôt qu'à tout l'exercice — \
sauf si cette consigne est elle-même hors-sujet (voir la règle de PORTÉE ci-dessous), auquel cas décline-la \
et contente-toi d'aider sur l'exercice de physique photographié.
7. Adapte le niveau de langue à {classe_txt}.{chapitre_txt}{followup_txt}

{OFF_TOPIC_INSTRUCTIONS}

{FIGURE_FORMAT_INSTRUCTIONS}

{NO_EMOJI_INSTRUCTIONS}

RÈGLES DE MISE EN FORME :
- Structure en Markdown clair : ## pour les titres courts, **gras** pour les notions clés.
- Applique les règles FORMULES/UNITÉS et RIGUEUR SUR LES UNITÉS ci-dessous.
- Termine par une courte question de compréhension ou une invitation à s'entraîner sur un exercice similaire.

{FORMULA_FORMAT_INSTRUCTIONS}

{UNITS_INSTRUCTIONS}
"""

        # PDF : bloc "document" (lu nativement par Claude, page par page). Image : bloc "image" (vision).
        file_block = (
            {"type": "document", "source": {"type": "base64", "media_type": media_type,
                                             "data": base64.b64encode(file_bytes).decode("ascii")}}
            if media_type == "application/pdf"
            else {"type": "image", "source": {"type": "base64", "media_type": media_type,
                                               "data": base64.b64encode(file_bytes).decode("ascii")}}
        )
        if is_followup:
            instruction_txt = user_prompt.strip() if user_prompt and user_prompt.strip() else \
                "Continue à m'aider sur ce même exercice."
        else:
            instruction_txt = (
                f"Voici {support_txt} de mon exercice de physique. {user_prompt.strip()}"
                if user_prompt and user_prompt.strip()
                else f"Voici {support_txt} de mon exercice de physique. Aide-moi à le résoudre : "
                     "explique-moi la méthode et guide-moi pas à pas."
            )
        user_content = [
            file_block,
            {"type": "text", "text": instruction_txt},
        ]

        # Les échanges précédents sur ce même exercice (voir le paramètre `history`) : sans ça,
        # Claude ne verrait l'image qu'une seule fois et "l'oublierait" dès la question suivante,
        # incapable de répondre à un simple "résous la question a" sur la même photo.
        messages = []
        if history:
            max_messages = config.HISTORY_MAX_TURNS * 2
            for turn in history[-max_messages:]:
                role = turn.get("role")
                content = turn.get("content", "")
                if role in ("user", "assistant") and content:
                    messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": user_content})

        response = self._call_claude(
            system_prompt,
            messages,
            max_tokens=config.MAX_TOKENS_EXERCISE_PHOTO,
        )
        if response:
            return response

        return ("Je n'arrive pas à analyser ce fichier pour le moment. Réessaie avec une photo plus nette, "
                "bien cadrée sur l'exercice, ou recopie l'énoncé directement dans le chat.")

    # ========================================================================
    # PRÉREQUIS (QCM diagnostique sur les notions ANTÉRIEURES nécessaires à ce chapitre)
    # ========================================================================

    def generate_prerequis(self, class_level: str, chapter: str, history: list = None) -> list:
        """Identifie les notions prérequises indispensables pour aborder ce chapitre (vues dans des
        chapitres ANTÉRIEURS, pas le chapitre lui-même) et renvoie, pour chacune, un court RAPPEL de
        cours (ce que l'élève doit déjà savoir) suivi de 1 à 2 exercices diagnostiques — jamais l'inverse :
        l'élève doit pouvoir relire la notion avant de s'y confronter, pas deviner à l'aveugle puis
        recevoir une correction. Renvoie une liste de groupes {notion, rappel, exercices} (voir
        _parse_prerequis_json), PAS une liste plate de questions.
        Contrairement aux manuels de maths, les manuels de physique Hakili Lab n'ont PAS de ligne
        « Prérequis : ... » en tête de chapitre (vérifié sur les 72 PDF) : le modèle déduit les prérequis
        du contenu du chapitre (extraits du cours, voir le bloc de retrieval ci-dessous) et de la liste
        des chapitres antérieurs du programme (de cette classe et des classes précédentes). Si l'élève a posé des questions récentes, elles pèsent sur QUELLES notions méritent
        2 exercices plutôt qu'un seul, pas sur le fait de tester le chapitre en cours (voir
        _local_prerequis pour le repli si Claude est indisponible)."""

        recent_questions = [
            turn.get("content", "").strip()
            for turn in (history or [])
            if turn.get("role") == "user" and turn.get("content", "").strip()
        ][-6:]

        if recent_questions:
            context_block = (
                "L'élève a récemment posé ces questions dans sa conversation (ordre chronologique) :\n"
                + "\n".join(f'- « {q} »' for q in recent_questions) +
                "\n\nCONSIGNE IMPORTANTE : si l'une de ces questions touche déjà une notion prérequise "
                "de ce chapitre, prévois 2 exercices diagnostiques pour celle-là plutôt qu'un seul "
                "(elle mérite d'être vérifiée plus en profondeur) ; un exercice suffit pour les autres."
            )
        else:
            context_block = ("L'élève n'a pas encore posé de question précise : répartis les exercices "
                              "de façon équilibrée entre les notions prérequises identifiées.")

        # Seul ancrage disponible sur ce qui a DÉJÀ été vu : les chapitres antérieurs de cette classe
        # (numérotés comme dans les manuels, à partir de 1) et ceux des classes précédentes — les
        # manuels de physique ne listent pas leurs prérequis (voir docstring).
        previous_chapters_block = ""
        chapters_list = CURRICULUM.get(class_level, {}).get("chapters", [])
        if chapter in chapters_list:
            idx = chapters_list.index(chapter)
            if idx > 0:
                previous_chapters_block = "\n".join(f"Ch. {i} — {c}" for i, c in enumerate(chapters_list[:idx], 1))
        class_codes = list(CURRICULUM.keys())
        earlier_classes = class_codes[:class_codes.index(class_level)] if class_level in class_codes else []
        earlier_classes_block = "\n".join(
            f"{c} : " + " ; ".join(CURRICULUM[c]["chapters"]) for c in earlier_classes
        )
        previous_chapters_context = (
            f"\nCHAPITRES DÉJÀ VUS EN {class_level} AVANT CELUI-CI (numérotés comme dans les manuels) :\n"
            f"{previous_chapters_block}\n" if previous_chapters_block else ""
        ) + (
            f"\nPROGRAMME DE PHYSIQUE DES CLASSES PRÉCÉDENTES :\n{earlier_classes_block}\n" if earlier_classes_block else ""
        )

        # Ancrage documentaire : extraits du cours de CE chapitre (notions, lois et grandeurs qu'il
        # utilise), à partir desquels le modèle déduit ce qui doit déjà être acquis.
        document_block = ""
        try:
            context_nodes = self._retrieve_with_filters(
                f"Notions, lois, grandeurs et unités utilisées dans le chapitre {chapter}",
                [self._exact_filter("class", class_level), self._exact_filter("chapter", chapter)],
                top_k=3,
            )
            if context_nodes:
                document_excerpts = "\n---\n".join(n.get_content()[:800] for n in context_nodes)
                document_block = f"""
EXTRAITS DU COURS DE CE CHAPITRE — repère les grandeurs, lois et savoir-faire qu'il UTILISE sans les \
réexpliquer : ce sont les prérequis à vérifier (à relier aux chapitres déjà vus listés ci-dessus) :
{document_excerpts}
"""
        except Exception as e:
            print(f"[WARN] Recherche de contexte pour les prérequis echouee: {e}")

        system_prompt = f"""Tu es « Prof Aïcha », professeure de physique au Burkina Faso. \
Un élève de {class_level} va commencer le chapitre « {chapter} ». AVANT qu'il ne s'y lance, tu vérifies \
qu'il maîtrise encore les notions prérequises — vues dans des chapitres ANTÉRIEURS, de cette année ou \
d'une année précédente — dont ce chapitre a besoin. Tu ne testes JAMAIS le contenu du chapitre « {chapter} » \
lui-même, seulement ce qui doit déjà être acquis avant de l'aborder. Un prérequis peut être une notion de \
physique vue avant (grandeur, loi, unité, appareil de mesure) ou un outil mathématique indispensable à ce chapitre \
(proportionnalité, conversions et puissances de dix, vecteurs, trigonométrie, dérivée...).

{FORMULA_FORMAT_INSTRUCTIONS}

{UNITS_INSTRUCTIONS}
{previous_chapters_context}
{context_block}
{document_block}
STRUCTURE ATTENDUE, PAR NOTION (dans cet ORDRE, jamais l'inverse) :
1. Un RAPPEL DE COURS autonome sur la notion prérequise elle-même (définition, propriété ou méthode, \
+ un exemple chiffré rapide si utile) : l'élève doit pouvoir le lire et comprendre la notion SANS avoir \
encore vu les exercices. Ce n'est ni un indice ni une reformulation de l'exercice — c'est un vrai rappel \
de cours, comme une fiche de révision de 3 à 5 phrases.
2. ENSUITE seulement, 1 à 2 exercices diagnostiques à choix multiples pour vérifier que ce rappel est \
compris.

CONTRAINTES :
- Identifie 3 à 5 notions prérequises indispensables pour ce chapitre (reste concentré sur ce qui est \
vraiment nécessaire, pas un rappel exhaustif de toutes les années précédentes).
- Pour chaque notion, 1 exercice diagnostique — 2 exercices seulement pour une notion plus fondamentale \
ou plus fragile (voir consigne sur les questions récentes de l'élève ci-dessus). Au total, ne dépasse \
JAMAIS 7 exercices.
- Chaque exercice est COURT et ACCESSIBLE (application directe du rappel, sans piège ni astuce) : le but \
est de vérifier que la notion est acquise, pas de la retester en profondeur ni d'évaluer le chapitre à venir.
- Chaque exercice a EXACTEMENT 4 choix, une seule bonne réponse.
- Le champ "notion" reprend le nom court du PRÉREQUIS (2-5 mots, ex: "Conversion d'unités", "Loi d'Ohm", \
"Relation poids-masse") — jamais une notion du chapitre « {chapter} » lui-même.
- Pour chaque exercice, donne une "explication" courte confirmant la bonne réponse (1-2 phrases) — le \
rappel de cours a déjà enseigné la notion, cette explication ne fait que confirmer, pas réexpliquer en entier.
- Reste concis partout (rappel, exercice, explication) : pas de phrases superflues.
- Contexte réaliste et local burkinabè quand c'est pertinent.
- N'utilise AUCUN emoji.

FORMAT DE SORTIE — réponds UNIQUEMENT avec un objet JSON valide (aucun texte avant/après, pas de bloc de code) :
{{"notions": [{{"notion": "...", "rappel": "...", "exercices": [{{"question": "...", \
"choix": ["...", "...", "...", "..."], "reponse_correcte_index": 0, "explication": "..."}}, ...]}}, ...]}}
"""

        user_message = f"Prépare le diagnostic de prérequis avant le chapitre « {chapter} » pour un élève de {class_level}."

        response = self._call_claude(system_prompt, [{"role": "user", "content": user_message}],
                                      max_tokens=config.MAX_TOKENS_REMEDIATION)

        if response:
            questions = self._parse_prerequis_json(response)
            if questions:
                # Revérifie tous les exercices diagnostiques de toutes les notions en UN seul
                # appel (voir _verify_qcm_batch) plutôt qu'un par notion : on aplatit puis on
                # redistribue dans le même ordre.
                flat = [ex for notion in questions for ex in notion["exercices"]]
                verified = self._verify_qcm_batch(class_level, chapter, flat)
                i = 0
                for notion in questions:
                    n = len(notion["exercices"])
                    notion["exercices"] = verified[i:i + n]
                    i += n
                return questions

        print("[WARN] Claude indisponible ou reponse non structuree pour les prérequis, fallback local...")
        return self._local_prerequis(class_level, chapter)

    generate_remediation = generate_prerequis

    @staticmethod
    def _parse_prerequis_json(raw_text: str):
        """Extrait et valide les groupes {notion, rappel, exercices} du diagnostic de prérequis
        renvoyé par Claude (voir FORMAT DE SORTIE dans generate_prerequis)."""
        text = raw_text.strip()
        text = re.sub(r"^```(json)?", "", text.strip(), flags=re.IGNORECASE).strip()
        text = re.sub(r"```$", "", text.strip()).strip()

        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            return None

        candidate = text[start:end + 1]
        try:
            data = json.loads(candidate)
        except json.JSONDecodeError:
            try:
                data = json.loads(_repair_latex_json_escapes(candidate))
            except json.JSONDecodeError:
                return None

        raw_notions = data.get("notions")
        if not isinstance(raw_notions, list):
            return None

        notions = []
        for notion_item in raw_notions:
            if not isinstance(notion_item, dict):
                continue
            notion = str(notion_item.get("notion", "")).strip()
            rappel = str(notion_item.get("rappel", "")).strip()
            raw_exercices = notion_item.get("exercices")
            if not notion or not rappel or not isinstance(raw_exercices, list):
                continue

            exercices = []
            for item in raw_exercices:
                if not isinstance(item, dict):
                    continue
                question = str(item.get("question", "")).strip()
                choix = item.get("choix")
                correct_index = item.get("reponse_correcte_index")
                if not question or not isinstance(choix, list) or len(choix) != 4:
                    continue
                if not isinstance(correct_index, int) or not (0 <= correct_index < 4):
                    continue
                exercices.append({
                    "question": question,
                    "choix": [str(c) for c in choix],
                    "reponse_correcte_index": correct_index,
                    "explication": str(item.get("explication", "")).strip(),
                })

            if exercices:
                notions.append({"notion": notion, "rappel": rappel, "exercices": exercices})

        return notions or None

    _parse_remediation_json = _parse_prerequis_json

    def _local_prerequis(self, class_level: str, chapter: str) -> list:
        """Fallback local pour le diagnostic de prérequis (utilisé uniquement si Claude est indisponible)."""
        return [{
            "notion": chapter or "Notion générale",
            "rappel": f"Le service Claude est momentanément indisponible : reviens plus tard pour un vrai "
                      f"diagnostic de prérequis sur « {chapter} ».",
            "exercices": [{
                "question": "Ceci est une version de secours, pas un vrai diagnostic.",
                "choix": ["Réessayer plus tard", "-", "-", "-"],
                "reponse_correcte_index": 0,
                "explication": "",
            }],
        }]

    _local_remediation = _local_prerequis

    # ========================================================================
    # ACCUEIL PERSONNALISÉ (élève connecté avec de l'historique)
    # ========================================================================

    def generate_welcome_message(self, username: str, weak_notions: list, struggles: list, topics: list) -> str:
        """Message d'accueil personnalisé pour un élève connecté ayant déjà de l'historique :
        mentionne 1-2 lacunes concrètes (notions ratées en remédiation, notions simplifiées)
        et suggère une action précise pour la prochaine session."""

        weak_text = "\n".join(
            f"- « {n['notion']} » (chapitre {n['chapter']}, {n['class_level']}) ratée {n['wrong_count']} fois en remédiation"
            for n in weak_notions
        ) or "Aucune lacune identifiée en remédiation pour l'instant."

        struggles_text = "\n".join(
            f"- A demandé une explication simplifiée sur « {s['question']} » (chapitre {s['chapter']}, {s['class_level']})"
            for s in struggles
        ) or "Aucune demande de simplification récente."

        topics_text = "\n".join(
            f"- {t['chapter']} ({t['class_level']}), {t['visits']} session(s)"
            for t in topics
        ) or "Aucun chapitre travaillé pour l'instant."

        system_prompt = f"""Tu es « Prof Aïcha », professeure de physique au Burkina Faso. \
Un élève nommé {username} vient de se connecter à l'application. Tu as accès à son historique \
récent. Rédige un court message d'accueil personnalisé (DEUX PHRASES MAXIMUM, en Markdown léger) qui :
- Salue-le par son prénom/pseudo de façon chaleureuse et mentionne de façon concrète 1 lacune réelle \
tirée de son historique ci-dessous (pas de généralités).
- Termine par UNE suggestion précise et actionnable pour cette session (ex: reprendre tel chapitre, \
refaire un QCM de remédiation sur telle notion).
- Si l'historique ne montre AUCUNE lacune claire, félicite-le pour sa progression et propose \
d'avancer sur un nouveau chapitre plutôt que d'inventer un problème.

HISTORIQUE DE L'ÉLÈVE :
Notions ratées en remédiation :
{weak_text}

Notions ayant nécessité une simplification :
{struggles_text}

Chapitres travaillés récemment :
{topics_text}

{NO_EMOJI_INSTRUCTIONS}
Ne mets pas de titre Markdown (##), juste le message directement, comme si tu parlais à l'élève."""

        response = self._call_claude(system_prompt, [{"role": "user", "content": "Rédige le message d'accueil."}],
                                      max_tokens=500)
        if response:
            return response

        return self._local_welcome_message(username, weak_notions)

    @staticmethod
    def _local_welcome_message(username: str, weak_notions: list) -> str:
        """Fallback local pour l'accueil personnalisé (Claude indisponible)."""
        if weak_notions:
            notion = weak_notions[0]
            return (
                f"Content de te revoir, {username}. La dernière fois, « {notion['notion']} » "
                f"({notion['chapter']}) t'a donné du fil à retordre : ce serait une bonne idée d'y "
                f"revenir avant de continuer.\n\n"
                f"*(Le service Claude est momentanément indisponible, ceci est une version de secours.)*"
            )
        return (
            f"Content de te revoir, {username} ! Prêt à continuer là où tu t'es arrêté ?\n\n"
            f"*(Le service Claude est momentanément indisponible, ceci est une version de secours.)*"
        )

    # ========================================================================
    # GÉNÉRATION D'EXERCICES (structurés : énoncé / indices / solution)
    # ========================================================================

    @staticmethod
    def _recent_user_questions(history: list, limit: int = 4) -> list:
        """Dernières questions posées par l'élève dans la conversation (les plus utiles pour
        deviner un chapitre ou un niveau de difficulté implicites)."""
        if not history:
            return []
        return [t.get("content", "").strip() for t in history if t.get("role") == "user" and t.get("content")][-limit:]

    def _default_chapter(self, class_level: str) -> str:
        """Chapitre de repli quand aucun n'est précisé et que Claude n'en a pas proposé
        (ex: mode local sans API) : le premier chapitre du programme officiel de la classe."""
        chapters = CURRICULUM.get(class_level, {}).get("chapters", [])
        return chapters[0] if chapters else "Notions générales"

    @staticmethod
    def _infer_difficulty(history: list) -> int:
        """Estime un niveau de difficulté (1-4) quand l'élève n'a pas choisi lui-même, à partir
        de la sophistication de ses dernières questions. Défaut : 2 (application guidée)."""
        recent = RAGSystem._recent_user_questions(history)
        if not recent:
            return 2
        text = " ".join(recent).lower()
        advanced_markers = [
            "démontre", "démontrer", "justifie", "justifier", "établis", "établir l'expression",
            "équation horaire", "équations horaires", "équation différentielle", "théorème du centre d'inertie",
            "référentiel galiléen", "quantité de mouvement", "énergie cinétique", "énergie potentielle",
            "champ électrique", "champ magnétique", "champ de gravitation", "oscillation", "pulsation",
            "condensateur", "bobine", "inductance", "radioactivité", "demi-vie", "défaut de masse",
            "dérivée", "vecteur accélération", "base de frenet",
        ]
        basic_markers = [
            "c'est quoi", "qu'est-ce que", "comment on fait", "définition", "exemple simple",
            "je ne comprends pas", "je comprends pas", "explique-moi", "explique moi",
        ]
        if any(marker in text for marker in advanced_markers):
            return 3
        if any(marker in text for marker in basic_markers):
            return 1
        return 2

    def generate_exercise(self, class_level, chapter, difficulty: int = None, history: list = None):
        """Génère un exercice structuré via Claude. Niveau 1★ : série de mini-questions QCM
        d'application directe. Niveaux 2-4★ : exercice ouvert (énoncé/indice/solution), la
        difficulté croissant jusqu'à une situation d'intégration en 4★.

        Le chapitre et la difficulté sont tous deux facultatifs : si l'élève ne les précise pas,
        Claude choisit lui-même un chapitre pertinent (à partir des dernières questions posées, ou
        un chapitre de base du programme sinon) et la difficulté est déduite du niveau apparent des
        questions récentes (moyenne par défaut)."""

        difficulty = difficulty if difficulty in (1, 2, 3, 4, 5) else self._infer_difficulty(history)
        difficulty_label = STAR_DIFFICULTY_LABELS[difficulty]

        auto_chapter = not chapter
        chapter_txt = chapter if chapter else "à choisir toi-même (voir consigne ci-dessous)"

        # Ancrage dans les documents fournis : priorité absolue à la matière déposée par l'équipe
        # pédagogique. Quand le chapitre est connu, le filtre doit être EXACT (pas le repli
        # classe-seule de self.query(), pensé pour le chat) : sinon, dès qu'aucun document ne
        # correspond vraiment, on récupérerait quand même des extraits d'un AUTRE chapitre de la
        # même classe et on croirait à tort avoir une source — l'exercice partirait alors sur un
        # sujet hors-programme sans jamais activer le repli recherche internet/génération libre.
        # Niveau 5 (olympiades) : jamais ancré sur les documents de cours déposés — ce sont des
        # manuels de programme standard, aucun contenu de type concours/olympiades dedans
        # (vérifié) ; les y ancrer donnerait au mieux un exercice 4★ recyclé, pas un vrai défi.
        context_nodes = []
        if difficulty != 5:
            try:
                if chapter:
                    context_nodes = self._retrieve_with_filters(
                        chapter,
                        [self._exact_filter("class", class_level), self._exact_filter("chapter", chapter)],
                        top_k=4,
                    )
                else:
                    recent = self._recent_user_questions(history, limit=1)
                    if recent:
                        context_nodes = self.query(recent[0], class_level=class_level, top_k=4)
            except Exception as e:
                print(f"[WARN] Recherche de contexte pour l'exercice echouee: {e}")

        web_search_tools = None
        if context_nodes:
            document_excerpts = "\n---\n".join(n.get_content()[:800] for n in context_nodes)
            context_instructions = f"""
DOCUMENTS DE COURS FOURNIS — base l'exercice EN PRIORITÉ sur ces extraits (mêmes notions, mêmes \
notations, même niveau de raisonnement) ; adapte les valeurs numériques et la mise en situation \
pour que l'exercice reste ORIGINAL plutôt qu'un copier-coller :
{document_excerpts}
"""
        elif difficulty == 5:
            context_instructions = """
Ce niveau sort volontairement du programme direct de la classe (voir la consigne OLYMPIADES \
ci-dessous) : ne te limite pas aux documents de cours. Compose un problème ORIGINAL à partir de \
tes connaissances des grands classiques de concours de physique (olympiades de physique francophones, \
IJSO, IPhO, problèmes d'estimation de type Fermi...) plutôt que de chercher à en citer un exact — l'objectif est un exercice inédit et bien \
calibré pour la classe, pas une citation d'archive.
"""
            # Pas d'outil de recherche web ici : un aller-retour de recherche consomme une bonne
            # partie du budget de tokens avant même de generer l'exercice, ce qui faisait souvent
            # revenir une reponse vide (voir MAX_TOKENS_EXERCISE_OLYMPIAD) sur ce niveau
            # spécifiquement — et une recherche n'apporte de toute façon pas grand-chose ici : aucune
            # vraie banque d'annales n'est indexée de façon exploitable, mieux vaut miser sur la
            # composition originale.
        else:
            context_instructions = """
Aucun document de cours fourni ne correspond à ce chapitre. Un outil de recherche internet est à \
ta disposition : utilise-le si une source fiable et récente (programme burkinabè de préférence) \
améliorerait la pertinence de l'exercice, sinon génère-le à partir de tes connaissances générales.
"""
            web_search_tools = [{"type": "web_search_20250305", "name": "web_search", "max_uses": 2}]

        chapter_instructions = ""
        if auto_chapter:
            chapters_catalog = CURRICULUM.get(class_level, {}).get("chapters", [])
            catalog_txt = "\n".join(f"- {c}" for c in chapters_catalog) if chapters_catalog else "(programme non précisé)"
            recent_questions = self._recent_user_questions(history)
            history_txt = "\n".join(f"- {q}" for q in recent_questions) if recent_questions \
                else "(l'élève n'a pas encore posé de question)"
            chapter_instructions = f"""
L'ÉLÈVE N'A PAS CHOISI DE CHAPITRE — choisis-en un toi-même, en respectant cette règle :
- Si les dernières questions de l'élève ci-dessous pointent clairement vers un chapitre du programme, choisis-le.
- Sinon, choisis un chapitre de base adapté au niveau {class_level} (une notion fondamentale et incontournable).

Programme officiel de {class_level} :
{catalog_txt}

Dernières questions posées par l'élève :
{history_txt}

Indique EXACTEMENT l'intitulé retenu (repris tel quel dans la liste ci-dessus) dans le champ "chapitre" du JSON.
"""

        if difficulty == 1:
            system_prompt = f"""Tu es « Prof Aïcha », professeure de physique au Burkina Faso. \
Tu génères une série de mini-questions à choix multiples ORIGINALES pour un élève de {class_level} sur le \
chapitre « {chapter_txt} », en application DIRECTE du cours (restitution immédiate, pas de raisonnement à \
plusieurs étapes).
{chapter_instructions}
{context_instructions}
CONTRAINTES :
- Fournis entre 3 et 4 mini-questions QCM, chacune sur une notion de base différente du chapitre.
- Chaque question a EXACTEMENT 4 choix, une seule bonne réponse.
- Contexte réaliste et local burkinabè quand c'est pertinent (moto, panneau solaire, forage, cuisine, radio...).
- Une courte "explication" accompagne chaque question (pourquoi cette réponse est la bonne).
- Les choix numériques portent tous leur unité ; un distracteur peut être la bonne valeur avec une mauvaise unité \
ou une conversion oubliée (erreur typique d'élève).

{FORMULA_FORMAT_INSTRUCTIONS}

{NO_EMOJI_INSTRUCTIONS}

FORMAT DE SORTIE — réponds UNIQUEMENT avec un objet JSON valide (aucun texte avant/après, pas de bloc de code) :
{{"chapitre": "{chapter if chapter else '...'}", "enonce": "phrase d'introduction courte", "qcm": [{{"question": "...", \
"choix": ["...", "...", "...", "..."], "reponse_correcte_index": 0, "explication": "..."}}, ...]}}
"""
        else:
            olympiad_instructions = f"""
- CONSIGNE OLYMPIADES (niveau 5 uniquement) : ce n'est PAS un exercice de plus dans le programme de la classe — \
c'est un problème de concours de physique, nettement plus dur qu'une "situation d'intégration" (niveau 4). Choisis \
UNE idée physique non standard et construis le problème AUTOUR d'elle (ne te contente pas de la nommer) : \
analyse dimensionnelle pour trouver une loi, estimation d'ordre de grandeur (problème de Fermi), loi de \
conservation bien choisie (énergie, quantité de mouvement, charge), choix astucieux du système ou du référentiel, \
étude de cas limites, symétrie, modélisation d'une situation réelle à partir de quelques hypothèses, méthode \
graphique, ou expérience à concevoir avec du matériel simple. Les outils mathématiques restent ceux de la classe. \
INTERDIT : un exercice qui se résout en appliquant une formule du cours une ou deux fois, même avec des nombres \
compliqués — ce n'est qu'un niveau 4 déguisé, pas un niveau 5. Un élève sérieux de {class_level} doit pouvoir \
comprendre l'énoncé et les notions utilisées, mais PAS voir le chemin de résolution immédiatement : il doit \
chercher, essayer, se tromper avant de trouver l'angle d'attaque. L'indice unique pointe vers L'IDÉE CLÉ (quelle \
technique utiliser), jamais vers une étape de calcul. La solution doit expliquer POURQUOI cette idée fonctionne, \
pas seulement dérouler le calcul final.""" if difficulty == 5 else ""

            system_prompt = f"""Tu es « Prof Aïcha », professeure de physique au Burkina Faso. \
Tu génères un exercice d'entraînement ORIGINAL pour un élève de {class_level} sur le chapitre « {chapter_txt} ».
{chapter_instructions}
{context_instructions}
CONTRAINTES :
- Niveau de difficulté : {difficulty_label}{olympiad_instructions}
- Contexte réaliste et local burkinabè (moto et circulation, panneau solaire et batterie, forage et pompe, \
installation électrique d'une maison, cuisine, puits et poulie, radio et téléphone...)
- Données numériques réalistes (ordres de grandeur plausibles), chacune avec son unité ; précise dans l'énoncé \
les constantes nécessaires (ex : $g = 9{{,}}8\\,\\text{{N/kg}}$) et les approximations à faire (frottements négligés...).
- Fournis exactement 1 indice qui guide SANS donner le résultat.
- NE RÉDIGE PAS de solution ni de réponse finale ici — uniquement l'énoncé et l'indice (la correction est générée \
séparément, à la demande de l'élève, voir generate_exercise_solution). Formule quand même l'énoncé de façon \
suffisamment précise et autonome pour qu'une solution complète et non ambiguë puisse en être déduite plus tard.
{UNITS_INSTRUCTIONS}
- OBLIGATOIRE si l'énoncé s'appuie sur un schéma (circuit électrique, solide et ses forces, plan incliné, \
lentille et rayons, ombre, courbe ou tableau de mesures à tracer...) : remplis le champ "figure" avec le schéma \
correspondant (voir SCHÉMAS DE PHYSIQUE ci-dessous). Sinon mets "figure" à null. Le schéma de l'énoncé ne doit JAMAIS \
dévoiler la réponse (pas d'image déjà construite si l'élève doit la construire, pas de valeur cherchée dans un label). \
N'essaie JAMAIS de représenter un schéma avec des caractères ASCII (`|`, `/`, `\\`, `-`) dans "enonce" : uniquement \
le champ "figure" prévu à cet effet (ce champ est un mécanisme différent des blocs ```figure``` du chat : ici \
toujours un objet JSON dédié, jamais du texte).
{FORMULA_FORMAT_INSTRUCTIONS}

{NO_EMOJI_INSTRUCTIONS}

FORMAT DE SORTIE — réponds UNIQUEMENT avec un objet JSON valide (aucun texte avant/après, pas de bloc de code), \
exactement sous cette forme :
{{"chapitre": "{chapter if chapter else '...'}", "enonce": "...", "indices": ["..."], "figure": null}}

Si présente, la "figure" doit être un OBJET JSON (pas une chaîne de caractères échappée) suivant l'un des formats \
ci-dessous :
{FIGURE_SCHEMAS}
"""

        user_message = (
            f"Génère un exercice original et motivant sur « {chapter} » pour un élève de {class_level}."
            if chapter else
            f"Génère un exercice original et motivant pour un élève de {class_level} : choisis toi-même le "
            "chapitre le plus adapté, en suivant la consigne du système."
        )

        exercise_max_tokens = config.MAX_TOKENS_EXERCISE_OLYMPIAD if difficulty == 5 else config.MAX_TOKENS_EXERCISE
        response = self._call_claude(system_prompt, [{"role": "user", "content": user_message}],
                                      max_tokens=exercise_max_tokens, tools=web_search_tools)

        if response:
            parsed, claude_chapter = self._parse_exercise_json(response, difficulty)
            if parsed:
                resolved_chapter = chapter or claude_chapter or self._default_chapter(class_level)
                parsed["chapter"] = resolved_chapter
                parsed["class_level"] = class_level
                parsed["difficulty"] = difficulty
                if parsed["qcm"] is not None:
                    parsed["qcm"] = self._verify_qcm_batch(class_level, resolved_chapter, parsed["qcm"])
                return parsed
            print(f"[WARN] JSON exercice non parsable meme apres reparation ({len(response)} caracteres) : "
                  f"debut={response[:150]!r} fin={response[-150:]!r}")
        else:
            print("[WARN] _call_claude a renvoye une reponse vide pour l'exercice.")

        print("[WARN] Claude indisponible ou reponse non structuree pour l'exercice, fallback local...")
        return self._local_generate_exercise(class_level, chapter or self._default_chapter(class_level), difficulty)

    # Clés minimales qui rendent un schéma dessinable, par type (voir FIGURE_SCHEMAS et
    # frontend/src/lib/figureSpec.js) : un schéma sans aucun élément dessinable est ignoré plutôt
    # que servi vide. Sans "type", une figure avec des "points" est une figure géométrique.
    _FIGURE_REQUIRED_KEYS = {
        "circuit": ("composants",),
        "forces": ("solides", "forces"),
        "optique": ("elements", "rayons"),
        "graphique": ("series",),
        "geometrie": ("points",),
    }

    @staticmethod
    def _valid_figure(figure) -> Optional[dict]:
        """Le schéma tel quel s'il est exploitable (type connu et au moins une liste d'éléments
        dessinables non vide), sinon None."""
        if not isinstance(figure, dict):
            return None
        kind = str(figure.get("type") or "geometrie").strip().lower().replace("é", "e")
        required = RAGSystem._FIGURE_REQUIRED_KEYS.get(kind)
        if not required:
            return None
        if not any(isinstance(figure.get(k), list) and figure.get(k) for k in required):
            return None
        return figure

    @staticmethod
    def _figure_as_text(figure: Optional[dict]) -> str:
        """Résumé d'un schéma déjà généré (voir generate_exercise), pour que
        generate_exercise_solution puisse s'y référer sans avoir à le regénérer ni à le deviner :
        le JSON compact, lisible directement par le modèle quel que soit le type de schéma."""
        if not figure:
            return ""
        compact = json.dumps(figure, ensure_ascii=False, separators=(",", ":"))
        return f"Schéma de l'énoncé (JSON, pour information) : {compact[:2500]}"

    def generate_exercise_solution(self, class_level: str, chapter: str, difficulty: int,
                                    enonce: str, indices: Optional[list] = None,
                                    figure: Optional[dict] = None) -> dict:
        """Génère la correction (solution détaillée + réponse finale) d'un exercice DÉJÀ généré
        par generate_exercise, à la demande de l'élève (bouton "Voir la solution détaillée" côté
        frontend) — séparé de la génération de l'énoncé pour deux raisons : (1) la plupart des
        élèves qui génèrent un exercice ne demandent pas forcément la correction tout de suite,
        générer les deux d'un coup était donc souvent du travail perdu ; (2) réunir énoncé ET
        solution détaillée dans le même appel forçait à partager un seul budget de tokens entre
        les deux — sur un exercice de Terminale (raisonnement long, rédaction dense), la part
        "solution" pouvait à elle seule dépasser ce budget partagé, tronquant la réponse JSON et
        déclenchant un repli silencieux vers un exercice générique (symptôme observé : "l'exercice
        ne vient pas vraiment" en Terminale). Ici la solution a son propre budget dédié, donc plus
        de contention avec l'énoncé."""
        difficulty_label = STAR_DIFFICULTY_LABELS.get(difficulty, STAR_DIFFICULTY_LABELS[2])
        indice_txt = f"\nIndice déjà donné à l'élève : {indices[0]}" if indices else ""
        figure_txt = self._figure_as_text(figure)

        system_prompt = f"""Tu es « Prof Aïcha », professeure de physique au Burkina Faso. Un élève de \
{class_level} a déjà reçu l'énoncé suivant (chapitre « {chapter} », niveau {difficulty_label}) et souhaite \
maintenant en voir la correction détaillée.

ÉNONCÉ DÉJÀ DONNÉ À L'ÉLÈVE (ne le répète pas, résous-le directement) :
{enonce}
{indice_txt}
{f"{chr(10)}{figure_txt}" if figure_txt else ""}

CONTRAINTES :
- Rédige une solution détaillée, étape par étape, cohérente avec CET énoncé précis (pas un autre) : données \
converties en unités SI, expression littérale, application numérique, résultat avec unité et chiffres significatifs.
- Mets la réponse finale bien en évidence, séparément, TOUJOURS avec son unité.
- Si la correction demande de TRACER ou de COMPLÉTER un schéma (circuit, forces, construction optique, graphique), \
remplis le champ "figure" avec ce schéma (un objet JSON, formats ci-dessous) et réfère-toi à lui dans "solution" ; \
sinon mets "figure" à null. N'essaie JAMAIS de dessiner un schéma dans "solution" ou "reponse_finale" : ni caractères \
alignés, ni tableau LaTeX (`\\begin{{array}}`), ni suite de `\\text{{...}}` — uniquement le champ "figure".
{FORMULA_FORMAT_INSTRUCTIONS}

{UNITS_INSTRUCTIONS}

{NO_EMOJI_INSTRUCTIONS}

FORMAT DE SORTIE — réponds UNIQUEMENT avec un objet JSON valide (aucun texte avant/après, pas de bloc de code) :
{{"solution": "...", "reponse_finale": "...", "figure": null}}

Formats possibles pour "figure" :
{FIGURE_SCHEMAS}
"""
        user_message = "Rédige la correction détaillée de cet exercice."

        max_tokens = config.MAX_TOKENS_EXERCISE_OLYMPIAD if difficulty == 5 else config.MAX_TOKENS_EXERCISE
        response = self._call_claude(system_prompt, [{"role": "user", "content": user_message}], max_tokens=max_tokens)

        if response:
            parsed = self._parse_exercise_solution_json(response)
            if parsed:
                return parsed
            print(f"[WARN] JSON de correction non parsable ({len(response)} caracteres) : "
                  f"debut={response[:150]!r} fin={response[-150:]!r}")
        else:
            print("[WARN] _call_claude a renvoye une reponse vide pour la correction.")

        return {
            "solution": "Le service est momentanément indisponible : reviens plus tard pour voir la correction.",
            "reponse_finale": "",
            "figure": None,
        }

    @staticmethod
    def _parse_exercise_solution_json(raw_text: str) -> Optional[dict]:
        text = raw_text.strip()
        text = re.sub(r"^```(json)?", "", text.strip(), flags=re.IGNORECASE).strip()
        text = re.sub(r"```$", "", text.strip()).strip()

        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            return None

        candidate = text[start:end + 1]
        try:
            data = json.loads(candidate)
        except json.JSONDecodeError:
            try:
                data = json.loads(_repair_latex_json_escapes(candidate))
            except json.JSONDecodeError:
                return None

        solution = str(data.get("solution", "")).strip()
        if not solution:
            return None
        return {
            "solution": solution,
            "reponse_finale": str(data.get("reponse_finale", "")).strip(),
            "figure": RAGSystem._valid_figure(data.get("figure")),
        }

    @staticmethod
    def _parse_exercise_json(raw_text: str, difficulty: int = 2):
        """Extrait et valide le JSON d'exercice renvoyé par Claude : forme QCM (liste `qcm`) en 1★,
        forme ouverte (`solution`/`indices`) en 2-4★. Tolère les fences markdown.
        Retourne un tuple (exercice, chapitre_choisi_par_claude) — le second élément n'est utile
        que lorsque l'élève n'avait pas précisé de chapitre lui-même."""
        text = raw_text.strip()
        text = re.sub(r"^```(json)?", "", text.strip(), flags=re.IGNORECASE).strip()
        text = re.sub(r"```$", "", text.strip()).strip()

        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            return None, None

        candidate = text[start:end + 1]
        try:
            data = json.loads(candidate)
        except json.JSONDecodeError:
            # Échappement LaTeX cassé : ça arrive surtout dans le morceau "continué" d'une réponse
            # tronquée (voir _call_claude) — le modèle recommence alors à écrire \vec, \frac...
            # en JSON à échappement unique au lieu du double backslash JSON attendu (\\vec).
            # On tente une réparation ciblée avant d'abandonner.
            try:
                data = json.loads(_repair_latex_json_escapes(candidate))
            except json.JSONDecodeError:
                return None, None

        enonce = str(data.get("enonce", "")).strip()
        if not enonce:
            return None, None

        claude_chapter = str(data.get("chapitre", "")).strip()

        if difficulty == 1:
            raw_qcm = data.get("qcm")
            if not isinstance(raw_qcm, list):
                return None, None
            qcm = []
            for item in raw_qcm:
                if not isinstance(item, dict):
                    continue
                question = str(item.get("question", "")).strip()
                choix = item.get("choix")
                correct_index = item.get("reponse_correcte_index")
                if not question or not isinstance(choix, list) or len(choix) != 4:
                    continue
                if not isinstance(correct_index, int) or not (0 <= correct_index < 4):
                    continue
                qcm.append({
                    "question": question,
                    "choix": [str(c) for c in choix],
                    "reponse_correcte_index": correct_index,
                    "explication": str(item.get("explication", "")).strip(),
                })
            if not qcm:
                return None, None
            return {"enonce": enonce, "indices": [], "solution": "", "reponse_finale": "", "figure": None,
                    "qcm": qcm}, claude_chapter

        indices = data.get("indices", [])
        if not isinstance(indices, list):
            indices = [str(indices)]

        figure = RAGSystem._valid_figure(data.get("figure"))

        # La solution est désormais générée séparément, à la demande (voir
        # generate_exercise_solution) : on ne l'exige plus ici (c'était la cause du bug
        # Terminale, la réponse combinée dépassant parfois le budget de tokens et laissant
        # "solution" vide, ce qui faisait rejeter tout l'exercice). On la récupère quand même
        # si le modèle en a fourni une, pour rester tolérant aux anciennes réponses.
        return {
            "enonce": enonce,
            "indices": [str(i) for i in indices][:1],
            "solution": str(data.get("solution", "")).strip(),
            "reponse_finale": str(data.get("reponse_finale", "")).strip(),
            "figure": figure,
            "qcm": None
        }, claude_chapter

    # ========================================================================
    # FALLBACKS LOCAUX (quand Claude est indisponible)
    # ========================================================================

    def _generate_local_response(self, question, class_level, chapter, context):
        """Fallback local pour les réponses (utilisé uniquement si Claude est indisponible)."""
        chapter_lower = chapter.lower()
        question_lower = question.lower()

        knowledge = self._get_knowledge(chapter_lower, question_lower, question, class_level, chapter)

        if knowledge:
            if context and context != "Aucun document spécifique disponible pour ce chapitre.":
                knowledge += f"\n\n**Extrait des documents :**\n{context[:500]}"
            return knowledge

        if context and context != "Aucun document spécifique disponible pour ce chapitre.":
            return f"""
**Question :** {question}

Voici les informations disponibles sur le chapitre "{chapter}" de {class_level}.

**Documents :**
{context[:800]}

*Conseil : Pour approfondir, consulte ton manuel ou demande à ton professeur.*
"""
        intro = (
            f'Le chapitre "{chapter}" fait partie du programme de {class_level} au Burkina Faso.'
            if class_level or chapter else
            "Voici ce que je peux te dire pour l'instant."
        )
        return f"""
**Question :** {question}

{intro}

**Pour t'aider :**
1. Relis les définitions dans ton cours
2. Fais des exercices d'application simples
3. Augmente progressivement la difficulté

*Je peux te donner des explications plus précises si tu reformules ta question, ou réessaie dans un instant \
(le service Claude est momentanément indisponible).*
"""

    def _get_knowledge(self, chapter_lower, question_lower, question, class_level, chapter):
        """Retourne le contenu de connaissance si le thème est détecté (secours hors-ligne uniquement)."""
        knowledge_base = {
            "ohm": f"""
**Question :** {question}

La **loi d'Ohm** relie la tension aux bornes d'un conducteur ohmique et l'intensité du courant qui le traverse.

**Énoncé :** $U = R \\times I$
- $U$ : tension aux bornes du conducteur, en volts ($\\text{{V}}$)
- $R$ : résistance du conducteur, en ohms ($\\Omega$)
- $I$ : intensité du courant, en ampères ($\\text{{A}}$)

**Exemple :** $R = 100\\,\\Omega$ et $I = 120\\,\\text{{mA}} = 0{{,}}120\\,\\text{{A}}$, donc \
$U = 100 \\times 0{{,}}120 = 12\\,\\text{{V}}$.

**Attention :** convertis toujours les milliampères en ampères avant de calculer.
""",
            "poids": f"""
**Question :** {question}

Le **poids** d'un corps est la force d'attraction que la Terre exerce sur lui ; sa **masse** est la quantité de \
matière qu'il contient. Ce sont deux grandeurs différentes.

**Relation :** $P = m \\times g$
- $P$ : poids, en newtons ($\\text{{N}}$)
- $m$ : masse, en kilogrammes ($\\text{{kg}}$)
- $g$ : intensité de la pesanteur, en newtons par kilogramme ($g \\approx 9{{,}}8\\,\\text{{N/kg}}$ au Burkina Faso)

**Exemple :** un sac de riz de $m = 50\\,\\text{{kg}}$ a un poids $P = 50 \\times 9{{,}}8 = 490\\,\\text{{N}}$.
""",
            "masse volumique": f"""
**Question :** {question}

La **masse volumique** d'une substance est la masse d'une unité de volume de cette substance.

**Relation :** $\\rho = \\dfrac{{m}}{{V}}$
- $m$ en $\\text{{kg}}$, $V$ en $\\text{{m}}^3$, donc $\\rho$ en $\\text{{kg/m}}^3$
- Unité pratique : $\\text{{g/cm}}^3$, avec $1\\,\\text{{g/cm}}^3 = 1\\,000\\,\\text{{kg/m}}^3$

**Exemple :** $1{{,}}5\\,\\text{{L}}$ d'huile de masse $1{{,}}38\\,\\text{{kg}}$ : \
$\\rho = \\dfrac{{1{{,}}38\\,\\text{{kg}}}}{{1{{,}}5 \\times 10^{{-3}}\\,\\text{{m}}^3}} = 920\\,\\text{{kg/m}}^3$.
""",
            "vitesse": f"""
**Question :** {question}

La **vitesse moyenne** est la distance parcourue divisée par la durée du parcours.

**Relation :** $v = \\dfrac{{d}}{{t}}$ avec $d$ en mètres ($\\text{{m}}$), $t$ en secondes ($\\text{{s}}$) et $v$ en \
mètres par seconde ($\\text{{m/s}}$).

**Conversion utile :** $1\\,\\text{{m/s}} = 3{{,}}6\\,\\text{{km/h}}$, donc pour passer de $\\text{{km/h}}$ à \
$\\text{{m/s}}$ on divise par $3{{,}}6$.

**Exemple :** une moto roule à $54\\,\\text{{km/h}}$, soit $\\dfrac{{54}}{{3{{,}}6}} = 15\\,\\text{{m/s}}$.
""",
            "puissance électrique": f"""
**Question :** {question}

La **puissance électrique** reçue par un appareil est le produit de la tension à ses bornes par l'intensité du \
courant qui le traverse.

**Relations :** $P = U \\times I$ et $E = P \\times t$
- $P$ en watts ($\\text{{W}}$), $U$ en volts ($\\text{{V}}$), $I$ en ampères ($\\text{{A}}$)
- $E$ en joules ($\\text{{J}}$) si $t$ est en secondes, ou en kilowattheures ($\\text{{kWh}}$) si $P$ est en \
kilowatts et $t$ en heures

**Exemple :** un ventilateur sous $220\\,\\text{{V}}$ traversé par $0{{,}}25\\,\\text{{A}}$ reçoit \
$P = 220 \\times 0{{,}}25 = 55\\,\\text{{W}}$.
""",
        }

        for key, value in knowledge_base.items():
            if key in chapter_lower or key in question_lower:
                return value
        return None

    def _local_simplify(self, question: str, original_answer: str, class_level: str) -> str:
        """Fallback simplification locale (utilisé uniquement si Claude est indisponible)."""
        key_points = []
        for line in original_answer.split('\n'):
            line = line.strip()
            if line and len(line) > 20 and not line.startswith('**') and not line.startswith('#'):
                line = line.replace('**', '').replace('*', '')
                key_points.append(line)

        text = '\n'.join(key_points[:4]) if key_points else original_answer[:300]
        return f"""
**Pas de panique, voici en plus simple :**

{text}

**Conseil :** En {class_level}, apprends bien la formule et fais plusieurs petits exercices d'application.

*(Le service Claude est momentanément indisponible, ceci est une version de secours.)*
"""

    def _local_generate_exercise(self, class_level, chapter, difficulty: int = 2):
        """Fallback exercice local structuré (utilisé uniquement si Claude est indisponible)."""
        if difficulty == 1:
            return {
                "enonce": f"Petit test de connaissances sur « {chapter} ».",
                "indices": [],
                "solution": "",
                "reponse_finale": "",
                "figure": None,
                "qcm": [{
                    "question": f"Quelle affirmation correspond à une notion du chapitre « {chapter} » ?",
                    "choix": [
                        "Une notion vue en cours sur ce chapitre",
                        "Une notion d'un autre chapitre",
                        "Une affirmation fausse",
                        "Une affirmation hors-programme",
                    ],
                    "reponse_correcte_index": 0,
                    "explication": "Le service Claude est momentanément indisponible : reviens plus tard "
                                   "pour un vrai QCM généré sur ce chapitre.",
                }],
                "chapter": chapter,
                "class_level": class_level,
                "difficulty": difficulty,
            }

        chapter_lower = chapter.lower()

        exercises = {
            "ohm": {
                "enonce": "Pour l'éclairage de sa boutique à Bobo-Dioulasso, Salif utilise une batterie solaire de "
                           "$12\\,\\text{V}$. Il branche à ses bornes un conducteur ohmique de résistance "
                           "$R = 48\\,\\Omega$. Quelle est l'intensité du courant qui le traverse ?",
                "indices": [
                    "Écris la loi d'Ohm, puis isole l'intensité $I$.",
                    "Vérifie que la tension est en volts et la résistance en ohms avant de calculer."
                ],
                "solution": "1) Loi d'Ohm : $U = R \\times I$, donc $I = \\dfrac{U}{R}$.\n"
                            "2) Application numérique : $I = \\dfrac{12\\,\\text{V}}{48\\,\\Omega} = 0{,}25\\,\\text{A}$.",
                "reponse_finale": "$I = 0{,}25\\,\\text{A}$, soit $250\\,\\text{mA}$."
            },
            "poids": {
                "enonce": "Au marché de Ouagadougou, Awa achète un sac d'arachides de masse $25\\,\\text{kg}$. "
                           "Calcule le poids de ce sac (on prendra $g = 9{,}8\\,\\text{N/kg}$).",
                "indices": [
                    "Le poids et la masse sont liés par l'intensité de la pesanteur.",
                    "Vérifie que la masse est bien exprimée en kilogrammes."
                ],
                "solution": "1) Relation : $P = m \\times g$.\n"
                            "2) Application numérique : $P = 25\\,\\text{kg} \\times 9{,}8\\,\\text{N/kg} = 245\\,\\text{N}$.",
                "reponse_finale": "$P = 2{,}5 \\times 10^{2}\\,\\text{N}$ (soit $245\\,\\text{N}$)."
            },
            "masse volumique": {
                "enonce": "Un bidon contient $2{,}0\\,\\text{L}$ d'huile d'arachide de masse $1{,}84\\,\\text{kg}$. "
                           "Calcule la masse volumique de cette huile en $\\text{kg/m}^3$.",
                "indices": [
                    "Convertis d'abord le volume en mètres cubes : $1\\,\\text{L} = 10^{-3}\\,\\text{m}^3$.",
                    "Applique ensuite la définition de la masse volumique."
                ],
                "solution": "1) Conversion : $V = 2{,}0\\,\\text{L} = 2{,}0 \\times 10^{-3}\\,\\text{m}^3$.\n"
                            "2) Relation : $\\rho = \\dfrac{m}{V} = \\dfrac{1{,}84\\,\\text{kg}}{2{,}0 \\times 10^{-3}\\,"
                            "\\text{m}^3} = 920\\,\\text{kg/m}^3$.",
                "reponse_finale": "$\\rho = 9{,}2 \\times 10^{2}\\,\\text{kg/m}^3$."
            },
            "vitesse": {
                "enonce": "Un car relie Ouagadougou à Koudougou, distantes de $99\\,\\text{km}$, en "
                           "$1\\,\\text{h}\\,30\\,\\text{min}$. Calcule sa vitesse moyenne en $\\text{km/h}$ puis en "
                           "$\\text{m/s}$.",
                "indices": [
                    "Exprime d'abord la durée en heures : $30\\,\\text{min} = 0{,}5\\,\\text{h}$.",
                    "Pour passer des km/h aux m/s, divise par $3{,}6$."
                ],
                "solution": "1) Durée : $t = 1{,}5\\,\\text{h}$.\n"
                            "2) $v = \\dfrac{d}{t} = \\dfrac{99\\,\\text{km}}{1{,}5\\,\\text{h}} = 66\\,\\text{km/h}$.\n"
                            "3) Conversion : $v = \\dfrac{66}{3{,}6} \\approx 18\\,\\text{m/s}$.",
                "reponse_finale": "$v = 66\\,\\text{km/h} \\approx 18\\,\\text{m/s}$."
            },
        }

        for key, value in exercises.items():
            if key in chapter_lower:
                return {
                    "enonce": value["enonce"],
                    "indices": value["indices"][:1],
                    "solution": value["solution"],
                    "reponse_finale": value["reponse_finale"],
                    "figure": value.get("figure"),
                    "qcm": None,
                    "chapter": chapter,
                    "class_level": class_level,
                    "difficulty": difficulty,
                }

        default_solution = ("Applique la méthode vue en cours, étape par étape : convertis les données en unités SI, "
                            "écris l'expression littérale, puis fais l'application numérique avec les unités.")
        default_indices = ["Relis la loi principale du chapitre, repère la relation à appliquer et l'unité de chaque grandeur."]
        return {
            "enonce": f"Entraîne-toi sur le chapitre « {chapter} » : reprends un exercice vu en cours avec tes "
                      f"propres valeurs (sans oublier les unités), puis résous-le étape par étape.",
            "indices": default_indices,
            "solution": default_solution,
            "reponse_finale": "",
            "figure": None,
            "qcm": None,
            "chapter": chapter,
            "class_level": class_level,
            "difficulty": difficulty,
        }

