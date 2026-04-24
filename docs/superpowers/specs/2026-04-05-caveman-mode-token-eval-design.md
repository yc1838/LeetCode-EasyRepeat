# Caveman Mode Token Savings Eval

## Goal

Quantify whether Caveman Mode saves tokens net (output savings > input overhead) using LangSmith A/B evaluation, and whether it degrades fix/explanation quality.

## Background

- Caveman Mode is already implemented in `src/content/llm_sidecar.js` (frontend)
- The LangSmith eval pipeline (`mcp-server/scripts/eval_prompts.py`) already runs structured vs streaming A/B experiments
- Previous experiment: structured Pydantic > streaming freeform. Streaming variant is dropped from this experiment.
- The existing seed dataset (`mcp-server/eval_data/seed_dataset.json`) is reused

## Approach: Approach B — `caveman_mode` parameter on `AgentFixer`

Add `caveman_mode: bool = False` to `AgentFixer`, so the caveman instruction is defined once in production code and shared by both eval and (eventually) frontend.

### Why not session-based caching?

- LangSmith `aevaluate` runs each dataset example independently; no shared session support
- Gemini context caching requires 32k+ tokens minimum; caveman instruction is ~50 tokens
- This experiment uses independent per-example calls

## Design

### 1. `mcp-server/api.py` Changes

**Add `CAVEMAN_INSTRUCTION` constant:**

```python
CAVEMAN_INSTRUCTION = (
    "CRITICAL: Respond like a SMART CAVEMAN. "
    "Cut ALL articles (a, an, the), filler, and pleasantries. "
    "Minimize pronouns and auxiliary verbs. "
    "Technical accuracy must remain 100%. "
    "Structure: [thing] [action] [reason]. [next step]."
)
```

This matches the instruction in `src/content/llm_sidecar.js` lines 799-803.

**Modify `AgentFixer.__init__`:**

```python
def __init__(self, llm, *, caveman_mode: bool = False):
    self.llm = llm
    self.caveman_mode = caveman_mode
    # ... rest unchanged
```

**Modify `generate_fix_details` template:**

When `self.caveman_mode` is True, append `CAVEMAN_INSTRUCTION` to the prompt template, before the closing instructions.

**Modify `generate_fix_streaming` template:**

Same pattern — append `CAVEMAN_INSTRUCTION` when enabled. Not evaluated in this experiment, but added for consistency so the parameter works across all methods.

Default is `False`. No existing behavior changes.

### 2. `mcp-server/scripts/eval_prompts.py` Changes

**Add `structured_caveman_target`:**

```python
async def structured_caveman_target(inputs, *, provider, model, ...):
    llm = get_llm(provider, model, ...)
    agent = AgentFixer(llm, caveman_mode=True)  # <-- only difference
    # ... same as structured_target
```

**Modify `run_evaluations`:**

- Remove `streaming_target` / `streaming-freeform` experiment
- Add `structured-caveman` experiment using `structured_caveman_target`
- Metadata includes `"caveman_mode": True` for filtering

Two experiments total:

| Experiment Prefix | Target | Caveman |
|---|---|---|
| `structured-pydantic` | `structured_target` | False |
| `structured-caveman` | `structured_caveman_target` | True |

Both use the same scorers: `fix_quality_scorer`, `explanation_quality_scorer`.

**Add token summary to `print_experiment_summary`:**

Pull `prompt_tokens`, `completion_tokens`, `total_tokens` from experiment aggregate and print alongside quality scores.

**CLI changes:**

- Add `--caveman-only` flag to skip baseline (useful when baseline was already run)
- Remove streaming-related CLI options (if any)

### 3. What We Measure

| Metric | Meaning |
|---|---|
| `delta completion_tokens` | Output tokens saved by caveman (expect negative) |
| `delta prompt_tokens` | Input overhead from caveman instruction (expect ~+50) |
| `delta total_tokens` | Net savings or cost |
| `fix_quality` score | Whether fix correctness degrades |
| `explanation_quality` score | Whether explanation clarity degrades |

### 4. Files Changed

| File | Change |
|---|---|
| `mcp-server/api.py` | `CAVEMAN_INSTRUCTION` constant; `AgentFixer(caveman_mode)` parameter; conditional append in `generate_fix_details` and `generate_fix_streaming` templates |
| `mcp-server/scripts/eval_prompts.py` | `structured_caveman_target`; caveman experiment in `run_evaluations`; token summary; `--caveman-only` flag; remove streaming variant |

### 5. Not In Scope

- Frontend changes to `llm_sidecar.js`
- `generate_tests` caveman eval (needs a new scorer for test case quality — follow-up)
- Session-based caching / multi-turn eval (LangSmith limitation)
- New dataset creation
