import pytest
from server import verify_solution_logic
import json

def test_verify_solution_logic_sanitizes_nbsp():
    # Code with \u00A0 (non-breaking space) which would cause SyntaxError in raw Python
    # class Solution:
    #     def solve(self, x):
    #         return True (indented 8 spaces)
    code_with_nbsp = "class Solution:\n    def solve(self, x):\n\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0return True"
    test_inputs = ["1"]
    
    # This should NOT crash with SyntaxError
    result = verify_solution_logic(code_with_nbsp, test_inputs)
    
    # result is JSON string or Runtime Error string
    try:
        # Handle cases where result might be a list of stdout lines
        if isinstance(result, list):
            result = result[0]
            
        data = json.loads(result)
        assert isinstance(data, list)
        assert data[0]['status'] == "Passed"
        assert data[0]['output'] == "True"
    except json.JSONDecodeError:
        pytest.fail(f"verify_solution_logic failed with: {result}")

if __name__ == "__main__":
    # Manual run for debugging
    res = test_verify_solution_logic_sanitizes_nbsp()
    print("Test Passed!")
