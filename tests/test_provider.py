import json
import logging
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient

from app import main

TEST_KEY = "fixture-bearer-token-never-a-real-key"


@pytest.fixture
def live_client(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", TEST_KEY)
    monkeypatch.setenv("OPENAI_BASE_URL", "https://gateway.example/compatible/v1/")
    monkeypatch.setenv("OPENAI_MODEL", "demo/studio-model")

    def make_client(handler):
        transport = httpx.MockTransport(handler)
        monkeypatch.setattr(main, "httpx", SimpleNamespace(AsyncClient=lambda: httpx.AsyncClient(transport=transport)))
        return TestClient(main.create_app())

    return make_client


def test_live_provider_sends_chat_completions_request_and_history(live_client, caplog):
    caplog.set_level(logging.INFO)
    requests = []

    def handler(request):
        requests.append(json.loads(request.content))
        assert request.method == "POST"
        assert str(request.url) == "https://gateway.example/compatible/v1/chat/completions"
        assert request.headers["authorization"] == f"Bearer {TEST_KEY}"
        assert request.headers["content-type"] == "application/json"
        assert request.extensions["timeout"]["connect"] == 3.0
        assert request.extensions["timeout"]["read"] == 8.0
        return httpx.Response(200, json={"choices": [{"message": {"content": f"  Studio costs $49. {TEST_KEY}  "}}]})

    with live_client(handler) as client:
        health = client.get("/api/health")
        assert health.json() == {"status": "ok", "provider": "openai_compat"}
        assert TEST_KEY not in health.text
        initial = client.post("/api/chat", json={"message": "  How much is the Studio plan?  "})
        assert initial.status_code == 200
        first = initial.json()
        assert first["provider"] == "openai_compat"
        assert first["answer"] == "Studio costs $49. [redacted]"
        follow_up = client.post(
            "/api/chat", json={"message": "How many seats are in the Studio plan?", "session_id": first["session_id"]}
        )

    assert follow_up.status_code == 200
    assert TEST_KEY not in initial.text + follow_up.text + caplog.text
    first_body, second_body = requests
    assert first_body["model"] == second_body["model"] == "demo/studio-model"
    system, user = first_body["messages"]
    assert system["role"] == "system"
    assert "retrieved" in system["content"] and "Never invent billing facts" in system["content"]
    assert user["role"] == "user"
    question = json.loads(user["content"])
    assert question["question"] == "How much is the Studio plan?"
    assert question["context"][0] == {"title": first["sources"][0]["title"], "excerpt": first["sources"][0]["excerpt"]}
    assert second_body["messages"][1:3] == [
        {"role": "user", "content": "How much is the Studio plan?"},
        {"role": "assistant", "content": first["answer"]},
    ]


@pytest.mark.parametrize("failure", ["http", "api", "malformed", "empty", "timeout"])
def test_upstream_failures_return_generic_error(live_client, caplog, failure):
    caplog.set_level(logging.INFO)

    def handler(request):
        if failure == "http":
            return httpx.Response(429, text=TEST_KEY)
        if failure == "api":
            return httpx.Response(200, json={"error": {"message": TEST_KEY}})
        if failure == "malformed":
            return httpx.Response(200, text=TEST_KEY)
        if failure == "empty":
            return httpx.Response(200, json={"choices": [{"message": {"content": " "}}]})
        raise httpx.ReadTimeout(TEST_KEY, request=request)

    with live_client(handler) as client:
        response = client.post("/api/chat", json={"message": "How much is the Studio plan?"})

    assert response.status_code == 502
    assert response.json() == {"error": "upstream_unavailable"}
    assert TEST_KEY not in response.text + caplog.text


def test_live_mode_answers_unknown_questions_without_upstream(live_client):
    def handler(request):
        pytest.fail("An unanswered question should not call the upstream provider.")

    with live_client(handler) as client:
        response = client.post("/api/chat", json={"message": "What causes a lunar eclipse?"})

    assert response.status_code == 200
    assert response.json()["provider"] == "openai_compat"
    assert response.json()["sources"] == []
    assert "don't have that in the LumenDesk docs" in response.json()["answer"]
