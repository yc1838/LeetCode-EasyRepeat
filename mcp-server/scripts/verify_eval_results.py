"""Verify eval results by comparing judge scores against actual code execution."""

import argparse
import os
import sys
from pathlib import Path
from typing import Any

from langsmith import Client

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def execute_fix_and_test(fixed_code: str, test_input: str) -> dict[str, Any]:
    """
    Execute the generated fix with the given test input.

    Returns:
        {
            "success": bool,      # Did code run without exception?
            "result": Any,        # Return value or None
            "error": str | None   # Exception message if failed
        }
    """
    if not fixed_code or not fixed_code.strip():
        return {"success": False, "result": None, "error": "Empty code"}

    try:
        # Create namespace with common imports
        namespace = {
            "List": list,
            "Dict": dict,
            "Optional": type(None),
            "Tuple": tuple,
            "Set": set,
            "Union": type(None),
            "__builtins__": __builtins__,
        }

        # Execute the fixed code
        exec(fixed_code, namespace)

        # Find Solution class
        solution_class = namespace.get("Solution")
        if not solution_class:
            return {"success": False, "result": None, "error": "No Solution class found"}

        # Parse test input
        try:
            # Remove whitespace and wrap in parens for eval
            test_clean = test_input.strip().replace("\n", "")
            parsed = eval(f"({test_clean})" if "," in test_clean else f"({test_clean},)")
        except Exception as e:
            return {"success": False, "result": None, "error": f"Parse test_input: {e}"}

        # Call the method
        try:
            methods = [m for m in dir(solution_class) if not m.startswith("_")]
            if not methods:
                return {"success": False, "result": None, "error": "No methods in Solution"}

            solution = solution_class()
            method = getattr(solution, methods[0])

            if isinstance(parsed, tuple):
                result = method(*parsed)
            else:
                result = method(parsed)

            return {"success": True, "result": result, "error": None}
        except Exception as e:
            return {"success": False, "result": None, "error": f"Execution: {type(e).__name__}: {e}"}

    except Exception as e:
        return {"success": False, "result": None, "error": f"Setup: {e}"}


def execution_to_score(execution_result: dict[str, Any]) -> float:
    """
    Convert execution result to a simple score.
    1.0 = code executed successfully
    0.0 = code failed
    """
    return 1.0 if execution_result["success"] else 0.0


def fetch_eval_examples(
    experiment_id: str,
    project_name: str,
    limit: int = 10,
) -> list[dict[str, Any]]:
    """
    Fetch examples from a LangSmith experiment session.

    Args:
        experiment_id: The experiment name/ID (e.g., structured-pydantic-92300192)
        project_name: LangSmith project name
        limit: Max number of runs to fetch

    Returns:
        List of runs with inputs, outputs, and feedback
    """
    api_key = os.getenv("LANGCHAIN_API_KEY")
    if not api_key:
        raise EnvironmentError("LANGCHAIN_API_KEY required")

    client = Client(api_key=api_key)

    print(f"✓ Project: {project_name}")

    # Fetch runs from the project filtered by name
    try:
        runs = client.list_runs(
            project_name=project_name,
            filter=f'has(metadata, "experiment_name") and contains(metadata["experiment_name"], "{experiment_id.split("-")[0]}")',
            limit=limit,
        )
        runs_list = list(runs)

        if not runs_list:
            # Fallback: get all runs and filter locally
            print("  (Fallback: fetching all runs and filtering locally)")
            runs = client.list_runs(project_name=project_name, limit=limit * 3)
            runs_list = [r for r in runs if hasattr(r, 'name') and experiment_id in str(getattr(r, 'name', ''))]

        print(f"✓ Found {len(runs_list)} runs in experiment '{experiment_id}'")
        return runs_list
    except Exception as e:
        # Final fallback
        print(f"  Warning: {e}")
        print("  Trying direct fetch...")
        try:
            runs = client.list_runs(
                project_name=project_name,
                limit=limit,
            )
            runs_list = list(runs)
            print(f"✓ Fetched {len(runs_list)} runs from project")
            return runs_list
        except Exception as e2:
            raise RuntimeError(f"Failed to fetch runs: {e2}") from e


def extract_score_from_feedback(feedback: dict[str, Any]) -> float | None:
    """Extract numeric score from feedback dict."""
    if not feedback:
        return None

    # Try common score field names
    for key in ["score", "fix_quality", "value", "numeric_score"]:
        if key in feedback and isinstance(feedback[key], (int, float)):
            return float(feedback[key])

    return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--experiment-id",
        required=True,
        help='Experiment session ID (e.g., "structured-pydantic-92300192")',
    )
    parser.add_argument(
        "--project",
        default=os.getenv("LANGCHAIN_PROJECT", "LeetCode EasyRepeat"),
        help="LangSmith project name",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=10,
        help="Number of examples to verify (default: 10)",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print detailed output for each example",
    )
    args = parser.parse_args()

    print("=" * 70)
    print("EVAL RESULT VERIFICATION")
    print("=" * 70)
    print(f"\nExperiment ID: {args.experiment_id}")
    print(f"Limit: {args.limit}")

    # Fetch runs
    try:
        runs = fetch_eval_examples(args.experiment_id, args.project, limit=args.limit)
    except Exception as e:
        print(f"❌ Error fetching examples: {e}")
        return 1

    if not runs:
        print("❌ No runs found")
        return 1

    # Verify each
    results = []
    alignments = []

    for i, run in enumerate(runs, 1):
        print(f"\n[{i}/{len(runs)}] Verifying...", end=" ", flush=True)

        inputs = getattr(run, "inputs", {})
        outputs = getattr(run, "outputs", {})
        feedback = getattr(run, "feedback", {})

        error = inputs.get("error", "")
        test_input = inputs.get("test_input", "")
        fixed_code = outputs.get("fixed_code", "") if isinstance(outputs, dict) else ""

        # Extract judge score
        judge_score = None
        if isinstance(feedback, dict):
            for fb_key, fb_value in feedback.items():
                if isinstance(fb_value, dict):
                    score = extract_score_from_feedback(fb_value)
                    if score is not None:
                        judge_score = score
                        break

        if judge_score is None:
            judge_score = 0.0

        # Execute and test
        exec_result = execute_fix_and_test(fixed_code, test_input)
        exec_score = execution_to_score(exec_result)

        diff = abs(judge_score - exec_score)
        is_aligned = diff < 0.25
        alignments.append(is_aligned)

        status = "✅" if is_aligned else "⚠️"
        print(f"{status} Judge={judge_score:.2f}, Exec={exec_score:.2f}, Δ={diff:.2f}")

        results.append({
            "index": i,
            "judge_score": judge_score,
            "execution_score": exec_score,
            "difference": diff,
            "aligned": is_aligned,
            "execution_result": exec_result,
        })

        if args.verbose:
            print(f"  Error: {error[:60]}")
            if exec_result["error"]:
                print(f"  Exec Error: {exec_result['error'][:60]}")

    # Summary
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)

    aligned_count = sum(alignments)
    total = len(alignments)
    alignment_rate = (aligned_count / total * 100) if total > 0 else 0

    print(f"\nAlignment Rate: {aligned_count}/{total} ({alignment_rate:.1f}%)")
    print(f"Average Difference: {sum(r['difference'] for r in results) / len(results):.3f}")

    if alignment_rate >= 80:
        print("\n✅ Judge seems well-calibrated!")
        print("   The rubric aligns with actual execution results.")
    elif alignment_rate >= 50:
        print("\n⚠️  Judge is partially calibrated")
        print("   Some scores don't match execution. Consider tweaking the rubric.")
    else:
        print("\n❌ Judge poorly calibrated")
        print("   Most scores don't match execution. Revise FIX_QUALITY_RUBRIC.")

    # Misaligned examples
    misaligned = [r for r in results if not r["aligned"]]
    if misaligned:
        print(f"\n📋 Misaligned Examples ({len(misaligned)}):")
        for r in misaligned[:5]:
            print(
                f"   #{r['index']}: Judge={r['judge_score']:.2f}, "
                f"Exec={r['execution_score']:.2f}"
            )
            if r["execution_result"]["error"]:
                print(f"      Error: {r['execution_result']['error'][:50]}")

    return 0 if alignment_rate >= 70 else 1


if __name__ == "__main__":
    sys.exit(main())
