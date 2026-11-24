import os
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlsplit

import httpx
from dotenv import dotenv_values

PROJECT_DIR = Path(__file__).resolve().parents[1]
ENV_FILE = PROJECT_DIR / ".env"


class ConfigurationError(RuntimeError):
    """An invalid application setting with a safe error message."""


@dataclass(frozen=True, slots=True)
class Settings:
    host: str = "127.0.0.1"
    port: int = 8000
    api_key: str = field(default="", repr=False)
    base_url: str = "https://api.openai.com/v1"
    model: str = "gpt-4o-mini"


def load_settings() -> Settings:
    file_values = dotenv_values(ENV_FILE, interpolate=False)

    def get(name: str, default: str = "") -> str:
        file_value = file_values.get(name)
        return os.environ.get(name, default if file_value is None else file_value).strip()

    host = get("APP_HOST", "127.0.0.1")
    if not host or _has_space_or_control(host):
        raise ConfigurationError("APP_HOST must be a non-empty host.")

    try:
        port = int(get("APP_PORT", "8000"))
    except ValueError:
        raise ConfigurationError("APP_PORT must be an integer from 1 to 65535.") from None
    if not 1 <= port <= 65535:
        raise ConfigurationError("APP_PORT must be an integer from 1 to 65535.")

    api_key = get("OPENAI_API_KEY")
    base_url = get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    model = get("OPENAI_MODEL", "gpt-4o-mini")
    if api_key:
        if not api_key.isascii() or _has_space_or_control(api_key):
            raise ConfigurationError("OPENAI_API_KEY must be a valid bearer token.")
        _validate_base_url(base_url)
        if not model or _has_space_or_control(model):
            raise ConfigurationError("OPENAI_MODEL must be a non-empty model identifier.")

    return Settings(host=host, port=port, api_key=api_key, base_url=base_url, model=model)


def _has_space_or_control(value: str) -> bool:
    return any(character.isspace() or not character.isprintable() for character in value)


def _validate_base_url(value: str) -> None:
    message = "OPENAI_BASE_URL must be an HTTP(S) API URL without credentials, a query, or a fragment."
    try:
        parts = urlsplit(value)
        if (
            _has_space_or_control(value)
            or any(character in value for character in "\\?#")
            or parts.scheme not in {"http", "https"}
            or not parts.hostname
            or parts.username is not None
            or parts.port == 0
        ):
            raise ValueError
        httpx.URL(value)
    except (ValueError, httpx.InvalidURL):
        raise ConfigurationError(message) from None
