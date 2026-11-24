import pytest

from app.knowledge.retriever import Retriever
from app.main import ARTICLES_DIR


@pytest.fixture
def retriever():
    return Retriever.from_directory(ARTICLES_DIR)


@pytest.mark.parametrize(
    ("question", "expected_id", "expected_text"),
    [
        ("How much is the Studio plan?", "pricing", "$49"),
        ("Which browsers do you support?", "browser-support", "Firefox"),
        ("How do I cancel my subscription?", "billing", "stops renewal"),
        ("How do I invite a client?", "client-portals", "one-time sign-in link"),
        ("Can I use automatic payment reminders?", "payment-reminders", "seven days"),
        ("Do you offer a free trial?", "pricing", "14-day trial"),
        ("Can I export my workspace data?", "data-privacy", "ZIP export"),
    ],
)
def test_retrieval_ranks_relevant_article_first(retriever, question, expected_id, expected_text):
    results = retriever.search(question)

    assert results[0].id == expected_id
    assert expected_text in results[0].excerpt
    scores = [result.score for result in results]
    assert scores == sorted(scores, reverse=True)
    assert results == retriever.search(question, top_k=3)


def test_pricing_outranks_weak_matches(retriever):
    question = "How much is the Studio plan?"
    results = retriever.search(question, top_k=len(retriever.articles))

    assert results[0].id == "pricing"
    assert results[0].score > results[1].score
    assert "browser-support" not in {result.id for result in results}
    assert retriever.search(question, top_k=1) == results[:1]


def test_retrieval_omits_unrelated_articles(retriever):
    assert retriever.search("What causes a lunar eclipse?") == []
