"""Schémas de physique (champ `figure` des exercices, voir FIGURE_SCHEMAS dans rag_system.py) :
un schéma exploitable est conservé tel quel, un schéma vide ou d'un type inconnu est écarté
plutôt que servi au frontend (qui ne saurait pas le dessiner)."""
import json
import re

from rag_system import FIGURE_SCHEMAS, RAGSystem

CIRCUIT = {
    "type": "circuit",
    "composants": [{"type": "pile", "de": [0, 0], "vers": [0, 2]}, {"type": "lampe", "de": [0, 2], "vers": [3, 2]}],
    "fils": [[[3, 2], [3, 0], [0, 0]]],
}


def test_valid_figure_keeps_each_physics_type():
    assert RAGSystem._valid_figure(CIRCUIT) is CIRCUIT
    assert RAGSystem._valid_figure({"type": "forces", "forces": [{"nom": "P", "origine": [0, 0], "vecteur": [0, -1]}]})
    assert RAGSystem._valid_figure({"type": "optique", "elements": [{"type": "lentille_convergente", "x": 0}]})
    assert RAGSystem._valid_figure({"type": "graphique", "series": [{"points": [[0, 0], [1, 1]]}]})
    assert RAGSystem._valid_figure({"type": "Géométrie", "points": [{"id": "A", "x": 0, "y": 0}]})


def test_valid_figure_accepts_typeless_geometry():
    assert RAGSystem._valid_figure({"points": [{"id": "A", "x": 0, "y": 0}]})


def test_valid_figure_rejects_empty_unknown_or_malformed():
    assert RAGSystem._valid_figure({"type": "circuit", "composants": []}) is None
    assert RAGSystem._valid_figure({"type": "chimie", "points": [{"id": "A"}]}) is None
    assert RAGSystem._valid_figure({"type": "graphique"}) is None
    assert RAGSystem._valid_figure("figure") is None
    assert RAGSystem._valid_figure(None) is None


def test_parse_exercise_keeps_a_circuit_figure():
    raw = json.dumps({"chapitre": "Le circuit électrique", "enonce": "Énoncé", "indices": ["Indice"], "figure": CIRCUIT})
    parsed, chapter = RAGSystem._parse_exercise_json(raw, difficulty=2)
    assert parsed["figure"] == CIRCUIT
    assert chapter == "Le circuit électrique"


def test_parse_exercise_drops_an_unusable_figure():
    raw = json.dumps({"enonce": "Énoncé", "indices": [], "figure": {"type": "circuit", "composants": []}})
    parsed, _ = RAGSystem._parse_exercise_json(raw, difficulty=3)
    assert parsed["figure"] is None


def test_parse_solution_keeps_a_valid_figure_and_drops_an_invalid_one():
    """La correction peut porter son propre schéma (construction optique, circuit à compléter) :
    sans ce champ, le modèle « dessinait » le schéma en LaTeX (\\begin{array}), cassé à l'écran."""
    raw = json.dumps({"solution": "Voir la construction.", "reponse_finale": "3,0 cm", "figure": CIRCUIT})
    assert RAGSystem._parse_exercise_solution_json(raw)["figure"] == CIRCUIT
    raw = json.dumps({"solution": "Voir.", "reponse_finale": "", "figure": {"type": "optique"}})
    assert RAGSystem._parse_exercise_solution_json(raw)["figure"] is None


def test_figure_schema_examples_are_valid_json_and_accepted():
    """Le modèle imite les exemples de FIGURE_SCHEMAS : chacun doit être du JSON valide et
    accepté par _valid_figure, sinon on lui apprendrait un format que l'application rejette."""
    examples = []
    for match in re.finditer(r'^\{"type"', FIGURE_SCHEMAS, flags=re.M):
        depth = 0
        for i in range(match.start(), len(FIGURE_SCHEMAS)):
            depth += FIGURE_SCHEMAS[i] == "{"
            depth -= FIGURE_SCHEMAS[i] == "}"
            if depth == 0:
                examples.append(json.loads(FIGURE_SCHEMAS[match.start():i + 1]))
                break
    assert {e["type"] for e in examples} == {"circuit", "forces", "optique", "graphique", "geometrie"}
    assert all(RAGSystem._valid_figure(e) is not None for e in examples)


def test_figure_as_text_is_compact_json():
    text = RAGSystem._figure_as_text(CIRCUIT)
    assert text.startswith("Schéma de l'énoncé")
    assert '"type":"circuit"' in text
    assert RAGSystem._figure_as_text(None) == ""
