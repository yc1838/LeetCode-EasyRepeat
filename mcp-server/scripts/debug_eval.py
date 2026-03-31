"""Debug eval results - inspect actual data structure."""

import argparse
import json
import os
import sys
from pathlib import Path

from langsmith import Client

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--experiment-id", required=True)
    parser.add_argument("--project", default=os.getenv("LANGCHAIN_PROJECT", "LeetCode EasyRepeat"))
    parser.add_argument("--limit", type=int, default=3)
    args = parser.parse_args()

    api_key = os.getenv("LANGCHAIN_API_KEY")
    if not api_key:
        raise EnvironmentError("LANGCHAIN_API_KEY required")

    client = Client(api_key=api_key)

    print("=" * 70)
    print("DEBUG: INSPECTING EVAL RESULTS")
    print("=" * 70)
    print(f"\nProject: {args.project}")
    print(f"Experiment: {args.experiment_id}\n")

    # Fetch runs
    runs = list(client.list_runs(project_name=args.project, limit=args.limit))
    print(f"Fetched {len(runs)} runs\n")

    for i, run in enumerate(runs, 1):
        print(f"[RUN {i}]")
        print(f"  Name: {getattr(run, 'name', 'N/A')}")
        print(f"  ID: {getattr(run, 'id', 'N/A')}")

        inputs = getattr(run, "inputs", {})
        outputs = getattr(run, "outputs", {})
        feedback = getattr(run, "feedback", {})

        print(f"\n  INPUTS:")
        if isinstance(inputs, dict):
            for k, v in inputs.items():
                preview = str(v)[:80] if v else "(empty)"
                print(f"    {k}: {preview}")
        else:
            print(f"    {inputs}")

        print(f"\n  OUTPUTS:")
        if isinstance(outputs, dict):
            for k, v in outputs.items():
                preview = str(v)[:80] if v else "(empty)"
                print(f"    {k}: {preview}")
        else:
            print(f"    {outputs}")

        print(f"\n  FEEDBACK:")
        if isinstance(feedback, dict):
            for k, v in feedback.items():
                print(f"    {k}:")
                if isinstance(v, dict):
                    for sk, sv in v.items():
                        preview = str(sv)[:100] if sv else "(empty)"
                        print(f"      {sk}: {preview}")
                else:
                    preview = str(v)[:100] if v else "(empty)"
                    print(f"      {preview}")
        else:
            print(f"    {feedback}")

        print(f"\n  FULL RUN DATA:")
        print(f"    {json.dumps({
            'inputs': inputs,
            'outputs': outputs,
            'feedback': feedback,
        }, indent=2, default=str)[:500]}...\n")


if __name__ == "__main__":
    main()
