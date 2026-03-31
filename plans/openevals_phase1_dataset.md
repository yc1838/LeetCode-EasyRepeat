# Phase 1: Build the Eval Dataset (Auto-Scrape from LangSmith)

## Goal
Auto-scrape real `(buggy_code, error, test_input)` examples from existing LangSmith traces,
save them to `eval_data/seed_dataset.json`, and upload the dataset to LangSmith for use
in prompt A/B experiments.

## TDD Rule
**Every task below follows:** Write test → Confirm it fails → Implement → Confirm it passes.
Test file: `mcp-server/tests/test_scrape_dataset.py`
Source file: `mcp-server/scripts/upload_eval_dataset.py`

---

## Task 1.1 — `extract_example(run)` — Parse one LangSmith run into an example dict

### What it does
Extracts `code`, `error`, and `test_input` from a single raw LangSmith run object
and returns a structured dict. Filters out runs with incomplete data.

### Test Plan (write these FIRST)

```python
# test_scrape_dataset.py

from scripts.upload_eval_dataset import extract_example
from unittest.mock import MagicMock

def make_run(inputs=None, outputs=None):
    run = MagicMock()
    run.inputs = inputs
    run.outputs = outputs
    return run

# (A) Happy path — all fields present
def test_extract_example_happy_path():
    run = make_run(
        inputs={"code": "def f(): pass", "error": "TypeError", "initial_inputs": ["(1,)"]},
        outputs={"verified": False}
    )
    result = extract_example(run)
    assert result["inputs"]["code"] == "def f(): pass"
    assert result["inputs"]["error"] == "TypeError"
    assert result["inputs"]["test_input"] == "(1,)"

# (B) Missing inputs → returns None (skip this run)
def test_extract_example_none_inputs():
    run = make_run(inputs=None)
    assert extract_example(run) is None

# (C) Empty inputs dict → returns None
def test_extract_example_empty_inputs():
    run = make_run(inputs={})
    assert extract_example(run) is None

# (D) Missing 'code' field → returns None
def test_extract_example_missing_code():
    run = make_run(inputs={"error": "TypeError", "initial_inputs": ["(1,)"]})
    assert extract_example(run) is None

# (E) Missing 'error' field → returns None
def test_extract_example_missing_error():
    run = make_run(inputs={"code": "def f(): pass", "initial_inputs": ["(1,)"]})
    assert extract_example(run) is None

# (F) initial_inputs is empty list → test_input defaults to ""
def test_extract_example_empty_initial_inputs():
    run = make_run(inputs={"code": "def f(): pass", "error": "Err", "initial_inputs": []})
    result = extract_example(run)
    assert result is not None
    assert result["inputs"]["test_input"] == ""

# (G) initial_inputs key missing entirely → test_input defaults to ""
def test_extract_example_missing_initial_inputs():
    run = make_run(inputs={"code": "def f(): pass", "error": "Err"})
    result = extract_example(run)
    assert result is not None
    assert result["inputs"]["test_input"] == ""

# (H) Code is an empty string → still valid (let LLM handle it)
def test_extract_example_empty_code_string():
    run = make_run(inputs={"code": "", "error": "Err", "initial_inputs": ["(1,)"]})
    result = extract_example(run)
    assert result is not None

# (I) initial_inputs contains non-string element → takes first element str()
def test_extract_example_non_string_initial_input():
    run = make_run(inputs={"code": "def f(): pass", "error": "Err", "initial_inputs": [123]})
    result = extract_example(run)
    assert result["inputs"]["test_input"] == "123"
```

### Implementation spec
```python
def extract_example(run) -> dict | None:
    if not run.inputs:
        return None
    code = run.inputs.get("code")
    error = run.inputs.get("error")
    if not code or not error:
        return None
    initial_inputs = run.inputs.get("initial_inputs", [])
    test_input = str(initial_inputs[0]) if initial_inputs else ""
    return {
        "inputs": {"code": code, "error": error, "test_input": test_input}
    }
```

---

## Task 1.2 — `scrape_runs(client, project_name, limit)` — Fetch and filter runs from LangSmith

### What it does
Calls `client.list_runs()` with the right filters, maps each run through `extract_example`,
drops `None` results, and returns a list of valid example dicts.

### Test Plan (write these FIRST)

```python
from unittest.mock import MagicMock, patch
from scripts.upload_eval_dataset import scrape_runs

def make_run(inputs=None):
    run = MagicMock()
    run.inputs = inputs
    run.outputs = {}
    return run

# (A) Happy path — 3 valid runs → 3 examples returned
def test_scrape_runs_happy_path():
    client = MagicMock()
    client.list_runs.return_value = [
        make_run({"code": f"def f{i}(): pass", "error": "Err", "initial_inputs": ["(1,)"]})
        for i in range(3)
    ]
    results = scrape_runs(client, "my-project", limit=10)
    assert len(results) == 3

# (B) Some runs have missing fields → those are dropped silently
def test_scrape_runs_drops_invalid():
    client = MagicMock()
    client.list_runs.return_value = [
        make_run({"code": "def f(): pass", "error": "Err", "initial_inputs": ["(1,)"]}),
        make_run(None),   # invalid
        make_run({}),     # invalid
    ]
    results = scrape_runs(client, "my-project", limit=10)
    assert len(results) == 1

# (C) No runs returned from LangSmith → returns empty list (no crash)
def test_scrape_runs_empty():
    client = MagicMock()
    client.list_runs.return_value = []
    results = scrape_runs(client, "my-project", limit=10)
    assert results == []

# (D) client.list_runs raises an exception → raises RuntimeError with message
def test_scrape_runs_api_failure():
    client = MagicMock()
    client.list_runs.side_effect = Exception("LangSmith API timeout")
    import pytest
    with pytest.raises(RuntimeError, match="LangSmith API timeout"):
        scrape_runs(client, "my-project", limit=10)

# (E) list_runs is called with correct filter arguments
def test_scrape_runs_calls_correct_filter():
    client = MagicMock()
    client.list_runs.return_value = []
    scrape_runs(client, "my-project", limit=25)
    call_kwargs = client.list_runs.call_args.kwargs
    assert call_kwargs["project_name"] == "my-project"
    assert call_kwargs["run_type"] == "chain"
    assert "Auto_Fix_Agent_Loop" in call_kwargs.get("filter", "")
    assert call_kwargs["limit"] == 25

# (F) limit=0 → returns empty list (edge case, don't crash)
def test_scrape_runs_zero_limit():
    client = MagicMock()
    client.list_runs.return_value = []
    results = scrape_runs(client, "my-project", limit=0)
    assert results == []
```

### Implementation spec
```python
def scrape_runs(client, project_name: str, limit: int = 30) -> list[dict]:
    try:
        runs = client.list_runs(
            project_name=project_name,
            run_type="chain",
            filter='eq(name, "Auto_Fix_Agent_Loop")',
            limit=limit,
        )
    except Exception as e:
        raise RuntimeError(str(e)) from e
    return [ex for run in runs if (ex := extract_example(run)) is not None]
```

---

## Task 1.3 — `save_dataset(examples, path)` — Write examples to JSON file

### What it does
Serializes the list of example dicts to a JSON file at the given path.
Creates the parent directory if it doesn't exist.

### Test Plan (write these FIRST)

```python
import json, os, tempfile
from pathlib import Path
from scripts.upload_eval_dataset import save_dataset

# (A) Happy path — saves valid data, file is readable JSON
def test_save_dataset_happy_path(tmp_path):
    examples = [{"inputs": {"code": "def f(): pass", "error": "E", "test_input": "(1,)"}}]
    out = tmp_path / "out.json"
    save_dataset(examples, str(out))
    loaded = json.loads(out.read_text())
    assert loaded == examples

# (B) Creates parent directory if it doesn't exist
def test_save_dataset_creates_dir(tmp_path):
    out = tmp_path / "new_dir" / "dataset.json"
    save_dataset([{"inputs": {}}], str(out))
    assert out.exists()

# (C) Empty list → saves valid empty JSON array
def test_save_dataset_empty_list(tmp_path):
    out = tmp_path / "empty.json"
    save_dataset([], str(out))
    assert json.loads(out.read_text()) == []

# (D) Overwrites existing file cleanly
def test_save_dataset_overwrites(tmp_path):
    out = tmp_path / "data.json"
    save_dataset([{"inputs": {"old": True}}], str(out))
    save_dataset([{"inputs": {"new": True}}], str(out))
    loaded = json.loads(out.read_text())
    assert loaded[0]["inputs"] == {"new": True}

# (E) Non-serializable value raises TypeError (don't silently corrupt file)
def test_save_dataset_non_serializable(tmp_path):
    import pytest
    out = tmp_path / "bad.json"
    with pytest.raises(TypeError):
        save_dataset([{"inputs": {"bad": object()}}], str(out))
```

### Implementation spec
```python
def save_dataset(examples: list[dict], path: str) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(examples, f, indent=2)
```

---

## Task 1.4 — `upload_to_langsmith(client, dataset_name, examples)` — Upload to LangSmith

### What it does
Creates a new LangSmith dataset (or reuses an existing one by name),
then uploads all examples to it.

### Test Plan (write these FIRST)

```python
from unittest.mock import MagicMock, call
from scripts.upload_eval_dataset import upload_to_langsmith

# (A) Happy path — creates dataset and uploads N examples
def test_upload_to_langsmith_happy_path():
    client = MagicMock()
    ds = MagicMock()
    ds.id = "ds-123"
    client.create_dataset.return_value = ds
    examples = [
        {"inputs": {"code": "def f(): pass", "error": "E", "test_input": "(1,)"}}
    ]
    upload_to_langsmith(client, "my-eval-dataset", examples)
    client.create_dataset.assert_called_once_with(dataset_name="my-eval-dataset")
    client.create_examples.assert_called_once()
    _, kwargs = client.create_examples.call_args
    assert kwargs["dataset_id"] == "ds-123"
    assert len(kwargs["inputs"]) == 1

# (B) Empty examples list → create_examples is NOT called (skip upload)
def test_upload_to_langsmith_empty_examples():
    client = MagicMock()
    ds = MagicMock(); ds.id = "ds-123"
    client.create_dataset.return_value = ds
    upload_to_langsmith(client, "my-dataset", [])
    client.create_examples.assert_not_called()

# (C) Dataset name already exists (LangSmith raises) → function raises RuntimeError
def test_upload_to_langsmith_dataset_exists():
    import pytest
    client = MagicMock()
    client.create_dataset.side_effect = Exception("Dataset already exists")
    with pytest.raises(RuntimeError, match="Dataset already exists"):
        upload_to_langsmith(client, "my-dataset", [{"inputs": {}}])

# (D) create_examples fails → raises RuntimeError
def test_upload_to_langsmith_create_examples_fails():
    import pytest
    client = MagicMock()
    ds = MagicMock(); ds.id = "ds-123"
    client.create_dataset.return_value = ds
    client.create_examples.side_effect = Exception("API error")
    with pytest.raises(RuntimeError, match="API error"):
        upload_to_langsmith(client, "my-dataset", [{"inputs": {"code": "x"}}])

# (E) inputs and outputs are split correctly from each example
def test_upload_to_langsmith_splits_inputs_outputs():
    client = MagicMock()
    ds = MagicMock(); ds.id = "ds-abc"
    client.create_dataset.return_value = ds
    examples = [
        {"inputs": {"code": "a"}, "outputs": {"note": "b"}},
        {"inputs": {"code": "c"}},  # no outputs key
    ]
    upload_to_langsmith(client, "ds", examples)
    _, kwargs = client.create_examples.call_args
    assert kwargs["inputs"] == [{"code": "a"}, {"code": "c"}]
    assert kwargs["outputs"] == [{"note": "b"}, {}]
```

### Implementation spec
```python
def upload_to_langsmith(client, dataset_name: str, examples: list[dict]) -> None:
    if not examples:
        print("No examples to upload — skipping.")
        return
    try:
        dataset = client.create_dataset(dataset_name=dataset_name)
    except Exception as e:
        raise RuntimeError(str(e)) from e
    try:
        client.create_examples(
            inputs=[ex["inputs"] for ex in examples],
            outputs=[ex.get("outputs", {}) for ex in examples],
            dataset_id=dataset.id,
        )
    except Exception as e:
        raise RuntimeError(str(e)) from e
```

---

## Task 1.5 — `main()` — Wire it all together in the script

### What it does
Reads env vars (`LANGCHAIN_PROJECT`, `LANGCHAIN_API_KEY`), scrapes runs,
saves to JSON, and uploads to LangSmith. Accepts `--dry-run` flag to
skip the upload step and only save JSON locally.

### Test Plan (write these FIRST)

```python
from unittest.mock import MagicMock, patch
import pytest

# (A) Happy path — calls scrape, save, upload in order
def test_main_happy_path(monkeypatch, tmp_path):
    monkeypatch.setenv("LANGCHAIN_PROJECT", "my-project")
    monkeypatch.setenv("LANGCHAIN_API_KEY", "fake-key")
    with patch("scripts.upload_eval_dataset.Client") as MockClient, \
         patch("scripts.upload_eval_dataset.scrape_runs") as mock_scrape, \
         patch("scripts.upload_eval_dataset.save_dataset") as mock_save, \
         patch("scripts.upload_eval_dataset.upload_to_langsmith") as mock_upload:
        mock_scrape.return_value = [{"inputs": {"code": "x"}}]
        from scripts.upload_eval_dataset import main
        main(output_path=str(tmp_path / "out.json"))
        mock_scrape.assert_called_once()
        mock_save.assert_called_once()
        mock_upload.assert_called_once()

# (B) --dry-run flag skips upload
def test_main_dry_run(monkeypatch, tmp_path):
    monkeypatch.setenv("LANGCHAIN_PROJECT", "my-project")
    monkeypatch.setenv("LANGCHAIN_API_KEY", "fake-key")
    with patch("scripts.upload_eval_dataset.Client"), \
         patch("scripts.upload_eval_dataset.scrape_runs") as mock_scrape, \
         patch("scripts.upload_eval_dataset.save_dataset"), \
         patch("scripts.upload_eval_dataset.upload_to_langsmith") as mock_upload:
        mock_scrape.return_value = [{"inputs": {"code": "x"}}]
        from scripts.upload_eval_dataset import main
        main(output_path=str(tmp_path / "out.json"), dry_run=True)
        mock_upload.assert_not_called()

# (C) Missing LANGCHAIN_PROJECT env var → raises EnvironmentError
def test_main_missing_project_env(monkeypatch):
    monkeypatch.delenv("LANGCHAIN_PROJECT", raising=False)
    monkeypatch.setenv("LANGCHAIN_API_KEY", "fake-key")
    with pytest.raises(EnvironmentError, match="LANGCHAIN_PROJECT"):
        from scripts.upload_eval_dataset import main
        main()

# (D) scrape returns 0 results → prints warning, does NOT call upload
def test_main_no_results(monkeypatch, tmp_path):
    monkeypatch.setenv("LANGCHAIN_PROJECT", "my-project")
    monkeypatch.setenv("LANGCHAIN_API_KEY", "fake-key")
    with patch("scripts.upload_eval_dataset.Client"), \
         patch("scripts.upload_eval_dataset.scrape_runs", return_value=[]), \
         patch("scripts.upload_eval_dataset.upload_to_langsmith") as mock_upload:
        from scripts.upload_eval_dataset import main
        main(output_path=str(tmp_path / "out.json"))
        mock_upload.assert_not_called()
```

---

## Execution Order

```
1. Create mcp-server/tests/test_scrape_dataset.py  (all tests above, red)
2. Run: cd mcp-server && python -m pytest tests/test_scrape_dataset.py -v
   → All should FAIL (functions don't exist yet)
3. Create mcp-server/scripts/__init__.py  (empty, makes it importable)
4. Create mcp-server/scripts/upload_eval_dataset.py  (implement task by task)
5. Run tests after each task until all GREEN
6. Run script: python scripts/upload_eval_dataset.py --dry-run
7. Inspect eval_data/seed_dataset.json
8. Run script: python scripts/upload_eval_dataset.py
9. Verify dataset in LangSmith UI → Datasets tab
```

## File Map

```
mcp-server/
├── scripts/
│   ├── __init__.py                  ← empty, Task 1.0
│   └── upload_eval_dataset.py       ← Tasks 1.1–1.5
├── eval_data/
│   └── seed_dataset.json            ← generated by script
└── tests/
    └── test_scrape_dataset.py       ← ALL tests above
```
