"""Ingestion en masse des documents de cours dans la base vectorielle (Postgres/pgvector, ex. Neon
— voir DATABASE_URL dans config.py).

Convention officielle de depot : un document (PDF/DOCX/TXT) par chapitre, dans
    data/documents/<classe>/<chapitre>/
ou <classe> et <chapitre> sont les libelles de curriculum_data.py, passes a
sanitize_folder_name().

Le script accepte aussi les exports bruts de dossiers (ex: Google Drive/ZIP) du type
    data/documents/6eme-20260717T213949Z-1-001/6eme/Chapitre_1_Elements_de_geometrie.pdf
Dans ce cas, la classe est inferee depuis le chemin. Le chapitre est determine en priorite en
lisant le CONTENU du document (extrait envoye a Claude, compare a la liste officielle des
chapitres du programme burkinabe) : un nom de fichier ("Chapitre_5_Generalites_fonctions.pdf")
ne reflete pas toujours fidelement l'intitule officiel, alors que le contenu, lui, ne ment pas.
Si la classification par contenu echoue (pas de cle API, erreur reseau, contenu illisible) ou ne
correspond a aucun chapitre officiel, on retombe sur l'ancienne heuristique par nom de fichier.

Reconstruit entierement la table d'embeddings a chaque execution. A relancer apres tout
ajout/remplacement de PDF :

    python ingest_documents.py
"""
from pathlib import Path
from typing import Optional
import re
import sys

import anthropic

from config import config
from curriculum_data import CURRICULUM
from document_processor import (
    DocumentProcessor,
    sanitize_folder_name,
    COURSE_FILE_EXTENSIONS,
    normalize_key,
    infer_class_from_path,
)
from rag_system import RAGSystem

PROCESSORS = {
    ".pdf": "process_pdf",
    ".docx": "process_docx",
    ".txt": "process_txt",
}

CONTENT_EXCERPT_CHARS = 4000


def chapter_from_filename(path: Path) -> str:
    """Transforme Chapitre_1_Nombres_complexes.pdf en Nombres complexes. Filet de secours quand
    la classification par contenu (voir classify_chapter_from_content) n'a pas abouti."""
    stem = path.stem
    stem = re.sub(r"(?i)^chapitre[_\-\s]*\d+[_\-\s]*", "", stem)
    stem = re.sub(r"(?i)^chap[_\-\s]*\d+[_\-\s]*", "", stem)
    stem = re.sub(r"(?i)^bilan[_\-\s]*", "Bilan ", stem)
    stem = re.sub(r"(?i)^special[_\-\s]*", "Special ", stem)
    stem = stem.replace("_", " ").replace("-", " ")
    return re.sub(r"\s+", " ", stem).strip().capitalize() or path.stem


def best_curriculum_chapter(class_code: str, inferred_chapter: str) -> str:
    """Retourne le chapitre officiel le plus proche si un bon recouvrement existe."""
    chapters = CURRICULUM.get(class_code, {}).get("chapters", [])
    inferred_key = normalize_key(inferred_chapter)
    if not chapters or not inferred_key:
        return inferred_chapter

    best = None
    best_score = 0
    inferred_tokens = set(re.findall(r"[a-z0-9]+", inferred_key))
    for chapter in chapters:
        chapter_key = normalize_key(chapter)
        if inferred_key in chapter_key or chapter_key in inferred_key:
            return chapter
        chapter_tokens = set(re.findall(r"[a-z0-9]+", chapter_key))
        overlap = len(inferred_tokens & chapter_tokens)
        if overlap > best_score:
            best = chapter
            best_score = overlap

    return best if best_score >= 2 else inferred_chapter


def classify_chapter_from_content(anthropic_client, model: str, class_code: str, content: str,
                                   filename_hint: str) -> Optional[str]:
    """Demande a Claude a quel chapitre OFFICIEL du programme ce contenu correspond, en lisant un
    extrait du texte reellement present dans le document. Retourne None si Claude n'est pas
    disponible, si le contenu est vide, ou si le document ne correspond a aucun chapitre officiel
    (bilan trimestriel, page de garde, sommaire...) — dans ce cas l'appelant retombe sur
    l'heuristique par nom de fichier."""
    chapters = CURRICULUM.get(class_code, {}).get("chapters", [])
    excerpt = content.strip()[:CONTENT_EXCERPT_CHARS]
    if not anthropic_client or not chapters or not excerpt:
        return None

    chapters_list = "\n".join(f"- {c}" for c in chapters)
    prompt = f"""Voici un extrait d'un document de cours de mathématiques pour la classe {class_code} \
du programme officiel du Burkina Faso (fichier source : "{filename_hint}").

EXTRAIT DU CONTENU :
\"\"\"
{excerpt}
\"\"\"

CHAPITRES OFFICIELS DU PROGRAMME DE {class_code} :
{chapters_list}

À quel chapitre de cette liste ce contenu correspond-il ? Réponds UNIQUEMENT avec :
- l'intitulé EXACT d'un chapitre ci-dessus, recopié caractère pour caractère (aucune reformulation),
- ou le mot AUCUN si ce document ne correspond à aucun chapitre précis de la liste (bilan/contrôle, \
page de garde, sommaire, introduction générale non liée à un chapitre...).
Ne réponds rien d'autre."""

    try:
        response = anthropic_client.messages.create(
            model=model,
            max_tokens=60,
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(b.text for b in response.content if hasattr(b, "text")).strip()
    except Exception as e:
        print(f"[WARN] Classification par contenu echouee pour {filename_hint}: {e}")
        return None

    return text if text in chapters else None


def _process_file(processor: DocumentProcessor, path: Path) -> Optional[dict]:
    method_name = PROCESSORS.get(path.suffix.lower())
    if not method_name:
        return None
    return getattr(processor, method_name)(str(path), {})


def find_documents(processor: DocumentProcessor, anthropic_client=None, model: str = None):
    """Retourne les documents extraits avec leurs metadonnees (classe, chapitre) : liste de
    tuples (path, doc) ou doc = {"text": ..., "metadata": {"class": ..., "chapter": ..., ...}}."""
    data_dir = Path(config.DATA_DIR)
    found_by_path = {}

    def add_document(path: Path, doc: dict, classe: str, chapitre: str):
        if not classe or not doc:
            return
        doc["metadata"]["class"] = classe
        doc["metadata"]["chapter"] = chapitre
        found_by_path[path.resolve()] = (path, doc)

    # 1. Convention officielle : classe/chapitre deja corrects via la structure de dossiers,
    #    pas besoin de classification par contenu.
    for classe, info in CURRICULUM.items():
        classe_dir = data_dir / sanitize_folder_name(classe)
        for chapitre in info["chapters"]:
            chapitre_dir = classe_dir / sanitize_folder_name(chapitre)
            if not chapitre_dir.is_dir():
                continue
            for ext in COURSE_FILE_EXTENSIONS:
                matches = sorted(chapitre_dir.glob(f"*{ext}"))
                if matches:
                    doc = _process_file(processor, matches[0])
                    if doc is None:
                        print(f"[ERREUR] Echec du traitement de {matches[0]}")
                    else:
                        add_document(matches[0], doc, classe, chapitre)
                    break

    # 2. Exports bruts : classe inferee depuis le chemin, chapitre determine en priorite par le
    #    CONTENU (plus fiable que le nom de fichier), avec repli sur l'heuristique par nom.
    for path in sorted(data_dir.rglob("*")):
        if path.resolve() in found_by_path:
            continue
        if not path.is_file() or path.name.startswith("."):
            continue
        if path.suffix.lower() not in COURSE_FILE_EXTENSIONS:
            continue

        classe = infer_class_from_path(path, data_dir)
        if not classe:
            print(f"[SKIP] Classe introuvable dans le chemin : {path}")
            continue

        doc = _process_file(processor, path)
        if doc is None:
            print(f"[ERREUR] Echec du traitement de {path}")
            continue

        chapitre = classify_chapter_from_content(anthropic_client, model, classe, doc["text"], path.name)
        source = "contenu"
        if not chapitre:
            inferred_chapter = chapter_from_filename(path)
            chapitre = best_curriculum_chapter(classe, inferred_chapter)
            source = "nom de fichier"

        print(f"  [{source}] {classe} / {chapitre} <- {path.name}")
        add_document(path, doc, classe, chapitre)

    return sorted(found_by_path.values(), key=lambda item: str(item[0]).lower())


def main():
    # La console Windows utilise par defaut un encodage legacy (cp1252) qui ne sait pas afficher
    # les symboles mathematiques du programme officiel (ex: l'ensemble "ℝ" des reels, "𝔻" des
    # decimaux) presents dans les intitules de chapitres reels : sans ceci, print() plante des que
    # ces caracteres apparaissent dans les logs de classification.
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    anthropic_client = None
    if config.ANTHROPIC_API_KEY:
        anthropic_client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
        print("[OK] Classification des chapitres par contenu activee (cle Anthropic detectee).")
    else:
        print("[ATTENTION] Pas de cle ANTHROPIC_API_KEY : repli sur l'ancienne heuristique par "
              "nom de fichier pour tous les exports bruts.")

    processor = DocumentProcessor(config.DATA_DIR)
    documents = find_documents(processor, anthropic_client, config.ANTHROPIC_MODEL)
    if not documents:
        print("Aucun document trouve dans data/documents/. Rien a indexer.")
        return

    rag_system = RAGSystem()
    rag_system._reset_store()
    rag_system.initialize_vector_store()

    indexed = 0
    for file_path, doc in documents:
        rag_system.add_documents([doc], doc["metadata"])
        print(f"[OK] {doc['metadata']['class']} / {doc['metadata']['chapter']} <- {file_path.name}")
        indexed += 1

    print(f"\n{indexed} document(s) indexes sur {len(documents)} trouve(s).")


if __name__ == "__main__":
    main()
