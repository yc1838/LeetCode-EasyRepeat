import inspect
import time
from unittest.mock import MagicMock, patch, AsyncMock

from fastapi.testclient import TestClient

from api import app

client = TestClient(app)


def _mock_llm():
    mock_llm = MagicMock()
    mock_llm.with_structured_output.return_value = mock_llm
    return mock_llm


@patch('api.get_llm')
@patch('api.anyio.to_thread.run_sync', new_callable=AsyncMock)
def test_autofix_async_job_flow(mock_run_sync, mock_get_llm):
    mock_run_sync.return_value = "Runtime Error"
    mock_get_llm.return_value = _mock_llm()

    async def mock_attempt_fix(self, code, error, inputs, max_retries=3, progress_cb=None):
        events = [
            {"step": "generate_tests", "status": "active", "attempt": None, "max_attempts": max_retries},
            {"step": "generate_tests", "status": "done", "attempt": None, "max_attempts": max_retries},
            {"step": "generate_fix_attempt_1", "status": "active", "attempt": 1, "max_attempts": max_retries},
            {"step": "generate_fix_attempt_1", "status": "done", "attempt": 1, "max_attempts": max_retries},
            {"step": "execute_sandbox_attempt_1", "status": "done", "attempt": 1, "max_attempts": max_retries},
            {"step": "verified_success", "status": "done", "attempt": 1, "max_attempts": max_retries},
        ]
        if progress_cb:
            for event in events:
                result = progress_cb(event)
                if inspect.isawaitable(result):
                    await result
        return {
            "verified": True,
            "fixed_code": "fixed",
            "explanation": "ok",
            "logs": "All Tests Passed: []",
            "attempts": 1,
            "test_count": 1
        }

    with patch('api.AgentFixer.attempt_fix', new=mock_attempt_fix):
        response = client.post("/autofix/async", json={
            "code": "def test(): pass",
            "test_input": "42",
            "provider": "ollama",
            "model": "llama3.1"
        })
        assert response.status_code == 200
        job_id = response.json().get("job_id")
        assert job_id

        status_payload = None
        for _ in range(50):
            status = client.get(f"/autofix/status/{job_id}")
            assert status.status_code == 200
            status_payload = status.json()
            if status_payload.get("state") in ("succeeded", "failed"):
                break
            time.sleep(0.01)

        assert status_payload["state"] == "succeeded"
        assert status_payload["result"]["verified"] is True
        steps = [event["step"] for event in status_payload.get("events", [])]
        assert "generate_tests" in steps


def test_autofix_status_not_found():
    response = client.get("/autofix/status/does-not-exist")
    assert response.status_code == 404
