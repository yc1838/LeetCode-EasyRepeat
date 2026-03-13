import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from api import AgentFixer, GeneratedTests


def _make_mock_llm():
    """Create a mock BaseChatModel for injection into AgentFixer."""
    mock_llm = MagicMock()
    mock_llm.with_structured_output.return_value = mock_llm
    return mock_llm


@pytest.mark.anyio
async def test_generate_tests_happy_path():
    # (A) Happy path: Mocks with_structured_output returning GeneratedTests
    
    mock_llm = _make_mock_llm()
    
    # Setup OR chain mock
    mock_chain = MagicMock()
    mock_chain.ainvoke = AsyncMock(return_value=GeneratedTests(test_cases=["[1]", "[2]", "[3]"]))
    
    with patch("api.PromptTemplate.__or__", return_value=mock_chain):
        agent = AgentFixer(mock_llm)
        tests = await agent.generate_tests("code", "error")
    
    assert tests == ["[1]", "[2]", "[3]"]
    
@pytest.mark.anyio
async def test_generate_tests_dependency_failure():
    # (E) Dependency failure: Mocking timeout / exception from LLM
    
    mock_llm = _make_mock_llm()
    
    # Setup OR chain mock with Exception
    mock_chain = MagicMock()
    mock_chain.ainvoke = AsyncMock(side_effect=Exception("Timeout Error"))
    
    with patch("api.PromptTemplate.__or__", return_value=mock_chain):
        agent = AgentFixer(mock_llm)
        tests = await agent.generate_tests("code", "error")
    
    # Should safely fail and return empty list
    assert tests == []
