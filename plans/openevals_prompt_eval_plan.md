# OpenEvals Integration Plan: Prompt A/B Testing

## Goal
Use `openevals` to determine which prompt variant (`generate_fix` structured Pydantic vs `generate_fix_streaming` freeform) produces better code fixes, using a free open-source judge model running locally via Ollama.

---

## On Using Open-Source Models (DeepSeek, etc.)

**Yes — 100% possible and recommended for your setup.**

Your project already supports Ollama via `ChatOllama`. OpenEvals accepts any `BaseChatModel` as its judge. You can run DeepSeek, Qwen, or Mistral locally and pass it directly:

```python
from langchain_ollama import ChatOllama
from openevals.llm import create_llm_as_judge

judge = ChatOllama(model="deepseek-r1:8b", base_url="http://localhost:11434", temperature=0)

scorer = create_llm_as_judge(
    prompt=FIX_QUALITY_RUBRIC,
    judge=judge,           # ← your local Ollama model, no API key
    continuous=True,
)
```

**Recommended judge models (Ollama pull commands):**

| Model | Size | Strength | Command |
|---|---|---|---|
| `deepseek-r1:8b` | ~5 GB | Strong reasoning, great for code eval | `ollama pull deepseek-r1:8b` |
| `deepseek-r1:14b` | ~9 GB | Even better reasoning | `ollama pull deepseek-r1:14b` |
| `qwen2.5-coder:7b` | ~4 GB | Code-specialized | `ollama pull qwen2.5-coder:7b` |
| `mistral:7b` | ~4 GB | Fast, solid for text | `ollama pull mistral:7b` |

> [!NOTE]
> `deepseek-r1` variants include chain-of-thought reasoning which makes the `reasoning` field in scores much more informative — highly recommended over vanilla DeepSeek v2 for evaluation tasks.

---

## Task Breakdown

### Phase 0 — Setup

#### Task 0.1 — Install `openevals`
- Open `mcp-server/requirements.txt`
- Add `openevals` on a new line
- Run `pip install openevals` inside the `mcp-server/venv`

#### Task 0.2 — Pull judge model via Ollama
- Decide which model to use (recommendation: `deepseek-r1:8b`)
- Run `ollama pull deepseek-r1:8b` in terminal
- Verify with `ollama run deepseek-r1:8b "say hello"` — confirm response

#### Task 0.3 — Confirm LangSmith env vars are set
- Open `mcp-server/.env`
- Confirm `LANGCHAIN_API_KEY`, `LANGCHAIN_TRACING_V2=true`, `LANGCHAIN_PROJECT` are present
- If `LANGCHAIN_PROJECT` is missing, add `LANGCHAIN_PROJECT=leetcode-autofix-evals`

---

### Phase 1 — Build the Eval Dataset

#### Task 1.1 — Identify seed examples from LangSmith traces
- Go to your LangSmith project
- Filter traces by `run_type=chain` and name `Auto_Fix_Agent_Loop`
- Find 20–30 runs where the agent **failed on attempt 1** (most interesting for comparison)
- Note down the `code`, `error`, `test_input` fields from each trace's input

#### Task 1.2 — Create the dataset JSON file
- Create `mcp-server/eval_data/seed_dataset.json`
- Format: array of objects with `inputs` and optional `outputs` fields

```json
[
  {
    "inputs": {
      "code": "def two_sum(nums, target):\n    ...",
      "error": "TypeError: ...",
      "test_input": "([2,7,11,15], 9)"
    },
    "outputs": {
      "note": "Should return [0, 1]"
    }
  }
]
```

#### Task 1.3 — Upload dataset to LangSmith
- Create `mcp-server/scripts/upload_eval_dataset.py`
- Use `langsmith.Client().create_dataset()` and `create_examples()`
- Run the script once: `python scripts/upload_eval_dataset.py`
- Verify dataset appears in LangSmith UI under **Datasets**

---

### Phase 2 — Write the Eval Script

#### Task 2.1 — Create the script file
- Create `mcp-server/scripts/eval_prompts.py`
- Add file-level docstring explaining what the script does

#### Task 2.2 — Add imports and judge setup block
- Import `create_llm_as_judge` from `openevals.llm`
- Import `ChatOllama` from `langchain_ollama`
- Instantiate judge: `ChatOllama(model="deepseek-r1:8b", temperature=0)`

#### Task 2.3 — Define the `FIX_QUALITY_RUBRIC` string
- Write a rubric string with `{inputs}` and `{outputs}` placeholders
- Include explicit scoring tiers: 1.0 / 0.75 / 0.5 / 0.25 / 0.0
- Criteria: correctness, edge-case handling, code cleanliness, no regressions

#### Task 2.4 — Define the `EXPLANATION_QUALITY_RUBRIC` string
- Write a separate rubric for scoring the `explanation` field
- Criteria: accuracy (does it match the actual bug?), clarity, conciseness
- Only applies to `generate_fix` variant (structured output has `explanation` field)

#### Task 2.5 — Instantiate both scorers
```python
fix_quality_scorer = create_llm_as_judge(
    prompt=FIX_QUALITY_RUBRIC,
    judge=judge,
    continuous=True,
    use_reasoning=True,
)

explanation_scorer = create_llm_as_judge(
    prompt=EXPLANATION_QUALITY_RUBRIC,
    judge=judge,
    continuous=True,
    use_reasoning=True,
)
```

#### Task 2.6 — Write `structured_target()` async function
- Imports `get_llm` from `providers`
- Calls `AgentFixer(llm).generate_fix(code, error, test_input)`
- Returns `{"fixed_code": ..., "explanation": ...}`
- Uses provider/model from env var or hardcoded to `ollama/gemma3:latest`

#### Task 2.7 — Write `streaming_target()` async function
- Same as above but calls `generate_fix_streaming()`
- Returns `{"fixed_code": ...}` (no `explanation` field in streaming variant)

#### Task 2.8 — Add a `parse_structured_fix` helper
- Handles the case where `generate_fix` returns `None` (LLM failure)
- Returns `{"fixed_code": "", "explanation": "generation_failed"}` on `None`
- Prevents the evaluator from crashing on failed runs

#### Task 2.9 — Write the `main()` block
- Call `langsmith.evaluate()` for `structured_target` against the dataset
- Call `langsmith.evaluate()` for `streaming_target` against the dataset
- Set `experiment_prefix` to `"structured-pydantic"` and `"streaming-freeform"`
- Set `metadata` with `prompt_version` key matching `PROMPT_VERSIONS` in `api.py`
- Print summary stats after each run

---

### Phase 3 — Write Tests for the Eval Script

> Per the project rule: write tests before implementation. These tests mock the judge and verify script logic, not the LLM itself.

#### Task 3.1 — Create `mcp-server/tests/test_eval_prompts.py`

#### Task 3.2 — Test: `structured_target` returns expected shape
- Mock `AgentFixer.generate_fix` to return a known string
- Call `structured_target(inputs)` and assert output has `fixed_code` key

#### Task 3.3 — Test: `streaming_target` returns expected shape
- Mock `AgentFixer.generate_fix_streaming` to return a known string
- Assert output has `fixed_code` key

#### Task 3.4 — Test: `parse_structured_fix` handles `None` input
- Call helper with `None` result
- Assert returns `{"fixed_code": "", "explanation": "generation_failed"}`

#### Task 3.5 — Test: rubric strings contain required placeholders
- Assert `"{inputs}"` and `"{outputs}"` in `FIX_QUALITY_RUBRIC`
- Assert `"{inputs}"` and `"{outputs}"` in `EXPLANATION_QUALITY_RUBRIC`

#### Task 3.6 — Run tests
- `cd mcp-server && python -m pytest tests/test_eval_prompts.py -v`
- All tests must pass before implementing the eval script

---

### Phase 4 — Implement the Eval Script (after tests pass)

- Implement `Task 2.1` through `Task 2.9` above
- Run: `python scripts/eval_prompts.py`
- Watch scores appear in terminal and in LangSmith

---

### Phase 5 — Interpret Results and Ship

#### Task 5.1 — Compare mean scores in LangSmith
- Go to LangSmith → **Experiments** tab
- Both experiments appear side-by-side
- Look at: mean `fix_quality` score per variant, std deviation, per-example breakdowns

#### Task 5.2 — Read per-example reasoning logs
- Click into individual examples from the losing variant
- Read the `reasoning` field from DeepSeek's scores
- Identify what specific patterns caused lower scores (regex failure? Over-explanation? Edge case misses?)

#### Task 5.3 — Decide on a winner
- If structured ≥ streaming by >0.10 mean score: retire `generate_fix_streaming`, keep structured
- If streaming ≥ structured: retire `generate_fix`, simplify the streaming parser
- If within 0.05: both are equivalent — keep structured (simpler, more reliable parsing)

#### Task 5.4 — Update `PROMPT_VERSIONS` in `api.py`
- Set `fix_generation` to the winning version identifier
- If retiring a variant, remove the losing function from `AgentFixer`

#### Task 5.5 — Document the result
- Add a short note to `DECISIONS.md` with the experiment date, models used, scores, and conclusion

---

## File Map

```
mcp-server/
├── requirements.txt          ← Task 0.1: add openevals
├── .env                      ← Task 0.3: confirm LANGCHAIN vars
├── eval_data/
│   └── seed_dataset.json     ← Task 1.2: 20-30 seed examples
├── scripts/
│   ├── upload_eval_dataset.py ← Task 1.3: one-time upload
│   └── eval_prompts.py       ← Phase 4: main eval script
└── tests/
    └── test_eval_prompts.py  ← Phase 3: tests for eval script
```
