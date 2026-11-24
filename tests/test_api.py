import json
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app.main import MAX_CHAT_BODY_BYTES, create_app


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(frontend_dir=tmp_path)) as test_client:
        yield test_client


def test_mock_health_and_root(client):
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json() == {"status": "ok", "provider": "mock"}

    root = client.get("/")
    assert root.status_code == 200
    assert root.json() == {"status": "ok", "ui": "not_installed"}


def test_knowledge_sidebar(client):
    response = client.get("/api/knowledge")

    assert response.status_code == 200
    articles = response.json()["articles"]
    assert 8 <= len(articles) <= 15
    assert all(set(article) == {"id", "title", "summary"} for article in articles)
    assert all(all(article.values()) for article in articles)
    assert len({article["id"] for article in articles}) == len(articles)


@pytest.mark.parametrize("message", [None, "", " \t\n ", "x" * 2001, 42, ["hello"]])
def test_invalid_message(client, message):
    response = client.post("/api/chat", json={"message": message})

    assert response.status_code == 400
    assert response.json() == {"error": "invalid_message"}


@pytest.mark.parametrize("session_id", ["", "../demo", "with space", "newline\n", "x" * 65, 123, "caf\u00e9"])
def test_invalid_session_id(client, session_id):
    response = client.post("/api/chat", json={"message": "hello", "session_id": session_id})

    assert response.status_code == 400
    assert response.json() == {"error": "invalid_session_id"}


def test_missing_message_and_malformed_json(client):
    missing = client.post("/api/chat", json={"session_id": "example"})
    malformed = client.post("/api/chat", content=b'{"message":')

    assert missing.status_code == malformed.status_code == 400
    assert missing.json() == {"error": "invalid_message"}
    assert malformed.json() == {"error": "invalid_request"}


def test_accepts_trimmed_limit_and_escaped_unicode(client):
    text = json.dumps({"message": "  " + "🎨" * 2000 + "\t", "session_id": "x" * 64})
    response = client.post("/api/chat", content=text, headers={"Content-Type": "application/json"})

    assert response.status_code == 200
    assert response.json()["session_id"] == "x" * 64


def test_rejects_oversized_request_body(client):
    response = client.post("/api/chat", content=b" " * (MAX_CHAT_BODY_BYTES + 1))

    assert response.status_code == 413
    assert response.json() == {"error": "payload_too_large"}


def test_chat_answers_studio_pricing_and_returns_sources(client):
    response = client.post("/api/chat", json={"message": "  How much is the Studio plan?  "})

    assert response.status_code == 200
    chat = response.json()
    assert chat["provider"] == "mock"
    assert "$49" in chat["answer"]
    assert "Pricing and plan limits" in chat["answer"]
    assert UUID(chat["session_id"]).version == 4
    assert chat["sources"][0]["id"] == "pricing"
    for source in chat["sources"]:
        assert set(source) == {"id", "title", "excerpt", "score"}
        assert source["excerpt"] and source["score"] > 0


def test_greeting_and_off_topic_question(client):
    greeting = client.post("/api/chat", json={"message": "Hello there!"})
    off_topic = client.post("/api/chat", json={"message": "What is the weather in Paris?"})

    assert greeting.status_code == off_topic.status_code == 200
    assert greeting.json()["answer"].startswith("Hi!")
    assert "LumenDesk" in greeting.json()["answer"]
    assert "don't have that in the LumenDesk docs" in off_topic.json()["answer"]
    assert greeting.json()["sources"] == off_topic.json()["sources"] == []


def test_chat_accepts_and_reuses_session_id(client):
    session_id = "studio-demo_123"
    initial = client.post("/api/chat", json={"message": "Hello!", "session_id": session_id})
    follow_up = client.post("/api/chat", json={"message": "How do I invite a client?", "session_id": session_id})

    assert initial.status_code == follow_up.status_code == 200
    assert initial.json()["session_id"] == follow_up.json()["session_id"] == session_id
    assert "portal" in follow_up.json()["answer"].lower()


@pytest.mark.parametrize(
    "origin",
    ["http://127.0.0.1:8000", "http://localhost:8000", "http://127.0.0.1:5500", "http://localhost:5500"],
)
def test_cors_allows_demo_origins(client, origin):
    response = client.options(
        "/api/chat",
        headers={"Origin": origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "Content-Type"},
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin


def test_future_frontend_mount_keeps_api_routes(tmp_path):
    (tmp_path / "index.html").touch()
    assets = tmp_path / "assets"
    assets.mkdir()
    (assets / "example.txt").write_text("example asset", encoding="utf-8")

    with TestClient(create_app(frontend_dir=tmp_path)) as client:
        root = client.get("/")
        assert root.status_code == 200
        assert root.headers["content-type"].startswith("text/html")
        assert client.get("/assets/example.txt").text == "example asset"
        assert client.get("/api/health").json() == {"status": "ok", "provider": "mock"}
