from e2b_code_interpreter import Sandbox
from dotenv import load_dotenv
import os

load_dotenv()

def test():
    print(f"🔑 API Key found: {bool(os.getenv('E2B_API_KEY'))}")
    print("🚀 Initializing E2B Sandbox (Synchronous)...")
    
    # Use synchronous context manager
    with Sandbox.create() as sandbox:
        print("✅ Sandbox created!")
        
        code = """
class Solution:
    def which_sign(self, sign, popped_once, popped_twice):
        match sign:
            case "+":
                return popped_once + popped_twice
            case "-":
                return popped_twice - popped_once
            case "*":
                return popped_once * popped_twice
            case "/":
                return int(popped_twice / popped_once)

    def evalRPN(self, tokens):
        stack = []
        for i, token in enumerate(tokens):
            if token in {"+", "-", "*", "/"}:
                first_popped = int(stack.pop())
                second_popped = int(stack.pop())
                stack.append(self.which_sign(token, first_popped, second_popped))
            else:
                stack.append(token)
        return stack[-1]
"""
        test_input = "['4', '13', '5', '/', '+']"
        
        full_script = f"""
{code}

tokens = {test_input}
try:
    print(f"Run Input: {{tokens}}")
    sol = Solution()
    result = sol.evalRPN(tokens)
    print(f"Final Result: {{result}}")
except Exception as e:
    import traceback
    traceback.print_exc()
"""
        print("running_code...")
        # No await here for synchronous Sandbox
        execution = sandbox.run_code(full_script)
        
        if execution.error:
            print("❌ Execution Error:")
            print(execution.logs.stderr)
        else:
            print("✅ Execution Success:")
            print(execution.logs.stdout)
            
    # Context manager handles .kill() automatically

if __name__ == "__main__":
    test()
