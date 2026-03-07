import unittest
from unittest.mock import MagicMock, patch
import urllib.error
import json
import sys
import os

# Add src to path to import moltbook_poster if it's in the root
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import moltbook_poster

class TestRateLimit(unittest.TestCase):

    @patch('moltbook_poster.OPENER.open')
    def test_safe_request_returns_429_json(self, mock_open):
        # Setup mock to raise HTTPError 429
        error_body = json.dumps({
            "success": False,
            "error": "Too Many Requests",
            "retry_after_minutes": 7
        }).encode('utf-8')

        # Create a mock response object that behaves like an HTTPError
        # HTTPError(url, code, msg, hdrs, fp)
        img_fp = MagicMock()
        img_fp.read.return_value = error_body
        
        http_error = urllib.error.HTTPError(
            url="http://example.com",
            code=429,
            msg="Too Many Requests",
            hdrs={},
            fp=img_fp
        )
        
        mock_open.side_effect = http_error

        # Act
        result = moltbook_poster.safe_request("https://www.moltbook.com/api/v1/posts", method="POST")

        # Assert
        self.assertIsNotNone(result, "safe_request should not return None for 429")
        self.assertIn("retry_after_minutes", result, "Should return the retry_after_minutes field")
        self.assertEqual(result["retry_after_minutes"], 7)

if __name__ == '__main__':
    unittest.main()
