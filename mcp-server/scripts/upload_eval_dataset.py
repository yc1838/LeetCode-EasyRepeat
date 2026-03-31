"""Scrape Auto Fix traces from LangSmith, save them locally, and upload a dataset."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from langsmith import Client


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_PATH = ROOT / "eval_data" / "seed_dataset.json"


def extract_example(run) -> dict[str, Any] | None:
    inputs = getattr(run, "inputs", None)
    if not inputs:
        return None

    code = inputs.get("code")
    error = inputs.get("error")
    if code is None or error is None:
        return None

    initial_inputs = inputs.get("initial_inputs", [])
    if isinstance(initial_inputs, (list, tuple)):
        test_input = str(initial_inputs[0]) if initial_inputs else ""
    else:
        test_input = str(initial_inputs) if initial_inputs is not None else ""

    return {
        "inputs": {
            "code": code,
            "error": error,
            "test_input": test_input,
        }
    }


def scrape_runs(client, project_name: str, limit: int = 30) -> list[dict[str, Any]]:
    if limit <= 0:
        return []

    try:
        runs = client.list_runs(
            project_name=project_name,
            run_type="chain",
            filter='eq(name, "Auto_Fix_Agent_Loop")',
            limit=limit,
        )
    except Exception as exc:
        raise RuntimeError(str(exc)) from exc

    return [example for run in runs if (example := extract_example(run)) is not None]


def save_dataset(examples: list[dict[str, Any]], path: str) -> None:
    payload = json.dumps(examples, indent=2)
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(payload + "\n", encoding="utf-8")


def upload_to_langsmith(client, dataset_name: str, examples: list[dict[str, Any]]) -> None:
    if not examples:
        print("No examples to upload; skipping LangSmith dataset creation.")
        return

    try:
        dataset = client.create_dataset(dataset_name=dataset_name)
    except Exception as exc:
        raise RuntimeError(str(exc)) from exc

    try:
        client.create_examples(
            inputs=[example["inputs"] for example in examples],
            outputs=[example.get("outputs", {}) for example in examples],
            dataset_id=dataset.id,
        )
    except Exception as exc:
        raise RuntimeError(str(exc)) from exc


def main(
    output_path: str | None = None,
    dry_run: bool = False,
    project_name: str | None = None,
    dataset_name: str | None = None,
    limit: int = 30,
) -> list[dict[str, Any]]:
    project = project_name or os.getenv("LANGCHAIN_PROJECT")
    if not project:
        raise EnvironmentError("LANGCHAIN_PROJECT is required")

    api_key = os.getenv("LANGCHAIN_API_KEY") or os.getenv("LANGSMITH_API_KEY")
    if not api_key:
        raise EnvironmentError("LANGCHAIN_API_KEY is required")

    client = Client(api_key=api_key)
    examples = scrape_runs(client, project, limit=limit)

    resolved_output_path = output_path or str(DEFAULT_OUTPUT_PATH)
    save_dataset(examples, resolved_output_path)

    if not examples:
        print("No LangSmith runs matched the dataset scrape filter.")
        return examples

    if dry_run:
        print(f"Saved {len(examples)} examples to {resolved_output_path} (dry run).")
        return examples

    resolved_dataset_name = dataset_name or f"{project}-seed-dataset"
    upload_to_langsmith(client, resolved_dataset_name, examples)
    print(
        f"Saved {len(examples)} examples to {resolved_output_path} "
        f"and uploaded dataset '{resolved_dataset_name}'."
    )
    return examples


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-path", default=str(DEFAULT_OUTPUT_PATH))
    parser.add_argument("--project-name")
    parser.add_argument("--dataset-name")
    parser.add_argument("--limit", type=int, default=30)
    parser.add_argument("--dry-run", action="store_true")
    return parser


if __name__ == "__main__":
    args = _build_parser().parse_args()
    main(
        output_path=args.output_path,
        dry_run=args.dry_run,
        project_name=args.project_name,
        dataset_name=args.dataset_name,
        limit=args.limit,
    )
