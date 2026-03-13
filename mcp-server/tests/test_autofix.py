
import pytest
from unittest.mock import MagicMock, patch

# Add parent directory to path to import api
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from api import AgentFixer


def _make_mock_llm():
    """Create a mock BaseChatModel for injection into AgentFixer."""
    mock_llm = MagicMock()
    mock_llm.with_structured_output.return_value = mock_llm
    return mock_llm


def test_heuristics_simple_code():
    mock_llm = _make_mock_llm()
    fixer = AgentFixer(mock_llm)
    # Simple code, short length
    code = "class Solution:\n    def add(a, b):\n        return a + b"
    
    assert fixer.is_simple_fix(code) == True

def test_heuristics_complex_code():
    mock_llm = _make_mock_llm()
    fixer = AgentFixer(mock_llm)
    # Long code
    code = "\n".join(["print('line')" for _ in range(20)])
    assert fixer.is_simple_fix(code) == False

@pytest.mark.anyio
async def test_generate_fix_calls_llm():
    # This replaces the old requests.post mock
    mock_llm = _make_mock_llm()
    fixer = AgentFixer(mock_llm)
    start_code = "def foo(): pass"
    error = "SyntaxError"
    
    from api import CodeFix
    mock_codefix = CodeFix(fixed_code="fixed_code", explanation="mocked expl")
    
    from unittest.mock import AsyncMock
    mock_chain = MagicMock()
    mock_chain.ainvoke = AsyncMock(return_value=mock_codefix)
    
    with patch("api.PromptTemplate.__or__", return_value=mock_chain):
        fix = await fixer.generate_fix(start_code, error, "input")
    
    assert fix == "fixed_code"

# For verify_fix, we don't need async as verify_fix logic itself is synchronous 
# (wrapped in anyio.to_thread in the caller attempt_fix, but the function itself is sync)
def test_verify_fix_success():
    with patch('api.verify_solution_logic') as mock_verify:
        mock_verify.return_value = "All Tests Passed: [{}]"
        
        mock_llm = _make_mock_llm()
        fixer = AgentFixer(mock_llm)
        result, logs = fixer.verify_fix("code", ["input"])
        
        assert result == True
        assert "All Tests Passed" in logs

@pytest.mark.anyio
async def test_agent_workflow_success():
    """
    Simulates the full flow: 
    1. Generate Fix (Mocked)
    2. Verify Fix (Mocked Success)
    3. Return Code
    """
    mock_llm = _make_mock_llm()
    fixer = AgentFixer(mock_llm)
    
    from unittest.mock import AsyncMock
    
    with patch.object(fixer, 'generate_tests', new_callable=AsyncMock) as mock_gen_tests:
        mock_gen_tests.return_value = ["test2"]
        with patch.object(fixer, 'generate_fix', new_callable=AsyncMock) as mock_gen_fix:
            mock_gen_fix.return_value = "class Solution:\n    val = 1"
            with patch('api.anyio.to_thread.run_sync', new_callable=AsyncMock) as mock_verify:
                mock_verify.return_value = (True, "Success")
                
                response = await fixer.attempt_fix("bad_code", "error", ["input"])
                
                assert response['fixed_code'] is not None
                assert response['verified'] == True

@pytest.mark.anyio
async def test_agent_workflow_failure():
    """
    Simulates:
    1. Generate Fix
    2. Verify Fix (Fails)
    3. Return Failure
    """
    mock_llm = _make_mock_llm()
    fixer = AgentFixer(mock_llm)
    
    from unittest.mock import AsyncMock
    
    with patch.object(fixer, 'generate_tests', new_callable=AsyncMock) as mock_gen_tests:
        mock_gen_tests.return_value = ["test2"]
        with patch.object(fixer, 'generate_fix', new_callable=AsyncMock) as mock_gen_fix:
            mock_gen_fix.return_value = "bad_fix"
            with patch('api.anyio.to_thread.run_sync', new_callable=AsyncMock) as mock_verify:
                mock_verify.return_value = (False, "Runtime Error")
                
                response = await fixer.attempt_fix("bad_code", "error", ["input"], max_retries=1)
                
                assert response['fixed_code'] == "bad_fix"
                assert response['verified'] == False
