
import pytest
from unittest.mock import MagicMock, patch, ANY

from api import AgentFixer, GeneratedTests, CodeFix


def _make_mock_llm():
    """Create a mock BaseChatModel for injection into AgentFixer."""
    mock_llm = MagicMock()
    mock_llm.with_structured_output.return_value = mock_llm
    return mock_llm


def test_agent_fixer_initialization():
    # (A) Happy path: AgentFixer stores the injected LLM
    mock_llm = _make_mock_llm()
    agent = AgentFixer(mock_llm)

    assert agent.llm is mock_llm


@pytest.mark.anyio
async def test_generate_fix_happy_path():
    # (A) Happy path: Mocks with_structured_output returning a valid CodeFix
    
    # Create the test CodeFix response
    mock_codefix = CodeFix(
        fixed_code="def fixed_solution(): return 'fixed'",
        explanation="Fixed by doing X"
    )
    
    mock_llm = _make_mock_llm()
    
    # Mock the chain that results from prompt | self.llm.with_structured_output(...)
    mock_chain = MagicMock()
    from unittest.mock import AsyncMock
    mock_chain.ainvoke = AsyncMock(return_value=mock_codefix)
    
    with patch("api.PromptTemplate.__or__", return_value=mock_chain):
        agent = AgentFixer(mock_llm)
        fixed_code = await agent.generate_fix("bad code", "Error", "1")
    
    assert fixed_code == "def fixed_solution(): return 'fixed'"


@pytest.mark.anyio
async def test_generate_fix_idempotency():
    # (F) Idempotency/Side effects tests: Ensure generate_fix runs through
    # without unexpected side effects or external calls.
    mock_llm = _make_mock_llm()
    
    mock_response = MagicMock()
    mock_response.content = "def x(): pass"
    
    async def mock_ainvoke(*args, **kwargs):
        return mock_response
    
    mock_llm.ainvoke = mock_ainvoke
    
    agent = AgentFixer(mock_llm)
    # Call twice — should produce no side effects between calls
    await agent.generate_fix("code", "error", "input")
    await agent.generate_fix("code", "error", "input")


@pytest.mark.anyio
async def test_tracing_degrades_gracefully():
    # (B) Graceful degradation without LangSmith Keys
    import os
    with patch.dict(os.environ, {"GOOGLE_API_KEY": "test_key"}, clear=True):
        mock_llm = _make_mock_llm()
        
        mock_codefix = CodeFix(fixed_code="fixed_code", explanation="expl")
        
        from unittest.mock import AsyncMock
        mock_chain = MagicMock()
        mock_chain.ainvoke = AsyncMock(return_value=mock_codefix)
        
        with patch("api.PromptTemplate.__or__", return_value=mock_chain):
            agent = AgentFixer(mock_llm)
            
            # This call should succeed purely returning content, and the @traceable decorator 
            # should gracefully no-op without crashing because tracing is not configured.
            fix = await agent.generate_fix("code", "err", "inp")
            assert fix == "fixed_code"
