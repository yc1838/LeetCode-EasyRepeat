# Phase 0: Align with Current Implementation

**Parent Plan**: [MASTER_PLAN_pydantic_integration.md](./MASTER_PLAN_pydantic_integration.md)

**Goal**: Fix implementation mismatches between the original plans and the current codebase before starting Phase 1.

**Estimated Time**: 1-2 hours

**Priority**: CRITICAL | **Risk**: Low

---

## Overview

The original Phase 1-3 plans were created based on assumptions about the codebase that don't match the actual implementation. This phase corrects those mismatches to ensure the plans are executable.

**Critical Mismatches Identified**:
1. Method names don't match (`_call_llm()` vs `generate_fix()`, `fix_code()` vs `attempt_fix()`)
2. Response formats would break the JavaScript extension
3. LLM response format assumptions (structured JSON vs single string)
4. Settings instantiation would prevent server startup
5. Missing `pydantic-settings` dependency
6. Effort estimates inconsistent between master and phase plans

---

## Task 0.1: Document Current API Contracts

**Status**: ⬜ Not Started

**Files to Create**:
- `mcp-server/docs/CURRENT_API.md`

**Content to Write**:
```markdown
# Current API Contracts (Before Pydantic Integration)

## Endpoints

### GET /health
**Response**:
```json
{"status": "ok"}
```

### POST /verify
**Request**:
```json
{
  "code": "string",
  "test_input": "string"
}
```

**Response**:
```json
{
  "result": "string"  // JSON string or error message
}
```

### POST /autofix
**Request**:
```json
{
  "code": "string",
  "test_input": "string"
}
```

**Response** (Success):
```json
{
  "verified": true,
  "fixed_code": "string",
  "explanation": "string",
  "logs": "string",
  "attempts": number,
  "test_count": number
}
```

**Response** (Failure):
```json
{
  "verified": false,
  "fixed_code": "string",
  "logs": "string",
  "history": [...]
}
```

## AgentFixer Class

### Methods
- `generate_fix(code: str, error: str, test_input: str) -> str`
- `generate_tests(code: str, error: str) -> list[str]`
- `verify_fix(code: str, test_inputs: list[str]) -> tuple[bool, str]`
- `attempt_fix(code: str, error: str, initial_input: str, max_retries: int = 3) -> dict`

### LLM Response Format
Ollama returns:
```json
{
  "response": "single string with code or JSON"
}
```

NOT structured fields like `{"fixed_code": "...", "explanation": "..."}`.

## Breaking Change Considerations

Any changes to response formats MUST maintain backward compatibility with the JavaScript extension.

**Approach**: Add new fields while keeping old fields, then deprecate old fields in a future release.
```

**Tests to Create**: None (documentation only)

**Verification Steps**:
1. Read: `cat mcp-server/docs/CURRENT_API.md`
2. Verify all endpoints and methods are documented
3. Confirm with actual api.py implementation

**🛑 STOP HERE - Wait for user verification before proceeding**

---

## Task 0.2: Update Phase 1 for Backward Compatibility

**Status**: ⬜ Not Started

**Files to Modify**:
- `plans/phase1_pydantic_models.md`

**Changes to Make**:

### 1. Update Task 1.5 (/verify endpoint)
**Change response to be ADDITIVE**:
```python
@app.post("/verify")
async def verify_code(request: VerificationRequest):
    # ... existing implementation ...

    # OLD FORMAT (keep for backward compatibility)
    legacy_response = {"result": result}

    # NEW FORMAT (add structured data)
    structured_response = VerificationResult(
        success=success,
        output=output,
        error=error,
        execution_time_ms=execution_time_ms
    )

    # Return both formats
    return {
        **legacy_response,  # Keep old "result" field
        "structured": structured_response.model_dump()  # Add new structured field
    }
```

### 2. Update Task 1.6 (/autofix endpoint)
**Change response to be ADDITIVE**:
```python
@app.post("/autofix")
async def autofix_code(request: VerificationRequest):
    result = agent.attempt_fix(...)

    # OLD FORMAT (keep for backward compatibility)
    legacy_response = result  # Already has verified, fixed_code, etc.

    # NEW FORMAT (add structured data)
    structured_response = AutofixResult(
        success=result.get("verified", False),
        fixed_code=result.get("fixed_code"),
        attempts=result.get("attempts", 0),
        final_error=result.get("logs") if not result.get("verified") else None,
        execution_time_ms=execution_time_ms
    )

    # Return both formats
    return {
        **legacy_response,  # Keep all old fields
        "structured": structured_response.model_dump()  # Add new structured field
    }
```

### 3. Update Settings to be optional
**Change e2b_api_key to optional with default**:
```python
class Settings(BaseSettings):
    # ... other fields ...

    # Make optional to prevent startup failure
    e2b_api_key: Optional[str] = Field(None, description="E2B API key for sandbox execution")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        env_nested_delimiter = "__"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Validate at runtime, not import time
        if not self.e2b_api_key:
            import warnings
            warnings.warn("E2B_API_KEY not set. Sandbox execution will fail.")
```

**Tests to Create**: None (plan update only)

**Verification Steps**:
1. Read updated phase1_pydantic_models.md
2. Verify backward compatibility approach
3. Confirm no breaking changes

**🛑 STOP HERE - Wait for user verification before proceeding**

---

## Task 0.3: Update Phase 2 for Current LLM Response Format

**Status**: ⬜ Not Started

**Files to Modify**:
- `plans/phase2_pydantic_evals.md`

**Changes to Make**:

### 1. Update Task 2.2 to handle string responses
**Current reality**: Ollama returns `{"response": "string"}`, not structured JSON.

**Two approaches**:

**Approach A: Parse string response (simpler, works now)**
```python
def _call_llm(self, prompt: str) -> str:
    # ... existing HTTP call ...
    raw = res.json().get('response', '').strip()

    # Try to parse as JSON (if LLM returned JSON string)
    try:
        parsed = json.loads(raw)
        eval_result = self.code_fix_evaluator.evaluate(parsed)
    except json.JSONDecodeError:
        # LLM returned plain text, create minimal structure
        parsed = {"fixed_code": raw, "explanation": ""}
        eval_result = self.code_fix_evaluator.evaluate(parsed)

    # ... rest of logic ...
```

**Approach B: Update prompts to request JSON (better, requires prompt changes)**
```python
def generate_fix(self, code: str, error: str, test_input: str) -> str:
    prompt = f"""
    You are an expert Python coding assistant.

    CODE:
    {code}

    ERROR:
    {error}

    Task: Fix the code and return a JSON object with:
    {{
      "fixed_code": "the complete fixed code",
      "explanation": "what you fixed and why",
      "confidence": 0.8,
      "changes_made": ["change 1", "change 2"]
    }}

    CRITICAL: Return ONLY valid JSON. No markdown, no explanation outside JSON.
    """
    # ... rest of implementation ...
```

**Recommendation**: Use Approach B (update prompts) in Task 2.2.

### 2. Add Task 2.1.5: Update LLM Prompts for Structured Output
**New subtask before evaluation integration**:
- Update `generate_fix()` prompt to request JSON
- Update `generate_tests()` prompt to request JSON (already does this)
- Test that Ollama returns valid JSON
- Add fallback parsing for non-JSON responses

**Tests to Create**: None (plan update only)

**Verification Steps**:
1. Read updated phase2_pydantic_evals.md
2. Verify approach matches current LLM response format
3. Confirm prompts will be updated before evaluation

**🛑 STOP HERE - Wait for user verification before proceeding**

---

## Task 0.4: Update Phase 3 Method Names

**Status**: ⬜ Not Started

**Files to Modify**:
- `plans/phase3_pydantic_ai.md`

**Changes to Make**:

### 1. Fix method name references
**Replace all references**:
- `fix_code()` → `attempt_fix()`
- `_call_llm()` → `generate_fix()`

### 2. Update Task 3.4 feature flag logic
**Current code structure**:
```python
# api.py line 221
agent = AgentFixer()

# api.py line 246
result = agent.attempt_fix(req.code, error_context, req.test_input)
```

**Updated feature flag approach**:
```python
from models import Settings

settings = Settings()

if settings.use_pydantic_ai:
    from agent_fixer_v2 import AgentFixerV2
    agent = AgentFixerV2(settings)
else:
    agent = AgentFixer()

# Both implementations must have attempt_fix() method!
@app.post("/autofix")
def autofix_endpoint(req: VerificationRequest):
    # ... existing code ...
    result = agent.attempt_fix(req.code, error_context, req.test_input)
    return result
```

### 3. Ensure AgentFixerV2 has attempt_fix() method
**Add to AgentFixerV2**:
```python
class AgentFixerV2:
    # ... existing methods ...

    def attempt_fix(self, code: str, error: str, initial_input: str, max_retries: int = None):
        """Backward-compatible wrapper for generate_fix."""
        if max_retries is None:
            max_retries = self.settings.agent_config.max_attempts

        # Use Pydantic AI implementation
        result = asyncio.run(self.generate_fix(code, error, initial_input))

        return {
            "verified": True,
            "fixed_code": result.fixed_code,
            "explanation": result.explanation,
            "logs": "Success",
            "attempts": 1,  # Pydantic AI handles retries internally
            "test_count": 1
        }
```

**Tests to Create**: None (plan update only)

**Verification Steps**:
1. Read updated phase3_pydantic_ai.md
2. Verify method names match current implementation
3. Confirm backward compatibility

**🛑 STOP HERE - Wait for user verification before proceeding**

---

## Task 0.5: Add Missing Dependencies

**Status**: ⬜ Not Started

**Files to Modify**:
- `mcp-server/requirements.txt`

**Changes to Make**:
```txt
fastapi
uvicorn
requests
pydantic
pydantic-settings  # ADD THIS
mcp
e2b-code-interpreter
python-dotenv
```

**Files to Modify**:
- `plans/phase1_pydantic_models.md` (Task 1.3)

**Add note**:
```markdown
**Important**: `pydantic-settings` must be added to requirements.txt BEFORE using BaseSettings.

Update requirements.txt:
```txt
pydantic-settings>=2.0.0
```

Then install:
```bash
cd mcp-server && pip install -r requirements.txt
```
```

**Tests to Create**:
- Test that `pydantic-settings` can be imported
- Test that Settings class can be instantiated

**Verification Steps**:
1. Update requirements.txt
2. Run: `pip install -r mcp-server/requirements.txt`
3. Test: `python -c "from pydantic_settings import BaseSettings; print('OK')"`

**🛑 STOP HERE - Wait for user verification before proceeding**

---

## Task 0.6: Fix Effort Estimates

**Status**: ⬜ Not Started

**Files to Modify**:
- `plans/MASTER_PLAN_pydantic_integration.md`
- `plans/phase1_pydantic_models.md`
- `plans/phase2_pydantic_evals.md`

**Changes to Make**:

### Master Plan (line 21)
**Current**: "Effort: 2-3 hours"
**Should be**: "Effort: 4-6 hours" (matches phase1 plan line 7)

### Phase 1 Plan (line 7)
**Current**: "Effort: 4-6 hours"
**Correct** (matches detailed task breakdown)

### Phase 2 Plan (line 7)
**Current**: "Effort: 5-7 hours"
**Add note**: "Includes 1-2 hours for prompt updates to support structured JSON output"

### Update Master Timeline (line 185-190)
```markdown
| Phase | Duration | Start After |
|-------|----------|-------------|
| Phase 0 | 1-2 hours | Immediate |
| Phase 1 | 4-6 hours | Phase 0 complete |
| Phase 2 | 5-7 hours | Phase 1 Task 1.4 |
| Phase 3 | 6-8 hours | Phase 1 complete |
| **Total** | **16-23 hours** | |
```

**Tests to Create**: None (documentation only)

**Verification Steps**:
1. Read updated master plan
2. Verify all effort estimates are consistent
3. Confirm timeline includes Phase 0

**🛑 STOP HERE - Wait for user verification before proceeding**

---

## Phase 0 Completion Checklist

- [ ] Task 0.1: Current API contracts documented
- [ ] Task 0.2: Phase 1 updated for backward compatibility
- [ ] Task 0.3: Phase 2 updated for current LLM format
- [ ] Task 0.4: Phase 3 method names fixed
- [ ] Task 0.5: Missing dependencies added
- [ ] Task 0.6: Effort estimates corrected
- [ ] All plans reviewed and aligned with current code
- [ ] No breaking changes in updated plans

**Success Criteria**:
- ✅ All method names match current implementation
- ✅ Response formats maintain backward compatibility
- ✅ LLM response handling matches current format
- ✅ Settings won't prevent server startup
- ✅ All dependencies documented
- ✅ Effort estimates consistent
- ✅ Ready to start Phase 1 implementation

---

**Next Phase**: [phase1_pydantic_models.md](./phase1_pydantic_models.md) (after Phase 0 complete)
