from unittest.mock import AsyncMock, MagicMock

import pytest

from api import CodeFix, PROMPT_VERSIONS
from scripts import eval_prompts


@pytest.mark.anyio
async def test_structured_target_returns_expected_shape():
    mock_llm = MagicMock()
    mock_result = CodeFix(
        fixed_code="def fixed_solution():\n    return 42",
        explanation="Fixed the return path.",
    )

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(eval_prompts, "get_llm", lambda *args, **kwargs: mock_llm)
        mp.setattr(
            eval_prompts.AgentFixer,
            "generate_fix_details",
            AsyncMock(return_value=mock_result),
        )

        result = await eval_prompts.structured_target(
            {"code": "bad", "error": "TypeError", "test_input": "(1,)"},
            provider="ollama",
            model="gemma3:latest",
            base_url="http://localhost:11434",
        )

    assert result["fixed_code"] == "def fixed_solution():\n    return 42"
    assert result["explanation"] == "Fixed the return path."


@pytest.mark.anyio
async def test_streaming_target_returns_expected_shape():
    mock_llm = MagicMock()

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(eval_prompts, "get_llm", lambda *args, **kwargs: mock_llm)
        mp.setattr(
            eval_prompts.AgentFixer,
            "generate_fix_streaming",
            AsyncMock(return_value="def streamed_fix():\n    return True"),
        )

        result = await eval_prompts.streaming_target(
            {"code": "bad", "error": "TypeError", "test_input": "(1,)"},
            provider="ollama",
            model="gemma3:latest",
            base_url="http://localhost:11434",
        )

    assert result == {"fixed_code": "def streamed_fix():\n    return True"}


def test_parse_structured_fix_handles_none_input():
    result = eval_prompts.parse_structured_fix(None)
    assert result == {"fixed_code": "", "explanation": "generation_failed"}


def test_parse_structured_fix_accepts_codefix():
    result = eval_prompts.parse_structured_fix(
        CodeFix(fixed_code="def ok():\n    pass", explanation="Patched the bug.")
    )
    assert result["fixed_code"] == "def ok():\n    pass"
    assert result["explanation"] == "Patched the bug."


def test_rubric_strings_contain_required_placeholders():
    assert "{inputs}" in eval_prompts.FIX_QUALITY_RUBRIC
    assert "{outputs}" in eval_prompts.FIX_QUALITY_RUBRIC
    assert "{inputs}" in eval_prompts.EXPLANATION_QUALITY_RUBRIC
    assert "{outputs}" in eval_prompts.EXPLANATION_QUALITY_RUBRIC


@pytest.mark.anyio
async def test_run_evaluations_calls_aevaluate_with_expected_variants():
    fix_quality_scorer = MagicMock(name="fix_quality_scorer")
    explanation_quality_scorer = MagicMock(name="explanation_quality_scorer")
    structured_results = MagicMock(experiment_name="structured-exp")
    streaming_results = MagicMock(experiment_name="streaming-exp")
    mock_aevaluate = AsyncMock(side_effect=[structured_results, streaming_results])
    mock_summary = MagicMock()

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(
            eval_prompts,
            "build_scorers",
            lambda judge_model, judge_base_url: (fix_quality_scorer, explanation_quality_scorer),
        )
        mp.setattr(eval_prompts, "aevaluate", mock_aevaluate)
        mp.setattr(eval_prompts, "print_experiment_summary", mock_summary)

        results = await eval_prompts.run_evaluations(
            dataset_name="seed-dataset",
            provider="ollama",
            model="gemma3:latest",
            base_url="http://localhost:11434",
            judge_model="deepseek-r1:8b",
            judge_base_url="http://localhost:11434",
            max_concurrency=2,
        )

    assert results["structured"] is structured_results
    assert results["streaming"] is streaming_results
    assert mock_aevaluate.await_count == 2

    first_call = mock_aevaluate.await_args_list[0]
    second_call = mock_aevaluate.await_args_list[1]

    assert first_call.kwargs["data"] == "seed-dataset"
    assert first_call.kwargs["experiment_prefix"] == "structured-pydantic"
    assert first_call.kwargs["evaluators"] == [fix_quality_scorer, explanation_quality_scorer]
    assert first_call.kwargs["metadata"]["prompt_version"] == PROMPT_VERSIONS["fix_generation"]
    assert callable(first_call.args[0])

    assert second_call.kwargs["data"] == "seed-dataset"
    assert second_call.kwargs["experiment_prefix"] == "streaming-freeform"
    assert second_call.kwargs["evaluators"] == [fix_quality_scorer]
    assert second_call.kwargs["metadata"]["prompt_version"] == PROMPT_VERSIONS["fix_generation_streaming"]
    assert callable(second_call.args[0])

    assert mock_summary.call_count == 2
