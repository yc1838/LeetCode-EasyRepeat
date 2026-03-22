import sys
from pathlib import Path
import os
import pytest
from unittest.mock import patch

MCP_SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(MCP_SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(MCP_SERVER_ROOT))

from config import get_settings

@pytest.fixture(autouse=True)
def mock_env_gemini_key():
    get_settings.cache_clear()
    with patch.dict(os.environ, {"GOOGLE_API_KEY": "mocked_key"}):
        get_settings.cache_clear()
        yield
    get_settings.cache_clear()
