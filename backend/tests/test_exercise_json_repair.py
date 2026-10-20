"""Régression : quand une réponse d'exercice est tronquée (max_tokens) puis relancée via la
relance automatique de _call_claude, Claude recommence parfois à écrire les commandes LaTeX
(\\vec, \\frac, \\det...) avec un seul backslash au lieu du double backslash JSON attendu,
rendant le JSON invalide. _repair_latex_json_escapes() corrige ça ; _parse_exercise_json() doit
retomber dessus automatiquement quand le premier json.loads() échoue."""
import json

from rag_system import RAGSystem, _repair_latex_json_escapes


def test_repair_leaves_valid_json_unchanged():
    text = json.dumps({"solution": "Calcule $\\vec{AB}$ avec $\\dfrac{2}{3}$."})
    assert _repair_latex_json_escapes(text) == text
    assert json.loads(_repair_latex_json_escapes(text)) == json.loads(text)


def test_repair_fixes_single_backslash_latex_commands():
    # Construit volontairement une chaîne JSON invalide (un seul backslash devant "vec" et
    # "frac") : c'est exactement ce que produit Claude après une relance automatique.
    broken = '{"solution": "Calcule \\vec{AB} avec \\frac{2}{3}."}'
    try:
        json.loads(broken)
        raised = False
    except json.JSONDecodeError:
        raised = True
    assert raised, "le texte de test doit être du JSON invalide avant réparation"

    repaired = _repair_latex_json_escapes(broken)
    data = json.loads(repaired)
    assert data["solution"] == "Calcule \\vec{AB} avec \\frac{2}{3}."


def test_repair_preserves_legitimate_escapes():
    text = '{"enonce": "Ligne 1\\nLigne 2, avec un \\"guillemet\\" et un chemin C:\\\\dossier"}'
    data = json.loads(_repair_latex_json_escapes(text))
    assert data["enonce"] == "Ligne 1\nLigne 2, avec un \"guillemet\" et un chemin C:\\dossier"


def test_parse_exercise_json_recovers_from_broken_latex_escapes():
    broken_response = (
        '{"chapitre": "Vecteurs", "enonce": "Calcule les coordonnees de $\\vec{AB}$.", '
        '"indices": ["Utilise \\frac{1}{2}."], '
        '"solution": "On calcule \\vec{AB} = \\frac{2}{3}\\vec{AI}.", '
        '"reponse_finale": "OK", "figure": null}'
    )
    parsed, chapitre = RAGSystem._parse_exercise_json(broken_response, difficulty=2)
    assert parsed is not None, "la reparation doit permettre de recuperer un exercice valide"
    assert chapitre == "Vecteurs"
    assert "vec{AB}" in parsed["solution"]


def test_parse_exercise_json_still_rejects_genuinely_malformed_json():
    assert RAGSystem._parse_exercise_json("ceci n'est pas du JSON du tout", difficulty=2) == (None, None)
