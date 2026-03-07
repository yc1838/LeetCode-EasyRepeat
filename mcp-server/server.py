from e2b_code_interpreter import Sandbox
import ast
import traceback
import sys
from dotenv import load_dotenv

load_dotenv()

def verify_solution_logic(code: str, test_inputs: list[str]) -> str:
    # 1. Initialize E2B Sandbox (Synchronous context manager)
    with Sandbox.create() as sandbox:
        # 2. Prepare the verification script
        # Safe string injection: repr() ensures we get a valid python string literal
        inputs_repr = repr(test_inputs)
        
        full_script = f"""
import ast
import traceback
import sys
import json

# --- User Code ---
{code}
# -----------------

# --- Test Harness ---
results = []
try:
    # 1. Parse Input Batch
    # We expect raw_inputs to be a list of strings
    raw_inputs = {inputs_repr}
    
    for idx, raw_input_str in enumerate(raw_inputs):
        try:
            # Split by lines to handle multiple arguments (standard LeetCode format)
            lines = [line.strip() for line in raw_input_str.strip().split('\\n') if line.strip()]
            parsed_args = []
            for line in lines:
                try:
                    parsed_args.append(ast.literal_eval(line))
                except:
                    parsed_args.append(line)
                    
            # 2. Dynamic Class Discovery (Do this once? No, maybe per test if state leaks? 
            # Actually user code is global, but instance should be fresh per test)
            target_cls = None
            if 'Solution' in globals():
                target_cls = Solution
            else:
                for name, obj in list(globals().items()):
                    if isinstance(obj, type) and obj.__module__ == '__main__':
                        target_cls = obj
                        break
            
            if target_cls:
                # 3. Design Pattern Detection
                is_design = False
                if len(parsed_args) == 2 and isinstance(parsed_args[0], list) and isinstance(parsed_args[1], list):
                     commands = parsed_args[0]
                     params = parsed_args[1]
                     if len(commands) > 0 and (commands[0] == target_cls.__name__ or commands[0] == 'MyQueue' or commands[0] == 'MinStack'): 
                         is_design = True
                         
                if is_design:
                     commands = parsed_args[0]
                     params = parsed_args[1]
                     obj = target_cls() 
                     design_results = [None] 
                     
                     for i in range(1, len(commands)):
                         cmd = commands[i]
                         args = params[i]
                         if not hasattr(obj, cmd):
                             design_results.append(None)
                             continue
                         method = getattr(obj, cmd)
                         try:
                             res = method(*args)
                             design_results.append(res)
                         except TypeError:
                             res = method(args)
                             design_results.append(res)
                     
                     results.append({{"index": idx, "input": raw_input_str, "output": str(design_results), "status": "Passed"}})
                     
                else:
                     sol = target_cls()
                     methods = [m for m in dir(sol) if not m.startswith('__')]
                     if methods:
                         method_name = methods[0]
                         method = getattr(sol, method_name)
                         try:
                            res = method(*parsed_args)
                         except:
                            res = method(parsed_args)
                         
                         results.append({{"index": idx, "input": raw_input_str, "output": str(res), "status": "Passed"}})
                     else:
                         results.append({{"index": idx, "input": raw_input_str, "error": "No public method found", "status": "Runtime Error"}})
            else:
                results.append({{"index": idx, "input": raw_input_str, "error": "No Solution class found", "status": "Runtime Error"}})

        except Exception as e:
            # Capture individual test failure
            results.append({{"index": idx, "input": raw_input_str, "error": str(e), "traceback": traceback.format_exc(), "status": "Runtime Error"}})

    # Print JSON results to stdout for easier parsing
    print(json.dumps(results))

except Exception:
    traceback.print_exc()
"""
        # 3. Run the code inside the isolated VM
        execution = sandbox.run_code(full_script)
        
        if execution.error:
            # Fatal script error (syntax error in user code likely)
            return f"Runtime Error: {execution.error.name}: {execution.error.value}\\nTraceback:\\n{execution.logs.stderr}"
        
        return execution.logs.stdout
