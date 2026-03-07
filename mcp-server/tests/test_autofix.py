
import pytest
from unittest.mock import MagicMock, patch

# Mock the server module since we are testing logic independent of E2B for now, 
# or we can mock E2B.
import sys
import os

# Add parent directory to path to import api
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from api import AgentFixer

def test_heuristics_simple_code():
    fixer = AgentFixer()
    # Simple code, short length
    code = "class Solution:\n    def add(a, b):\n        return a + b"
    
    assert fixer.is_simple_fix(code) == True

def test_heuristics_complex_code():
    fixer = AgentFixer()
    # Long code
    code = "\n".join(["print('line')" for _ in range(20)])
    assert fixer.is_simple_fix(code) == False

@patch('api.requests.post')
def test_generate_fix_calls_ollama(mock_post):
    fixer = AgentFixer()
    
    start_code = "def foo(): pass"
    error = "SyntaxError"
    
    # Mock Ollama response
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"response": "```python\nfixed_code\n```"}
    mock_post.return_value = mock_response
    
    fix = fixer.generate_fix(start_code, error, "input")
    
    assert fix == "fixed_code"
    assert mock_post.called

def test_verify_fix_success():
    # We need to mock verify_solution_logic from server.py import in api.py
    with patch('api.verify_solution_logic') as mock_verify:
        mock_verify.return_value = "Output Logs:\nResult: 6"
        
        fixer = AgentFixer()
        result, logs = fixer.verify_fix("code", "input")
        
        assert result == True
        assert "Result: 6" in logs

def test_agent_workflow_success():
    """
    Simulates the full flow: 
    1. Generate Fix (Mocked)
    2. Verify Fix (Mocked Success)
    3. Return Code
    """
    fixer = AgentFixer()
    
    with patch.object(fixer, 'generate_fix', return_value="class Solution:\n    val = 1"):
        with patch.object(fixer, 'verify_fix', return_value=(True, "Success")):
            
            response = fixer.attempt_fix("bad_code", "error", "input")
            
            assert response['fixed_code'] is not None
            assert response['explanation'] is None
            assert response['verified'] == True

def test_agent_workflow_failure():
    """
    Simulates:
    1. Generate Fix
    2. Verify Fix (Fails)
    3. Return Failure (or retry logic, for now failure)
    """
    fixer = AgentFixer()
    
    with patch.object(fixer, 'generate_fix', return_value="bad_fix"):
        with patch.object(fixer, 'verify_fix', return_value=(False, "Runtime Error")):
            
            response = fixer.attempt_fix("bad_code", "error", "input")
            
            # The implementation returns the candidate even if verification fails
            assert response['fixed_code'] == "bad_fix"
            assert response['verified'] == False
