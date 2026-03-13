import pytest
from fastapi.testclient import TestClient
from api import app
from unittest.mock import patch, AsyncMock

client = TestClient(app)

@patch('api.anyio.to_thread.run_sync', new_callable=AsyncMock)
def test_verify_single_input(mock_run_sync):
    # (A) Happy path: standard single test_input parsed into a list
    mock_run_sync.return_value = "Passed"
    response = client.post("/verify", json={
        "code": "def test(): pass",
        "test_input": "42"
    })
    
    assert response.status_code == 200
    mock_run_sync.assert_called_once()
    args, kwargs = mock_run_sync.call_args
    # It must parse the single input correctly
    assert args[2] == ["42"]

@patch('api.anyio.to_thread.run_sync', new_callable=AsyncMock)
def test_verify_batch_input_json_array(mock_run_sync):
    # (A) Happy path: a json string array should be unpacked into a python list
    mock_run_sync.return_value = "Passed"
    
    # Simulate Chrome Extension sending multiple inputs as JSON string
    response = client.post("/verify", json={
        "code": "def test(): pass",
        "test_input": '["case_1", "case_2"]'
    })
    
    assert response.status_code == 200
    mock_run_sync.assert_called_once()
    args, kwargs = mock_run_sync.call_args
    # It must parse the JSON string into standard args
    assert args[2] == ["case_1", "case_2"]

@patch('api.anyio.to_thread.run_sync', new_callable=AsyncMock)
def test_verify_malformed_json_fallback(mock_run_sync):
    # (F) Graceful fallback: Malformed string should just be sent exactly as is.
    mock_run_sync.return_value = "Passed"
    
    response = client.post("/verify", json={
        "code": "def test(): pass",
        "test_input": '[[[1,2]' # Unclosed bracket, invalid format
    })
    
    assert response.status_code == 200
    mock_run_sync.assert_called_once()
    args, kwargs = mock_run_sync.call_args
    assert args[2] == ['[[[1,2]']
