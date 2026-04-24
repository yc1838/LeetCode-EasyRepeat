import json
import os
from pathlib import Path
from langsmith import Client

ROOT = Path(__file__).resolve().parents[1]
DATASET_PATH = ROOT / "eval_data" / "seed_dataset.json"
# User-specified dataset name
DATASET_NAME = "testing_caveman"

def upload():
    api_key = os.getenv("LANGCHAIN_API_KEY") or os.getenv("LANGSMITH_API_KEY")
    if not api_key:
        print("❌ Error: LANGCHAIN_API_KEY is not set.")
        return

    if not DATASET_PATH.exists():
        print(f"❌ Error: {DATASET_PATH} not found.")
        return

    with open(DATASET_PATH, "r") as f:
        examples = json.load(f)

    client = Client(api_key=api_key)
    
    print(f"Dataset target: '{DATASET_NAME}'...")
    try:
        # Check if dataset exists
        dataset = client.read_dataset(dataset_name=DATASET_NAME)
        print(f"Dataset already exists (ID: {dataset.id})")
    except Exception:
        # Create if not found
        try:
            dataset = client.create_dataset(dataset_name=DATASET_NAME)
            print(f"Created new dataset: {DATASET_NAME} (ID: {dataset.id})")
        except Exception as e:
            print(f"❌ Error creating/reading dataset: {e}")
            return

    print(f"Uploading {len(examples)} examples...")
    try:
        client.create_examples(
            inputs=[ex["inputs"] for ex in examples],
            outputs=[ex.get("outputs", {}) for ex in examples],
            dataset_id=dataset.id,
        )
        print(f"✅ Successfully uploaded to '{DATASET_NAME}'")
    except Exception as e:
        print(f"❌ Error uploading examples: {e}")

if __name__ == "__main__":
    upload()
