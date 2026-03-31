# OpenEvals A/B Testing Guide

This document walks through running prompt A/B evaluations to compare `generate_fix` (structured Pydantic) vs `generate_fix_streaming` (freeform) variants.

## Overview

The evaluation uses LangSmith + OpenEvals to score two prompt variants against a dataset of real failed code fixes:
1. **Structured variant**: Pydantic-based output with `explanation` field
2. **Streaming variant**: Freeform text output, faster feedback

Both are scored on fix quality (correctness, edge cases, cleanliness) and the structured variant is also scored on explanation quality.

---

## Prerequisites

- **LangSmith API key** in `.env` as `LANGCHAIN_API_KEY`
- **LangSmith project** set up (e.g., `LANGCHAIN_PROJECT="LeetCode EasyRepeat"`)
- **Judge model** running locally via Ollama (e.g., `deepseek-r1:8b` for reasoning-based scoring)
- **Application LLM** available (Ollama, OpenAI, etc.) to generate fixes during eval

---

## Step 1: Populate the Dataset

The dataset contains seed examples (code, error, test_input) extracted from your LangSmith traces.

### If the dataset is empty:

```bash
cd mcp-server

# Scrape Auto_Fix_Agent_Loop runs and add to existing dataset
export LANGCHAIN_PROJECT="LeetCode EasyRepeat"
export LANGCHAIN_API_KEY="<your-api-key>"

python scripts/populate_dataset.py
```

**What it does:**
- Queries LangSmith for `Auto_Fix_Agent_Loop` chain runs (first 30)
- Extracts `code`, `error`, `test_input` from each run
- Adds examples to your LangSmith dataset (e.g., "LeetCode EasyRepeat Dataset")

---

## Step 2: Run the Evaluation

```bash
cd mcp-server

export LANGCHAIN_PROJECT="LeetCode EasyRepeat"
export LANGCHAIN_API_KEY="<your-api-key>"
export AUTOFIX_EVAL_PROVIDER="ollama"
export AUTOFIX_EVAL_MODEL="gemma3:latest"
export AUTOFIX_EVAL_BASE_URL="http://localhost:11434"
export OPENEVALS_JUDGE_MODEL="deepseek-r1:8b"
export OPENEVALS_JUDGE_BASE_URL="http://localhost:11434"

python scripts/eval_prompts.py --dataset-name "LeetCode EasyRepeat Dataset"
```

**What it does:**
- Loads your dataset from LangSmith
- Runs **structured_target** on all examples:
  - Calls `AgentFixer.generate_fix()` (structured Pydantic variant)
  - Scores output with `fix_quality_scorer` and `explanation_quality_scorer`
  - Creates experiment "structured-pydantic-<id>"
- Runs **streaming_target** on all examples:
  - Calls `AgentFixer.generate_fix_streaming()`
  - Scores output with `fix_quality_scorer` only
  - Creates experiment "streaming-freeform-<id>"
- Prints LangSmith URLs where results appear

### Environment Variables (Customize as Needed)

| Variable | Default | Purpose |
|----------|---------|---------|
| `AUTOFIX_EVAL_PROVIDER` | `ollama` | Which LLM provider to use for fixes |
| `AUTOFIX_EVAL_MODEL` | Provider's default | Which model to use for fixes |
| `AUTOFIX_EVAL_BASE_URL` | `http://localhost:11434` | Base URL for fix generation LLM |
| `OPENEVALS_JUDGE_MODEL` | `deepseek-r1:8b` | Judge model for scoring |
| `OPENEVALS_JUDGE_BASE_URL` | `http://localhost:11434` | Judge model base URL |
| `OPENEVALS_MAX_CONCURRENCY` | `4` | Parallel evals to run simultaneously |

---

## Step 3: Review Results in LangSmith

The eval script prints two URLs to compare experiments. Open them to see:

- **Mean scores** per variant (fix_quality, explanation_quality)
- **Standard deviations** (consistency of fixes)
- **Per-example breakdowns** with judge reasoning
- **Failure patterns** (which types of errors does each variant struggle with?)

### Decision Criteria

| Condition | Action |
|-----------|--------|
| Structured ≥ Streaming by >0.10 | Keep structured, remove streaming |
| Streaming > Structured by >0.10 | Keep streaming, remove/simplify structured |
| Within 0.05 difference | Keep structured (more reliable parsing, has explanations) |

---

## Step 4: Update Code & Ship

Once you decide the winner:

1. **Update `PROMPT_VERSIONS` in `api.py`**:
   ```python
   PROMPT_VERSIONS = {
       "fix_generation": "structured",  # or "streaming"
       ...
   }
   ```

2. **Remove the losing variant** from `AgentFixer` class if desired (optional—keeping both is safe)

3. **Document the decision** in `DECISIONS.md`:
   ```markdown
   ## Eval: Structured vs Streaming Prompts (2026-03-28)

   - **Dataset**: LeetCode EasyRepeat Dataset (30 examples)
   - **Judge Model**: deepseek-r1:8b
   - **Structured mean fix_quality**: 0.75 ± 0.15
   - **Streaming mean fix_quality**: 0.68 ± 0.18
   - **Winner**: Structured (+0.07 edge, more consistent)
   - **Action**: Kept structured, removed streaming fallback
   ```

---

## Troubleshooting

**"Dataset not found"**
- Dataset name must match exactly in LangSmith
- Pass `--dataset-name "Your Dataset Name"` to match

**"No examples found in the dataset"**
- Run `populate_dataset.py` first to add examples from your traces

**"LLM Generation Failed: All connection attempts failed"**
- Start Ollama: `ollama serve`
- Verify judge model: `ollama pull deepseek-r1:8b`
- Verify application model: `ollama pull gemma3:latest`
- Check base URL: defaults to `http://localhost:11434`

**"The 'pandas' library is required"**
- Summary stats won't display locally, but results are in LangSmith
- Optional: `pip install pandas` to see summaries

---

## Files Involved

```
mcp-server/
├── scripts/
│   ├── eval_prompts.py        ← Main eval runner
│   └── populate_dataset.py    ← Populate dataset from traces
├── tests/
│   └── test_eval_prompts.py   ← Tests (run: pytest tests/test_eval_prompts.py)
├── .env                        ← API keys (do not commit!)
└── EVAL_INSTRUCTIONS.md        ← This file
```

---

## Copy-Paste Command Templates

### Full Setup (populate + eval)

```bash
cd mcp-server && \
export LANGCHAIN_PROJECT="LeetCode EasyRepeat" && \
export LANGCHAIN_API_KEY="<your-key>" && \
python scripts/populate_dataset.py && \
AUTOFIX_EVAL_PROVIDER="ollama" \
AUTOFIX_EVAL_MODEL="gemma3:latest" \
OPENEVALS_JUDGE_MODEL="deepseek-r1:8b" \
python scripts/eval_prompts.py --dataset-name "LeetCode EasyRepeat Dataset"
```

### Just Run Eval (dataset already populated)

```bash
cd mcp-server && \
export LANGCHAIN_PROJECT="LeetCode EasyRepeat" && \
export LANGCHAIN_API_KEY="<your-key>" && \
AUTOFIX_EVAL_PROVIDER="ollama" \
AUTOFIX_EVAL_MODEL="gemma3:latest" \
OPENEVALS_JUDGE_MODEL="deepseek-r1:8b" \
python scripts/eval_prompts.py --dataset-name "LeetCode EasyRepeat Dataset"
```

---

**Note:** Keep your actual API keys and commands in a local `.env.local` or shell aliases—this file is safe to commit as it contains placeholders only.
