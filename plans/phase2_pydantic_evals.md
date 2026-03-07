# Phase 2: Pydantic Evals Integration

**Parent Plan**: [MASTER_PLAN_pydantic_integration.md](./MASTER_PLAN_pydantic_integration.md)

**Goal**: Integrate Pydantic Evals to validate and score LLM outputs across the MCP server and extension.

**Estimated Time**: 5-7 hours

**Priority**: High | **Risk**: Medium

---

## Overview

The extension has extensive LLM usage:
- **MCP Server**: AgentFixer generates code fixes and test cases
- **JavaScript Extension**: Drill generation, skill analysis, code explanations

Pydantic Evals provides:
- Structured evaluation of LLM outputs against expected schemas
- Scoring and metrics for output quality
- Automatic retry with feedback when outputs fail validation
- Evaluation history and analytics

**Benefits**:
- Catch malformed LLM outputs before they cause errors
- Improve LLM output quality through iterative feedback
- Track LLM performance over time
- Reduce manual validation code

---

## Task 2.1: Add Pydantic Evals Dependency and Setup

**Status**: ⬜ Not Started

**Files to Modify**:
- `mcp-server/requirements.txt`

**Code to Add**:
```txt
pydantic-evals>=0.1.0
```

**Files to Create**:
- `mcp-server/evals/__init__.py` (empty file for package)
- `mcp-server/evals/schemas.py` (evaluation schemas)

**Code for evals/schemas.py**:
```python
from pydantic import BaseModel, Field
from typing import List, Optional
from pydantic_evals import Evaluator, EvalResult

class CodeFixEvaluator(Evaluator):
    """Evaluator for code fix LLM outputs."""

    def evaluate(self, output: dict) -> EvalResult:
        """Evaluate a code fix response."""
        score = 1.0
        feedback = []

        # Check required fields
        if "fixed_code" not in output or not output["fixed_code"]:
            score -= 0.5
            feedback.append("Missing or empty fixed_code field")

        if "explanation" not in output or not output["explanation"]:
            score -= 0.3
            feedback.append("Missing or empty explanation field")

        # Check code quality
        if "fixed_code" in output:
            code = output["fixed_code"]
            if "TODO" in code or "FIXME" in code:
                score -= 0.2
                feedback.append("Code contains TODO/FIXME markers")

            if len(code.strip()) < 10:
                score -= 0.3
                feedback.append("Code is suspiciously short")

        # Check confidence if present
        if "confidence" in output:
            conf = output.get("confidence", 0)
            if not (0 <= conf <= 1):
                score -= 0.2
                feedback.append(f"Invalid confidence value: {conf}")

        return EvalResult(
            score=max(0.0, score),
            passed=score >= 0.7,
            feedback=feedback
        )

class TestCaseEvaluator(Evaluator):
    """Evaluator for test case generation LLM outputs."""

    def evaluate(self, output: dict) -> EvalResult:
        """Evaluate a test case generation response."""
        score = 1.0
        feedback = []

        # Check test_cases field
        if "test_cases" not in output:
            return EvalResult(score=0.0, passed=False, feedback=["Missing test_cases field"])

        test_cases = output["test_cases"]
        if not isinstance(test_cases, list) or len(test_cases) == 0:
            score -= 0.5
            feedback.append("test_cases must be a non-empty list")

        # Check each test case
        for i, tc in enumerate(test_cases):
            if not isinstance(tc, dict):
                score -= 0.2
                feedback.append(f"Test case {i} is not a dict")
                continue

            if "input_data" not in tc:
                score -= 0.2
                feedback.append(f"Test case {i} missing input_data")

        # Check reasoning
        if "reasoning" not in output or not output["reasoning"]:
            score -= 0.2
            feedback.append("Missing or empty reasoning field")

        return EvalResult(
            score=max(0.0, score),
            passed=score >= 0.7,
            feedback=feedback
        )
```

**Tests to Create** (per /detailed-testing):
- `mcp-server/tests/test_evals.py`:
  - Test CodeFixEvaluator with valid output (score=1.0)
  - Test CodeFixEvaluator with missing fixed_code (score penalty)
  - Test CodeFixEvaluator with TODO markers (score penalty)
  - Test CodeFixEvaluator with invalid confidence (score penalty)
  - Test TestCaseEvaluator with valid output (score=1.0)
  - Test TestCaseEvaluator with empty test_cases (score penalty)
  - Test TestCaseEvaluator with malformed test cases (score penalty)
  - Test EvalResult.passed threshold (0.7)
  - Test feedback messages are descriptive

**Verification Steps**:
1. Install: `cd mcp-server && pip install -r requirements.txt`
2. Run: `pytest tests/test_evals.py -v`
3. Verify all tests pass
4. Check: `python -c "from evals.schemas import CodeFixEvaluator, TestCaseEvaluator; print('Import successful')"`

**🛑 STOP HERE - Wait for user verification before proceeding**

---

## Task 2.1.5: Update LLM Prompts for Structured JSON Output

**Status**: ⬜ Not Started

**Context**: Current Ollama integration returns `{"response": "string"}` - a single string, not structured JSON. Before we can evaluate structured outputs, we need to update prompts to request JSON format.

**Files to Modify**:
- `mcp-server/api.py` (lines 56-92): Update `generate_fix()` method

**Current Prompt** (lines 60-68):
```python
prompt = f"""You are an expert Python coding assistant.

CODE:
{code}

ERROR:
{error}

Task: Fix the code above. Return ONLY the fixed code, no explanations."""
```

**New Prompt** (request structured JSON):
```python
prompt = f"""You are an expert Python coding assistant.

CODE:
{code}

ERROR:
{error}

TEST INPUT:
{test_input}

Task: Fix the code and return a JSON object with this EXACT structure:
{{
  "fixed_code": "the complete fixed code here",
  "explanation": "what you fixed and why",
  "confidence": 0.8,
  "changes_made": ["change 1", "change 2"]
}}

CRITICAL REQUIREMENTS:
1. Return ONLY valid JSON - no markdown, no code blocks, no text outside JSON
2. The "fixed_code" field must contain the COMPLETE working code
3. The "confidence" field must be a number between 0.0 and 1.0
4. The "changes_made" field must be a list of strings describing each change

Example response format:
{{"fixed_code": "def solution(x):\\n    return x * 2", "explanation": "Fixed the multiplication", "confidence": 0.9, "changes_made": ["Changed + to *"]}}
"""
```

**Files to Modify**:
- `mcp-server/api.py` (lines 94-128): Update `generate_tests()` method (if needed)

**Note**: The `generate_tests()` method already requests JSON format (line 102-120), so it may only need minor adjustments.

**Tests to Create** (per /detailed-testing):
- `mcp-server/tests/test_prompts.py`:
  - Test generate_fix() with Ollama returns valid JSON
  - Test generate_fix() JSON has all required fields
  - Test generate_fix() fixed_code field is not empty
  - Test generate_fix() confidence is between 0.0 and 1.0
  - Test generate_fix() changes_made is a list
  - Test generate_tests() returns valid JSON (existing behavior)
  - Mock Ollama responses for testing
  - Test fallback behavior if Ollama returns non-JSON

**Verification Steps**:
1. Run: `pytest tests/test_prompts.py -v`
2. Test with real Ollama (if available):
   ```bash
   python -c "from api import AgentFixer; agent = AgentFixer(); result = agent.generate_fix('def f(x): return x +', 'SyntaxError', '5'); print(result)"
   ```
3. Verify result is valid JSON with required fields
4. Check that fixed_code field contains complete code

**🛑 STOP HERE - Wait for user verification before proceeding**

---

## Task 2.2: Integrate Evals into AgentFixer.generate_fix()

**Status**: ⬜ Not Started

**Prerequisites**: Task 2.1.5 must be completed first (prompts updated to request JSON)

**Files to Modify**:
- `mcp-server/api.py` (lines 56-92): Update `generate_fix()` method

**Current Flow**:
1. Make HTTP request to Ollama
2. Parse JSON response: `{"response": "string"}`
3. Strip markdown code blocks with regex
4. Return raw string

**New Flow**:
1. Make HTTP request to Ollama
2. Parse JSON response: `{"response": "string"}`
3. Extract string from response field
4. Try to parse string as JSON (LLM should return JSON after Task 2.1.5)
5. Evaluate parsed JSON with CodeFixEvaluator
6. If eval fails (score < 0.7), retry with feedback
7. Validate against LLMFixResponse model
8. Return validated response

**Fallback Strategy**: If LLM returns non-JSON string, create minimal structure:
```python
{"fixed_code": raw_string, "explanation": "", "confidence": 0.5, "changes_made": []}
```

**Important Note - Latency Considerations**:
The retry loop with LLM calls can significantly increase latency. Each retry adds ~2-5 seconds depending on the LLM provider. To mitigate:

1. **Make retries configurable**: Use `settings.agent_config.max_attempts`
2. **Add timeout handling**: Set reasonable timeouts for LLM calls
3. **Track latency metrics**: Log retry count and total time in metrics
4. **Consider async execution**: For non-blocking operations

The metrics tracker will be vital to monitor if retries are causing user-facing timeouts.

**Code Changes**:
```python
from evals.schemas import CodeFixEvaluator
from models import LLMFixResponse
import json

class AgentFixer:
    def __init__(self):
        # ... existing code ...
        self.code_fix_evaluator = CodeFixEvaluator()

    def generate_fix(self, code: str, error: str, test_input: str, max_retries: int = 3) -> str:
        """Generate code fix with evaluation and retry logic.

        Returns: JSON string with fixed_code, explanation, confidence, changes_made
        """
        prompt = f"""You are an expert Python coding assistant.

CODE:
{code}

ERROR:
{error}

TEST INPUT:
{test_input}

Task: Fix the code and return a JSON object with this EXACT structure:
{{
  "fixed_code": "the complete fixed code here",
  "explanation": "what you fixed and why",
  "confidence": 0.8,
  "changes_made": ["change 1", "change 2"]
}}

CRITICAL: Return ONLY valid JSON - no markdown, no code blocks, no text outside JSON.
"""

        for attempt in range(max_retries):
            try:
                # Make HTTP request to Ollama (existing code)
                response = requests.post(
                    self.ollama_url,
                    json={"model": self.model, "prompt": prompt, "stream": False},
                    timeout=30
                )
                response.raise_for_status()

                # Ollama returns {"response": "string"}
                raw_string = response.json().get("response", "").strip()

                # Try to parse as JSON
                try:
                    parsed_output = json.loads(raw_string)
                except json.JSONDecodeError:
                    # Fallback: LLM returned non-JSON, create minimal structure
                    # Strip markdown code blocks if present
                    code_only = re.sub(r"```python\n?", "", raw_string)
                    code_only = re.sub(r"```\n?", "", code_only)

                    parsed_output = {
                        "fixed_code": code_only,
                        "explanation": "LLM returned non-JSON format",
                        "confidence": 0.5,
                        "changes_made": []
                    }

                # Evaluate output
                eval_result = self.code_fix_evaluator.evaluate(parsed_output)

                if not eval_result.passed:
                    if attempt < max_retries - 1:
                        # Retry with feedback
                        feedback_str = "; ".join(eval_result.feedback)
                        prompt = f"{prompt}\n\nPrevious attempt failed: {feedback_str}\nPlease fix these issues."
                        continue
                    else:
                        # Last attempt failed, but return what we have
                        import warnings
                        warnings.warn(f"LLM output failed evaluation: {eval_result.feedback}")

                # Validate against Pydantic model (if using Phase 1 models)
                # validated = LLMFixResponse(**parsed_output)

                # Return JSON string (current API expects string)
                return json.dumps(parsed_output)

            except Exception as e:
                if attempt == max_retries - 1:
                    raise
                continue

        raise ValueError("Failed to generate fix after max retries")
```

**Tests to Create** (per /detailed-testing):
- `mcp-server/tests/test_agent_loop.py` (modify existing):
  - Test generate_fix() with valid JSON response from Ollama (no retries)
  - Test generate_fix() with non-JSON response triggers fallback parsing
  - Test generate_fix() with invalid JSON triggers retry with feedback
  - Test generate_fix() exhausts retries and returns last attempt
  - Test generate_fix() strips markdown from non-JSON responses
  - Test generate_fix() validates against CodeFixEvaluator
  - Test generate_fix() returns JSON string format
  - Mock HTTP requests to Ollama
  - Test evaluation scores are calculated correctly
  - Test retry prompt includes feedback from previous attempt
  - Test fallback structure has all required fields

**Verification Steps**:
1. Run: `pytest tests/test_agent_loop.py -v`
2. Test with real Ollama (if available): Start server and trigger /autofix
3. Check logs show evaluation scores
4. Verify retries happen when eval fails
5. Test fallback parsing with non-JSON response

**🛑 STOP HERE - Wait for user verification before proceeding**

---

## Task 2.3: Add Eval Metrics Tracking

**Status**: ⬜ Not Started

**Files to Create**:
- `mcp-server/evals/metrics.py`

**Code to Write**:
```python
from dataclasses import dataclass, field
from typing import List, Dict
from datetime import datetime
import json

@dataclass
class EvalMetric:
    """Single evaluation metric."""
    timestamp: datetime
    evaluator_name: str
    score: float
    passed: bool
    feedback: List[str]
    metadata: Dict = field(default_factory=dict)

class MetricsTracker:
    """Track evaluation metrics over time."""

    def __init__(self, log_file: str = "evals/metrics.jsonl"):
        self.log_file = log_file
        self.metrics: List[EvalMetric] = []

    def record(self, metric: EvalMetric):
        """Record a single metric."""
        self.metrics.append(metric)

        # Append to JSONL file
        with open(self.log_file, "a") as f:
            data = {
                "timestamp": metric.timestamp.isoformat(),
                "evaluator": metric.evaluator_name,
                "score": metric.score,
                "passed": metric.passed,
                "feedback": metric.feedback,
                "metadata": metric.metadata
            }
            f.write(json.dumps(data) + "\n")

    def get_stats(self, evaluator_name: str = None) -> Dict:
        """Get statistics for evaluations."""
        filtered = self.metrics
        if evaluator_name:
            filtered = [m for m in self.metrics if m.evaluator_name == evaluator_name]

        if not filtered:
            return {"count": 0}

        scores = [m.score for m in filtered]
        passed_count = sum(1 for m in filtered if m.passed)

        return {
            "count": len(filtered),
            "avg_score": sum(scores) / len(scores),
            "min_score": min(scores),
            "max_score": max(scores),
            "pass_rate": passed_count / len(filtered),
            "total_passed": passed_count,
            "total_failed": len(filtered) - passed_count
        }

# Global tracker instance
metrics_tracker = MetricsTracker()
```

**Files to Modify**:
- `mcp-server/api.py`: Import and use metrics_tracker in _call_llm()
  - Add: `from evals.metrics import metrics_tracker, EvalMetric`
  - After evaluation: `metrics_tracker.record(EvalMetric(...))`

**Files to Create**:
- `mcp-server/evals/metrics.jsonl` (empty file, will be populated)

**Files to Modify**:
- `mcp-server/evals/metrics.py` - Add latency tracking fields

**Code to Add to EvalMetric**:
```python
@dataclass
class EvalMetric:
    """Single evaluation metric."""
    timestamp: datetime
    evaluator_name: str
    score: float
    passed: bool
    feedback: List[str]
    metadata: Dict = field(default_factory=dict)
    # Latency tracking
    llm_call_time_ms: Optional[float] = None
    retry_count: int = 0
    total_time_ms: Optional[float] = None
```

**Tests to Create** (per /detailed-testing):
- `mcp-server/tests/test_metrics.py`:
  - Test MetricsTracker.record() writes to JSONL
  - Test MetricsTracker.get_stats() calculates correctly
  - Test get_stats() with evaluator_name filter
  - Test get_stats() with empty metrics
  - Test JSONL format is valid
  - Test metrics persist across tracker instances
  - Test concurrent writes (thread safety)
  - Test latency fields are tracked correctly
  - Test retry_count is incremented properly
  - Mock file I/O for testing

**Verification Steps**:
1. Run: `pytest tests/test_metrics.py -v`
2. Trigger some /autofix requests
3. Check: `cat mcp-server/evals/metrics.jsonl` (should have entries)
4. Test stats: `python -c "from evals.metrics import metrics_tracker; print(metrics_tracker.get_stats())"`

**🛑 STOP HERE - Wait for user verification before proceeding**

---

## Task 2.4: Add /evals/stats Endpoint

**Status**: ⬜ Not Started

**Files to Modify**:
- `mcp-server/api.py` (add new endpoint)

**Code to Add**:
```python
from evals.metrics import metrics_tracker

@app.get("/evals/stats")
async def get_eval_stats(evaluator: Optional[str] = None):
    """Get evaluation statistics.

    Args:
        evaluator: Optional evaluator name to filter by

    Returns:
        Statistics including count, avg_score, pass_rate, etc.
    """
    stats = metrics_tracker.get_stats(evaluator_name=evaluator)
    return stats

@app.get("/evals/recent")
async def get_recent_evals(limit: int = 10, evaluator: Optional[str] = None):
    """Get recent evaluation results.

    Args:
        limit: Number of recent evals to return (default 10)
        evaluator: Optional evaluator name to filter by

    Returns:
        List of recent evaluation metrics
    """
    filtered = metrics_tracker.metrics
    if evaluator:
        filtered = [m for m in filtered if m.evaluator_name == evaluator]

    recent = filtered[-limit:]
    return [
        {
            "timestamp": m.timestamp.isoformat(),
            "evaluator": m.evaluator_name,
            "score": m.score,
            "passed": m.passed,
            "feedback": m.feedback
        }
        for m in recent
    ]
```

**Tests to Create** (per /detailed-testing):
- `mcp-server/tests/test_api.py` (add to existing):
  - Test /evals/stats endpoint returns correct stats
  - Test /evals/stats with evaluator filter
  - Test /evals/stats with no metrics returns count=0
  - Test /evals/recent endpoint returns recent evals
  - Test /evals/recent with limit parameter
  - Test /evals/recent with evaluator filter
  - Test /evals/recent with no metrics returns empty list
  - Mock metrics_tracker for testing

**Verification Steps**:
1. Run: `pytest tests/test_api.py::test_evals* -v`
2. Start server: `python mcp-server/api.py`
3. Test: `curl http://localhost:8000/evals/stats`
4. Test: `curl http://localhost:8000/evals/recent?limit=5`
5. Check OpenAPI docs: `http://localhost:8000/docs` (should show new endpoints)

**🛑 STOP HERE - Wait for user verification before proceeding**

---

## Task 2.5: Add Drill Generation Eval (JavaScript Bridge)

**Status**: ⬜ Not Started

**Context**: The JavaScript extension ([src/background/llm_gateway.js](../src/background/llm_gateway.js)) generates drills using LLMs. We can add a Python eval endpoint that JavaScript can call.

**Files to Create**:
- `mcp-server/evals/drill_schemas.py`

**Code to Write**:
```python
from pydantic import BaseModel, Field
from typing import List, Optional
from pydantic_evals import Evaluator, EvalResult

class DrillEvaluator(Evaluator):
    """Evaluator for drill generation LLM outputs."""

    def evaluate(self, output: dict) -> EvalResult:
        """Evaluate a drill generation response."""
        score = 1.0
        feedback = []

        # Check required fields
        required_fields = ["problem", "solution", "difficulty", "tags"]
        for field in required_fields:
            if field not in output or not output[field]:
                score -= 0.25
                feedback.append(f"Missing or empty {field} field")

        # Check problem quality
        if "problem" in output:
            problem = output["problem"]
            if len(problem) < 20:
                score -= 0.2
                feedback.append("Problem description too short")

            if "TODO" in problem or "PLACEHOLDER" in problem:
                score -= 0.3
                feedback.append("Problem contains placeholder text")

        # Check solution quality
        if "solution" in output:
            solution = output["solution"]
            if len(solution) < 10:
                score -= 0.2
                feedback.append("Solution too short")

        # Check difficulty
        if "difficulty" in output:
            valid_difficulties = ["easy", "medium", "hard"]
            if output["difficulty"].lower() not in valid_difficulties:
                score -= 0.1
                feedback.append(f"Invalid difficulty: {output['difficulty']}")

        # Check tags
        if "tags" in output:
            tags = output["tags"]
            if not isinstance(tags, list) or len(tags) == 0:
                score -= 0.1
                feedback.append("Tags must be a non-empty list")

        return EvalResult(
            score=max(0.0, score),
            passed=score >= 0.7,
            feedback=feedback
        )
```

**Files to Modify**:
- `mcp-server/api.py` (add new endpoint)

**Code to Add**:
```python
from evals.drill_schemas import DrillEvaluator

drill_evaluator = DrillEvaluator()

@app.post("/evals/drill")
async def evaluate_drill(drill_output: dict):
    """Evaluate a drill generation output.

    This endpoint can be called from JavaScript to validate drill outputs.

    Args:
        drill_output: The drill object to evaluate

    Returns:
        Evaluation result with score, passed, and feedback
    """
    eval_result = drill_evaluator.evaluate(drill_output)

    # Record metric
    from evals.metrics import metrics_tracker, EvalMetric
    from datetime import datetime
    metrics_tracker.record(EvalMetric(
        timestamp=datetime.now(),
        evaluator_name="DrillEvaluator",
        score=eval_result.score,
        passed=eval_result.passed,
        feedback=eval_result.feedback,
        metadata={"drill_difficulty": drill_output.get("difficulty")}
    ))

    return {
        "score": eval_result.score,
        "passed": eval_result.passed,
        "feedback": eval_result.feedback
    }
```

**Tests to Create** (per /detailed-testing):
- `mcp-server/tests/test_evals.py` (add to existing):
  - Test DrillEvaluator with valid drill (score=1.0)
  - Test DrillEvaluator with missing fields (score penalties)
  - Test DrillEvaluator with short problem (score penalty)
  - Test DrillEvaluator with placeholder text (score penalty)
  - Test DrillEvaluator with invalid difficulty (score penalty)
  - Test DrillEvaluator with empty tags (score penalty)
- `mcp-server/tests/test_api.py` (add to existing):
  - Test /evals/drill endpoint with valid drill
  - Test /evals/drill endpoint with invalid drill
  - Test /evals/drill records metric
  - Test /evals/drill returns correct response format

**Verification Steps**:
1. Run: `pytest tests/test_evals.py::test_drill* -v`
2. Run: `pytest tests/test_api.py::test_evals_drill* -v`
3. Start server: `python mcp-server/api.py`
4. Test: `curl -X POST http://localhost:8000/evals/drill -H "Content-Type: application/json" -d '{"problem":"Test","solution":"Test","difficulty":"easy","tags":["test"]}'`
5. Check metrics: `curl http://localhost:8000/evals/stats?evaluator=DrillEvaluator`

**🛑 STOP HERE - Wait for user verification before proceeding**

---

## Task 2.6: Document Evals Usage and Best Practices

**Status**: ⬜ Not Started

**Files to Create**:
- `mcp-server/evals/README.md`

**Content to Write**:
```markdown
# Pydantic Evals Integration

This directory contains evaluation schemas and metrics tracking for LLM outputs.

## Evaluators

### CodeFixEvaluator
Evaluates code fix responses from the LLM.

**Scoring**:
- -0.5: Missing or empty `fixed_code`
- -0.3: Missing or empty `explanation`
- -0.2: Code contains TODO/FIXME markers
- -0.3: Code is suspiciously short (< 10 chars)
- -0.2: Invalid confidence value

**Pass threshold**: 0.7

### TestCaseEvaluator
Evaluates test case generation responses.

**Scoring**:
- -0.5: Missing or empty `test_cases` list
- -0.2: Test case missing `input_data`
- -0.2: Missing or empty `reasoning`

**Pass threshold**: 0.7

### DrillEvaluator
Evaluates drill generation responses (called from JavaScript).

**Scoring**:
- -0.25: Missing required field (problem, solution, difficulty, tags)
- -0.2: Problem too short (< 20 chars)
- -0.3: Problem contains placeholder text
- -0.2: Solution too short (< 10 chars)
- -0.1: Invalid difficulty value
- -0.1: Empty or invalid tags

**Pass threshold**: 0.7

## Metrics Tracking

All evaluations are automatically logged to `evals/metrics.jsonl`.

### View Statistics

```bash
# Get overall stats
curl http://localhost:8000/evals/stats

# Get stats for specific evaluator
curl http://localhost:8000/evals/stats?evaluator=CodeFixEvaluator

# Get recent evaluations
curl http://localhost:8000/evals/recent?limit=10
```

### Programmatic Access

```python
from evals.metrics import metrics_tracker

# Get stats
stats = metrics_tracker.get_stats("CodeFixEvaluator")
print(f"Pass rate: {stats['pass_rate']:.2%}")
print(f"Average score: {stats['avg_score']:.2f}")

# Get recent metrics
recent = metrics_tracker.metrics[-10:]
for metric in recent:
    print(f"{metric.evaluator_name}: {metric.score:.2f} - {metric.passed}")
```

## Adding New Evaluators

1. Create evaluator class in `evals/schemas.py` or `evals/drill_schemas.py`
2. Inherit from `pydantic_evals.Evaluator`
3. Implement `evaluate(output: dict) -> EvalResult` method
4. Define scoring criteria and pass threshold
5. Add tests in `tests/test_evals.py`
6. Integrate into relevant code (e.g., AgentFixer, API endpoints)

Example:

```python
class MyEvaluator(Evaluator):
    def evaluate(self, output: dict) -> EvalResult:
        score = 1.0
        feedback = []

        # Add scoring logic
        if "required_field" not in output:
            score -= 0.5
            feedback.append("Missing required_field")

        return EvalResult(
            score=max(0.0, score),
            passed=score >= 0.7,
            feedback=feedback
        )
```

## Best Practices

1. **Pass threshold**: Use 0.7 as default, adjust based on use case
2. **Feedback messages**: Be specific and actionable
3. **Scoring**: Deduct points proportional to severity
4. **Retries**: Use eval feedback to improve LLM prompts
5. **Monitoring**: Check `/evals/stats` regularly to track LLM performance
6. **Logging**: All evals are logged automatically, no manual logging needed

## Testing

```bash
# Run all eval tests
pytest tests/test_evals.py -v

# Run metrics tests
pytest tests/test_metrics.py -v

# Run API eval tests
pytest tests/test_api.py::test_evals* -v
```
```

**Tests to Create** (per /detailed-testing):
- `mcp-server/tests/test_documentation.py`:
  - Test README.md exists and is not empty
  - Test README.md contains all evaluator names
  - Test README.md contains usage examples
  - Test code examples in README are valid Python
  - Test curl commands in README are valid

**Verification Steps**:
1. Run: `pytest tests/test_documentation.py -v`
2. Read: `cat mcp-server/evals/README.md`
3. Verify all examples work as documented
4. Check links and references are correct

**🛑 STOP HERE - Wait for user verification before proceeding**

---

## Phase 2 Completion Checklist

- [ ] Task 2.1: Pydantic Evals dependency added and evaluators created
- [ ] Task 2.2: Evals integrated into AgentFixer with retry logic
- [ ] Task 2.3: Metrics tracking implemented
- [ ] Task 2.4: Eval stats endpoints added
- [ ] Task 2.5: Drill evaluation endpoint for JavaScript bridge
- [ ] Task 2.6: Documentation complete
- [ ] All tests passing: `pytest tests/ -v`
- [ ] Metrics logging to JSONL file
- [ ] Eval stats accessible via API

**Success Criteria**:
- ✅ All 6 tasks completed with tests passing
- ✅ LLM outputs validated with automatic retry
- ✅ Evaluation metrics tracked and accessible
- ✅ JavaScript can call Python eval endpoints
- ✅ Documentation complete and accurate
- ✅ Foundation ready for Phase 3 (Pydantic AI)

---

**Previous Phase**: [phase1_pydantic_models.md](./phase1_pydantic_models.md)
**Next Phase**: [phase3_pydantic_ai.md](./phase3_pydantic_ai.md)
