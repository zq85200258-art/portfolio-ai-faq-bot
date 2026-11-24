from collections.abc import AsyncIterator
from contextlib import AsyncExitStack, asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError

from app.config import PROJECT_DIR, Settings, load_settings
from app.knowledge.retriever import Retriever
from app.providers.base import AnswerProvider, ProviderError, Turn
from app.providers.mock import MockProvider
from app.providers.openai_compat import OpenAICompatProvider
from app.schemas import (
    ArticleSummary,
    ChatRequest,
    ChatResponse,
    ErrorResponse,
    HealthResponse,
    KnowledgeResponse,
)
from app.sessions import SessionStore

ARTICLES_DIR = PROJECT_DIR / "app" / "knowledge" / "articles"
FRONTEND_DIR = PROJECT_DIR / "frontend"
MAX_CHAT_BODY_BYTES = 32 * 1024
DEMO_ORIGINS = [
    "http://127.0.0.1:8000",
    "http://localhost:8000",
    "http://127.0.0.1:5500",
    "http://localhost:5500",
]


@dataclass(slots=True)
class Runtime:
    provider: AnswerProvider
    retriever: Retriever
    sessions: SessionStore


def create_app(settings: Settings | None = None, *, frontend_dir: Path = FRONTEND_DIR) -> FastAPI:
    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        active_settings = settings if settings is not None else load_settings()
        retriever = Retriever.from_directory(ARTICLES_DIR)
        async with AsyncExitStack() as stack:
            provider: AnswerProvider = MockProvider()
            if active_settings.api_key:
                client = await stack.enter_async_context(httpx.AsyncClient())
                provider = OpenAICompatProvider(
                    client, active_settings.base_url, active_settings.model, active_settings.api_key
                )
            application.state.runtime = Runtime(provider, retriever, SessionStore())
            yield

    application = FastAPI(title="LumenDesk FAQ API", version="1.0.0", lifespan=lifespan)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=DEMO_ORIGINS,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

    @application.get("/api/health")
    async def health(request: Request) -> HealthResponse:
        runtime: Runtime = request.app.state.runtime
        return HealthResponse(provider=runtime.provider.name)

    @application.get("/api/knowledge")
    async def knowledge(request: Request) -> KnowledgeResponse:
        runtime: Runtime = request.app.state.runtime
        return KnowledgeResponse(
            articles=[
                ArticleSummary(id=article.id, title=article.title, summary=article.summary)
                for article in runtime.retriever.articles
            ]
        )

    @application.post(
        "/api/chat",
        response_model=ChatResponse,
        responses={
            400: {"model": ErrorResponse, "description": "Invalid chat request"},
            413: {"model": ErrorResponse, "description": "Request body exceeds 32 KiB"},
            502: {"model": ErrorResponse, "description": "Model provider unavailable"},
        },
        openapi_extra={
            "requestBody": {
                "required": True,
                "content": {"application/json": {"schema": ChatRequest.model_json_schema()}},
            }
        },
    )
    async def chat(request: Request) -> ChatResponse | JSONResponse:
        body = bytearray()
        async for chunk in request.stream():
            if len(body) + len(chunk) > MAX_CHAT_BODY_BYTES:
                return JSONResponse(status_code=413, content={"error": "payload_too_large"})
            body.extend(chunk)

        try:
            payload = ChatRequest.model_validate_json(body)
        except ValidationError as error:
            location = error.errors(include_input=False, include_context=False)[0]["loc"]
            code = {("message",): "invalid_message", ("session_id",): "invalid_session_id"}.get(
                location, "invalid_request"
            )
            return JSONResponse(status_code=400, content={"error": code})

        runtime: Runtime = request.app.state.runtime
        session_id = payload.session_id or uuid4().hex
        sources = runtime.retriever.search(payload.message)
        history = runtime.sessions.history(session_id)
        try:
            answer = await runtime.provider.answer(payload.message, sources, history)
        except ProviderError:
            return JSONResponse(status_code=502, content={"error": "upstream_unavailable"})

        runtime.sessions.remember(session_id, Turn(question=payload.message, answer=answer))
        return ChatResponse(answer=answer, sources=sources, provider=runtime.provider.name, session_id=session_id)

    if (frontend_dir / "index.html").is_file():
        application.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
    else:

        @application.get("/", include_in_schema=False)
        async def root() -> dict[str, str]:
            return {"status": "ok", "ui": "not_installed"}

    return application


app = create_app()


if __name__ == "__main__":
    import uvicorn

    startup_settings = load_settings()
    uvicorn.run(create_app(startup_settings), host=startup_settings.host, port=startup_settings.port)
