# Curriculum data for Burkina Faso - Physique
# Source : manuels de Physique-Chimie de la Collection Hakili Lab (Édition 2026), de la 4ème à la
# Terminale D — partie physique uniquement (la chimie a sa propre application). Les intitulés
# reprennent EXACTEMENT ceux de la première page de chaque chapitre des manuels (vérifiés un par
# un contre les PDF de data/documents/, ex: "Chapitre_4_La_masse_volumique_et_la_densite.pdf" <->
# "La masse volumique et la densité d'un corps"), dans l'ordre des manuels : c'est ce qui permet à
# la recherche de cours et au classement automatique des documents (voir document_processor.py,
# ingest_documents.py) de fonctionner. La physique n'est pas enseignée en 6ème/5ème.

CURRICULUM = {
    "4ème": {
        "name": "Quatrième",
        "chapters": [
            "Les états solide, liquide et gazeux",
            "La masse d'un corps",
            "Le volume d'un corps",
            "La masse volumique et la densité d'un corps",
            "Le thermomètre",
            "La propagation de la chaleur",
            "Les changements d'état physique",
            "Les mélanges avec l'eau",
            "Les sources et les récepteurs de lumière",
            "La propagation rectiligne et la vitesse de la lumière",
            "Les ombres",
            "Le circuit électrique",
            "La tension électrique",
            "Les associations de générateurs et de récepteurs",
            "Le courant électrique et ses dangers",
            "La notion de force",
            "Le poids d'un corps",
            "La poussée d'Archimède"
        ]
    },
    "3ème": {
        "name": "Troisième",
        "chapters": [
            "L'intensité d'un courant électrique",
            "La tension électrique",
            "Les mesures sur des circuits électriques",
            "La puissance électrique",
            "L'énergie électrique",
            "Les applications, la production et la distribution de l'énergie électrique",
            "La résistance d'un conducteur ohmique",
            "Les mesures de résistances",
            "Les associations de conducteurs ohmiques",
            "Les poulies et le treuil",
            "Le travail et la puissance mécaniques",
            "L'énergie mécanique : transfert et rendement",
            "Les moteurs à piston",
            "L'analyse et la synthèse de la lumière",
            "Les lentilles convergentes",
            "La formation des images",
            "La construction géométrique des images",
            "La loupe",
            "Le miroir plan"
        ]
    },
    "2nde": {
        "name": "Seconde C",
        "chapters": [
            "La notion de mouvement",
            "Les forces",
            "L'équilibre d'un solide soumis à un ensemble de forces",
            "L'équilibre d'un solide mobile autour d'un axe fixe",
            "Le courant électrique et son intensité",
            "La tension électrique",
            "Les tensions variables",
            "Les dipôles passifs",
            "Le conducteur ohmique",
            "Le générateur et le point de fonctionnement d'un circuit",
            "Les montages électroniques"
        ]
    },
    "1ère": {
        "name": "Première D",
        "chapters": [
            "Le mouvement du centre d'inertie",
            "L'énergie calorifique",
            "L'énergie mécanique",
            "Les transferts d'énergie dans les récepteurs, les générateurs et les circuits électriques en courant continu",
            "La propagation d'un signal",
            "Les ondes progressives",
            "Les principes généraux de l'optique géométrique",
            "Les lentilles minces"
        ]
    },
    "Tle": {
        "name": "Terminale D",
        "chapters": [
            "Les éléments de cinématique",
            "Les lois du mouvement de Newton",
            "Le travail et l'énergie cinétique",
            "Le champ de gravitation et les interactions gravitationnelles",
            "Le champ et les interactions électriques",
            "Le champ et les interactions magnétiques",
            "Le mouvement dans un champ de gravitation",
            "Le mouvement d'une particule chargée dans un champ électrique uniforme",
            "Le mouvement d'une particule chargée dans un champ magnétique uniforme",
            "Le pendule élastique",
            "Le condensateur",
            "La bobine inductive",
            "Les oscillations électriques forcées",
            "Le noyau atomique",
            "Les réactions nucléaires spontanées",
            "Les réactions nucléaires provoquées"
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
