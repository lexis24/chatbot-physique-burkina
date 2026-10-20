"""Garde-fous sur curriculum_data.py : ce fichier a été entièrement réécrit à partir du sommaire
officiel de la Collection Hakili Lab (remplaçant une liste de chapitres génériques qui ne
correspondait pas aux vrais fichiers de cours déposés). Ces tests protègent contre une régression
silencieuse (classe oubliée, liste vidée par erreur, chapitre de remédiation supprimé)."""
from curriculum_data import CURRICULUM, get_chapters, get_classes

EXPECTED_CLASSES = {"6ème", "5ème", "4ème", "3ème", "2nde", "1ère", "Tle"}
REMEDIATION_CHAPTER_SUBSTRING = "Remédiation Hakili Lab"


def test_all_expected_classes_present():
    assert set(get_classes()) == EXPECTED_CLASSES


def test_every_class_has_a_real_chapter_list():
    for class_code in get_classes():
        chapters = get_chapters(class_code)
        assert len(chapters) >= 10, f"{class_code} n'a que {len(chapters)} chapitre(s)"
        assert len(chapters) == len(set(chapters)), f"{class_code} a des doublons de chapitre"


def test_every_class_has_a_display_name():
    for class_code in get_classes():
        assert CURRICULUM[class_code]["name"].strip()


def test_remediation_chapter_present_for_3eme_1ere_tle():
    for class_code in ("3ème", "1ère", "Tle"):
        chapters = get_chapters(class_code)
        assert any(REMEDIATION_CHAPTER_SUBSTRING in c for c in chapters), (
            f"Chapitre de remédiation manquant pour {class_code}"
        )


def test_remediation_chapter_absent_outside_target_classes():
    """Les livrets de remédiation ne couvrent que 3ème (rattrapage 6e/5e/4e) et 1ère/Tle
    (rattrapage 2nde/1ère) : pas de chapitre "Remédiation" ailleurs."""
    for class_code in ("6ème", "5ème", "4ème", "2nde"):
        chapters = get_chapters(class_code)
        assert not any(REMEDIATION_CHAPTER_SUBSTRING in c for c in chapters)
