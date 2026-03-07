from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import os

# Import the logic from server.py
# This will also run load_dotenv() from server.py
from server import verify_solution_logic

app = FastAPI()

# Enable CORS for Chrome Extension (and localhost)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class VerificationRequest(BaseModel):
    code: str
    test_input: str # Keep singular for backward compat, but we might send JSON string of list

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/verify")
def verify_endpoint(req: VerificationRequest):
    """
    Endpoint for the Chrome Extension to call.
    """
    print(f"Received verification request for input: {req.test_input}")
    # Normalize input: always array
    inputs = [req.test_input]
    # verify_solution_logic expects a list of strings
    result = verify_solution_logic(req.code, inputs)
    return {"result": result}

import requests
import re
import json

class AgentFixer:
    def __init__(self):
        # Default to local Ollama
        self.llm_url = "http://localhost:11434/api/generate"
        self.model = "llama3.1" # Or configurable

    def is_simple_fix(self, code: str) -> bool:
        # Heuristic: If code is < 10 lines, it's simple enough to show
        # Or if the diff is small (harder to calculate without original)
        return len(code.split('\n')) < 15

    def generate_fix(self, code: str, error: str, test_input: str) -> str:
        prompt = f"""
        You are an expert Python coding assistant.
        The user has the following buggy code which failed with an error.
        
        CODE:
        {code}
        
        ERROR:
        {error}
        
        FAILING INPUT:
        {test_input}
        
        Task: Write a CORRECT, WORKING Python solution that fixes this error.
        CRITICAL: 
        1. Return ONLY the python code. 
        2. Do NOT use markdown blocks like ```python.
        3. Do NOT explain.
        4. The code must be a full valid replacement for the user's snippet.
        """
        
        try:
            res = requests.post(self.llm_url, json={
                "model": self.model,
                "prompt": prompt,
                "stream": False
            })
            if res.status_code == 200:
                # Extract code from response
                raw = res.json().get('response', '').strip()
                # Remove markdown if present
                clean = re.sub(r'```python|```', '', raw).strip()
                return clean
        except Exception as e:
            print(f"LLM Generation Failed: {e}")
        return None

    def generate_tests(self, code: str, error: str) -> list[str]:
        prompt = f"""
        You are a QA Engineer for Python LeetCode problems.
        Analyze the code and error below.
        Generate 3 DISTINCT, EDGE-CASE test inputs that would stressors this code.
        The inputs must be in valid Python literal format (e.g. string representation of args).
        
        CODE:
        {code}
        
        ERROR:
        {error}
        
        CRITICAL:
        1. Return ONLY a JSON list of strings.
        2. Example: ["(([1,2], 3))", "(([], 0))"] or whatever the function signature expects.
        3. Do NOT use markdown.
        """
        try:
            res = requests.post(self.llm_url, json={
                "model": self.model,
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0.4}
            })
            if res.status_code == 200:
                raw = res.json().get('response', '').strip()
                clean = re.sub(r'```json|```', '', raw).strip()
                import json
                tests = json.loads(clean)
                if isinstance(tests, list):
                    return tests[:3] # Cap at 3
        except Exception as e:
            print(f"Test Gen Failed: {e}")
        return []

    def verify_fix(self, code: str, test_inputs: list[str]):
        # Run in sandbox with batch inputs
        logs = verify_solution_logic(code, test_inputs)
        
        # Logs are now JSON string (list of dicts) or a Runtime Error string
        try:
            results = json.loads(logs)
            # Check if ANY failed
            failures = [r for r in results if r['status'] != 'Passed']
            if failures:
                # Return False and a summary of failures
                return False, json.dumps(failures, indent=2)
            return True, "All Tests Passed: " + json.dumps(results, indent=2)
        except:
            # If not JSON, it's a fatal error (syntax etc)
            pass
        
        # Fallback for fatal errors
        if "Runtime Error" in logs or "Traceback" in logs:
            return False, logs
        
        return True, logs

    def attempt_fix(self, code: str, error: str, initial_input: str, max_retries: int = 3):
        current_code = code
        current_error = error
        
        # 0. Generate Test Suite
        print("Generating Test Suite...")
        generated_tests = self.generate_tests(code, error)
        # Combine with user's failing input (deduplicate?)
        all_tests = [initial_input] + generated_tests
        print(f"Test Suite: {len(all_tests)} tests")
        
        history = [] 

        for attempt in range(max_retries):
            print(f"--- Attempt {attempt + 1}/{max_retries} ---")
            
            # 1. Generate Fix
            print("Generating fix...")
            retry_context = ""
            if attempt > 0:
                retry_context = f"PREVIOUS ATTEMPT FAILED.\nCode tried:\n{current_code}\n\nError/Failures:\n{current_error}\n\nFix these specific failures."
            
            candidate = self.generate_fix(current_code if attempt > 0 else code, current_error if attempt == 0 else retry_context, initial_input)
            
            if not candidate:
                return {"verified": False, "error": "Failed to generate fix"}

            # 2. Verify against ALL tests
            print("Verifying fix against suite...")
            success, logs = self.verify_fix(candidate, all_tests)
            
            history.append({
                "attempt": attempt + 1,
                "code": candidate,
                "logs": logs,
                "success": success
            })

            if success:
                print(f"Verify Success on attempt {attempt + 1}!")
                # Parse logs to get test details for UI
                try:
                    # extract JSON part if possible? 
                    # verify_fix returns "All Tests Passed: [...]"
                    # We might want to structured return
                    pass
                except: pass

                return {
                    "verified": True,
                    "fixed_code": candidate,
                    "explanation": f"Fixed after {attempt + 1} attempts. Passed {len(all_tests)}/{len(all_tests)} tests (including {len(generated_tests)} generated edge cases).",
                    "logs": logs,
                    "attempts": attempt + 1,
                    "test_count": len(all_tests)
                }
            
            # If we failed, update state
            current_code = candidate
            current_error = logs 
        
        return {
            "verified": False,
            "fixed_code": current_code,
            "logs": logs,
            "history": history
        }

agent = AgentFixer()

@app.post("/autofix")
def autofix_endpoint(req: VerificationRequest):
    """
    Agentic Endpoint: Generates and Verifies a fix.
    """
    # req.code is the USER's broken code
    # We also need the Error message ideally, but we can infer or run it first.
    # For now, let's assume we run it first to get the error if not provided?
    # Or strict Auto-Fix: User sends "I have this error". 
    # Current VerificationRequest only has code/input.
    # Let's run the BROKEN code first to get the error trace!
    
    print(f"Auto-Fix Request for: {req.test_input}")
    
    # 1. Reproduce the error locally
    # verify_solution_logic expects a list, even for a single input
    initial_logs = verify_solution_logic(req.code, [req.test_input])
    
    # Extract error from logs
    # Assume logs format: "Runtime Error: ... \nTraceback: ..."
    error_context = initial_logs
    
    # 2. Agent Loop
    result = agent.attempt_fix(req.code, error_context, req.test_input)
    return result

if __name__ == "__main__":
    import uvicorn
    # Run on port 8000
    uvicorn.run("api:app", host="127.0.0.1", port=8000, reload=True)
