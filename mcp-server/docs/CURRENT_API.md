# Current API Contracts (Before Pydantic Integration)

**Last Updated**: 2026-02-20
**Purpose**: Document existing API contracts to ensure backward compatibility during Pydantic integration

---

## Endpoints

### GET /health

**Purpose**: Health check endpoint

**Request**: None

**Response**:
```json
{
  "status": "ok"
}
```

**Status Codes**:
- 200: Service is healthy

---

### POST /verify

**Purpose**: Verify Python code execution against a test input

**Request**:
```json
{
  "code": "string",        // Python code to verify
  "test_input": "string"   // Test input (can be JSON string of list)
}
```

**Response**:
```json
{
  "result": "string"  // JSON string of test results or error message
}
```

**Example Success Response**:
```json
{
  "result": "[{\"status\": \"Passed\", \"input\": \"test1\", \"output\": \"result1\"}]"
}
```

**Example Error Response**:
```json
{
  "result": "Runtime Error: ZeroDivisionError\nTraceback: ..."
}
```

**Status Codes**:
- 200: Request processed (check result field for success/failure)

**Implementation**: [api.py:29-39](../api.py#L29-L39)

---

### POST /autofix

**Purpose**: Automatically fix buggy Python code using LLM-based agent loop

**Request**:
```json
{
  "code": "string",        // Buggy Python code to fix
  "test_input": "string"   // Test input that causes the error
}
```

**Response (Success)**:
```json
{
  "verified": true,
  "fixed_code": "string",      // The corrected code
  "explanation": "string",     // Explanation of what was fixed
  "logs": "string",            // Execution logs
  "attempts": number,          // Number of fix attempts made (1-3)
  "test_count": number         // Total number of tests run
}
```

**Response (Failure)**:
```json
{
  "verified": false,
  "fixed_code": "string",      // Last attempted fix
  "logs": "string",            // Error logs from last attempt
  "history": [                 // History of all attempts
    {
      "attempt": number,
      "code": "string",
      "logs": "string",
      "success": boolean
    }
  ]
}
```

**Status Codes**:
- 200: Request processed (check verified field for success/failure)

**Implementation**: [api.py:223-247](../api.py#L223-L247)

---

## AgentFixer Class

**Location**: [api.py:45-219](../api.py#L45-L219)

### Configuration

```python
class AgentFixer:
    def __init__(self):
        self.llm_url = "http://localhost:11434/api/generate"  # Ollama endpoint
        self.model = "llama3.1"  # LLM model name
```

### Methods

#### `generate_fix(code: str, error: str, test_input: str) -> str`

**Purpose**: Generate a fixed version of buggy code using LLM

**Parameters**:
- `code`: The buggy Python code
- `error`: Error message or incorrect output
- `test_input`: Test input that caused the error

**Returns**: Fixed code as string, or None if generation fails

**Implementation**: [api.py:56-92](../api.py#L56-L92)

---

#### `generate_tests(code: str, error: str) -> list[str]`

**Purpose**: Generate edge-case test inputs using LLM

**Parameters**:
- `code`: Python code to generate tests for
- `error`: Error message for context

**Returns**: List of test input strings (max 3), or empty list if generation fails

**Implementation**: [api.py:94-128](../api.py#L94-L128)

---

#### `verify_fix(code: str, test_inputs: list[str]) -> tuple[bool, str]`

**Purpose**: Verify code against multiple test inputs in E2B sandbox

**Parameters**:
- `code`: Python code to verify
- `test_inputs`: List of test input strings

**Returns**: Tuple of (success: bool, logs: str)
- `success`: True if all tests passed
- `logs`: JSON string of test results or error message

**Implementation**: [api.py:130-151](../api.py#L130-L151)

---

#### `attempt_fix(code: str, error: str, initial_input: str, max_retries: int = 3) -> dict`

**Purpose**: Main agent loop that attempts to fix code with retries

**Parameters**:
- `code`: Buggy Python code
- `error`: Error message or incorrect output
- `initial_input`: Test input that caused the error
- `max_retries`: Maximum number of fix attempts (default: 3)

**Returns**: Dictionary with keys:
- `verified`: bool - Whether fix succeeded
- `fixed_code`: str - The fixed code (or last attempt)
- `explanation`: str - Explanation of fix (success only)
- `logs`: str - Execution logs
- `attempts`: int - Number of attempts made (success only)
- `test_count`: int - Number of tests run (success only)
- `history`: list - History of all attempts (failure only)

**Implementation**: [api.py:153-219](../api.py#L153-L219)

**Algorithm**:
1. Generate test suite (initial input + 3 LLM-generated edge cases)
2. For each attempt (up to max_retries):
   - Generate fix using LLM
   - Verify fix against all tests
   - If success: return result
   - If failure: update context and retry
3. Return failure with history

---

## LLM Response Format

### Ollama API

**Endpoint**: `http://localhost:11434/api/generate`

**Request**:
```json
{
  "model": "llama3.1",
  "prompt": "string",
  "stream": false,
  "options": {
    "temperature": 0.2  // Optional
  }
}
```

**Response**:
```json
{
  "response": "string"  // Single string containing LLM output
}
```

**Important Notes**:
- Ollama returns a **single string**, NOT structured JSON fields
- The string may contain:
  - Plain code (for `generate_fix`)
  - JSON string (for `generate_tests`)
  - Markdown code blocks (need to be stripped)
- Current implementation uses regex to strip markdown: `re.sub(r'```python|```', '', raw)`

**Implications for Pydantic Integration**:
- Phase 2 evaluators must parse string responses, not expect structured fields
- To get structured output, prompts must explicitly request JSON format
- Fallback parsing needed for non-JSON responses

---

## Breaking Change Considerations

### Current JavaScript Extension Dependencies

The Chrome extension expects these exact response formats:

**For /verify**:
```javascript
const response = await fetch('/verify', {
  method: 'POST',
  body: JSON.stringify({ code, test_input })
});
const data = await response.json();
// Expects: data.result (string)
```

**For /autofix**:
```javascript
const response = await fetch('/autofix', {
  method: 'POST',
  body: JSON.stringify({ code, test_input })
});
const data = await response.json();
// Expects: data.verified (bool), data.fixed_code (string), etc.
```

### Backward Compatibility Strategy

**Approach**: Additive changes only

1. **Keep existing fields**: All current response fields must remain
2. **Add new structured field**: Add `structured` field with Pydantic models
3. **Deprecation path**: Mark old fields as deprecated in docs, remove in v2.0

**Example**:
```json
{
  "result": "...",           // OLD FORMAT (keep)
  "structured": {            // NEW FORMAT (add)
    "success": true,
    "output": "...",
    "error": null,
    "execution_time_ms": 123.45
  }
}
```

This ensures:
- ✅ Existing JavaScript extension continues working
- ✅ New clients can use structured format
- ✅ Gradual migration path
- ✅ No breaking changes

---

## Testing Requirements

### Current Test Coverage

**Location**: `mcp-server/tests/`

**Existing Tests**:
- `test_agent_loop.py`: Tests AgentFixer retry logic
- `test_autofix.py`: Integration tests for /autofix endpoint

**Test Dependencies**:
- Mock Ollama responses
- Mock E2B sandbox execution
- Test fixtures for sample code and errors

### Backward Compatibility Tests

**Required for Pydantic Integration**:
1. Test that old response format still works
2. Test that new structured format is added
3. Test that both formats contain same data
4. Test that JavaScript extension can parse responses
5. Test that 422 validation errors are handled gracefully

---

## Configuration

### Environment Variables

**Current**:
- `E2B_API_KEY`: Required for sandbox execution (loaded in server.py)

**Planned** (Phase 1):
- `OLLAMA_URL`: LLM endpoint (default: http://localhost:11434/api/generate)
- `MODEL_NAME`: LLM model (default: llama3.1)
- `AGENT_CONFIG__MAX_ATTEMPTS`: Max retry attempts (default: 3)
- `AGENT_CONFIG__TEMPERATURE`: LLM temperature (default: 0.2)
- `AGENT_CONFIG__TIMEOUT_SECONDS`: Execution timeout (default: 30)

### Startup Requirements

**Current**:
- Server starts successfully even if E2B_API_KEY is missing (fails at runtime)
- No configuration validation at startup

**Planned** (Phase 1):
- Settings class with optional fields and runtime validation
- Warning messages for missing configuration
- Server starts successfully with defaults

---

## Migration Checklist

Before modifying any endpoint:

- [ ] Document current request/response format
- [ ] Identify all JavaScript extension dependencies
- [ ] Design additive response format
- [ ] Write backward compatibility tests
- [ ] Update this documentation
- [ ] Get user approval before implementation

---

## Related Files

- [api.py](../api.py) - Main API implementation
- [server.py](../server.py) - E2B sandbox integration
- [requirements.txt](../requirements.txt) - Python dependencies
- [tests/test_agent_loop.py](../tests/test_agent_loop.py) - Agent tests
- [tests/test_autofix.py](../tests/test_autofix.py) - Integration tests

---

## Version History

- **2026-02-20**: Initial documentation (Phase 0 Task 0.1)
