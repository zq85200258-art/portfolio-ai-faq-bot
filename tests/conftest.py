import httpx
import pytest

from app import config


@pytest.fixture(autouse=True)
def isolate_environment(monkeypatch, tmp_path):
    for name in ("APP_HOST", "APP_PORT", "OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_MODEL"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(config, "ENV_FILE", tmp_path / ".env")

    def block_network(*args, **kwargs):
        pytest.fail("Tests must use the offline provider or an in-memory HTTPX transport.")

    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", block_network)
    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", block_network)
