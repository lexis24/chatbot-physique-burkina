"""Document Processor for math curriculum documents"""
import re
import unicodedata
from pathlib import Path
from typing import Optional, List

COURSE_FILE_EXTENSIONS = (".pdf", ".docx", ".txt")

# Alias de classe utilisés à la fois pour l'ingestion (ingest_documents.py) et pour la recherche
# du document de cours (find_course_file) : les exports bruts (Google Drive/ZIP) ne respectent
# pas toujours le libellé officiel de curriculum_data.py (ex: dossier "2ndc" pour la classe "2nde").
CLASS_ALIASES = {
    "6eme": "6ème",
    "6e": "6ème",
    "sixieme": "6ème",
    "5eme": "5ème",
    "5e": "5ème",
    "cinquieme": "5ème",
    "4eme": "4ème",
    "4e": "4ème",
    "quatrieme": "4ème",
    "3eme": "3ème",
    "3e": "3ème",
    "troisieme": "3ème",
    "2nde": "2nde",
    "2ndc": "2nde",
    "seconde": "2nde",
    "1ere": "1ère",
    "1ered": "1ère",
    "premiere": "1ère",
    "tled": "Tle",
    "tle": "Tle",
    "terminale": "Tle",
}


def sanitize_folder_name(name: str) -> str:
    """Rend un libellé de classe/chapitre utilisable comme nom de dossier sur tous les OS
    (Windows interdit certains caractères, ex: ':' dans "Géométrie: droites et segments")."""
    return re.sub(r'[<>:"/\\|?*]', "-", name).strip()


def normalize_source_path(file_path: str) -> str:
    """Uniformise le séparateur de chemin en '/' pour la métadonnée "source" stockée dans la base
    vectorielle. Sans ça, un index construit sur Windows (chemins en '\\') est illisible une fois
    déployé sur un serveur Linux : os.path.isfile() ne reconnaît pas '\\' comme séparateur, donc
    find_course_file_from_index() échoue systématiquement (repli silencieux sur la recherche par
    nom de fichier, moins précise). '/' fonctionne nativement sur Windows comme sur Linux/macOS."""
    return Path(file_path).as_posix()


def normalize_key(value: str) -> str:
    """Normalise un libellé pour les comparaisons floues (accents/casse/ponctuation ignorés)."""
    ascii_text = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "", ascii_text.lower())


_STOPWORDS = {"de", "du", "des", "le", "la", "les", "un", "une", "et", "sur", "dans", "a", "au", "aux", "en"}


def _tokens(value: str) -> List[str]:
    """Découpe un libellé en mots-clés normalisés (accents/casse/pluriel ignorés), sans les mots
    vides. Contrairement à normalize_key (qui concatène tout en une seule chaîne et casse donc
    toute comparaison mot à mot), ceci garde les mots séparés pour un score de recouvrement fiable."""
    ascii_text = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    words = re.findall(r"[a-z0-9]+", ascii_text.lower())
    # Normalisation naive du pluriel français ("racines" -> "racine") pour que les libellés du
    # curriculum et les noms de fichiers (souvent formulés différemment) se recoupent quand même.
    words = [w[:-1] if len(w) > 4 and w.endswith("s") and not w.endswith("ss") else w for w in words]
    return [t for t in words if t not in _STOPWORDS]


def infer_class_from_path(path: Path, data_dir: Path) -> Optional[str]:
    """Déduit le code de classe officiel (ex: "2nde") depuis les dossiers parents ou le nom du
    fichier, via CLASS_ALIASES. Utilisé aussi bien à l'ingestion qu'à la recherche du cours."""
    rel_parts = path.relative_to(data_dir).parts
    candidates = list(rel_parts[:-1]) + [path.stem]
    for raw in candidates:
        key = normalize_key(raw)
        for alias, class_code in CLASS_ALIASES.items():
            if alias in key:
                return class_code
    return None


def find_course_file(
    data_dir: str, class_code: str, chapter: str, extensions: tuple = COURSE_FILE_EXTENSIONS
) -> Optional[str]:
    """Cherche un document (PDF/DOCX/TXT par défaut) pour une classe/un chapitre.

    La recherche commence par la convention officielle <data_dir>/<classe>/<chapitre>/
    puis tombe sur une recherche recursive utile pour les exports bruts de dossiers, en
    inférant la classe via CLASS_ALIASES (le nom du dossier ne correspond pas toujours
    exactement au libellé officiel, ex: "2ndc" pour "2nde").

    `extensions` généralise à d'autres types de fichiers (ex: `.json` pour les flashcards, voir
    /api/flashcards) sans dupliquer cette logique de recherche déjà éprouvée sur les cours/résumés.
    """
    folder = Path(data_dir) / sanitize_folder_name(class_code) / sanitize_folder_name(chapter)
    if folder.is_dir():
        for ext in extensions:
            matches = sorted(folder.glob(f"*{ext}"))
            if matches:
                return str(matches[0])

    data_path = Path(data_dir)
    chapter_tokens = _tokens(chapter)
    best = None
    best_matched = -1
    best_score = -1
    for path in sorted(data_path.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in extensions:
            continue
        if infer_class_from_path(path, data_path) != class_code:
            continue
        rel_tokens = set(_tokens(" ".join(path.relative_to(data_path).parts)))
        stem_tokens = set(_tokens(path.stem))
        # Nombre de mots-clés distincts du chapitre retrouvés dans le chemin, avec un bonus
        # s'ils apparaissent directement dans le nom du fichier (signal plus fort qu'un simple
        # dossier parent) : sert à départager plusieurs fichiers candidats.
        matched = sum(1 for t in chapter_tokens if t in rel_tokens or t in stem_tokens)
        score = matched + sum(1 for t in chapter_tokens if t in stem_tokens)
        if score > best_score:
            best = path
            best_score = score
            best_matched = matched

    if best is None:
        return None
    # Exige qu'une stricte majorité des mots-clés du chapitre soit retrouvée (un seul mot-clé
    # générique en commun, ex: "théorème", ne suffit pas) : mieux vaut signaler l'absence du
    # cours que renvoyer le document d'un autre chapitre.
    if not chapter_tokens or 2 * best_matched <= len(chapter_tokens):
        return None
    return str(best)


class DocumentProcessor:
    """Process math curriculum documents for the knowledge base"""

    def __init__(self, data_dir: str):
        self.data_dir = data_dir

    @staticmethod
    def _strip_nul(text: str) -> str:
        """Retire les octets NUL (\\x00) parfois présents dans un texte extrait (PDF scannés/mal
        encodés surtout) : SQLite/ChromaDB les toléraient silencieusement, mais Postgres les
        rejette purement et simplement à l'insertion ("A string literal cannot contain NUL (0x00)
        characters"), ce qui fait planter toute l'ingestion sur le premier document concerné."""
        return text.replace("\x00", "")

    def process_pdf(self, file_path: str, metadata: dict) -> Optional[dict]:
        """Extract text from a PDF file"""
        try:
            from pypdf import PdfReader
            text = ""
            with open(file_path, 'rb') as f:
                reader = PdfReader(f)
                for page in reader.pages:
                    text += page.extract_text() + "\n"
            text = self._strip_nul(text)

            return {
                "text": text,
                "metadata": {
                    "source": normalize_source_path(file_path),
                    "type": "pdf",
                    **metadata
                }
            }
        except Exception as e:
            print(f"Error processing PDF {file_path}: {e}")
            return None
    
    def process_docx(self, file_path: str, metadata: dict) -> Optional[dict]:
        """Extract text from a DOCX file"""
        try:
            import docx
            doc = docx.Document(file_path)
            text = "\n".join([p.text for p in doc.paragraphs if p.text.strip()])
            text = self._strip_nul(text)

            return {
                "text": text,
                "metadata": {
                    "source": normalize_source_path(file_path),
                    "type": "docx",
                    **metadata
                }
            }
        except Exception as e:
            print(f"Error processing DOCX {file_path}: {e}")
            return None
    
    def process_txt(self, file_path: str, metadata: dict) -> Optional[dict]:
        """Extract text from a TXT file"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                text = f.read()
            text = self._strip_nul(text)

            return {
                "text": text,
                "metadata": {
                    "source": normalize_source_path(file_path),
                    "type": "txt",
                    **metadata
                }
            }
        except Exception as e:
            print(f"Error processing TXT {file_path}: {e}")
            return None
    
    def create_sample_documents(self) -> List[dict]:
        """Create sample curriculum documents"""
        samples = [
            {
                "text": """Le théorème de Pythagore est un résultat fondamental en géométrie.
                
Dans un triangle rectangle, le carré de la longueur de l'hypoténuse est égal à la somme des carrés des longueurs des deux autres côtés.

Si ABC est un triangle rectangle en A, alors BC² = AB² + AC²

Exemple : Si AB = 3 cm et AC = 4 cm, alors BC² = 3² + 4² = 9 + 16 = 25, donc BC = 5 cm.

Ce théorème permet de calculer la longueur d'un côté d'un triangle rectangle quand on connaît les deux autres.""",
                "metadata": {"type": "sample", "chapter": "Théorème de Pythagore", "class": "5ème"}
            },
            {
                "text": """Le théorème de Thalès permet de calculer des longueurs dans des configurations de triangles emboîtés ou coupés par une parallèle.

Si deux droites parallèles coupent deux sécantes, alors elles déterminent sur ces sécantes des segments proportionnels.

Dans un triangle ABC, si une droite parallèle à BC coupe AB en D et AC en E, alors :
AD/AB = AE/AC = DE/BC

Exemple : Si AD = 2 cm, AB = 6 cm et DE = 3 cm, trouver BC.""",
                "metadata": {"type": "sample", "chapter": "Théorème de Thalès", "class": "4ème"}
            },
            {
                "text": """Les fractions représentent une partie d'un tout.

Une fraction a/b représente a parts égales d'un tout divisé en b parts.

Opérations :
- Addition/Soustraction : Il faut le même dénominateur
- Multiplication : (a/b) × (c/d) = (a×c)/(b×d)
- Division : (a/b) ÷ (c/d) = (a×d)/(b×c)

Simplification : Diviser le numérateur et le dénominateur par leur PGCD.""",
                "metadata": {"type": "sample", "chapter": "Fractions", "class": "6ème"}
            }
        ]
        return samples
