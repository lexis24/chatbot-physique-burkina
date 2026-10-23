"""Tests de document_processor.py : correspondance classe/chapitre <-> fichiers sur le disque.

Ce module a concentré plusieurs bugs subtils (alias de classe manquant pour les exports bruts,
correspondance de mots-clés qui ne coupait pas les mots car les libellés étaient déjà concaténés,
faux positifs sur des mots génériques comme "électrique", égalité de score entre deux chapitres
dont les noms de fichiers se recoupent). Ces tests figent le comportement attendu pour éviter
les régressions.
"""
from pathlib import Path

import pytest

from document_processor import (
    sanitize_folder_name,
    normalize_key,
    infer_class_from_path,
    find_course_file,
    chapter_number_from_filename,
    curriculum_chapter_from_number,
    _tokens,
)


def test_sanitize_folder_name_replaces_forbidden_characters():
    assert sanitize_folder_name("L'énergie mécanique : transfert et rendement") == "L'énergie mécanique - transfert et rendement"
    assert sanitize_folder_name("Sans caractère interdit") == "Sans caractère interdit"


def test_normalize_key_strips_accents_case_and_punctuation():
    assert normalize_key("Les éléments de cinématique") == "leselementsdecinematique"
    assert normalize_key("2nde") == "2nde"


def test_tokens_splits_words_and_drops_stopwords():
    # normalize_key concatène tout ("leselementsdecinematique"), ce qui a longtemps cassé la
    # correspondance mot à mot : _tokens doit garder les mots séparés et retirer les mots vides.
    assert _tokens("Les éléments de cinématique") == ["element", "cinematique"]
    assert _tokens("La propagation de la chaleur") == ["propagation", "chaleur"]


def test_tokens_naive_depluralization():
    assert _tokens("Lentilles convergentes") == ["lentille", "convergente"]


@pytest.fixture
def fake_documents_dir(tmp_path: Path) -> Path:
    """Reproduit la structure réelle des documents : dossiers de classe nommés comme dans les
    exports (« 2ndeC » pour la classe « 2nde »), noms de fichiers sans accents qui ne reprennent
    pas toujours tous les mots de l'intitulé officiel."""
    root = tmp_path / "documents"

    twonde = root / "2ndeC"
    twonde.mkdir(parents=True)
    (twonde / "Chapitre_1_La_notion_de_mouvement.pdf").write_bytes(b"%PDF-1.4 fake")
    (twonde / "Chapitre_2_Les_forces.pdf").write_bytes(b"%PDF-1.4 fake")

    troisieme = root / "3eme"
    troisieme.mkdir(parents=True)
    # Seul fichier de 3ème : il ne partage que le mot générique "electrique" avec « La tension
    # électrique » — une recherche floue trop permissive le renverrait par erreur.
    (troisieme / "Chapitre_5_L_energie_electrique.pdf").write_bytes(b"%PDF-1.4 fake")

    quatrieme = root / "4eme"
    quatrieme.mkdir(parents=True)
    # Cas réel : le fichier du chapitre 4 ne contient pas le mot "corps" de son intitulé, et
    # recoupe donc autant de mots-clés que celui du chapitre 2.
    (quatrieme / "Chapitre_2_La_masse_d_un_corps.pdf").write_bytes(b"%PDF-1.4 fake")
    (quatrieme / "Chapitre_4_La_masse_volumique_et_la_densite.pdf").write_bytes(b"%PDF-1.4 fake")

    return root


def test_infer_class_from_path_handles_raw_export_alias(fake_documents_dir):
    path = fake_documents_dir / "2ndeC" / "Chapitre_2_Les_forces.pdf"
    assert infer_class_from_path(path, fake_documents_dir) == "2nde"
    assert infer_class_from_path(Path("/x/TleD/a.pdf"), Path("/x")) == "Tle"
    assert infer_class_from_path(Path("/x/1ereD/a.pdf"), Path("/x")) == "1ère"


def test_find_course_file_matches_multiword_chapter(fake_documents_dir):
    result = find_course_file(str(fake_documents_dir), "2nde", "La notion de mouvement")
    assert result is not None
    assert "La_notion_de_mouvement" in result


def test_find_course_file_matches_single_word_chapter(fake_documents_dir):
    result = find_course_file(str(fake_documents_dir), "2nde", "Les forces")
    assert result is not None
    assert "Les_forces" in result


def test_find_course_file_rejects_weak_generic_word_match(fake_documents_dir):
    """Régression : « La tension électrique » (3ème) ne doit jamais renvoyer le fichier sur
    l'énergie électrique juste parce que les deux partagent le mot générique "électrique"."""
    result = find_course_file(str(fake_documents_dir), "3ème", "La tension électrique")
    assert result is None


def test_find_course_file_breaks_ties_with_chapter_number(fake_documents_dir):
    """Régression : « La masse volumique et la densité d'un corps » (chapitre 4 de 4ème) recoupe
    autant de mots-clés avec le fichier du chapitre 2 (« La masse d'un corps ») qu'avec le sien ;
    le numéro de chapitre du nom de fichier doit départager (sinon : cours, résumé et flashcards
    du mauvais chapitre)."""
    result = find_course_file(str(fake_documents_dir), "4ème", "La masse volumique et la densité d'un corps")
    assert result is not None and "Chapitre_4_" in result
    result = find_course_file(str(fake_documents_dir), "4ème", "La masse d'un corps")
    assert result is not None and "Chapitre_2_" in result


def test_find_course_file_returns_none_for_missing_content(fake_documents_dir):
    result = find_course_file(str(fake_documents_dir), "2nde", "Les montages électroniques")
    assert result is None


def test_find_course_file_official_convention_takes_priority(tmp_path):
    """Convention officielle : data_dir/<classe>/<chapitre>/fichier — doit être trouvé même sans
    recourir à la recherche floue."""
    folder = tmp_path / "4ème" / "Les ombres"
    folder.mkdir(parents=True)
    (folder / "cours.pdf").write_bytes(b"%PDF-1.4 fake")

    result = find_course_file(str(tmp_path), "4ème", "Les ombres")
    assert result == str(folder / "cours.pdf")


def test_chapter_number_from_filename_reads_every_naming_scheme():
    assert chapter_number_from_filename(Path("Chapitre_4_La_masse_volumique.pdf")) == 4
    assert chapter_number_from_filename(Path("flashcards_tled_Chapitre_12_La_bobine_inductive.json")) == 12
    assert chapter_number_from_filename(Path("Chapitre_3_L_energie_mecanique_FICHE_REVISION.pdf")) == 3
    assert chapter_number_from_filename(Path("Annexe_Questions_rapides.pdf")) is None


def test_curriculum_chapter_from_number_follows_manual_order():
    assert curriculum_chapter_from_number("4ème", Path("Chapitre_1_x.pdf")) == "Les états solide, liquide et gazeux"
    assert curriculum_chapter_from_number("Tle", Path("Chapitre_16_x.pdf")) == "Les réactions nucléaires provoquées"
    assert curriculum_chapter_from_number("1ère", Path("Chapitre_9_x.pdf")) is None  # 8 chapitres en 1ère
    assert curriculum_chapter_from_number("4ème", Path("Annexe.pdf")) is None
