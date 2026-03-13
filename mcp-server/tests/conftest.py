import os
import pytest
from unittest.mock import patch

@pytest.fixture(autouse=True)
def mock_env_gemini_key():
    with patch.dict(os.environ, {"GOOGLE_API_KEY": "mocked_key"}):
        yield
