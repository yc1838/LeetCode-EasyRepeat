import pytest
from unittest.mock import patch, MagicMock
from api import app
from fastapi.testclient import TestClient

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
