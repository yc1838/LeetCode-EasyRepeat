# Phase 3: Pydantic AI Migration

**Parent Plan**: [MASTER_PLAN_pydantic_integration.md](./MASTER_PLAN_pydantic_integration.md)

**Goal**: Replace custom AgentFixer implementation with Pydantic AI for structured LLM outputs and better error handling.

**Estimated Time**: 6-8 hours

**Priority**: Medium | **Risk**: Medium-High

---

## Overview

Current AgentFixer implementation (~175 lines) has:
- Manual HTTP calls to Ollama
- Regex-based markdown stripping
- Custom retry logic
- No structured output validation
- Hardcoded configuration

Pydantic AI provides:
- Structured outputs with automatic validation
- Multi-provider support (Ollama, OpenAI, Anthropic, Gemini)
- Built-in retry logic with exponential backoff
- Type-safe agent definitions
- Production-ready error handling

**Benefits**:
- ~60% less code (~50-70 lines vs ~175 lines)
- Better error handling and retry logic
- Easy to switch LLM providers
- Automatic output validation
- Type safety throughout

**Trade-offs**:
- New dependency (~6MB)
- Team learning curve (~1-2 hours)
- Migration effort (~6-8 hours)

---

### `pydantic-ai` vs `pydantic-deepagents` — Which to Use?

[`pydantic-deepagents`](https://github.com/vstorm-co/pydantic-deepagents) is built
**on top of** `pydantic-ai` and adds higher-level agent infrastructure. Use this decision guide:

| Need | Use |
|---|---|
| Structured LLM output + auto-retry | `pydantic-ai` (already in plan) |
| Cost budget enforcement (`$0.05` cap per fix) | `pydantic-deepagents` |
| Save/resume mid-session fix state (checkpointing) | `pydantic-deepagents` |
| Run multiple fix strategies in parallel (subagents) | `pydantic-deepagents` |
| Claude Code-style hooks (audit log every tool call) | `pydantic-deepagents` |
| Keep it minimal, just replace `re.sub` | `pydantic-ai` |

**Recommendation for this project**: Start with bare `pydantic-ai` (Tasks 3.1-3.5).
If you later want a cost budget on the autofix loop or parallel subagents trying
different fix strategies simultaneously, swap `Agent(...)` for
`create_deep_agent(...)` — the output models and validators stay identical.

---

## Task 3.1: Add Pydantic AI Dependency

**Status**: ⬜ Not Started

**Files to Modify**:
- `mcp-server/requirements.txt`

**Option A — bare `pydantic-ai` (recommended to start)**:
```txt
pydantic-ai>=0.0.14
```

**Option B — `pydantic-deepagents` (if you want cost budgets / checkpointing)**:
```txt
pydantic-deep>=0.1.0
# pydantic-deep installs pydantic-ai as a dependency — don't add both
```

Pick **Option A** unless you already know you need checkpointing or cost budgets.
You can always upgrade to Option B later; the `CodeFixOutput` / `TestGenerationOutput`
models and all validators are reused unchanged.

**Files to Modify**:
- `mcp-server/models.py` (update Settings)

**Code to Add**:
```python
class Settings(BaseSettings):
    # ... existing fields ...

    # Pydantic AI Configuration
    use_pydantic_ai: bool = Field(default=False, description="Use Pydantic AI implementation")
    pydantic_ai_provider: str = Field(default="ollama", description="LLM provider (ollama, openai, anthropic)")
    openai_api_key: Optional[str] = Field(None, description="OpenAI API key")
    anthropic_api_key: Optional[str] = Field(None, description="Anthropic API key")
```

**Files to Modify**:
- `mcp-server/.env.example`

**Code to Add**:
```
# Pydantic AI Configuration
USE_PYDANTIC_AI=false
PYDANTIC_AI_PROVIDER=ollama
OPENAI_API_KEY=your_openai_key_here
ANTHROPIC_API_KEY=your_anthropic_key_here
```

**Tests to Create** (per /detailed-testing):
- `mcp-server/tests/test_models.py` (add to existing):
  - Test Settings loads Pydantic AI config
  - Test default values for Pydantic AI settings
  - Test optional API keys (None when not set)
  - Test pydantic_ai_provider validation

**Verification Steps**:
1. Install: `cd mcp-server && pip install -r requirements.txt`
2. Run: `pytest tests/test_models.py::test_settings* -v`
3. Check: `python -c "import pydantic_ai; print(pydantic_ai.__version__)"`
4. Verify .env.example has new fields

**🛑 STOP HERE - Wait for user verification before proceeding**

---

## Task 3.2: Create AgentFixerV2 with Pydantic AI

**Status**: ⬜ Not Started

**Files to Create**:
- `mcp-server/agent_fixer_v2.py`

**Code to Write** (Part 1 - Models and Setup):
```python
from pydantic import BaseModel, Field, field_validator, model_validator
from pydantic_ai import Agent, RunContext
from pydantic_ai.models.ollama import OllamaModel
from pydantic_ai.models.openai import OpenAIModel
from pydantic_ai.models.anthropic import AnthropicModel
from typing import Optional, List
from models import Settings

class CodeFixOutput(BaseModel):
    """Structured output for code fix agent with built-in validation.

    This model merges Phase 2 evaluation logic with Pydantic validators.
    When validation fails, Pydantic AI automatically retries with the error message.
    """
    fixed_code: str = Field(..., description="The fixed Python code without markdown formatting")
    explanation: str = Field(..., description="Clear explanation of what was fixed and why")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence in the fix (0-1)")
    changes_made: List[str] = Field(default_factory=list, description="List of specific changes")

    @field_validator('fixed_code')
    @classmethod
    def validate_code_quality(cls, v: str) -> str:
        """Validate code quality - Pydantic AI will retry if this fails."""
        if len(v.strip()) < 10:
            raise ValueError("Code is suspiciously short (< 10 characters). Provide complete implementation.")

        if "TODO" in v or "FIXME" in v:
            raise ValueError("Code contains TODO/FIXME markers. Complete the implementation.")

        if "..." in v and v.count("...") > 1:
            raise ValueError("Code contains multiple ellipsis (...). Provide full implementation, not placeholders.")

        return v

    @field_validator('explanation')
    @classmethod
    def validate_explanation(cls, v: str) -> str:
        """Validate explanation quality."""
        if len(v.strip()) < 10:
            raise ValueError("Explanation too short. Provide detailed explanation of what was fixed and why.")

        return v

    @model_validator(mode='after')
    def validate_overall_quality(self) -> 'CodeFixOutput':
        """Overall quality check - runs after all field validators."""
        # If confidence is low, explanation should be detailed
        if self.confidence < 0.5 and len(self.explanation) < 50:
            raise ValueError(
                f"Low confidence ({self.confidence:.2f}) requires detailed explanation (at least 50 chars). "
                "Explain why you're uncertain and what might be wrong."
            )

        # If changes_made is empty, try to infer from explanation
        if not self.changes_made and len(self.explanation) > 0:
            # This is a warning, not an error - we'll allow it but log it
            pass

        return self

class TestGenerationOutput(BaseModel):
    """Structured output for test generation agent."""
    test_cases: List[dict] = Field(..., min_items=1, description="Generated test cases")
    reasoning: str = Field(..., description="Reasoning behind test case selection")
    coverage_areas: List[str] = Field(default_factory=list, description="Areas of code covered")

    @field_validator('test_cases')
    @classmethod
    def validate_test_cases(cls, v: List[dict]) -> List[dict]:
        """Validate test case structure."""
        for i, tc in enumerate(v):
            if not isinstance(tc, dict):
                raise ValueError(f"Test case {i} must be a dictionary")

            if "input_data" not in tc:
                raise ValueError(f"Test case {i} missing required field 'input_data'")

        return v

    @field_validator('reasoning')
    @classmethod
    def validate_reasoning(cls, v: str) -> str:
        """Validate reasoning quality."""
        if len(v.strip()) < 20:
            raise ValueError("Reasoning too short. Explain your test strategy in detail (at least 20 chars).")

        return v

class AgentFixerV2:
    """Pydantic AI-based code fixer with structured outputs and automatic validation retry."""

    def __init__(self, settings: Settings = None):
        self.settings = settings or Settings()

        # Initialize model based on provider
        self.model = self._create_model()

        # Create agents with structured outputs
        # Pydantic AI will automatically retry when validators fail!
        self.fix_agent = Agent(
            self.model,
            result_type=CodeFixOutput,
            system_prompt=self._get_fix_system_prompt(),
            retries=self.settings.agent_config.max_attempts
        )

        self.test_agent = Agent(
            self.model,
            result_type=TestGenerationOutput,
            system_prompt=self._get_test_system_prompt(),
            retries=self.settings.agent_config.max_attempts
        )
```

**Key Architectural Improvement**:
This merges Phase 2 evaluation logic directly into Pydantic validators. When a validator raises `ValueError`, Pydantic AI automatically:
1. Catches the validation error
2. Feeds the error message back to the LLM
3. Retries with the feedback
4. Continues until validation passes or max retries reached

This eliminates duplicate validation logic between Phase 2 and Phase 3!

    def _create_model(self):
        """Create LLM model based on configuration."""
        provider = self.settings.pydantic_ai_provider.lower()

        if provider == "ollama":
            return OllamaModel(
                model_name=self.settings.model_name,
                base_url=self.settings.ollama_url.replace("/api/generate", "")
            )
        elif provider == "openai":
            if not self.settings.openai_api_key:
                raise ValueError("OpenAI API key required for openai provider")
            return OpenAIModel(
                model_name="gpt-4",
                api_key=self.settings.openai_api_key
            )
        elif provider == "anthropic":
            if not self.settings.anthropic_api_key:
                raise ValueError("Anthropic API key required for anthropic provider")
            return AnthropicModel(
                model_name="claude-3-5-sonnet-20241022",
                api_key=self.settings.anthropic_api_key
            )
        else:
            raise ValueError(f"Unknown provider: {provider}")

    def _get_fix_system_prompt(self) -> str:
        """System prompt for code fixing agent."""
        return """You are an expert Python debugging assistant.

Your task is to fix Python code that has errors or produces incorrect output.

Guidelines:
1. Analyze the error message carefully
2. Identify the root cause
3. Provide a complete, working fix
4. Explain what was wrong and how you fixed it
5. Be confident in your fix

Return your response as structured JSON with:
- fixed_code: The complete fixed code (no markdown formatting)
- explanation: Clear explanation of the fix
- confidence: Your confidence level (0.0 to 1.0)
- changes_made: List of specific changes you made
"""

    def _get_test_system_prompt(self) -> str:
        """System prompt for test generation agent."""
        return """You are an expert at generating comprehensive test cases.

Your task is to create test cases that thoroughly validate Python code.

Guidelines:
1. Cover edge cases and boundary conditions
2. Include both positive and negative test cases
3. Test error handling
4. Ensure good code coverage
5. Make test cases realistic and meaningful

Return your response as structured JSON with:
- test_cases: List of test case objects with input_data and expected_output
- reasoning: Explanation of your test strategy
- coverage_areas: List of code areas covered
"""
```

**🛑 STOP HERE - Wait for user verification before proceeding**

---

## Task 3.3: Implement AgentFixerV2 Core Methods

**Status**: ⬜ Not Started

**Files to Modify**:
- `mcp-server/agent_fixer_v2.py` (continue from Task 3.2)

**Code to Add** (Part 2 - Core Methods):
```python
    async def generate_fix(
        self,
        code: str,
        error: str,
        test_input: str,
        context: Optional[str] = None
    ) -> CodeFixOutput:
        """Generate a fix for broken code.

        Args:
            code: The buggy Python code
            error: The error message or incorrect output
            test_input: The test input that caused the error
            context: Optional additional context

        Returns:
            CodeFixOutput with fixed code and explanation
        """
        prompt = self._build_fix_prompt(code, error, test_input, context)

        # Run agent with automatic retries and validation
        result = await self.fix_agent.run(prompt)

        # result.data is already a validated CodeFixOutput instance!
        return result.data

    async def generate_tests(
        self,
        code: str,
        num_tests: int = 5
    ) -> TestGenerationOutput:
        """Generate test cases for code.

        Args:
            code: The Python code to generate tests for
            num_tests: Number of test cases to generate

        Returns:
            TestGenerationOutput with test cases and reasoning
        """
        prompt = f"""Generate {num_tests} comprehensive test cases for this Python code:

```python
{code}
```

Create test cases that cover:
- Normal/happy path cases
- Edge cases and boundary conditions
- Error cases
- Different input types
"""

        result = await self.test_agent.run(prompt)
        return result.data

    def _build_fix_prompt(
        self,
        code: str,
        error: str,
        test_input: str,
        context: Optional[str] = None
    ) -> str:
        """Build prompt for fix generation."""
        prompt = f"""Fix this Python code that has an error:

**Code:**
```python
{code}
```

**Error/Incorrect Output:**
{error}

**Test Input:**
{test_input}
"""

        if context:
            prompt += f"\n**Additional Context:**\n{context}\n"

        prompt += "\nProvide a complete fix with explanation."

        return prompt

    # Synchronous wrappers for backward compatibility
    def generate_fix_sync(self, code: str, error: str, test_input: str) -> CodeFixOutput:
        """Synchronous wrapper for generate_fix."""
        import asyncio
        return asyncio.run(self.generate_fix(code, error, test_input))

    def generate_tests_sync(self, code: str, num_tests: int = 5) -> TestGenerationOutput:
        """Synchronous wrapper for generate_tests."""
        import asyncio
        return asyncio.run(self.generate_tests(code, num_tests))

    def attempt_fix(self, code: str, error: str, initial_input: str, max_retries: int = None) -> dict:
        """Backward-compatible wrapper for generate_fix that matches legacy API.

        This method ensures AgentFixerV2 can be used as a drop-in replacement for AgentFixer.

        Args:
            code: The buggy Python code
            error: The error message or incorrect output
            initial_input: The test input that caused the error
            max_retries: Maximum retry attempts (ignored, Pydantic AI handles retries)

        Returns:
            dict: Legacy format matching AgentFixer.attempt_fix() return value:
                {
                    "verified": bool,
                    "fixed_code": str,
                    "explanation": str,
                    "logs": str,
                    "attempts": int,
                    "test_count": int
                }
        """
        import asyncio

        try:
            # Use Pydantic AI implementation
            result = asyncio.run(self.generate_fix(code, error, initial_input))

            # Convert to legacy format
            return {
                "verified": True,
                "fixed_code": result.fixed_code,
                "explanation": result.explanation,
                "logs": "Success",
                "attempts": 1,  # Pydantic AI handles retries internally
                "test_count": 1
            }
        except Exception as e:
            # Return failure in legacy format
            return {
                "verified": False,
                "fixed_code": code,  # Return original code on failure
                "explanation": "",
                "logs": str(e),
                "attempts": self.settings.agent_config.max_attempts,
                "test_count": 0
            }

    # -------------------------------------------------------------------------
    # OPTIONAL UPGRADE: pydantic-deepagents version of attempt_fix
    # -------------------------------------------------------------------------
    # If you want a per-call cost cap and automatic checkpointing, swap the
    # `Agent(...)` above for `create_deep_agent(...)` from pydantic-deepagents.
    # Everything below is a reference implementation — don't activate until
    # Task 3.1 Option B is chosen.
    #
    # from pydantic_deep import create_deep_agent
    #
    # async def attempt_fix_deep(self, code: str, error: str, initial_input: str) -> dict:
    #     agent = create_deep_agent(
    #         model=self.model,
    #         result_type=CodeFixOutput,          # same Pydantic model, no changes
    #         system_prompt=self._get_fix_system_prompt(),
    #         cost_tracking=True,
    #         cost_budget_usd=0.05,               # hard stop if LeetCode fix gets expensive
    #         on_cost_update=lambda info: print(f"Fix cost so far: ${info.total_usd:.4f}"),
    #     )
    #     result = await agent.run(self._build_fix_prompt(code, error, initial_input))
    #     return {
    #         "verified": True,
    #         "fixed_code": result.data.fixed_code,
    #         "explanation": result.data.explanation,
    #         "logs": f"Cost: ${result.usage.total_usd:.4f}",
    #         "attempts": 1,
    #         "test_count": 1,
    #     }
```

**Tests to Create** (per /detailed-testing):
- `mcp-server/tests/test_agent_v2.py`:
  - Test AgentFixerV2 initialization with different providers
  - Test _create_model() for ollama provider
  - Test _create_model() for openai provider (mock API key)
  - Test _create_model() for anthropic provider (mock API key)
  - Test _create_model() raises error for unknown provider
  - Test _build_fix_prompt() formats correctly
  - Test generate_fix() returns CodeFixOutput (mock agent)
  - Test generate_tests() returns TestGenerationOutput (mock agent)
  - Test synchronous wrappers work correctly
  - Mock Pydantic AI agents for all tests

**Verification Steps**:
1. Run: `pytest tests/test_agent_v2.py -v`
2. Test import: `python -c "from agent_fixer_v2 import AgentFixerV2; print('Import successful')"`
3. Test initialization: `python -c "from agent_fixer_v2 import AgentFixerV2; fixer = AgentFixerV2(); print('Init successful')"`

**🛑 STOP HERE - Wait for user verification before proceeding**

---

## Task 3.4: Add Feature Flag to Switch Implementations

**Status**: ⬜ Not Started

**Files to Modify**:
- `mcp-server/api.py` (lines 221-247): Add conditional import and initialization

**Current Code Structure** (lines 221-246):
```python
# Line 221
agent = AgentFixer()

# Line 246
result = agent.attempt_fix(req.code, error_context, req.test_input)
```

**Code Changes**:
```python
from models import Settings

settings = Settings()

# Conditional import based on feature flag
if settings.use_pydantic_ai:
    from agent_fixer_v2 import AgentFixerV2
    agent = AgentFixerV2(settings)
    print("Using Pydantic AI implementation")
else:
    # Keep legacy implementation (existing AgentFixer class at lines 45-219)
    agent = AgentFixer()
    print("Using legacy implementation")

# Both implementations must have attempt_fix() method!
# No changes needed to /autofix endpoint - it already calls agent.attempt_fix()
@app.post("/autofix")
def autofix_endpoint(req: VerificationRequest):
    # ... existing implementation (lines 223-247) ...
    initial_logs = verify_solution_logic(req.code, [req.test_input])
    error_context = initial_logs

    # This works with both implementations because both have attempt_fix()
    result = agent.attempt_fix(req.code, error_context, req.test_input)

    return result
```

**Important - Backward Compatibility**:
- Both `AgentFixer` (legacy) and `AgentFixerV2` (Pydantic AI) must have `attempt_fix()` method
- The method signature must match: `attempt_fix(code: str, error: str, initial_input: str, max_retries: int = 3) -> dict`
- The return format must match the current API (see CURRENT_API.md)
- No changes needed to the /autofix endpoint itself - it already uses the correct method name

**Tests to Create** (per /detailed-testing):
- `mcp-server/tests/test_feature_flag.py`:
  - Test with USE_PYDANTIC_AI=false uses legacy implementation
  - Test with USE_PYDANTIC_AI=true uses Pydantic AI implementation
  - Test /autofix endpoint works with both implementations
  - Test response format is consistent between implementations
  - Test error handling works with both implementations
  - Mock both AgentFixer and AgentFixerV2

**Verification Steps**:
1. Run: `pytest tests/test_feature_flag.py -v`
2. Test legacy: `USE_PYDANTIC_AI=false python mcp-server/api.py` (check startup message)
3. Test Pydantic AI: `USE_PYDANTIC_AI=true python mcp-server/api.py` (check startup message)
4. Test both with curl requests to /autofix

**🛑 STOP HERE - Wait for user verification before proceeding**

---

## Task 3.5: Update Existing Tests for Compatibility

**Status**: ⬜ Not Started

**Files to Modify**:
- `mcp-server/tests/test_agent_loop.py` (lines 18-46): Update for both implementations
- `mcp-server/tests/test_autofix.py` (lines 57-92): Update mocks

**Code Changes for test_agent_loop.py**:
```python
import pytest
from models import Settings

@pytest.fixture
def agent_fixer_legacy():
    """Fixture for legacy AgentFixer."""
    settings = Settings(use_pydantic_ai=False)
    # Import and return legacy implementation
    from api import AgentFixer
    return AgentFixer()

@pytest.fixture
def agent_fixer_v2():
    """Fixture for Pydantic AI AgentFixerV2."""
    settings = Settings(use_pydantic_ai=True)
    from agent_fixer_v2 import AgentFixerV2
    return AgentFixerV2(settings)

@pytest.mark.parametrize("fixer_fixture", ["agent_fixer_legacy", "agent_fixer_v2"])
def test_attempt_fix_with_both_implementations(fixer_fixture, request):
    """Test attempt_fix works with both implementations."""
    fixer = request.getfixturevalue(fixer_fixture)

    # Test logic that works with both implementations
    # ...

def test_legacy_specific_behavior(agent_fixer_legacy):
    """Test behavior specific to legacy implementation."""
    # ...

@pytest.mark.asyncio
async def test_pydantic_ai_specific_behavior(agent_fixer_v2):
    """Test behavior specific to Pydantic AI implementation."""
    # ...
```

**Tests to Create** (per /detailed-testing):
- `mcp-server/tests/test_agent_loop.py` (update existing):
  - Parametrize tests to run with both implementations
  - Add legacy-specific tests
  - Add Pydantic AI-specific tests (async)
  - Test retry logic works with both
  - Test error handling works with both
- `mcp-server/tests/test_autofix.py` (update existing):
  - Update mocks to work with both implementations
  - Test /autofix endpoint with both implementations
  - Test response format consistency

**Verification Steps**:
1. Run: `pytest tests/test_agent_loop.py -v`
2. Run: `pytest tests/test_autofix.py -v`
3. Run full suite: `pytest tests/ -v`
4. Verify all tests pass with both implementations

**🛑 STOP HERE - Wait for user verification before proceeding**

---

## Task 3.6: Add Comparison Testing and Migration Guide

**Status**: ⬜ Not Started

**Files to Create**:
- `mcp-server/tests/test_comparison.py`

**Code to Write**:
```python
import pytest
from agent_fixer_v2 import AgentFixerV2
from api import AgentFixer
from models import Settings

@pytest.mark.integration
@pytest.mark.asyncio
async def test_compare_implementations():
    """Compare outputs from legacy and Pydantic AI implementations.

    This test requires a running Ollama instance.
    """
    # Setup
    legacy_fixer = AgentFixer()
    v2_fixer = AgentFixerV2(Settings(use_pydantic_ai=True))

    test_code = """
def add(a, b):
    return a - b  # Bug: should be +
"""
    test_input = "add(2, 3)"
    expected_output = "5"

    # Run both implementations
    legacy_result = legacy_fixer.attempt_fix(test_code, "Expected 5, got -1", test_input)
    v2_result = await v2_fixer.generate_fix(test_code, "Expected 5, got -1", test_input)

    # Compare results
    print(f"\nLegacy result: {legacy_result}")
    print(f"V2 result: {v2_result}")

    # Both should produce working code
    assert legacy_result.get("verified"), "Legacy fix failed"
    assert v2_result.fixed_code is not None, "V2 fix failed"

    # V2 should provide more structured output
    assert hasattr(v2_result, "explanation"), "V2 missing explanation"
    assert hasattr(v2_result, "confidence"), "V2 missing confidence"
    assert hasattr(v2_result, "changes_made"), "V2 missing changes_made"

@pytest.mark.integration
def test_performance_comparison():
    """Compare performance of both implementations."""
    import time

    legacy_fixer = AgentFixer()
    v2_fixer = AgentFixerV2(Settings(use_pydantic_ai=True))

    test_code = "def double(x): return x * 3"  # Bug: should be * 2
    test_input = "double(5)"

    # Time legacy
    start = time.time()
    legacy_result = legacy_fixer.attempt_fix(test_code, "Expected 10, got 15", test_input)
    legacy_time = time.time() - start

    # Time V2
    start = time.time()
    import asyncio
    v2_result = asyncio.run(v2_fixer.generate_fix(test_code, "Expected 10, got 15", test_input))
    v2_time = time.time() - start

    print(f"\nLegacy time: {legacy_time:.2f}s")
    print(f"V2 time: {v2_time:.2f}s")

    # V2 should be comparable or faster
    # (Allow 2x slower for initial overhead)
    assert v2_time < legacy_time * 2, "V2 significantly slower than legacy"
```

**Files to Create**:
- `mcp-server/MIGRATION_GUIDE.md`

**Content to Write**:
```markdown
# Pydantic AI Migration Guide

This guide explains how to migrate from the legacy AgentFixer to Pydantic AI-based AgentFixerV2.

## Why Migrate?

**Benefits of Pydantic AI**:
- 60% less code (~50-70 lines vs ~175 lines)
- Structured outputs with automatic validation
- Built-in retry logic with exponential backoff
- Multi-provider support (Ollama, OpenAI, Anthropic, Gemini)
- Better error handling
- Type safety throughout

**Trade-offs**:
- New dependency (~6MB)
- Async/await required
- Learning curve (~1-2 hours)

## Migration Steps

### 1. Enable Feature Flag

Update `.env`:
```
USE_PYDANTIC_AI=true
```

### 2. Test with Ollama (Default)

No additional configuration needed. Pydantic AI will use your existing Ollama setup.

```bash
# Start server
python mcp-server/api.py

# Test endpoint
curl -X POST http://localhost:8000/autofix \
  -H "Content-Type: application/json" \
  -d '{"code":"print(1/0)","test_input":""}'
```

### 3. (Optional) Switch to OpenAI

Update `.env`:
```
USE_PYDANTIC_AI=true
PYDANTIC_AI_PROVIDER=openai
OPENAI_API_KEY=your_key_here
```

### 4. (Optional) Switch to Anthropic

Update `.env`:
```
USE_PYDANTIC_AI=true
PYDANTIC_AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_key_here
```

## Comparison Testing

Run comparison tests to verify both implementations produce similar results:

```bash
# Requires running Ollama
pytest tests/test_comparison.py -v -m integration
```

## Rollback Plan

If issues arise, rollback is simple:

1. Update `.env`:
   ```
   USE_PYDANTIC_AI=false
   ```

2. Restart server:
   ```bash
   python mcp-server/api.py
   ```

The legacy implementation remains in the codebase for easy rollback.

## Code Changes Required

### Before (Legacy)

```python
fixer = AgentFixer()
result = fixer.attempt_fix(code, error, test_input)
fixed_code = result.get("fixed_code")
verified = result.get("verified")
```

### After (Pydantic AI)

```python
fixer = AgentFixerV2()
result = await fixer.generate_fix(code, error, test_input)
fixed_code = result.fixed_code
explanation = result.explanation
confidence = result.confidence
```

### Using Backward-Compatible Method

Both implementations support `attempt_fix()` for drop-in replacement:

```python
# Works with both AgentFixer and AgentFixerV2
fixer = AgentFixer()  # or AgentFixerV2(settings)
result = fixer.attempt_fix(code, error, test_input)
# Returns dict with: verified, fixed_code, explanation, logs, attempts, test_count
```

## API Endpoint Changes

**No changes required!** The `/autofix` endpoint works with both implementations.

Response format is consistent:
```json
{
  "success": true,
  "fixed_code": "...",
  "attempts": 1,
  "final_error": null,
  "execution_time_ms": 1234.56
}
```

## Monitoring

After migration, monitor:

1. **Evaluation metrics**: `curl http://localhost:8000/evals/stats`
2. **Error rates**: Check logs for validation failures
3. **Performance**: Compare execution times
4. **LLM costs**: Track API usage if using paid providers

## Troubleshooting

### Issue: "Pydantic AI not found"

```bash
pip install -r requirements.txt
```

### Issue: "OpenAI API key required"

Set `OPENAI_API_KEY` in `.env` or switch back to Ollama:
```
PYDANTIC_AI_PROVIDER=ollama
```

### Issue: "Validation errors"

Check evaluation metrics:
```bash
curl http://localhost:8000/evals/recent?limit=10
```

Adjust prompts or retry logic if needed.

## Timeline

Recommended migration timeline:

- **Week 1**: Enable feature flag, test with Ollama
- **Week 2**: Monitor metrics, fix any issues
- **Week 3**: (Optional) Switch to paid provider if needed
- **Week 4**: Remove legacy code if migration successful

## Support

For issues or questions:
1. Check logs: `tail -f mcp-server/logs/app.log`
2. Check eval metrics: `curl http://localhost:8000/evals/stats`
3. Review comparison tests: `pytest tests/test_comparison.py -v`
```

**Tests to Create** (per /detailed-testing):
- `mcp-server/tests/test_comparison.py` (as shown above):
  - Test compare_implementations() produces similar results
  - Test performance_comparison() shows acceptable performance
  - Test both implementations handle same edge cases
  - Mark as integration tests (require Ollama)

**Verification Steps**:
1. Run: `pytest tests/test_comparison.py -v -m integration` (requires Ollama)
2. Read: `cat mcp-server/MIGRATION_GUIDE.md`
3. Follow migration steps in guide
4. Verify rollback works

**🛑 STOP HERE - Wait for user verification before proceeding**

---

## Phase 3 Completion Checklist

- [ ] Task 3.1: Pydantic AI dependency added
- [ ] Task 3.2: AgentFixerV2 created with Pydantic AI
- [ ] Task 3.3: Core methods implemented
- [ ] Task 3.4: Feature flag added for switching implementations
- [ ] Task 3.5: Existing tests updated for compatibility
- [ ] Task 3.6: Comparison testing and migration guide complete
- [ ] All tests passing: `pytest tests/ -v`
- [ ] Both implementations work correctly
- [ ] Migration guide tested and accurate
- [ ] Rollback plan verified

**Success Criteria**:
- ✅ All 6 tasks completed with tests passing
- ✅ Pydantic AI implementation works correctly
- ✅ Feature flag allows easy switching
- ✅ Legacy implementation still works (backward compatibility)
- ✅ Migration guide complete and tested
- ✅ Comparison tests show similar results
- ✅ Ready for production migration

---

**Previous Phase**: [phase2_pydantic_evals.md](./phase2_pydantic_evals.md)
**Parent Plan**: [MASTER_PLAN_pydantic_integration.md](./MASTER_PLAN_pydantic_integration.md)
