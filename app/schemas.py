from typing import Annotated, Literal

from pydantic import BaseModel, StringConstraints

from app.knowledge.retriever import Snippet
from app.providers.base import ProviderName

Message = Annotated[
    str, StringConstraints(strict=True, strip_whitespace=True, min_length=1, max_length=2000)
]
SessionId = Annotated[
    str, StringConstraints(strict=True, min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
]


class ChatRequest(BaseModel):
    message: Message
    session_id: SessionId | None = None


class ChatResponse(BaseModel):
    answer: str
    sources: list[Snippet]
    provider: ProviderName
    session_id: str


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    provider: ProviderName


class ArticleSummary(BaseModel):
    id: str
    title: str
    summary: str


class KnowledgeResponse(BaseModel):
    articles: list[ArticleSummary]


class ErrorResponse(BaseModel):
    error: str
