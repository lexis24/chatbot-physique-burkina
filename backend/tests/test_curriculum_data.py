"""Garde-fous sur curriculum_data.py : le programme de physique reprend exactement les classes
et les intitulés de chapitres des manuels Hakili Lab, dans leur ordre. Ces tests protègent contre
une régression silencieuse (classe oubliée, liste vidée par erreur, chapitre renommé ou déplacé)
— l'ordre compte : le chapitre N d'un manuel est retrouvé à l'index N-1 (voir
document_processor.curriculum_chapter_from_number)."""
import re
from pathlib import Path

from curriculum_data import CURRICULUM, get_chapters, get_classes

EXPECTED_CLASSES = ["4ème", "3ème", "2nde", "1ère", "Tle"]
EXPECTED_CHAPTER_COUNTS = {"4ème": 18, "3ème": 19, "2nde": 11, "1ère": 8, "Tle": 16}
DOCUMENTS_DIR = Path(__file__).resolve().parent.parent / "data" / "documents"
CLASS_FOLDERS = {"4ème": "4eme", "3ème": "3eme", "2nde": "2ndeC", "1ère": "1ereD", "Tle": "TleD"}


def test_expected_classes_in_school_order():
    assert get_classes() == EXPECTED_CLASSES


def test_every_class_has_its_full_chapter_list():
    for class_code in get_classes():
        chapters = get_chapters(class_code)
        assert len(chapters) == EXPECTED_CHAPTER_COUNTS[class_code], class_code
        assert len(chapters) == len(set(chapters)), f"{class_code} a des doublons de chapitre"


def test_every_class_has_a_display_name():
    for class_code in get_classes():
        assert CURRICULUM[class_code]["name"].strip()


def test_chapter_titles_follow_the_manuals():
    assert get_chapters("4ème")[0] == "Les états solide, liquide et gazeux"
    assert get_chapters("4ème")[3] == "La masse volumique et la densité d'un corps"
    assert get_chapters("3ème")[11] == "L'énergie mécanique : transfert et rendement"
    assert get_chapters("Tle")[-1] == "Les réactions nucléaires provoquées"


def test_no_chemistry_chapter():
    """La chimie a sa propre application : aucun de ses chapitres ne doit apparaître ici."""
    chemistry_words = ("combustion", "alcane", "acide", "oxydoréduction", "ester", "mole")
    for class_code in get_classes():
        for chapter in get_chapters(class_code):
            assert not any(w in chapter.lower() for w in chemistry_words), (class_code, chapter)


def test_each_chapter_has_its_course_pdf_with_matching_number():
    """Chaque chapitre a son PDF de cours dans data/documents/<classe>/, numéroté comme dans le
    programme : c'est ce qui garantit « Voir le cours » et le classement à l'ingestion."""
    for class_code, folder in CLASS_FOLDERS.items():
        numbers = sorted(
            int(re.match(r"Chapitre_(\d+)_", p.name).group(1))
            for p in (DOCUMENTS_DIR / folder).glob("Chapitre_*.pdf")
        )
        assert numbers == list(range(1, len(get_chapters(class_code)) + 1)), class_code
