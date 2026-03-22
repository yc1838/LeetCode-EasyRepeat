import pytest
from unittest.mock import patch, MagicMock
from httpx import ConnectError
from api import app
from fastapi.testclient import TestClient
from config import get_settings

client = TestClient(app)


@patch("api.requests.get")
def test_models_endpoint_ollama_dynamic(mock_get):
    """POST /models for ollama returns dynamic list when server is reachable."""
    mock_resp = MagicMock()
    mock_resp.ok = True
    mock_resp.json.return_value = {
        "models": [
            {"name": "gemma3:latest"},
            {"name": "llama3.2:latest"},
        ]
    }
    mock_get.return_value = mock_resp

    response = client.post("/models", json={"provider": "ollama"})
    assert response.status_code == 200

    data = response.json()
    assert data["source"] == "dynamic"
    assert "gemma3:latest" in data["models"]
    assert "llama3.2:latest" in data["models"]


@patch("api.requests.get", side_effect=Exception("Connection refused"))
def test_models_endpoint_ollama_fallback(mock_get):
    """POST /models for ollama returns fallback when server is unreachable."""
    response = client.post("/models", json={"provider": "ollama"})
    assert response.status_code == 200

    data = response.json()
    assert data["source"] == "fallback"
    assert "warning" in data
    assert len(data["models"]) > 0


def test_models_endpoint_unknown_provider():
    """POST /models with unknown provider returns 400."""
    response = client.post("/models", json={"provider": "deepseek"})
    assert response.status_code == 400


@patch("google.genai.Client")
def test_models_endpoint_google_network_error_returns_diagnostic(mock_client):
    """POST /models for google surfaces connection failures instead of generic invalid-key text."""
    get_settings.cache_clear()

    mock_instance = MagicMock()
    mock_instance.models.list.side_effect = ConnectError("nodename nor servname provided")
    mock_client.return_value = mock_instance

    response = client.post("/models", json={"provider": "google", "api_key": "AIzaTestKey123"})
    assert response.status_code == 200

    data = response.json()
    assert data["error"] == "Google Gemini connection failed"
    assert data["error_type"] == "network_error"
    assert "ConnectError" in data["error_detail"]
    assert "nodename nor servname provided" in data["error_detail"]
