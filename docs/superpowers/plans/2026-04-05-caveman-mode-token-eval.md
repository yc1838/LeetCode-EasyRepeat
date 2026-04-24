# Caveman Mode Token Savings Eval — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `caveman_mode` to `AgentFixer` and run a LangSmith A/B experiment to measure whether caveman-style prompts save tokens without degrading fix quality.

**Architecture:** Add a `CAVEMAN_INSTRUCTION` constant and `caveman_mode: bool` parameter to `AgentFixer` in `api.py`. The eval script gets a new `structured_caveman_target` that uses `AgentFixer(llm, caveman_mode=True)`. Both baseline and caveman experiments run on the same dataset with the same scorers, and token stats are printed for comparison.

**Tech Stack:** Python, LangChain, LangSmith (`aevaluate`), Pydantic, pytest

**Spec:** `docs/superpowers/specs/2026-04-05-caveman-mode-token-eval-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `mcp-server/api.py` | Modify | `CAVEMAN_INSTRUCTION` constant; `caveman_mode` param on `AgentFixer`; conditional append in `generate_fix_details` and `generate_fix_streaming` templates |
| `mcp-server/scripts/eval_prompts.py` | Modify | `structured_caveman_target`; caveman experiment in `run_evaluations`; token summary in `print_experiment_summary`; `--caveman-only` CLI flag; remove streaming variant |
| `mcp-server/tests/test_agent_fixer.py` | Modify | Tests for `caveman_mode` parameter and prompt injection |

---

## Task 1: Add `CAVEMAN_INSTRUCTION` constant and `caveman_mode` parameter to `AgentFixer`

**Files:**
- Modify: `mcp-server/api.py:32-36` (add constant after `PROMPT_VERSIONS`)
- Modify: `mcp-server/api.py:400-408` (`AgentFixer.__init__`)
- Test: `mcp-server/tests/test_agent_fixer.py`

- [ ] **Step 1: Write failing tests for caveman_mode parameter**

Add these tests to `mcp-server/tests/test_agent_fixer.py`:

```python
def test_agent_fixer_caveman_mode_default_false():
    mock_llm = _make_mock_llm()
    agent = AgentFixer(mock_llm)
    assert agent.caveman_mode is False


def test_agent_fixer_caveman_mode_true():
    mock_llm = _make_mock_llm()
    agent = AgentFixer(mock_llm, caveman_mode=True)
    assert agent.caveman_mode is True
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mcp-server && python -m pytest tests/test_agent_fixer.py::test_agent_fixer_caveman_mode_default_false tests/test_agent_fixer.py::test_agent_fixer_caveman_mode_true -v`

Expected: FAIL — `AgentFixer.__init__` does not accept `caveman_mode`

- [ ] **Step 3: Add `CAVEMAN_INSTRUCTION` constant and modify `AgentFixer.__init__`**

In `mcp-server/api.py`, add the constant right after the `PROMPT_VERSIONS` dict (around line 36):

```python
CAVEMAN_INSTRUCTION = (
    "CRITICAL: Respond like a SMART CAVEMAN. "
    "Cut ALL articles (a, an, the), filler, and pleasantries. "
    "Minimize pronouns and auxiliary verbs. "
    "Technical accuracy must remain 100%. "
    "Structure: [thing] [action] [reason]. [next step]."
)
```

Modify `AgentFixer.__init__` (around line 400-408) from:

```python
class AgentFixer:
    def __init__(self, llm, metadata: dict = None):
        self.llm = llm
        self.metadata = metadata or {}
```

to:

```python
class AgentFixer:
    def __init__(self, llm, metadata: dict = None, *, caveman_mode: bool = False):
        self.llm = llm
        self.metadata = metadata or {}
        self.caveman_mode = caveman_mode
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd mcp-server && python -m pytest tests/test_agent_fixer.py::test_agent_fixer_caveman_mode_default_false tests/test_agent_fixer.py::test_agent_fixer_caveman_mode_true tests/test_agent_fixer.py::test_agent_fixer_initialization -v`

Expected: All 3 PASS (including the existing `test_agent_fixer_initialization` to confirm no regression)

- [ ] **Step 5: Commit**

```bash
git add mcp-server/api.py mcp-server/tests/test_agent_fixer.py
git commit -m "feat: add CAVEMAN_INSTRUCTION constant and caveman_mode param to AgentFixer"
```

---

## Task 2: Inject caveman instruction into `generate_fix_details` template

**Files:**
- Modify: `mcp-server/api.py:415-456` (`generate_fix_details`)
- Test: `mcp-server/tests/test_agent_fixer.py`

- [ ] **Step 1: Write failing test for caveman prompt injection**

Add to `mcp-server/tests/test_agent_fixer.py`:

```python
@pytest.mark.anyio
async def test_generate_fix_details_caveman_injects_instruction():
    """When caveman_mode=True, the prompt sent to the LLM contains CAVEMAN_INSTRUCTION."""
    from api import CAVEMAN_INSTRUCTION

    mock_codefix = CodeFix(
        fixed_code="def fixed(): return 1",
        explanation="Fixed"
    )

    mock_llm = _make_mock_llm()
    mock_chain = MagicMock()
    from unittest.mock import AsyncMock
    mock_chain.ainvoke = AsyncMock(return_value=mock_codefix)

    captured_template = {}

    original_from_template = __import__('langchain_core.prompts', fromlist=['PromptTemplate']).PromptTemplate.from_template

    def spy_from_template(template_str):
        captured_template['text'] = template_str
        return original_from_template(template_str)

    with patch("api.PromptTemplate.from_template", side_effect=spy_from_template):
        with patch("api.PromptTemplate.__or__", return_value=mock_chain):
            agent = AgentFixer(mock_llm, caveman_mode=True)
            await agent.generate_fix_details("bad code", "Error", "1")

    assert CAVEMAN_INSTRUCTION in captured_template['text']


@pytest.mark.anyio
async def test_generate_fix_details_no_caveman_by_default():
    """When caveman_mode=False (default), the prompt does NOT contain CAVEMAN_INSTRUCTION."""
    from api import CAVEMAN_INSTRUCTION

    mock_codefix = CodeFix(
        fixed_code="def fixed(): return 1",
        explanation="Fixed"
    )

    mock_llm = _make_mock_llm()
    mock_chain = MagicMock()
    from unittest.mock import AsyncMock
    mock_chain.ainvoke = AsyncMock(return_value=mock_codefix)

    captured_template = {}

    original_from_template = __import__('langchain_core.prompts', fromlist=['PromptTemplate']).PromptTemplate.from_template

    def spy_from_template(template_str):
        captured_template['text'] = template_str
        return original_from_template(template_str)

    with patch("api.PromptTemplate.from_template", side_effect=spy_from_template):
        with patch("api.PromptTemplate.__or__", return_value=mock_chain):
            agent = AgentFixer(mock_llm, caveman_mode=False)
            await agent.generate_fix_details("bad code", "Error", "1")

    assert CAVEMAN_INSTRUCTION not in captured_template['text']
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mcp-server && python -m pytest tests/test_agent_fixer.py::test_generate_fix_details_caveman_injects_instruction tests/test_agent_fixer.py::test_generate_fix_details_no_caveman_by_default -v`

Expected: `test_generate_fix_details_caveman_injects_instruction` FAILS (instruction not in template yet)

- [ ] **Step 3: Modify `generate_fix_details` to conditionally append caveman instruction**

In `mcp-server/api.py`, modify the `generate_fix_details` method. Change the template from:

```python
        template = """
        You are an expert Python coding assistant.
        The user has the following buggy code which failed with an error.

        CODE:
        {code}

        ERROR:
        {error}

        FAILING INPUT:
        {test_input}

        Task: Write a CORRECT, WORKING Python solution that fixes this error.
        Return it complying with the requested JSON schema.
        """
```

to:

```python
        template = """
        You are an expert Python coding assistant.
        The user has the following buggy code which failed with an error.

        CODE:
        {code}

        ERROR:
        {error}

        FAILING INPUT:
        {test_input}

        Task: Write a CORRECT, WORKING Python solution that fixes this error.
        Return it complying with the requested JSON schema.
        """

        if self.caveman_mode:
            template += f"\n        {CAVEMAN_INSTRUCTION}\n"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd mcp-server && python -m pytest tests/test_agent_fixer.py -v -k "caveman"`

Expected: All caveman tests PASS

- [ ] **Step 5: Commit**

```bash
git add mcp-server/api.py mcp-server/tests/test_agent_fixer.py
git commit -m "feat: inject caveman instruction into generate_fix_details when enabled"
```

---

## Task 3: Inject caveman instruction into `generate_fix_streaming` template

**Files:**
- Modify: `mcp-server/api.py:469-537` (`generate_fix_streaming`)

- [ ] **Step 1: Modify `generate_fix_streaming` to conditionally append caveman instruction**

In `mcp-server/api.py`, in the `generate_fix_streaming` method, change the template from:

```python
        template = """You are an expert Python coding assistant.
The user has the following buggy code which failed with an error.

CODE:
{code}

ERROR:
{error}

FAILING INPUT:
{test_input}

Task: Write a CORRECT, WORKING Python solution that fixes this error.
First, briefly analyze the bug and explain your thought process. 
Then, provide the fixed code inside a single ```python code fence.
Do not provide additional explanations after the code fence.
"""
```

to:

```python
        template = """You are an expert Python coding assistant.
The user has the following buggy code which failed with an error.

CODE:
{code}

ERROR:
{error}

FAILING INPUT:
{test_input}

Task: Write a CORRECT, WORKING Python solution that fixes this error.
First, briefly analyze the bug and explain your thought process. 
Then, provide the fixed code inside a single ```python code fence.
Do not provide additional explanations after the code fence.
"""

        if self.caveman_mode:
            template += f"\n{CAVEMAN_INSTRUCTION}\n"
```

- [ ] **Step 2: Run existing tests to confirm no regression**

Run: `cd mcp-server && python -m pytest tests/test_agent_fixer.py -v`

Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add mcp-server/api.py
git commit -m "feat: inject caveman instruction into generate_fix_streaming for consistency"
```

---

## Task 4: Add `structured_caveman_target` to eval script

**Files:**
- Modify: `mcp-server/scripts/eval_prompts.py:225-252` (after `structured_target`)

- [ ] **Step 1: Add `structured_caveman_target` function**

In `mcp-server/scripts/eval_prompts.py`, add this function right after `structured_target` (after line 252):

```python
async def structured_caveman_target(
    inputs: dict[str, Any],
    *,
    provider: str = DEFAULT_PROVIDER,
    model: str | None = DEFAULT_MODEL,
    api_key: str | None = None,
    base_url: str | None = DEFAULT_BASE_URL,
) -> dict[str, str]:
    try:
        resolved_model = _resolve_app_model(provider, model)
        llm = get_llm(provider, resolved_model, api_key=api_key, base_url=base_url)
        agent = AgentFixer(llm, caveman_mode=True)

        if hasattr(agent, "generate_fix_details"):
            result = await agent.generate_fix_details(
                inputs.get("code", ""),
                inputs.get("error", ""),
                inputs.get("test_input", ""),
            )
        else:
            result = await agent.generate_fix(
                inputs.get("code", ""),
                inputs.get("error", ""),
                inputs.get("test_input", ""),
            )
        return parse_structured_fix(result)
    except Exception:
        return parse_structured_fix(None)
```

- [ ] **Step 2: Verify the import works**

Run: `cd mcp-server && python -c "from scripts.eval_prompts import structured_caveman_target; print('OK')"`

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add mcp-server/scripts/eval_prompts.py
git commit -m "feat: add structured_caveman_target for caveman A/B eval"
```

---

## Task 5: Update `run_evaluations` — remove streaming, add caveman experiment

**Files:**
- Modify: `mcp-server/scripts/eval_prompts.py:305-372` (`run_evaluations`)

- [ ] **Step 1: Replace `run_evaluations` body**

In `mcp-server/scripts/eval_prompts.py`, replace the `run_evaluations` function with:

```python
async def run_evaluations(
    *,
    dataset_name: str | None = None,
    provider: str = DEFAULT_PROVIDER,
    model: str | None = DEFAULT_MODEL,
    api_key: str | None = None,
    base_url: str | None = DEFAULT_BASE_URL,
    judge_model: str = DEFAULT_JUDGE_MODEL,
    judge_base_url: str = DEFAULT_JUDGE_BASE_URL,
    max_concurrency: int = DEFAULT_MAX_CONCURRENCY,
    caveman_only: bool = False,
) -> dict[str, Any]:
    resolved_dataset_name = dataset_name or _default_dataset_name()
    resolved_model = _resolve_app_model(provider, model)
    fix_quality_scorer, explanation_quality_scorer = build_scorers(judge_model, judge_base_url)

    results = {}

    if not caveman_only:
        structured_metadata = {
            "prompt_version": PROMPT_VERSIONS["fix_generation"],
            "variant": "structured",
            "caveman_mode": False,
            "app_provider": provider,
            "app_model": resolved_model,
            "judge_model": judge_model,
        }

        structured_results = await aevaluate(
            functools.partial(
                structured_target,
                provider=provider,
                model=resolved_model,
                api_key=api_key,
                base_url=base_url,
            ),
            data=resolved_dataset_name,
            evaluators=[fix_quality_scorer, explanation_quality_scorer],
            experiment_prefix="structured-pydantic",
            description="Structured Pydantic autofix prompt evaluation.",
            metadata=structured_metadata,
            max_concurrency=max_concurrency,
        )
        print_experiment_summary("structured-pydantic", structured_results)
        results["structured"] = structured_results

    # --- Caveman variant ---
    caveman_metadata = {
        "prompt_version": PROMPT_VERSIONS["fix_generation"],
        "variant": "structured-caveman",
        "caveman_mode": True,
        "app_provider": provider,
        "app_model": resolved_model,
        "judge_model": judge_model,
    }

    caveman_results = await aevaluate(
        functools.partial(
            structured_caveman_target,
            provider=provider,
            model=resolved_model,
            api_key=api_key,
            base_url=base_url,
        ),
        data=resolved_dataset_name,
        evaluators=[fix_quality_scorer, explanation_quality_scorer],
        experiment_prefix="structured-caveman",
        description="Structured Pydantic autofix with caveman mode — token savings evaluation.",
        metadata=caveman_metadata,
        max_concurrency=max_concurrency,
    )
    print_experiment_summary("structured-caveman", caveman_results)
    results["caveman"] = caveman_results

    return results
```

- [ ] **Step 2: Verify syntax**

Run: `cd mcp-server && python -c "from scripts.eval_prompts import run_evaluations; print('OK')"`

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add mcp-server/scripts/eval_prompts.py
git commit -m "feat: replace streaming with caveman experiment in run_evaluations"
```

---

## Task 6: Add token summary to `print_experiment_summary`

**Files:**
- Modify: `mcp-server/scripts/eval_prompts.py:277-303` (`print_experiment_summary`)

- [ ] **Step 1: Enhance `print_experiment_summary` to include token stats**

Replace the existing `print_experiment_summary` function with:

```python
def print_experiment_summary(label: str, results: Any) -> None:
    experiment_name = getattr(results, "experiment_name", None) or label
    print(f"[{label}] experiment={experiment_name}")

    try:
        frame = results.to_pandas()
    except Exception as exc:
        print(f"[{label}] Summary unavailable locally: {exc}")
        return

    print(f"[{label}] rows={len(frame)}")
    numeric_means: dict[str, float] = {}
    for column in frame.columns:
        lowered = str(column).lower()
        if "score" not in lowered and "feedback" not in lowered:
            continue
        try:
            mean_value = frame[column].dropna().mean()
            numeric_value = float(mean_value)
        except Exception:
            continue
        if numeric_value == numeric_value:
            numeric_means[str(column)] = round(numeric_value, 4)

    if numeric_means:
        print(json.dumps(numeric_means, indent=2, sort_keys=True))

    # Token usage summary
    token_cols = {
        col: col for col in frame.columns
        if any(tok in str(col).lower() for tok in ("prompt_token", "completion_token", "total_token"))
    }
    if token_cols:
        token_stats: dict[str, float] = {}
        for col_name in token_cols:
            try:
                mean_val = float(frame[col_name].dropna().mean())
                if mean_val == mean_val:
                    token_stats[str(col_name)] = round(mean_val, 1)
            except Exception:
                continue
        if token_stats:
            print(f"[{label}] token_usage={json.dumps(token_stats, sort_keys=True)}")
```

- [ ] **Step 2: Verify syntax**

Run: `cd mcp-server && python -c "from scripts.eval_prompts import print_experiment_summary; print('OK')"`

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add mcp-server/scripts/eval_prompts.py
git commit -m "feat: add token usage stats to print_experiment_summary"
```

---

## Task 7: Add `--caveman-only` CLI flag

**Files:**
- Modify: `mcp-server/scripts/eval_prompts.py:375-405` (`_build_parser` and `main`)

- [ ] **Step 1: Add `--caveman-only` flag to parser and pass to `run_evaluations`**

Replace `_build_parser` and `main` with:

```python
def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-name", default=_default_dataset_name())
    parser.add_argument("--provider", default=DEFAULT_PROVIDER)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--api-key")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--judge-model", default=DEFAULT_JUDGE_MODEL)
    parser.add_argument("--judge-base-url", default=DEFAULT_JUDGE_BASE_URL)
    parser.add_argument("--max-concurrency", type=int, default=DEFAULT_MAX_CONCURRENCY)
    parser.add_argument(
        "--caveman-only",
        action="store_true",
        help="Skip baseline structured experiment, only run caveman variant",
    )
    return parser


def main() -> None:
    args = _build_parser().parse_args()
    asyncio.run(
        run_evaluations(
            dataset_name=args.dataset_name,
            provider=args.provider,
            model=args.model,
            api_key=args.api_key,
            base_url=args.base_url,
            judge_model=args.judge_model,
            judge_base_url=args.judge_base_url,
            max_concurrency=args.max_concurrency,
            caveman_only=args.caveman_only,
        )
    )
```

- [ ] **Step 2: Verify CLI flag is recognized**

Run: `cd mcp-server && python scripts/eval_prompts.py --help`

Expected: Output includes `--caveman-only` with help text "Skip baseline structured experiment, only run caveman variant"

- [ ] **Step 3: Commit**

```bash
git add mcp-server/scripts/eval_prompts.py
git commit -m "feat: add --caveman-only CLI flag to eval script"
```

---

## Task 8: Remove `streaming_target` and streaming experiment code

**Files:**
- Modify: `mcp-server/scripts/eval_prompts.py`

- [ ] **Step 1: Delete `streaming_target` function**

Remove the entire `streaming_target` function (lines 255-274 in the original file). This function is no longer called by `run_evaluations` after Task 5.

- [ ] **Step 2: Remove the `streaming_metadata` dict from `PROMPT_VERSIONS` reference if no longer needed**

In `mcp-server/api.py`, the `PROMPT_VERSIONS` dict still has `"fix_generation_streaming"`. Leave it — it's used by `generate_fix_streaming` for tracing metadata. Only remove the `streaming_target` from eval_prompts.py.

- [ ] **Step 3: Run full test suite to confirm no regressions**

Run: `cd mcp-server && python -m pytest tests/test_agent_fixer.py -v`

Expected: All tests PASS

- [ ] **Step 4: Verify eval script still imports cleanly**

Run: `cd mcp-server && python -c "from scripts.eval_prompts import run_evaluations, structured_caveman_target; print('OK')"`

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add mcp-server/scripts/eval_prompts.py
git commit -m "chore: remove streaming_target from eval script (structured-only going forward)"
```

---

## Task 9: Final integration verification

- [ ] **Step 1: Run all agent fixer tests**

Run: `cd mcp-server && python -m pytest tests/test_agent_fixer.py tests/test_agent_fixer_tests.py -v`

Expected: All tests PASS

- [ ] **Step 2: Dry-run the eval CLI help**

Run: `cd mcp-server && python scripts/eval_prompts.py --help`

Expected: Shows `--caveman-only` flag, all other flags still present

- [ ] **Step 3: Verify CAVEMAN_INSTRUCTION matches frontend**

Run a quick check that the constant matches what's in `llm_sidecar.js`:

```bash
grep -A5 "CAVEMAN_INSTRUCTION" mcp-server/api.py
grep -A5 "Respond like a SMART CAVEMAN" src/content/llm_sidecar.js
```

Expected: Both contain the same instruction text (wording match)

- [ ] **Step 4: Commit any final adjustments and tag**

```bash
git add -A
git status  # verify only expected files
git commit -m "chore: caveman mode token eval — integration verified"
```
