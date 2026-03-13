"""
TDD Tests for providers.py — LLM-Agnostic Provider Registry & Factory.

Written BEFORE implementation per user's TDD workflow rule.
Covers: happy path, null/empty/missing fields, type/shape mismatch,
boundary values, dependency failures, and provider-specific edge cases.
"""

import pytest
import os
from unittest.mock import patch, MagicMock


# ---------------------------------------------------------------------------
# A) Happy Path: get_llm returns correct LangChain model per provider
# ---------------------------------------------------------------------------

@patch("langchain_google_genai.ChatGoogleGenerativeAI")
@patch.dict(os.environ, {"GOOGLE_API_KEY": ""}, clear=False)
def test_get_llm_google_happy_path(mock_cls):
    """Google provider with valid api_key returns ChatGoogleGenerativeAI."""
    from config import get_settings
    get_settings.cache_clear()
    from providers import get_llm
    llm = get_llm("google", "gemini-2.5-flash", api_key="AIzaTestKey123")
    mock_cls.assert_called_once_with(
        model="gemini-2.5-flash", api_key="AIzaTestKey123",
        temperature=0.4, max_retries=3,
    )
    assert llm is mock_cls.return_value


@patch("langchain_ollama.ChatOllama")
def test_get_llm_ollama_happy_path(mock_cls):
    """Ollama provider works without any API key."""
    from providers import get_llm
    llm = get_llm("ollama", "gemma3:latest")
    mock_cls.assert_called_once_with(
        model="gemma3:latest",
        base_url="http://localhost:11434",
        temperature=0.4,
    )
    assert llm is mock_cls.return_value


@patch("langchain_openai.ChatOpenAI")
@patch.dict(os.environ, {"OPENAI_API_KEY": ""}, clear=False)
def test_get_llm_openai_happy_path(mock_cls):
    """OpenAI provider with valid api_key returns ChatOpenAI."""
    from config import get_settings
    get_settings.cache_clear()
    from providers import get_llm
    llm = get_llm("openai", "gpt-4o-mini", api_key="sk-test123")
    mock_cls.assert_called_once_with(
        model="gpt-4o-mini", api_key="sk-test123",
        temperature=0.4, max_retries=3,
    )
    assert llm is mock_cls.return_value


@patch("langchain_anthropic.ChatAnthropic")
@patch.dict(os.environ, {"ANTHROPIC_API_KEY": ""}, clear=False)
def test_get_llm_anthropic_happy_path(mock_cls):
    """Anthropic provider with valid api_key returns ChatAnthropic."""
    from config import get_settings
    get_settings.cache_clear()
    from providers import get_llm
    llm = get_llm("anthropic", "claude-3-5-sonnet-latest", api_key="sk-ant-test")
    mock_cls.assert_called_once_with(
        model_name="claude-3-5-sonnet-latest", api_key="sk-ant-test",
        temperature=0.4, max_retries=3,
    )
    assert llm is mock_cls.return_value


# ---------------------------------------------------------------------------
# B) Null/Empty/Missing Fields: missing API key raises ValueError
# ---------------------------------------------------------------------------

@patch.dict(os.environ, {"GOOGLE_API_KEY": ""}, clear=False)
def test_get_llm_google_no_key_raises():
    """Google without api_key and without .env key → ValueError."""
    from config import get_settings
    get_settings.cache_clear()
    from providers import get_llm
    with pytest.raises(ValueError, match="Google Gemini requires an API key"):
        get_llm("google", "gemini-2.5-flash", api_key=None)


@patch.dict(os.environ, {"OPENAI_API_KEY": ""}, clear=False)
def test_get_llm_openai_no_key_raises():
    """OpenAI without api_key and without .env key → ValueError."""
    from config import get_settings
    get_settings.cache_clear()
    from providers import get_llm
    with pytest.raises(ValueError, match="OpenAI requires an API key"):
        get_llm("openai", "gpt-4o", api_key=None)


@patch.dict(os.environ, {"ANTHROPIC_API_KEY": ""}, clear=False)
def test_get_llm_anthropic_no_key_raises():
    """Anthropic without api_key and without .env key → ValueError."""
    from config import get_settings
    get_settings.cache_clear()
    from providers import get_llm
    with pytest.raises(ValueError, match="Anthropic requires an API key"):
        get_llm("anthropic", "claude-3-5-sonnet-latest", api_key=None)


@patch("langchain_ollama.ChatOllama")
def test_get_llm_ollama_no_key_does_not_raise(mock_cls):
    """Ollama never requires a key — should not raise."""
    from providers import get_llm
    # Should not raise even with api_key=None
    get_llm("ollama", "gemma3:latest", api_key=None)


# ---------------------------------------------------------------------------
# C) Type/Shape Mismatch: unsupported provider
# ---------------------------------------------------------------------------

def test_get_llm_unknown_provider_raises():
    """Unknown provider string → ValueError."""
    from providers import get_llm
    with pytest.raises(ValueError, match="Unsupported provider"):
        get_llm("deepseek", "deepseek-r1")


def test_get_llm_empty_provider_raises():
    """Empty string provider → ValueError."""
    from providers import get_llm
    with pytest.raises(ValueError, match="Unsupported provider"):
        get_llm("", "some-model")


# ---------------------------------------------------------------------------
# D) Boundary Values: Ollama base_url is honored
# ---------------------------------------------------------------------------

@patch("langchain_ollama.ChatOllama")
def test_get_llm_ollama_custom_base_url(mock_cls):
    """Custom base_url is passed through to ChatOllama."""
    from providers import get_llm
    get_llm("ollama", "llama3.2:latest", base_url="http://192.168.1.100:11434")
    mock_cls.assert_called_once_with(
        model="llama3.2:latest",
        base_url="http://192.168.1.100:11434",
        temperature=0.4,
    )


@patch("langchain_ollama.ChatOllama")
def test_get_llm_ollama_default_base_url_when_none(mock_cls):
    """base_url=None defaults to localhost:11434."""
    from providers import get_llm
    get_llm("ollama", "gemma3:latest", base_url=None)
    mock_cls.assert_called_once_with(
        model="gemma3:latest",
        base_url="http://localhost:11434",
        temperature=0.4,
    )


# ---------------------------------------------------------------------------
# E) .env Fallback: api_key=None but .env has key → uses .env value
# ---------------------------------------------------------------------------

@patch("langchain_google_genai.ChatGoogleGenerativeAI")
@patch.dict(os.environ, {"GOOGLE_API_KEY": "env_google_key"}, clear=False)
def test_get_llm_google_falls_back_to_env(mock_cls):
    """When api_key=None, falls back to GOOGLE_API_KEY from .env."""
    from providers import get_llm
    from config import get_settings
    get_settings.cache_clear()

    get_llm("google", "gemini-2.5-flash", api_key=None)
    # Should use the env key
    call_kwargs = mock_cls.call_args[1]
    assert call_kwargs["api_key"] is not None


# ---------------------------------------------------------------------------
# F) PROVIDERS registry structure validation
# ---------------------------------------------------------------------------

def test_providers_registry_has_all_four():
    """PROVIDERS dict has exactly ollama, google, openai, anthropic."""
    from providers import PROVIDERS
    assert set(PROVIDERS.keys()) == {"ollama", "google", "openai", "anthropic"}


def test_providers_ollama_requires_no_key():
    """Ollama provider does not require an API key."""
    from providers import PROVIDERS
    assert PROVIDERS["ollama"].requires_api_key is False


def test_providers_cloud_require_keys():
    """All cloud providers require API keys."""
    from providers import PROVIDERS
    for name in ("google", "openai", "anthropic"):
        assert PROVIDERS[name].requires_api_key is True, f"{name} should require API key"


def test_providers_have_fallback_models():
    """Every provider has a non-empty fallback_models list."""
    from providers import PROVIDERS
    for name, info in PROVIDERS.items():
        assert len(info.fallback_models) > 0, f"{name} missing fallback_models"


def test_providers_have_default_model():
    """Every provider has a non-empty default_model."""
    from providers import PROVIDERS
    for name, info in PROVIDERS.items():
        assert info.default_model, f"{name} missing default_model"


# ---------------------------------------------------------------------------
# API Endpoint Tests: GET /providers
# ---------------------------------------------------------------------------

def test_get_providers_endpoint():
    """GET /providers returns all providers with correct structure."""
    from fastapi.testclient import TestClient
    from api import app
    client = TestClient(app)

    response = client.get("/providers")
    assert response.status_code == 200

    data = response.json()
    assert "providers" in data
    names = [p["name"] for p in data["providers"]]
    assert "ollama" in names
    assert "google" in names
    assert "openai" in names
    assert "anthropic" in names

    # Each provider has expected fields
    for p in data["providers"]:
        assert "display_name" in p
        assert "requires_api_key" in p
        assert "default_model" in p
        assert "fallback_models" in p


# ---------------------------------------------------------------------------
# API Endpoint Tests: POST /models
# ---------------------------------------------------------------------------

def test_post_models_unknown_provider_returns_400():
    """POST /models with unknown provider → 400."""
    from fastapi.testclient import TestClient
    from api import app
    client = TestClient(app)

    response = client.post("/models", json={"provider": "deepseek"})
    assert response.status_code == 400


@patch("api.requests.get")
def test_post_models_ollama_dynamic(mock_get):
    """POST /models for ollama with reachable server → dynamic model list."""
    from fastapi.testclient import TestClient
    from api import app
    client = TestClient(app)

    mock_resp = MagicMock()
    mock_resp.ok = True
    mock_resp.json.return_value = {
        "models": [{"name": "gemma3:latest"}, {"name": "llama3.2:latest"}]
    }
    mock_get.return_value = mock_resp

    response = client.post("/models", json={"provider": "ollama"})
    assert response.status_code == 200
    data = response.json()
    assert data["source"] == "dynamic"
    assert "gemma3:latest" in data["models"]
    assert "llama3.2:latest" in data["models"]


@patch("api.requests.get", side_effect=Exception("Connection refused"))
def test_post_models_ollama_unreachable_falls_back(mock_get):
    """POST /models for ollama with unreachable server → fallback + warning."""
    from fastapi.testclient import TestClient
    from api import app
    client = TestClient(app)

    response = client.post("/models", json={"provider": "ollama"})
    assert response.status_code == 200
    data = response.json()
    assert data["source"] == "fallback"
    assert "warning" in data
    assert len(data["models"]) > 0  # Has fallback models


@patch("api.requests.get")
def test_post_models_ollama_honors_base_url(mock_get):
    """POST /models for ollama with custom base_url → uses that URL."""
    from fastapi.testclient import TestClient
    from api import app
    client = TestClient(app)

    mock_resp = MagicMock()
    mock_resp.ok = True
    mock_resp.json.return_value = {"models": [{"name": "test-model"}]}
    mock_get.return_value = mock_resp

    response = client.post("/models", json={
        "provider": "ollama",
        "base_url": "http://192.168.1.50:11434"
    })
    assert response.status_code == 200
    mock_get.assert_called_once_with(
        "http://192.168.1.50:11434/api/tags", timeout=3
    )


@patch.dict(os.environ, {"GOOGLE_API_KEY": ""}, clear=False)
def test_post_models_google_no_key_returns_fallback():
    """POST /models for google without any key → fallback list."""
    from fastapi.testclient import TestClient
    from api import app
    from config import get_settings
    get_settings.cache_clear()
    client = TestClient(app)

    response = client.post("/models", json={"provider": "google"})
    assert response.status_code == 200
    data = response.json()
    assert data["source"] == "fallback"
    assert len(data["models"]) > 0


# ---------------------------------------------------------------------------
# API Endpoint Tests: POST /autofix with unknown provider
# ---------------------------------------------------------------------------

def test_autofix_unknown_provider_returns_400():
    """POST /autofix with unsupported provider → 400."""
    from fastapi.testclient import TestClient
    from api import app
    client = TestClient(app)

    response = client.post("/autofix", json={
        "code": "def foo(): pass",
        "test_input": "1",
        "provider": "deepseek"
    })
    assert response.status_code == 400
