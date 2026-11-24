import re
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal, Protocol

from app.knowledge.retriever import Snippet

ProviderName = Literal["mock", "openai_compat"]


@dataclass(frozen=True, slots=True)
class Turn:
    question: str
    answer: str


class ProviderError(RuntimeError):
    """A model provider did not return a usable answer."""


class AnswerProvider(Protocol):
    @property
    def name(self) -> ProviderName: ...

    async def answer(
        self, question: str, context_snippets: Sequence[Snippet], history: Sequence[Turn]
    ) -> str: ...


def answer_without_context(question: str) -> str:
    greeting = r"(?:hi|hello|hey|good morning|good afternoon|good evening)(?:[ ,]+(?:there|lumendesk))?[!.?\s]*"
    if re.fullmatch(greeting, question.strip().casefold()):
        return "Hi! I can help with LumenDesk pricing, setup, proposals, and client portals. What would you like to know?"
    return "I don't have that in the LumenDesk docs. I can help with questions about LumenDesk features and policies."
