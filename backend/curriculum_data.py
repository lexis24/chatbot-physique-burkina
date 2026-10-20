# Curriculum data for Burkina Faso - Mathematics
# Source: sommaire officiel de la Collection Hakili Lab (Édition 2026), fourni par l'équipe
# pédagogique (fichier "structure_manuels (3).xlsx"). Les intitulés reprennent exactement ceux
# des manuels réellement déposés dans data/documents/ (ex: "Chapitre_6_Pythagore.pdf" <->
# "Théorème de Pythagore et sa réciproque"), pour que la recherche de cours et le classement
# automatique des documents (voir document_processor.py, ingest_documents.py) fonctionnent.

CURRICULUM = {
    "6ème": {
        "name": "Sixième",
        "chapters": [
            "Bien démarrer en 6ème",
            "Éléments de géométrie et vocabulaire ensembliste",
            "La numération décimale",
            "Les angles",
            "Sens et techniques d'exécution des opérations",
            "Le parallélogramme",
            "Parallélogrammes particuliers et trapèze",
            "Comparaison et rangement de nombres",
            "Le triangle",
            "Cercle et disque",
            "Médiatrice d'un segment",
            "Symétrie orthogonale",
            "Les fractions",
            "Égalités à « trous »",
            "Nombres relatifs",
            "Relations et fonctions",
            "Proportionnalité",
            "Repérage",
            "Parallélépipède rectangle et cube"
        ]
    },
    "5ème": {
        "name": "Cinquième",
        "chapters": [
            "Bien continuer en 5ème",
            "La symétrie centrale (1) : construction",
            "Multiples et diviseurs d'un entier naturel · Nombres premiers",
            "La symétrie centrale (2) : propriétés, centre de symétrie, repérage",
            "PGCD et PPCM",
            "Opérations sur les fractions",
            "Les angles : opposés par le sommet, alternes-internes, correspondants · Les triangles",
            "Addition et soustraction dans 𝔻",
            "Valeur absolue et comparaison de nombres relatifs",
            "Cylindre de révolution et prisme droit",
            "Multiplication dans 𝔻 · Développement et factorisation",
            "Puissances entières d'un nombre",
            "Cône de révolution et pyramide",
            "Égalités et opérations",
            "Équations dans 𝔻",
            "Sphère et boule",
            "Masse volumique, vitesse et débit",
            "Échelle : agrandissement et réduction"
        ]
    },
    "4ème": {
        "name": "Quatrième",
        "chapters": [
            "Bien continuer en 4ème",
            "Droites du plan : parallélisme et perpendicularité",
            "Nombres décimaux et puissances de dix : l'écriture scientifique",
            "Repérage sur une droite",
            "Repérage dans le plan",
            "Calculs sur les quotients d'entiers relatifs",
            "Projection et théorème des milieux",
            "Les polygones",
            "Les nombres rationnels",
            "Les vecteurs (1) : bipoints, vecteur, égalité, somme",
            "Les nombres réels",
            "Les vecteurs (2) : propriétés de l'addition et caractérisations",
            "La statistique",
            "Les applications",
            "Les translations",
            "Développement, factorisation et identités remarquables",
            "Équations et inéquations du premier degré dans ℝ",
            "Compositions d'applications du plan",
            "Sections de solides par un plan"
        ]
    },
    "3ème": {
        "name": "Troisième",
        "chapters": [
            "Bien réussir sa 3ème",
            "Les nombres réels : intervalles, encadrement, valeur absolue",
            "Les vecteurs du plan : multiplication par un réel et colinéarité",
            "Le repère cartésien : coordonnées d'un vecteur",
            "Racine carrée d'un nombre réel positif",
            "Le rapport de projection",
            "Théorème de Pythagore et sa réciproque",
            "Équations et inéquations du premier degré dans ℝ",
            "Théorème de Thalès et sa réciproque",
            "Monômes et polynômes",
            "Repère orthonormal : distance et orthogonalité",
            "Fonctions rationnelles",
            "Angles inscrits",
            "Équations de droites",
            "Trigonométrie dans le triangle rectangle",
            "Équations et systèmes du premier degré dans ℝ×ℝ",
            "Positions relatives d'une droite et d'un cercle",
            "Applications linéaires et applications affines",
            "Les isométries du plan",
            "Statistiques",
            "Sections de solides",
            "Remédiation Hakili Lab (bases à revoir avant la 3ème)"
        ]
    },
    "2nde": {
        "name": "Seconde C",
        "chapters": [
            "Bien commencer la 2nde C",
            "Calculs dans ℝ",
            "Équations et inéquations dans ℝ",
            "Vecteurs du plan",
            "Systèmes d'équations et d'inéquations linéaires",
            "Généralités sur les fonctions",
            "Fonctions de référence",
            "Fonctions circulaires",
            "Produit scalaire dans le plan",
            "Géométrie plane",
            "Les transformations géométriques",
            "La géométrie dans l'espace",
            "Les statistiques"
        ]
    },
    "1ère": {
        "name": "Première D",
        "chapters": [
            "Bien commencer la 1ère D",
            "Les applications : injection, surjection, bijection",
            "Polynômes et fonctions rationnelles",
            "Problèmes algébriques et numériques",
            "Suites numériques",
            "Trigonométrie",
            "Les fonctions numériques (généralités)",
            "Les limites",
            "Dérivation et étude de fonction",
            "Transformations du plan",
            "Dénombrement",
            "Géométrie dans l'espace",
            "Les statistiques",
            "Remédiation Hakili Lab (bases à revoir avant la 1ère-Tle)"
        ]
    },
    "Tle": {
        "name": "Terminale D",
        "chapters": [
            "Bien réussir sa Terminale D",
            "Nombres complexes",
            "Limites et continuité",
            "Calcul différentiel, primitives et étude de fonctions",
            "Fonction logarithme népérien",
            "Fonction exponentielle et fonctions puissances",
            "Suites numériques",
            "Calcul intégral et équations différentielles",
            "Probabilités",
            "Courbes paramétrées du plan",
            "Géométrie dans l'espace",
            "Statistiques à deux variables",
            "Remédiation Hakili Lab (bases à revoir avant la 1ère-Tle)"
        ]
    }
}

def get_classes():
    """Return list of all classes"""
    return list(CURRICULUM.keys())

def get_class_name(class_code):
    """Return full name of a class"""
    return CURRICULUM.get(class_code, {}).get("name", class_code)

def get_chapters(class_code):
    """Return list of chapters for a given class"""
    return CURRICULUM.get(class_code, {}).get("chapters", [])
