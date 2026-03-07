# Phase 1: Pydantic Models Expansion

**Parent Plan**: [MASTER_PLAN_pydantic_integration.md](./MASTER_PLAN_pydantic_integration.md)

**Goal**: Add comprehensive Pydantic models for API responses, internal data structures, and configuration management.

**Estimated Time**: 4-6 hours

**Priority**: High | **Risk**: Low

---

## Overview

Currently, the MCP server has only one Pydantic model (`VerificationRequest`). This phase adds:
- Response models for API endpoints
- Internal data models for test cases and results
- Configuration models using Pydantic Settings
- LLM output validation models

**Benefits**:
- Type safety throughout the codebase
- Automatic API documentation (OpenAPI/Swagger)
- Clear validation errors
- Better IDE autocomplete
- Foundation for Pydantic Evals (Phase 2)

---

## Task 1.1: Create models.py with Response Models

**Status**: ⬜ Not Started

**Files to Create**:
- `mcp-server/models.py`

**Code to Write**:
```python
from pydantic import BaseModel, Field
from typing import Optional, List

class VerificationRequest(BaseModel):
    """Request model for code verification endpoint."""
    code: str = Field(..., description="Python code to verify")
    test_input: str = Field(..., description="Test input data")

class VerificationResult(BaseModel):
    """Response model for /verify endpoint."""
    success: bool = Field(..., description="Whether verification passed")
    output: Optional[str] = Field(None, description="Program output")
    error: Optional[str] = Field(None, description="Error message if failed")
    execution_time_ms: Optional[float] = Field(None, description="Execution time in milliseconds")

class AutofixResult(BaseModel):
    """Response model for /autofix endpoint."""
    success: bool = Field(..., description="Whether autofix succeeded")
    fixed_code: Optional[str] = Field(None, description="Fixed code if successful")
    attempts: int = Field(..., description="Number of fix attempts made")
    final_error: Optional[str] = Field(None, description="Final error if failed")
    execution_time_ms: Optional[float] = Field(None, description="Total execution time")
```

**Files to Modify**:
- `mcp-server/api.py` (lines 21-23): Remove `VerificationRequest` class (now in models.py)
- `mcp-server/api.py` (top): Add `from models import VerificationRequest, VerificationResult, AutofixResult`

**Tests to Create** (per /detailed-testing):
- `mcp-server/tests/test_models.py`:
  - Test VerificationRequest validation (valid input, missing fields, invalid types)
  - Test VerificationResult serialization (all fields, optional fields)
  - Test AutofixResult serialization (all fields, optional fields)
  - Test Field descriptions are present
  - Test edge cases: empty strings, None values, negative numbers

**Verification Steps**:
1. Run: `cd mcp-server && pytest tests/test_models.py -v`
2. Verify all tests pass
3. Check: `python -c "from models import VerificationRequest, VerificationResult, AutofixResult; print('Import successful')"`

**🛑 STOP HERE - Wait for user verification before proceeding**

---

## Task 1.2: Add Internal Data Models

**Status**: ⬜ Not Started

**Files to Modify**:
- `mcp-server/models.py` (append to existing file)

**Code to Add**:
```python
from enum import Enum

class TestStatus(str, Enum):
    """Status of a test execution."""
    PASSED = "passed"
    FAILED = "failed"
    ERROR = "error"
    TIMEOUT = "timeout"

class TestCase(BaseModel):
    """Model for a single test case."""
    input_data: str = Field(..., description="Test input")
    expected_output: Optional[str] = Field(None, description="Expected output")
    description: Optional[str] = Field(None, description="Test case description")

class TestResult(BaseModel):
    """Model for test execution result."""
    test_case: TestCase
    status: TestStatus
    actual_output: Optional[str] = Field(None, description="Actual program output")
    error_message: Optional[str] = Field(None, description="Error if test failed")
    execution_time_ms: float = Field(..., ge=0, description="Execution time")

class FixAttempt(BaseModel):
    """Model for a single fix attempt in the agent loop."""
    attempt_number: int = Field(..., ge=1, description="Attempt number (1-indexed)")
    modified_code: str = Field(..., description="Code after this fix attempt")
    test_result: TestResult
    llm_explanation: Optional[str] = Field(None, description="LLM's explanation of the fix")
```

**Tests to Create** (per /detailed-testing):
- `mcp-server/tests/test_models.py` (add to existing file):
  - Test TestStatus enum values
  - Test TestCase validation (valid, missing required fields)
  - Test TestResult with all TestStatus values
  - Test FixAttempt validation (attempt_number >= 1 constraint)
  - Test nested model validation (TestResult contains TestCase)
  - Test edge cases: very long strings, special characters, unicode

**Verification Steps**:
1. Run: `cd mcp-server && pytest tests/test_models.py -v`
2. Verify all new tests pass
3. Check model relationships work correctly

**🛑 STOP HERE - Wait for user verification before proceeding**

---

## Task 1.3: Add Configuration Models

**Status**: ⬜ Not Started

**Files to Modify**:
- `mcp-server/models.py` (append to existing file)

**Code to Add**:
```python
from pydantic_settings import BaseSettings

class AgentConfig(BaseSettings):
    """Configuration for the agent fixer."""
    max_attempts: int = Field(default=3, ge=1, le=10, description="Maximum fix attempts")
    temperature: float = Field(default=0.2, ge=0.0, le=2.0, description="LLM temperature")
    timeout_seconds: int = Field(default=30, ge=5, le=300, description="Execution timeout")

class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    # LLM Configuration
    ollama_url: str = Field(default="http://localhost:11434/api/generate", description="Ollama API URL")
    model_name: str = Field(default="llama3.1", description="LLM model name")

    # E2B Configuration
    # IMPORTANT: Made optional to prevent startup failure
    e2b_api_key: Optional[str] = Field(None, description="E2B API key for sandbox execution")

    # Agent Configuration
    agent_config: AgentConfig = Field(default_factory=AgentConfig)

    # Feature Flags
    use_pydantic_ai: bool = Field(default=False, description="Use Pydantic AI implementation")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        env_nested_delimiter = "__"

    def __post_init__(self):
        """Runtime validation with helpful warnings."""
        if not self.e2b_api_key:
            import warnings
            warnings.warn(
                "E2B_API_KEY not set. Sandbox execution will fail. "
                "Set E2B_API_KEY environment variable or add to .env file."
            )
```

**Files to Create**:
- `mcp-server/.env.example`:
```
# LLM Configuration
OLLAMA_URL=http://localhost:11434/api/generate
MODEL_NAME=llama3.1

# E2B Configuration
E2B_API_KEY=your_api_key_here

# Agent Configuration
AGENT_CONFIG__MAX_ATTEMPTS=3
AGENT_CONFIG__TEMPERATURE=0.2
AGENT_CONFIG__TIMEOUT_SECONDS=30

# Feature Flags
USE_PYDANTIC_AI=false
```

**Files to Modify**:
- `mcp-server/api.py` (lines 45-219): Replace hardcoded values in AgentFixer with Settings
  - Add at top: `from models import Settings`
  - Add: `settings = Settings()`
  - Replace hardcoded URLs, model names, max_attempts with `settings.*`

**Tests to Create** (per /detailed-testing):
- `mcp-server/tests/test_models.py` (add to existing file):
  - Test Settings loads from environment variables
  - Test Settings defaults when env vars not set
  - Test AgentConfig validation (min/max constraints)
  - Test nested configuration (AGENT_CONFIG__MAX_ATTEMPTS)
  - Test invalid values raise validation errors
  - Test .env.example has all required fields
  - Mock environment variables for testing

**Verification Steps**:
1. Run: `cd mcp-server && pytest tests/test_models.py::test_settings* -v`
2. Test loading from .env: `cp .env.example .env && python -c "from models import Settings; s = Settings(); print(s)"`
3. Verify validation errors for invalid values

**🛑 STOP HERE - Wait for user verification before proceeding**

---

## Task 1.4: Add LLM Output Validation Models

**Status**: ⬜ Not Started

**Files to Modify**:
- `mcp-server/models.py` (append to existing file)

**Code to Add**:
```python
class LLMFixResponse(BaseModel):
    """Structured model for LLM fix responses."""
    fixed_code: str = Field(..., min_length=1, description="The fixed Python code")
    explanation: str = Field(..., description="Explanation of what was fixed")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence in the fix (0-1)")
    changes_made: List[str] = Field(default_factory=list, description="List of specific changes")

class LLMTestResponse(BaseModel):
    """Structured model for LLM test generation responses."""
    test_cases: List[TestCase] = Field(..., min_items=1, description="Generated test cases")
    reasoning: str = Field(..., description="Reasoning behind test case selection")
    coverage_areas: List[str] = Field(default_factory=list, description="Areas of code covered")
```

**Files to Modify**:
- `mcp-server/api.py` (lines 79-92): Update `_call_llm()` method to validate against LLMFixResponse
  - Current: Manual JSON parsing with regex stripping
  - New: Parse and validate against Pydantic model
  - Add error handling for validation failures

**Tests to Create** (per /detailed-testing):
- `mcp-server/tests/test_models.py` (add to existing file):
  - Test LLMFixResponse validation (valid, missing fields, invalid confidence)
  - Test LLMTestResponse validation (empty test_cases should fail)
  - Test confidence bounds (0.0, 1.0, -0.1, 1.1)
  - Test min_length constraint on fixed_code
  - Test List[TestCase] nested validation
  - Mock LLM responses and validate parsing

**Verification Steps**:
1. Run: `cd mcp-server && pytest tests/test_models.py::test_llm* -v`
2. Test with sample LLM response JSON
3. Verify validation catches malformed responses

**🛑 STOP HERE - Wait for user verification before proceeding**

---

## Task 1.5: Update /verify Endpoint to Use Response Models

**Status**: ⬜ Not Started

**Files to Modify**:
- `mcp-server/api.py` (lines 223-235): Update `/verify` endpoint

**Current Code** (lines 29-39):
```python
@app.post("/verify")
def verify_endpoint(req: VerificationRequest):
    # ... implementation ...
    result = verify_solution_logic(req.code, inputs)
    return {"result": result}
```

**New Code (Backward Compatible - Additive Approach)**:
```python
@app.post("/verify")
def verify_endpoint(req: VerificationRequest):
    import time
    start_time = time.time()

    # ... existing implementation ...
    inputs = [req.test_input]
    result = verify_solution_logic(req.code, inputs)

    execution_time_ms = (time.time() - start_time) * 1000

    # Parse result to determine success/error
    success = False
    output = None
    error = None

    try:
        # Try to parse as JSON (list of test results)
        import json
        results = json.loads(result)
        if isinstance(results, list):
            # Check if all tests passed
            failures = [r for r in results if r.get('status') != 'Passed']
            success = len(failures) == 0
            output = result if success else None
            error = result if not success else None
    except:
        # Not JSON, likely an error message
        success = False
        error = result

    # Create structured response
    structured = VerificationResult(
        success=success,
        output=output,
        error=error,
        execution_time_ms=execution_time_ms
    )

    # BACKWARD COMPATIBLE: Return both old and new formats
    return {
        "result": result,  # OLD FORMAT (keep for backward compatibility)
        "structured": structured.model_dump()  # NEW FORMAT (add structured data)
    }
```

**Important - Backward Compatibility**:
This approach ensures:
- ✅ Old JavaScript extension continues working (uses `response.result`)
- ✅ New clients can use structured format (uses `response.structured`)
- ✅ No breaking changes
- ✅ Gradual migration path

**Tests to Create** (per /detailed-testing):
- `mcp-server/tests/test_api.py` (create new file):
  - Test /verify endpoint with valid code (success case)
  - Test /verify endpoint with code that has errors (failure case)
  - Test /verify endpoint with missing fields (422 validation error)
  - Test /verify endpoint with invalid types (422 validation error)
  - Test response matches VerificationResult schema
  - Test execution_time_ms is present and positive
  - Test OpenAPI schema generation includes response model
  - Test custom validation error handler returns consistent format
  - Mock E2B sandbox for testing

**Important Note - FastAPI 422 Validation Errors**:
When `response_model` is added, FastAPI automatically returns 422 Unprocessable Entity for validation errors. The JavaScript extension must handle these gracefully. Consider adding a custom exception handler:

```python
from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Custom handler for validation errors to maintain consistent error format."""
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "success": False,
            "error": "Validation error",
            "details": exc.errors()
        }
    )
```

**Verification Steps**:
1. Run: `cd mcp-server && pytest tests/test_api.py::test_verify* -v`
2. Start server: `python mcp-server/api.py`
3. Test valid request: `curl -X POST http://localhost:8000/verify -H "Content-Type: application/json" -d '{"code":"print(1+1)","test_input":""}'`
4. Test invalid request (should return 422): `curl -X POST http://localhost:8000/verify -H "Content-Type: application/json" -d '{"invalid":"field"}'`
5. Check OpenAPI docs: `curl http://localhost:8000/docs` (should show response schema)

**🛑 STOP HERE - Wait for user verification before proceeding**

---

## Task 1.6: Update /autofix Endpoint to Use Response Models

**Status**: ⬜ Not Started

**Files to Modify**:
- `mcp-server/api.py` (lines 237-247): Update `/autofix` endpoint

**Current Code** (lines 223-247):
```python
@app.post("/autofix")
def autofix_endpoint(req: VerificationRequest):
    # ... implementation ...
    result = agent.attempt_fix(req.code, error_context, req.test_input)
    return result
```

**New Code (Backward Compatible - Additive Approach)**:
```python
@app.post("/autofix")
def autofix_endpoint(req: VerificationRequest):
    import time
    start_time = time.time()

    # ... existing implementation ...
    initial_logs = verify_solution_logic(req.code, [req.test_input])
    error_context = initial_logs
    result = agent.attempt_fix(req.code, error_context, req.test_input)

    execution_time_ms = (time.time() - start_time) * 1000

    # Create structured response
    structured = AutofixResult(
        success=result.get("verified", False),
        fixed_code=result.get("fixed_code"),
        attempts=result.get("attempts", 0),
        final_error=result.get("logs") if not result.get("verified") else None,
        execution_time_ms=execution_time_ms
    )

    # BACKWARD COMPATIBLE: Return both old and new formats
    return {
        **result,  # OLD FORMAT (keep all existing fields: verified, fixed_code, explanation, logs, attempts, test_count, history)
        "structured": structured.model_dump()  # NEW FORMAT (add structured data)
    }
```

**Important - Backward Compatibility**:
This approach ensures:
- ✅ Old JavaScript extension continues working (uses `response.verified`, `response.fixed_code`, etc.)
- ✅ New clients can use structured format (uses `response.structured`)
- ✅ No breaking changes
- ✅ All existing fields preserved
- ✅ Gradual migration path

**Tests to Create** (per /detailed-testing):
- `mcp-server/tests/test_api.py` (add to existing file):
  - Test /autofix endpoint with fixable code (success case)
  - Test /autofix endpoint with unfixable code (failure case)
  - Test /autofix endpoint tracks attempt count correctly
  - Test /autofix endpoint with missing fields (validation error)
  - Test response matches AutofixResult schema
  - Test execution_time_ms is present and positive
  - Test final_error is None when success=True
  - Test final_error is present when success=False
  - Mock AgentFixer for testing

**Verification Steps**:
1. Run: `cd mcp-server && pytest tests/test_api.py::test_autofix* -v`
2. Start server: `python mcp-server/api.py`
3. Test endpoint: `curl -X POST http://localhost:8000/autofix -H "Content-Type: application/json" -d '{"code":"print(1/0)","test_input":""}'`
4. Check OpenAPI docs: `curl http://localhost:8000/docs` (should show response schema)
5. Run full test suite: `cd mcp-server && pytest tests/ -v`

**🛑 STOP HERE - Wait for user verification before proceeding**

---

## Phase 1 Completion Checklist

- [ ] Task 1.1: Response models created and tested
- [ ] Task 1.2: Internal data models created and tested
- [ ] Task 1.3: Configuration models created and tested
- [ ] Task 1.4: LLM output validation models created and tested
- [ ] Task 1.5: /verify endpoint updated and tested
- [ ] Task 1.6: /autofix endpoint updated and tested
- [ ] All tests passing: `pytest tests/ -v`
- [ ] OpenAPI docs generated correctly: `/docs` endpoint
- [ ] No regressions in existing functionality

**Success Criteria**:
- ✅ All 6 tasks completed with tests passing
- ✅ API endpoints return structured Pydantic models
- ✅ Configuration loaded from environment variables
- ✅ OpenAPI documentation auto-generated
- ✅ Foundation ready for Phase 2 (Pydantic Evals)

---

**Next Phase**: [phase2_pydantic_evals.md](./phase2_pydantic_evals.md)
