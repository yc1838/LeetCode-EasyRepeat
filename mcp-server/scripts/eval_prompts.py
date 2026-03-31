"""Run LangSmith prompt A/B evals for structured vs streaming autofix generation."""

from __future__ import annotations

import argparse
import asyncio
import functools
import json
import os
import sys
from pathlib import Path
from typing import Any

from langsmith import aevaluate

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from api import AgentFixer, CodeFix, PROMPT_VERSIONS
from providers import PROVIDERS, get_llm


DEFAULT_PROVIDER = os.getenv("AUTOFIX_EVAL_PROVIDER", "ollama")
DEFAULT_MODEL = os.getenv(
    "AUTOFIX_EVAL_MODEL",
    PROVIDERS.get(DEFAULT_PROVIDER, PROVIDERS["ollama"]).default_model,
)
DEFAULT_BASE_URL = os.getenv("AUTOFIX_EVAL_BASE_URL", "http://localhost:11434")
DEFAULT_JUDGE_MODEL = os.getenv("OPENEVALS_JUDGE_MODEL", "deepseek-r1:8b")
DEFAULT_JUDGE_BASE_URL = os.getenv("OPENEVALS_JUDGE_BASE_URL", "http://localhost:11434")
DEFAULT_MAX_CONCURRENCY = int(os.getenv("OPENEVALS_MAX_CONCURRENCY", "4"))


FIX_QUALITY_RUBRIC = """
You are grading the quality of a Python code fix.

Score the candidate fix using only these values: 1.0, 0.75, 0.5, 0.25, 0.0.
IMPORTANT: You must output ONLY one of these exact decimal values. Do not output a value outside this range. Never use percentages (e.g., 100%, 45%).

Scoring rubric:
- 1.0: Fully fixes the reported failure, preserves intended behavior, handles edge cases, and is clean Python.
- 0.75: Fix is mostly correct but has a minor weakness, missing edge case, or small cleanliness issue.
- 0.5: Partial fix; addresses part of the problem but leaves correctness or regression risk.
- 0.25: Poor fix; likely incorrect, incomplete, or introduces substantial new risk.
- 0.0: Failed generation, empty output, or clearly unusable code.

Consider:
- correctness relative to the failure context
- edge-case handling
- code cleanliness and readability
- regression risk

<inputs>
{inputs}
</inputs>

<outputs>
{outputs}
</outputs>

<reference_outputs>
{reference_outputs}
</reference_outputs>
"""


EXPLANATION_QUALITY_RUBRIC = """
You are grading the explanation attached to a Python code fix.

Score the explanation using only these values: 1.0, 0.75, 0.5, 0.25, 0.0.
IMPORTANT: You must output ONLY one of these exact decimal values. Do not output a value outside this range. Never use percentages (e.g., 100%, 45%).

Scoring rubric:
- 1.0: Accurately identifies the bug, explains the fix clearly, and stays concise.
- 0.75: Mostly accurate and clear, but slightly vague, incomplete, or wordy.
- 0.5: Partially accurate explanation with important omissions or muddled reasoning.
- 0.25: Explanation is mostly incorrect, overly vague, or disconnected from the code fix.
- 0.0: Missing explanation or clearly false explanation.

Focus on:
- accuracy about the original failure
- clarity of the explanation
- conciseness

<inputs>
{inputs}
</inputs>

<outputs>
{outputs}
</outputs>

<reference_outputs>
{reference_outputs}
</reference_outputs>
"""


def _default_dataset_name() -> str:
    project_name = os.getenv("LANGCHAIN_PROJECT") or os.getenv("LANGSMITH_PROJECT") or "LeetCode EasyRepeat"
    return f"{project_name}-seed-dataset"


def _resolve_app_model(provider: str, model: str | None) -> str:
    if model:
        return model
    info = PROVIDERS.get(provider)
    if not info:
        raise ValueError(f"Unsupported provider: {provider}")
    return info.default_model


def _normalize_ollama_model_ref(model: str) -> str:
    return model if model.startswith("ollama:") else f"ollama:{model}"


def _create_judge_scorer(factory, *, prompt: str, feedback_key: str, judge: Any, model: str):
    common_kwargs = {
        "prompt": prompt,
        "feedback_key": feedback_key,
    }

    attempts: list[dict[str, Any]] = []
    if judge is not None:
        attempts.extend(
            [
                {"judge": judge, "model": model, "continuous": True, "use_reasoning": True},
                {"judge": judge, "model": model, "continuous": True},
                {"judge": judge, "model": model},
                {"judge": judge, "continuous": True, "use_reasoning": True},
                {"judge": judge, "continuous": True},
                {"judge": judge},
            ]
        )

    model_ref = _normalize_ollama_model_ref(model)
    attempts.extend(
        [
            {"model": model_ref, "continuous": True, "use_reasoning": True},
            {"model": model_ref, "continuous": True},
            {"model": model_ref},
        ]
    )

    last_error: Exception | None = None
    for i, extra_kwargs in enumerate(attempts):
        try:
            scorer = factory(**common_kwargs, **extra_kwargs)
            print(f"  [_create_judge_scorer/{feedback_key}] ✓ Attempt {i+1}/{len(attempts)} succeeded")
            return scorer
        except Exception as exc:
            last_error = exc
            print(f"  [_create_judge_scorer/{feedback_key}] ✗ Attempt {i+1}/{len(attempts)} failed: {exc}")

    raise RuntimeError(f"Unable to create scorer '{feedback_key}'.") from last_error


def build_scorers(
    judge_model: str = DEFAULT_JUDGE_MODEL,
    judge_base_url: str = DEFAULT_JUDGE_BASE_URL,
):
    try:
        from openevals.llm import create_async_llm_as_judge
    except ImportError as exc:
        raise RuntimeError(
            "OpenEvals is not installed. Install dependencies from mcp-server/requirements.txt."
        ) from exc

    judge = None
    try:
        from langchain_ollama import ChatOllama

        judge = ChatOllama(model=judge_model, base_url=judge_base_url, temperature=0)
        print(f"[build_scorers] ✓ Judge initialized: {judge_model} @ {judge_base_url}")
    except Exception as e:
        print(f"[build_scorers] ⚠️  Judge init failed: {e}")
        judge = None

    print(f"[build_scorers] Creating fix_quality_scorer (judge={judge is not None})...")
    fix_quality_scorer = _create_judge_scorer(
        create_async_llm_as_judge,
        prompt=FIX_QUALITY_RUBRIC,
        feedback_key="fix_quality",
        judge=judge,
        model=judge_model,
    )
    print(f"[build_scorers] ✓ fix_quality_scorer created")

    print(f"[build_scorers] Creating explanation_quality_scorer (judge={judge is not None})...")
    explanation_quality_scorer = _create_judge_scorer(
        create_async_llm_as_judge,
        prompt=EXPLANATION_QUALITY_RUBRIC,
        feedback_key="explanation_quality",
        judge=judge,
        model=judge_model,
    )
    print(f"[build_scorers] ✓ explanation_quality_scorer created")

    return fix_quality_scorer, explanation_quality_scorer


def parse_structured_fix(result: CodeFix | dict[str, Any] | str | None) -> dict[str, str]:
    if result is None:
        return {"fixed_code": "", "explanation": "generation_failed"}

    if isinstance(result, CodeFix):
        return {
            "fixed_code": result.fixed_code.strip(),
            "explanation": result.explanation.strip(),
        }

    if isinstance(result, dict):
        return {
            "fixed_code": str(result.get("fixed_code", "")).strip(),
            "explanation": str(result.get("explanation", "")).strip(),
        }

    return {
        "fixed_code": str(result).strip(),
        "explanation": "",
    }


async def structured_target(
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
        agent = AgentFixer(llm)

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


async def streaming_target(
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
        agent = AgentFixer(llm)
        fixed_code = await agent.generate_fix_streaming(
            inputs.get("code", ""),
            inputs.get("error", ""),
            inputs.get("test_input", ""),
        )
        return {"fixed_code": (fixed_code or "").strip()}
    except Exception:
        return {"fixed_code": ""}


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
) -> dict[str, Any]:
    resolved_dataset_name = dataset_name or _default_dataset_name()
    resolved_model = _resolve_app_model(provider, model)
    fix_quality_scorer, explanation_quality_scorer = build_scorers(judge_model, judge_base_url)

    structured_metadata = {
        "prompt_version": PROMPT_VERSIONS["fix_generation"],
        "variant": "structured",
        "app_provider": provider,
        "app_model": resolved_model,
        "judge_model": judge_model,
    }
    streaming_metadata = {
        "prompt_version": PROMPT_VERSIONS["fix_generation_streaming"],
        "variant": "streaming",
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

    streaming_results = await aevaluate(
        functools.partial(
            streaming_target,
            provider=provider,
            model=resolved_model,
            api_key=api_key,
            base_url=base_url,
        ),
        data=resolved_dataset_name,
        evaluators=[fix_quality_scorer],
        experiment_prefix="streaming-freeform",
        description="Streaming freeform autofix prompt evaluation.",
        metadata=streaming_metadata,
        max_concurrency=max_concurrency,
    )
    print_experiment_summary("streaming-freeform", streaming_results)

    return {
        "structured": structured_results,
        "streaming": streaming_results,
    }


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
        )
    )


if __name__ == "__main__":
    main()
