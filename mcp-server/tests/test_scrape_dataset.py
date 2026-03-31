import json
from unittest.mock import MagicMock, patch

import pytest

from scripts.upload_eval_dataset import (
    extract_example,
    main,
    save_dataset,
    scrape_runs,
    upload_to_langsmith,
)


def make_run(inputs=None, outputs=None):
    run = MagicMock()
    run.inputs = inputs
    run.outputs = outputs
    return run


def test_extract_example_happy_path():
    run = make_run(
        inputs={"code": "def f(): pass", "error": "TypeError", "initial_inputs": ["(1,)"]},
        outputs={"verified": False},
    )
    result = extract_example(run)
    assert result["inputs"]["code"] == "def f(): pass"
    assert result["inputs"]["error"] == "TypeError"
    assert result["inputs"]["test_input"] == "(1,)"


def test_extract_example_none_inputs():
    run = make_run(inputs=None)
    assert extract_example(run) is None


def test_extract_example_empty_inputs():
    run = make_run(inputs={})
    assert extract_example(run) is None


def test_extract_example_missing_code():
    run = make_run(inputs={"error": "TypeError", "initial_inputs": ["(1,)"]})
    assert extract_example(run) is None


def test_extract_example_missing_error():
    run = make_run(inputs={"code": "def f(): pass", "initial_inputs": ["(1,)"]})
    assert extract_example(run) is None


def test_extract_example_empty_initial_inputs():
    run = make_run(inputs={"code": "def f(): pass", "error": "Err", "initial_inputs": []})
    result = extract_example(run)
    assert result is not None
    assert result["inputs"]["test_input"] == ""


def test_extract_example_missing_initial_inputs():
    run = make_run(inputs={"code": "def f(): pass", "error": "Err"})
    result = extract_example(run)
    assert result is not None
    assert result["inputs"]["test_input"] == ""


def test_extract_example_empty_code_string():
    run = make_run(inputs={"code": "", "error": "Err", "initial_inputs": ["(1,)"]})
    result = extract_example(run)
    assert result is not None


def test_extract_example_non_string_initial_input():
    run = make_run(inputs={"code": "def f(): pass", "error": "Err", "initial_inputs": [123]})
    result = extract_example(run)
    assert result["inputs"]["test_input"] == "123"


def test_scrape_runs_happy_path():
    client = MagicMock()
    client.list_runs.return_value = [
        make_run({"code": f"def f{i}(): pass", "error": "Err", "initial_inputs": ["(1,)"]})
        for i in range(3)
    ]
    results = scrape_runs(client, "my-project", limit=10)
    assert len(results) == 3


def test_scrape_runs_drops_invalid():
    client = MagicMock()
    client.list_runs.return_value = [
        make_run({"code": "def f(): pass", "error": "Err", "initial_inputs": ["(1,)"]}),
        make_run(None),
        make_run({}),
    ]
    results = scrape_runs(client, "my-project", limit=10)
    assert len(results) == 1


def test_scrape_runs_empty():
    client = MagicMock()
    client.list_runs.return_value = []
    results = scrape_runs(client, "my-project", limit=10)
    assert results == []


def test_scrape_runs_api_failure():
    client = MagicMock()
    client.list_runs.side_effect = Exception("LangSmith API timeout")
    with pytest.raises(RuntimeError, match="LangSmith API timeout"):
        scrape_runs(client, "my-project", limit=10)


def test_scrape_runs_calls_correct_filter():
    client = MagicMock()
    client.list_runs.return_value = []
    scrape_runs(client, "my-project", limit=25)
    call_kwargs = client.list_runs.call_args.kwargs
    assert call_kwargs["project_name"] == "my-project"
    assert call_kwargs["run_type"] == "chain"
    assert "Auto_Fix_Agent_Loop" in call_kwargs.get("filter", "")
    assert call_kwargs["limit"] == 25


def test_scrape_runs_zero_limit():
    client = MagicMock()
    client.list_runs.return_value = []
    results = scrape_runs(client, "my-project", limit=0)
    assert results == []


def test_save_dataset_happy_path(tmp_path):
    examples = [{"inputs": {"code": "def f(): pass", "error": "E", "test_input": "(1,)"}}]
    out = tmp_path / "out.json"
    save_dataset(examples, str(out))
    loaded = json.loads(out.read_text())
    assert loaded == examples


def test_save_dataset_creates_dir(tmp_path):
    out = tmp_path / "new_dir" / "dataset.json"
    save_dataset([{"inputs": {}}], str(out))
    assert out.exists()


def test_save_dataset_empty_list(tmp_path):
    out = tmp_path / "empty.json"
    save_dataset([], str(out))
    assert json.loads(out.read_text()) == []


def test_save_dataset_overwrites(tmp_path):
    out = tmp_path / "data.json"
    save_dataset([{"inputs": {"old": True}}], str(out))
    save_dataset([{"inputs": {"new": True}}], str(out))
    loaded = json.loads(out.read_text())
    assert loaded[0]["inputs"] == {"new": True}


def test_save_dataset_non_serializable(tmp_path):
    out = tmp_path / "bad.json"
    with pytest.raises(TypeError):
        save_dataset([{"inputs": {"bad": object()}}], str(out))


def test_upload_to_langsmith_happy_path():
    client = MagicMock()
    ds = MagicMock()
    ds.id = "ds-123"
    client.create_dataset.return_value = ds
    examples = [{"inputs": {"code": "def f(): pass", "error": "E", "test_input": "(1,)"}}]
    upload_to_langsmith(client, "my-eval-dataset", examples)
    client.create_dataset.assert_called_once_with(dataset_name="my-eval-dataset")
    client.create_examples.assert_called_once()
    _, kwargs = client.create_examples.call_args
    assert kwargs["dataset_id"] == "ds-123"
    assert len(kwargs["inputs"]) == 1


def test_upload_to_langsmith_empty_examples():
    client = MagicMock()
    ds = MagicMock()
    ds.id = "ds-123"
    client.create_dataset.return_value = ds
    upload_to_langsmith(client, "my-dataset", [])
    client.create_examples.assert_not_called()


def test_upload_to_langsmith_dataset_exists():
    client = MagicMock()
    client.create_dataset.side_effect = Exception("Dataset already exists")
    with pytest.raises(RuntimeError, match="Dataset already exists"):
        upload_to_langsmith(client, "my-dataset", [{"inputs": {}}])


def test_upload_to_langsmith_create_examples_fails():
    client = MagicMock()
    ds = MagicMock()
    ds.id = "ds-123"
    client.create_dataset.return_value = ds
    client.create_examples.side_effect = Exception("API error")
    with pytest.raises(RuntimeError, match="API error"):
        upload_to_langsmith(client, "my-dataset", [{"inputs": {"code": "x"}}])


def test_upload_to_langsmith_splits_inputs_outputs():
    client = MagicMock()
    ds = MagicMock()
    ds.id = "ds-abc"
    client.create_dataset.return_value = ds
    examples = [
        {"inputs": {"code": "a"}, "outputs": {"note": "b"}},
        {"inputs": {"code": "c"}},
    ]
    upload_to_langsmith(client, "ds", examples)
    _, kwargs = client.create_examples.call_args
    assert kwargs["inputs"] == [{"code": "a"}, {"code": "c"}]
    assert kwargs["outputs"] == [{"note": "b"}, {}]


def test_main_happy_path(monkeypatch, tmp_path):
    monkeypatch.setenv("LANGCHAIN_PROJECT", "my-project")
    monkeypatch.setenv("LANGCHAIN_API_KEY", "fake-key")
    with patch("scripts.upload_eval_dataset.Client") as mock_client_cls, \
         patch("scripts.upload_eval_dataset.scrape_runs") as mock_scrape, \
         patch("scripts.upload_eval_dataset.save_dataset") as mock_save, \
         patch("scripts.upload_eval_dataset.upload_to_langsmith") as mock_upload:
        mock_scrape.return_value = [{"inputs": {"code": "x"}}]
        main(output_path=str(tmp_path / "out.json"))
        mock_client_cls.assert_called_once()
        mock_scrape.assert_called_once()
        mock_save.assert_called_once()
        mock_upload.assert_called_once()


def test_main_dry_run(monkeypatch, tmp_path):
    monkeypatch.setenv("LANGCHAIN_PROJECT", "my-project")
    monkeypatch.setenv("LANGCHAIN_API_KEY", "fake-key")
    with patch("scripts.upload_eval_dataset.Client"), \
         patch("scripts.upload_eval_dataset.scrape_runs") as mock_scrape, \
         patch("scripts.upload_eval_dataset.save_dataset"), \
         patch("scripts.upload_eval_dataset.upload_to_langsmith") as mock_upload:
        mock_scrape.return_value = [{"inputs": {"code": "x"}}]
        main(output_path=str(tmp_path / "out.json"), dry_run=True)
        mock_upload.assert_not_called()


def test_main_missing_project_env(monkeypatch):
    monkeypatch.delenv("LANGCHAIN_PROJECT", raising=False)
    monkeypatch.setenv("LANGCHAIN_API_KEY", "fake-key")
    with pytest.raises(EnvironmentError, match="LANGCHAIN_PROJECT"):
        main()


def test_main_no_results(monkeypatch, tmp_path):
    monkeypatch.setenv("LANGCHAIN_PROJECT", "my-project")
    monkeypatch.setenv("LANGCHAIN_API_KEY", "fake-key")
    with patch("scripts.upload_eval_dataset.Client"), \
         patch("scripts.upload_eval_dataset.scrape_runs", return_value=[]), \
         patch("scripts.upload_eval_dataset.save_dataset") as mock_save, \
         patch("scripts.upload_eval_dataset.upload_to_langsmith") as mock_upload:
        main(output_path=str(tmp_path / "out.json"))
        mock_save.assert_called_once()
        mock_upload.assert_not_called()
