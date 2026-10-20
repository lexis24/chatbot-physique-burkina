"""Tests de l'inférence de difficulté (RAGSystem._infer_difficulty / _recent_user_questions).

Ce sont des @staticmethod : on les appelle directement sur la classe pour éviter d'instancier
RAGSystem (ce qui chargerait le modèle d'embeddings et se connecterait à ChromaDB/Anthropic)."""
from rag_system import RAGSystem


def test_infer_difficulty_defaults_to_medium_without_history():
    assert RAGSystem._infer_difficulty(None) == 2
    assert RAGSystem._infer_difficulty([]) == 2


def test_infer_difficulty_detects_basic_level_questions():
    history = [{"role": "user", "content": "Je ne comprends pas, c'est quoi une fraction ?"}]
    assert RAGSystem._infer_difficulty(history) == 1


def test_infer_difficulty_detects_advanced_level_questions():
    history = [{"role": "user", "content": "Peux-tu démontrer que cette suite est convergente ?"}]
    assert RAGSystem._infer_difficulty(history) == 3


def test_infer_difficulty_ignores_assistant_turns():
    history = [
        {"role": "assistant", "content": "Voici comment démontrer une limite avec la définition."},
        {"role": "user", "content": "Merci !"},
    ]
    # Seuls les tours "user" comptent : le vocabulaire avancé de l'assistant ne doit pas influencer.
    assert RAGSystem._infer_difficulty(history) == 2


def test_recent_user_questions_filters_role_and_limits_count():
    history = [{"role": "user", "content": f"Question {i}"} for i in range(10)]
    history.insert(1, {"role": "assistant", "content": "Réponse"})
    recent = RAGSystem._recent_user_questions(history, limit=3)
    assert recent == ["Question 7", "Question 8", "Question 9"]


def test_recent_user_questions_empty_history():
    assert RAGSystem._recent_user_questions(None) == []
    assert RAGSystem._recent_user_questions([]) == []
