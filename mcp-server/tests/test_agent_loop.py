import pytest
from unittest.mock import MagicMock, patch, AsyncMock
import sys
import os

# Add parent directory to path to import api
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api import AgentFixer


def _make_mock_llm():
    """Create a mock BaseChatModel for injection into AgentFixer."""
    mock_llm = MagicMock()
    mock_llm.with_structured_output.return_value = mock_llm
    return mock_llm


@pytest.mark.anyio
@patch('api.AgentFixer.generate_tests')
@patch('api.AgentFixer.generate_fix')
@patch('api.anyio.to_thread.run_sync')
async def test_retry_loop_success_after_failure(mock_run_sync, mock_generate_fix, mock_generate_tests):
    """
    Test that the agent retries if the first verification fails, 
    and succeeds if the second verification passes against the SUITE.
    """
    mock_llm = _make_mock_llm()
    agent = AgentFixer(mock_llm)
    
    # Setup Mocks
    mock_generate_tests.return_value = ["test2", "test3"] # generated tests
    
    # 1. Generate Fix: First returns "Bad Code", Second returns "Good Code"
    mock_generate_fix.side_effect = ["def solution(): return 'bad'", "def solution(): return 'good'"]
    
    # 2. Verify: First returns (False, "Error"), Second returns (True, "Success")
    mock_run_sync.side_effect = [(False, "Runtime Error: Bad Code"), (True, "Output: Success")]
    
    # Run
    result = await agent.attempt_fix("def solution(): return 'buggy'", "Initial Error", ["initial_test"], max_retries=3)
    
    # Assertions
    assert result['verified'] is True
    assert result['attempts'] == 2
    assert result['test_count'] == 3 # initial + 2 generated
    
    # Check that verify was called with ALL tests
    expected_suite = ["initial_test", "test2", "test3"]
    args1, _ = mock_run_sync.call_args_list[0]
    assert args1[2] == expected_suite # Verification 1 uses suite
    
    # Check generate fix calls
    assert mock_generate_fix.call_count == 2

@pytest.mark.anyio
@patch('api.AgentFixer.generate_tests')
@patch('api.AgentFixer.generate_fix')
@patch('api.anyio.to_thread.run_sync')
async def test_retry_loop_fail_all(mock_run_sync, mock_generate_fix, mock_generate_tests):
    """
    Test that the agent gives up after max_retries.
    """
    mock_llm = _make_mock_llm()
    agent = AgentFixer(mock_llm)
    mock_generate_tests.return_value = []
    mock_generate_fix.return_value = "def solution(): return 'still_bad'"
    mock_run_sync.return_value = (False, "Runtime Error: Still Bad")
    
    result = await agent.attempt_fix("buggy", "error", ["input"], max_retries=2)
    
    assert result['verified'] is False
    assert len(result['history']) == 2
    assert mock_generate_fix.call_count == 2
