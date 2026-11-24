from collections.abc import Sequence

from app.knowledge.retriever import Snippet
from app.providers.base import ProviderName, Turn, answer_without_context


class MockProvider:
    name: ProviderName = "mock"

    async def answer(
        self, question: str, context_snippets: Sequence[Snippet], history: Sequence[Turn]
    ) -> str:
        if not context_snippets:
            return answer_without_context(question)

        snippet = context_snippets[0]
        return f'{snippet.excerpt}\n\nFrom the LumenDesk article "{snippet.title}".'
