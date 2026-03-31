"""Scrape Auto Fix traces and add them to an existing LangSmith dataset."""

import os
from langsmith import Client

PROJECT = os.getenv("LANGCHAIN_PROJECT", "LeetCode EasyRepeat")
API_KEY = os.getenv("LANGCHAIN_API_KEY")
DATASET_NAME = "LeetCode EasyRepeat Dataset"

if not API_KEY:
    raise EnvironmentError("LANGCHAIN_API_KEY is required")

client = Client(api_key=API_KEY)

# Fetch the dataset
try:
    dataset = client.read_dataset(dataset_name=DATASET_NAME)
    print(f"Found dataset: {DATASET_NAME} (ID: {dataset.id})")
except Exception as e:
    print(f"Error reading dataset: {e}")
    exit(1)

# Scrape Auto_Fix_Agent_Loop runs
try:
    runs = client.list_runs(
        project_name=PROJECT,
        run_type="chain",
        filter='eq(name, "Auto_Fix_Agent_Loop")',
        limit=30,
    )
except Exception as e:
    print(f"Error fetching runs: {e}")
    exit(1)

# Extract examples
examples = []
inputs_list = []
outputs_list = []

for run in runs:
    run_inputs = getattr(run, "inputs", None)
    if not run_inputs:
        continue

    code = run_inputs.get("code")
    error = run_inputs.get("error")
    if code is None or error is None:
        continue

    initial_inputs = run_inputs.get("initial_inputs", [])
    if isinstance(initial_inputs, (list, tuple)):
        test_input = str(initial_inputs[0]) if initial_inputs else ""
    else:
        test_input = str(initial_inputs) if initial_inputs is not None else ""

    inputs_list.append({
        "code": code,
        "error": error,
        "test_input": test_input,
    })
    outputs_list.append({})
    examples.append(run)

if not examples:
    print("No Auto_Fix_Agent_Loop runs found.")
    exit(0)

print(f"Found {len(examples)} examples. Adding to dataset...")

# Add examples to dataset
try:
    client.create_examples(
        inputs=inputs_list,
        outputs=outputs_list,
        dataset_id=dataset.id,
    )
    print(f"✅ Added {len(examples)} examples to '{DATASET_NAME}'")
except Exception as e:
    print(f"❌ Error adding examples: {e}")
    exit(1)
