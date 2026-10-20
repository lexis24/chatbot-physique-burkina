"""Tests de document_processor.py : correspondance classe/chapitre <-> fichiers sur le disque.

Ce module a concentré plusieurs bugs subtils (alias de classe manquant pour les exports bruts,
correspondance de mots-clés qui ne coupait pas les mots car les libellés étaient déjà concaténés,
faux positifs sur des mots génériques comme "théorème"). Ces tests figent le comportement attendu
pour éviter les régressions.
"""
from pathlib import Path

import pytest

from document_processor import (
    sanitize_folder_name,
    normalize_key,
    infer_class_from_path,
    find_course_file,
    _tokens,
)


def test_sanitize_folder_name_replaces_forbidden_characters():
    assert sanitize_folder_name("Géométrie: droites et segments") == "Géométrie- droites et segments"
    assert sanitize_folder_name("Sans caractère interdit") == "Sans caractère interdit"


def test_normalize_key_strips_accents_case_and_punctuation():
    assert normalize_key("Généralités sur les fonctions") == "generalitessurlesfonctions"
    assert normalize_key("2nde") == "2nde"


def test_tokens_splits_words_and_drops_stopwords():
    # normalize_key concatène tout ("generalitessurlesfonctions"), ce qui a longtemps cassé la
    # correspondance mot à mot : _tokens doit garder les mots séparés et retirer les mots vides.
    assert _tokens("Généralités sur les fonctions") == ["generalite", "fonction"]
    assert _tokens("Équations et inéquations") == ["equation", "inequation"]


def test_tokens_naive_depluralization():
    assert _tokens("Racines carrées") == ["racine", "carree"]


@pytest.fixture
def fake_documents_dir(tmp_path: Path) -> Path:
    """Reproduit la structure réelle rencontrée en production : un export brut nommé "2ndc" pour
    la classe "2nde", et des noms de fichiers qui ne partagent pas tous les mots du programme."""
    root = tmp_path / "documents"

    twonde = root / "2ndc-20260717T214050Z-1-001" / "2ndc"
    twonde.mkdir(parents=True)
    (twonde / "Chapitre_5_Generalites_fonctions.pdf").write_bytes(b"%PDF-1.4 fake")
    (twonde / "Chapitre_3_Vecteurs_du_plan.pdf").write_bytes(b"%PDF-1.4 fake")

    troisieme = root / "3eme-20260717T214034Z-1-001" / "3eme"
    troisieme.mkdir(parents=True)
    (troisieme / "Chapitre_6_Pythagore.pdf").write_bytes(b"%PDF-1.4 fake")

    quatrieme = root / "4eme-20260717T214020Z-1-001" / "4eme"
    quatrieme.mkdir(parents=True)
    # Ce fichier ne parle pas du tout de Pythagore : seul le mot générique "theoreme" pourrait
    # matcher par erreur une recherche floue trop permissive.
    (quatrieme / "Chapitre_6_Projection_theoreme_des_milieux.pdf").write_bytes(b"%PDF-1.4 fake")

    return root


def test_infer_class_from_path_handles_raw_export_alias(fake_documents_dir):
    path = fake_documents_dir / "2ndc-20260717T214050Z-1-001" / "2ndc" / "Chapitre_3_Vecteurs_du_plan.pdf"
    assert infer_class_from_path(path, fake_documents_dir) == "2nde"


def test_find_course_file_matches_multiword_chapter(fake_documents_dir):
    result = find_course_file(str(fake_documents_dir), "2nde", "Généralités sur les fonctions")
    assert result is not None
    assert "Generalites_fonctions" in result


def test_find_course_file_matches_single_word_chapter(fake_documents_dir):
    result = find_course_file(str(fake_documents_dir), "2nde", "Vecteurs")
    assert result is not None
    assert "Vecteurs_du_plan" in result


def test_find_course_file_rejects_weak_generic_word_match(fake_documents_dir):
    """Régression : "Théorème de Pythagore" (4ème) ne doit jamais renvoyer le fichier sur les
    milieux d'un triangle juste parce que les deux partagent le mot générique "théorème"."""
    result = find_course_file(str(fake_documents_dir), "4ème", "Théorème de Pythagore")
    assert result is None


def test_find_course_file_returns_none_for_missing_content(fake_documents_dir):
    result = find_course_file(str(fake_documents_dir), "2nde", "Probabilités")
    assert result is None


def test_find_course_file_official_convention_takes_priority(tmp_path):
    """Convention officielle : data_dir/<classe>/<chapitre>/fichier — doit être trouvé même sans
    recourir à la recherche floue."""
    folder = tmp_path / "6ème" / "Fractions"
    folder.mkdir(parents=True)
    (folder / "cours.pdf").write_bytes(b"%PDF-1.4 fake")

    result = find_course_file(str(tmp_path), "6ème", "Fractions")
    assert result == str(folder / "cours.pdf")
