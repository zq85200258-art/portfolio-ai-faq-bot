import json
import math
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

STOP_WORDS = frozenset(
    "a about after all also am an and any are as at be been before but by can could "
    "did do does doing for from get had has have how i if in into is it its me much "
    "my of on one or our please should so some tell than that the their them then "
    "there these they this to too up us use was we were what when where which who "
    "why will with would you your lumendesk".split()
)


@dataclass(frozen=True, slots=True)
class Article:
    id: str
    title: str
    summary: str
    excerpts: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class Snippet:
    id: str
    title: str
    excerpt: str
    score: float


@dataclass(frozen=True, slots=True)
class IndexedArticle:
    article: Article
    title_terms: frozenset[str]
    article_terms: frozenset[str]
    excerpt_terms: tuple[frozenset[str], ...]


def _terms(text: str) -> frozenset[str]:
    terms = set()
    for term in re.findall(r"[a-z0-9]+", text.casefold()):
        if term in STOP_WORDS or len(term) == 1:
            continue
        if len(term) > 3 and term.endswith("s") and not term.endswith(("ss", "us", "is")):
            if term.endswith("ies"):
                term = term[:-3] + "y"
            elif term.endswith(("ches", "shes", "sses", "xes", "zes")):
                term = term[:-2]
            else:
                term = term[:-1]
        if term not in STOP_WORDS:
            terms.add(term)
    return frozenset(terms)


class Retriever:
    def __init__(self, articles: tuple[Article, ...]) -> None:
        self.articles = articles
        index = []
        document_frequency: Counter[str] = Counter()
        for article in articles:
            title_terms = _terms(article.title)
            excerpt_terms = tuple(_terms(excerpt) for excerpt in article.excerpts)
            article_terms = title_terms.union(_terms(article.summary), *excerpt_terms)
            index.append(IndexedArticle(article, title_terms, article_terms, excerpt_terms))
            document_frequency.update(article_terms)
        self._index = tuple(index)
        self._weights = {
            term: 1 + math.log((len(articles) + 1) / (frequency + 1))
            for term, frequency in document_frequency.items()
        }

    @classmethod
    def from_directory(cls, directory: Path) -> "Retriever":
        articles = []
        for path in sorted(directory.glob("*.json")):
            data = json.loads(path.read_text(encoding="utf-8"))
            articles.append(
                Article(data["id"], data["title"], data["summary"], tuple(data["excerpts"]))
            )
        if not articles:
            raise ValueError(f"No knowledge articles found in {directory}.")
        return cls(tuple(articles))

    def search(self, question: str, top_k: int = 3) -> list[Snippet]:
        query = _terms(question)
        minimum_matches = 1 if len(query) == 1 else 2
        snippets = []
        for entry in self._index:
            matches = query & entry.article_terms
            if len(matches) < minimum_matches:
                continue

            excerpt_scores = [self._weight(query & terms) for terms in entry.excerpt_terms]
            excerpt_index = max(range(len(excerpt_scores)), key=excerpt_scores.__getitem__)
            excerpt_score = excerpt_scores[excerpt_index]
            if not excerpt_score:
                continue

            title_score = self._weight(query & entry.title_terms)
            score = self._weight(matches) + title_score + 2 * excerpt_score
            article = entry.article
            snippets.append(
                Snippet(article.id, article.title, article.excerpts[excerpt_index], round(score, 4))
            )

        snippets.sort(key=lambda snippet: (-snippet.score, snippet.id))
        return snippets[:top_k]

    def _weight(self, terms: frozenset[str]) -> float:
        return math.fsum(self._weights[term] for term in terms)
