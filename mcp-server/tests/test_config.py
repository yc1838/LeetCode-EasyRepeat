import pytest
import os
from unittest.mock import patch
from pydantic import ValidationError
from config import Settings, get_settings

def test_settings_load_successfully():
    # (A) Happy Path: Ensure settings load with mocked env vars
    # Use Settings directly with _env_file=None so the conftest mock is authoritative
    settings = Settings(_env_file=None)
    assert settings.google_api_key.get_secret_value() == "mocked_key"
    assert settings.temperature == 0.4

def test_get_settings_returns_cached_instance():
    # Ensure get_settings() returns a Settings instance and caches it (lru_cache)
    get_settings.cache_clear()
    s1 = get_settings()
    s2 = get_settings()
    assert isinstance(s1, Settings)
    assert s1 is s2  # Same object = cache is working
    
def test_settings_missing_optional_keys():
    # (B) Null/missing fields: Ensure default values are respected if optionals are missing
    # We clear the environment so Pydantic doesn't pick up the local .env file's "true"
    with patch.dict(os.environ, {"GOOGLE_API_KEY": "test_key"}, clear=True):
        settings = Settings(_env_file=None)
        assert settings.langchain_tracing_v2 is False # Default is False if not in env
    
def test_settings_type_mismatch():
    # (C) Type mismatch: Ensure Pydantic catches wrong types (e.g. string for temperature)
    with pytest.raises(ValidationError):
        Settings(google_api_key="test_key", temperature="too_hot")
