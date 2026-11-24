import pytest

from app import config

TEST_KEY = "fixture-key-for-settings-tests-only"


def test_settings_load_dotenv_and_environment_overrides(monkeypatch):
    config.ENV_FILE.write_text("APP_PORT=8050\nOPENAI_API_KEY=\n", encoding="utf-8")
    assert config.load_settings().port == 8050
    monkeypatch.setenv("APP_PORT", "8060")
    monkeypatch.setenv("OPENAI_API_KEY", "   ")

    settings = config.load_settings()
    assert settings.port == 8060
    assert settings.api_key == ""
    assert settings.base_url == "https://api.openai.com/v1"


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("OPENAI_BASE_URL", ""),
        ("OPENAI_BASE_URL", "gateway.example/v1"),
        ("OPENAI_BASE_URL", "https://gateway.example:99999/v1"),
        ("OPENAI_BASE_URL", "https://gateway.example/v1?token=value"),
        ("OPENAI_BASE_URL", "https://user:password@gateway.example/v1"),
        ("OPENAI_MODEL", ""),
        ("OPENAI_MODEL", "invalid identifier"),
    ],
)
def test_live_settings_fail_clearly_for_invalid_values(monkeypatch, name, value):
    monkeypatch.setenv("OPENAI_API_KEY", TEST_KEY)
    config.ENV_FILE.write_text(f"{name}={value}\n", encoding="utf-8")

    with pytest.raises(config.ConfigurationError, match=name) as failure:
        config.load_settings()
    assert TEST_KEY not in str(failure.value)
    if value:
        assert value not in str(failure.value)


def test_settings_repr_excludes_key(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", TEST_KEY)

    assert TEST_KEY not in repr(config.load_settings())
