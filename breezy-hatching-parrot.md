# Pydantic Integration & Pydantic AI Migration Plan

## Context

This LeetCode SRS extension has a Python MCP server (`mcp-server/`) that provides code verification and auto-fix capabilities. Currently, it uses minimal Pydantic (just one request model) and has a custom `AgentFixer` class with manual LLM integration (direct HTTP calls to Ollama, regex parsing, custom retry logic).

The user discovered **Pydantic AI** - a Python agent framework that provides structured LLM outputs, multi-provider support, automatic validation, and built-in retry logic. This could significantly simplify the current implementation.

**Key Insight**: The Python MCP server is doing manually what Pydantic AI does automatically and better. The JavaScript LLM gateway in the extension is already well-architected and should remain unchanged.

## Recommendation: YES to Pydantic AI

**Strong recommendation to adopt Pydantic AI** for the Python MCP server. Benefits:
- **~60% less code**: Current AgentFixer is ~175 lines, Pydantic AI version would be ~50-70 lines
- **Structured outputs**: Automatic validation against Pydantic schemas
- **Better error handling**: Built-in retry logic with exponential backoff
- **Multi-provider support**: Easy to switch from Ollama to OpenAI/Anthropic/Gemini
- **Type safety**: Full type hints throughout
- **Production-ready**: Built-in monitoring, logging, error handling

**Trade-offs**: New dependency, ~6-8 hours migration effort, team learning curve (~1-2 hours)

## Implementation Phases

### Phase 1: Add Response Models (2-3 hours)
**Priority: High | Risk: Low**

Add Pydantic models for API responses and internal data structures.

**Files to create:**
- `mcp-server/models.py` - All Pydantic models

**Files to modify:**
- `mcp-server/api.py` (lines 26-39, 223-247) - Update endpoints to use response models

**Models to add:**
```python
# API Response Models
class VerificationResult(BaseModel)
class AutofixResult(BaseModel)

# Internal Data Models
class TestCase(BaseModel)
class TestResult(BaseModel)
class FixAttempt(BaseModel)

# Configuration
class AgentConfig(BaseModel)

# LLM Output Validation
class LLMFixResponse(BaseModel)
class LLMTestResponse(BaseModel)
```

**Benefits:**
- Automatic OpenAPI documentation generation
- Type safety for API consumers
- Clear validation errors

### Phase 2: Migrate to Pydantic AI (6-8 hours)
**Priority: High | Risk: Medium**

Replace custom `AgentFixer` class with Pydantic AI implementation.

**Files to modify:**
- `mcp-server/requirements.txt` - Add `pydantic-ai`
- `mcp-server/api.py` (lines 45-219) - Replace AgentFixer

**Files to create:**
- `mcp-server/agent_fixer_v2.py` - New Pydantic AI implementation

**Key changes:**
1. Define structured output models (CodeFix, GeneratedTests)
2. Create Pydantic AI agents with result types
3. Replace manual HTTP calls with agent.run()
4. Remove manual JSON parsing and regex stripping
5. Remove custom retry logic (use built-in)
6. Update endpoints to use async/await

**Backward compatibility strategy:**
- Keep old AgentFixer as `AgentFixerLegacy`
- Add feature flag: `USE_PYDANTIC_AI=true` in .env
- Test side-by-side before full migration
- Easy rollback if issues arise

**Current implementation issues that Pydantic AI solves:**
- Manual HTTP calls (api.py:79-92)
- Regex stripping of markdown (api.py:88)
- No structured validation
- Custom retry logic (api.py:130-151)
- Hardcoded Ollama URL and model

### Phase 3: Configuration Management (2-3 hours)
**Priority: Medium | Risk: Low**

Use Pydantic Settings for environment-based configuration.

**Files to modify:**
- `mcp-server/models.py` - Add Settings class with BaseSettings
- `mcp-server/api.py` - Replace hardcoded values with Settings
- `mcp-server/.env` - Document all environment variables

**Configuration to add:**
```python
class Settings(BaseSettings):
    ollama_url: str = "http://localhost:11434/api/generate"
    model_name: str = "llama3.1"
    max_retries: int = 3
    temperature: float = 0.2
    e2b_api_key: str
    use_pydantic_ai: bool = False
```

### Phase 4: Update Tests (3-4 hours)
**Priority: High | Risk: Medium**

Update existing tests for new Pydantic AI implementation.

**Files to modify:**
- `mcp-server/tests/test_agent_loop.py` (lines 18-46) - Update for Pydantic AI
- `mcp-server/tests/test_autofix.py` (lines 57-92) - Update mocks

**Files to create:**
- `mcp-server/tests/test_models.py` - Test Pydantic model validation
- `mcp-server/tests/test_agent_v2.py` - Test Pydantic AI implementation

**Testing strategy:**
1. Mock Pydantic AI agents for unit tests
2. Add integration tests with real Ollama (if available)
3. Comparison tests: run both old and new, compare outputs
4. Test validation failures and error handling

## Critical Files

### Core Implementation
- [mcp-server/api.py](mcp-server/api.py) - AgentFixer class (lines 45-219), endpoints (lines 223-247)
- [mcp-server/server.py](mcp-server/server.py) - E2B sandbox integration (must remain compatible)
- [mcp-server/requirements.txt](mcp-server/requirements.txt) - Add pydantic-ai dependency

### Testing
- [mcp-server/tests/test_agent_loop.py](mcp-server/tests/test_agent_loop.py) - Retry logic tests
- [mcp-server/tests/test_autofix.py](mcp-server/tests/test_autofix.py) - Integration tests

### Configuration
- [mcp-server/.env](mcp-server/.env) - Environment variables

## Pydantic AI Implementation Example

```python
# mcp-server/agent_fixer_v2.py
from pydantic_ai import Agent
from pydantic_ai.models.ollama import OllamaModel
from pydantic import BaseModel, Field

class CodeFix(BaseModel):
    code: str = Field(..., description="Fixed Python code")
    explanation: str = Field(..., description="What was fixed")
    confidence: float = Field(ge=0.0, le=1.0)

class AgentFixerV2:
    def __init__(self):
        model = OllamaModel(
            model_name='llama3.1',
            base_url='http://localhost:11434'
        )

        self.fix_agent = Agent(
            model,
            result_type=CodeFix,
            system_prompt="You are an expert Python debugging assistant."
        )

    async def generate_fix(self, code: str, error: str, test_input: str) -> CodeFix:
        prompt = f"CODE:\n{code}\n\nERROR:\n{error}\n\nFIX IT:"
        result = await self.fix_agent.run(prompt)
        return result.data  # Already validated CodeFix instance!
```

**Key benefits over current implementation:**
- No manual JSON parsing
- Automatic validation
- Built-in retry logic
- Type-safe outputs
- ~60% less code

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Pydantic AI breaks existing tests | Keep legacy implementation, use feature flag |
| LLM outputs don't match schema | Add fallback parsing, retry with adjusted prompt |
| Performance regression | Benchmark before/after, optimize if needed |
| E2B sandbox compatibility | E2B is separate, no impact expected |

## Effort Estimation

| Phase | Hours | Priority |
|-------|-------|----------|
| Phase 1: Response models | 2-3 | High |
| Phase 2: Pydantic AI migration | 6-8 | High |
| Phase 3: Configuration | 2-3 | Medium |
| Phase 4: Update tests | 3-4 | High |
| **Total** | **13-18 hours** | |

**Recommended timeline:**
- Week 1: Phases 1 & 3 (response models + config)
- Week 2: Phase 2 (Pydantic AI migration + initial testing)
- Week 3: Phase 4 (comprehensive testing + documentation)
- Week 4: Monitoring, bug fixes, remove legacy code

## JavaScript LLM Gateway - No Changes Needed

The JavaScript LLM gateway ([src/background/llm_gateway.js](src/background/llm_gateway.js)) is already excellent:
- Multi-provider support (Gemini, OpenAI, Anthropic, local)
- Sophisticated JSON extraction with fallback strategies
- Schema validation and retry logic
- Used throughout extension for drill generation, skill analysis

**Recommendation**: Keep JavaScript gateway unchanged. It's well-architected for browser extension context.

## Verification & Testing

After implementation:

1. **Unit tests**: `cd mcp-server && pytest tests/`
2. **Manual testing**:
   - Start server: `python mcp-server/api.py`
   - Test /health endpoint: `curl http://localhost:8000/health`
   - Test /verify endpoint with sample code
   - Test /autofix endpoint with buggy code
3. **Integration testing**:
   - Test with Chrome extension
   - Verify auto-fix feature works end-to-end
   - Check E2B sandbox execution
4. **Comparison testing**:
   - Run both old and new implementations
   - Compare outputs for consistency
   - Verify performance is similar or better

## Dependencies to Add

```txt
# Add to mcp-server/requirements.txt
pydantic-ai>=0.0.14
```

Existing dependencies remain:
- fastapi
- uvicorn
- requests
- pydantic (already present)
- mcp
- e2b-code-interpreter
- python-dotenv
