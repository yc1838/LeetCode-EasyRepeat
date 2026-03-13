from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware
import os
import anyio
from langchain_core.prompts import PromptTemplate
from langsmith import traceable

import json
import requests

from server import verify_solution_logic
from config import get_settings
from providers import PROVIDERS, get_llm

app = FastAPI()
settings = get_settings()

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
    model: str | None = None
    provider: str | None = None
    api_key: str | None = None       # Frontend sends user's key per-request
    base_url: str | None = None      # Frontend sends local endpoint

class ModelsRequest(BaseModel):
    provider: str
    api_key: str | None = None
    base_url: str | None = None

class GeneratedTests(BaseModel):
    """
    Pydantic schema defining the strict structured output expected from the LLM.
    
    Why this is used:
    Instead of relying on the LLM to format its markdown correctly (e.g. ```json ... ```) 
    and manually parsing strings with `json.loads()`, LangChain allows us to pass this 
    Pydantic model directly to `ChatGoogleGenerativeAI.with_structured_output()`. 
    
    This guarantees that:
    1. The LLM is forced to output a JSON object matching this exact schema.
    2. LangChain automatically handles the parsing and validation.
    3. If the LLM output is malformed, Pydantic immediately throws a clear `ValidationError` 
       instead of failing silently or crashing during parsing downstream.
    """
    
    test_cases: list[str] = Field(
        ..., 
        description="A list of 3 distinct, edge-case Python literal test inputs."
    )

class CodeFix(BaseModel):
    """
    Pydantic schema defining the structured output for code generation.
    Forces the LLM to separate the actual syntactically correct code from 
    its explanation or conversational fluff, eliminating markdown parsing bugs.
    """
    fixed_code: str = Field(
        ...,
        description="The full, corrected Python code snippet. Must be valid, runnable Python code without markdown blocks."
    )
    explanation: str = Field(
        ...,
        description="A brief explanation of what was wrong and how it was fixed."
    )

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/providers")
def list_providers():
    """Returns supported providers and whether they need an API key.
    No API key required to call this — solves the bootstrap problem."""
    return {
        "providers": [
            {
                "name": p.name,
                "display_name": p.display_name,
                "requires_api_key": p.requires_api_key,
                "default_model": p.default_model,
                "fallback_models": p.fallback_models,
            }
            for p in PROVIDERS.values()
        ]
    }

@app.post("/models")
def list_models(req: ModelsRequest):
    """Dynamically fetch models for a given provider.
    For Ollama: no key needed, queries local server.
    For cloud providers: requires api_key, queries provider API.
    Falls back to static list on failure."""
    info = PROVIDERS.get(req.provider)
    if not info:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {req.provider}")

    # Read settings dynamically so tests with env patches see fresh values
    current_settings = get_settings()

    try:
        match req.provider:
            case "google":
                env_key = current_settings.google_api_key.get_secret_value() if current_settings.google_api_key else None
                final_key = req.api_key or env_key
                if not final_key:
                    return {"models": info.fallback_models, "source": "fallback"}

                try:
                    from google import genai
                    client = genai.Client(api_key=final_key)
                    google_models = []
                    for m in client.models.list():
                        name = m.name.lower()
                        is_text = m.supported_actions and "generateContent" in m.supported_actions
                        is_specialized = any(tag in name for tag in ["image", "tts", "robotics", "research", "computer-use", "banana"])
                        if is_text and not is_specialized:
                            google_models.append(m.name.replace("models/", ""))
                    return {"models": google_models, "source": "dynamic"}
                except Exception:
                    return {"error": "Invalid API key or validation failed"}

            case "openai":
                env_key = current_settings.openai_api_key.get_secret_value() if current_settings.openai_api_key else None
                final_key = req.api_key or env_key
                if not final_key:
                    return {"models": info.fallback_models, "source": "fallback"}
                try:
                    import openai
                    client = openai.OpenAI(api_key=final_key)
                    models = [m.id for m in client.models.list().data if m.id.startswith(("gpt-", "o1-", "o3-"))]
                    return {"models": sorted(models, reverse=True), "source": "dynamic"}
                except Exception:
                    return {"error": "Invalid OpenAI API key or validation failed"}

            case "anthropic":
                env_key = current_settings.anthropic_api_key.get_secret_value() if current_settings.anthropic_api_key else None
                final_key = req.api_key or env_key
                if not final_key:
                    return {"models": info.fallback_models, "source": "fallback"}
                try:
                    import anthropic
                    client = anthropic.Anthropic(api_key=final_key)
                    models_data = client.models.list().data
                    model_names = [m.id for m in models_data]
                    return {"models": model_names, "source": "dynamic"}
                except Exception:
                    return {"error": "Invalid Anthropic API key or validation failed"}

            case "ollama":
                b_url = req.base_url or "http://localhost:11434"
                try:
                    resp = requests.get(f"{b_url}/api/tags", timeout=3)
                    if resp.ok:
                        models = [m["name"] for m in resp.json().get("models", [])]
                        return {"models": models, "source": "dynamic"}
                except Exception:
                    pass
                return {
                    "models": info.fallback_models,
                    "source": "fallback",
                    "warning": f"Could not connect to Ollama at {b_url}"
                }

        return {"models": info.fallback_models, "source": "fallback"}
    except Exception as e:
        return {"error": str(e)}

def _parse_inputs(raw_input: str) -> list[str]:
    """
    Parses the incoming test_input. 
    If it's a JSON array of strings sent by the batch extension, unpacks it.
    Otherwise, treats the raw payload as a single test case.
    """
    try:
        parsed = json.loads(raw_input)
        if isinstance(parsed, list):
            # We strictly expect the batch payloads to be lists of strings.
            # If it's a single test case that happens to be an array (like '[1, 2]'),
            # the heuristic below ensures it's not accidentally split if they aren't strings.
            if all(isinstance(x, str) for x in parsed):
                return parsed
    except Exception:
        pass
    return [raw_input]

@app.post("/verify")
async def verify_endpoint(req: VerificationRequest):
    """
    Endpoint for the Chrome Extension to call.
    """
    print(f"Received verification request for input: {req.test_input}")
    
    # Normalize input: automatic batch unpacking or single string
    inputs = _parse_inputs(req.test_input)
    
    # verify_solution_logic expects a list of strings
    result = await anyio.to_thread.run_sync(verify_solution_logic, req.code, inputs)
    return {"result": result}



class AgentFixer:
    def __init__(self, llm):
        """Accept a pre-built BaseChatModel — provider-agnostic.
        
        The caller (autofix_endpoint) is responsible for constructing the LLM
        via get_llm(provider, model, api_key, base_url).
        """
        self.llm = llm

    def is_simple_fix(self, code: str) -> bool:
        # Heuristic: If code is < 10 lines, it's simple enough to show
        # Or if the diff is small (harder to calculate without original)
        return len(code.split('\n')) < 15

    @traceable(name="Generate_Fix", run_type="llm")
    async def generate_fix(self, code: str, error: str, test_input: str) -> str:
        """
        Generates a fixed Python code snippet using LangChain and Chat models.
        Uses Pydantic structured output to securely extract the executable code.
        """
        template = """
        You are an expert Python coding assistant.
        The user has the following buggy code which failed with an error.
        
        CODE:
        {code}
        
        ERROR:
        {error}
        
        FAILING INPUT:
        {test_input}
        
        Task: Write a CORRECT, WORKING Python solution that fixes this error.
        Return it complying with the requested JSON schema.
        """
        
        prompt = PromptTemplate.from_template(template)
        
        try:
            # Enforce structured Pydantic output
            structured_llm = self.llm.with_structured_output(CodeFix)
            chain = prompt | structured_llm
            res = await chain.ainvoke({
                "code": code,
                "error": error,
                "test_input": test_input
            })
            
            if res and res.fixed_code:
                return res.fixed_code.strip()
        except Exception as e:
            print(f"LLM Generation Failed: {e}")
        return None

    @traceable(name="Generate_Edge_Case_Tests", run_type="llm")
    async def generate_tests(self, code: str, error: str) -> list[str]:
        """
        Generates edge-case test inputs by forcing the language model to output 
        strict JSON conforming to the GeneratedTests Pydantic model.
        """
        template = """
        You are a QA Engineer for Python LeetCode problems.
        Analyze the code and error below.
        Generate 3 DISTINCT, EDGE-CASE test inputs that would stressors this code.
        The inputs must be in valid Python literal format (e.g. string representation of args).
        
        CODE:
        {code}
        
        ERROR:
        {error}
        
        CRITICAL:
        1. Return ONLY a JSON matching the requested schema.
        2. Example: ["(([1,2], 3))", "(([], 0))"] or whatever the function signature expects.
        3. Do NOT use markdown.
        """
        prompt = PromptTemplate.from_template(template)
        
        try:
            # Enforce structured Pydantic output
            structured_llm = self.llm.with_structured_output(GeneratedTests)
            chain = prompt | structured_llm
            result = await chain.ainvoke({
                "code": code,
                "error": error
            })
            if result and result.test_cases:
                return result.test_cases[:3]
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

    @traceable(name="Auto_Fix_Agent_Loop", run_type="chain")
    async def attempt_fix(self, code: str, error: str, initial_inputs: list[str], max_retries: int = 3):
        current_code = code
        current_error = error
        
        # 0. Generate Test Suite
        print("Generating Test Suite...")
        generated_tests = await self.generate_tests(code, error)
        # Combine with user's failing inputs
        all_tests = initial_inputs + generated_tests
        print(f"Test Suite: {len(all_tests)} tests")
        
        history = [] 

        for attempt in range(max_retries):
            print(f"--- Attempt {attempt + 1}/{max_retries} ---")
            
            # 1. Generate Fix
            print("Generating fix...")
            retry_context = ""
            if attempt > 0:
                retry_context = f"PREVIOUS ATTEMPT FAILED.\nCode tried:\n{current_code}\n\nError/Failures:\n{current_error}\n\nFix these specific failures."
            
            # Use the first failing input as the context for the prompt
            first_input = initial_inputs[0] if initial_inputs else ""
            candidate = await self.generate_fix(current_code if attempt > 0 else code, current_error if attempt == 0 else retry_context, first_input)
            
            if not candidate:
                return {"verified": False, "error": "Failed to generate fix"}

            # 2. Verify against ALL tests (runs in separate synced thread to prevent event loop blocking)
            print("Verifying fix against suite...")
            success, logs = await anyio.to_thread.run_sync(self.verify_fix, candidate, all_tests)
            
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


@app.post("/autofix")
async def autofix_endpoint(req: VerificationRequest):
    """
    Agentic Endpoint: Generates and Verifies a fix.
    Uses the provider factory to construct the correct LLM.
    """
    provider = req.provider or "ollama"  # Default to local, no key needed
    info = PROVIDERS.get(provider)
    if not info:
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}")

    model = req.model or info.default_model

    try:
        llm = get_llm(provider, model, api_key=req.api_key, base_url=req.base_url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    print(f"Auto-Fix Request: provider={provider}, model={model}, input={req.test_input}")
    
    # 1. Reproduce the error locally
    # verify_solution_logic expects a list, so we unpack batch
    inputs = _parse_inputs(req.test_input)
    initial_logs = await anyio.to_thread.run_sync(verify_solution_logic, req.code, inputs)
    
    # Extract error from logs
    error_context = initial_logs
    
    # 2. Agent Loop
    agent = AgentFixer(llm)
    result = await agent.attempt_fix(req.code, error_context, inputs, max_retries=settings.max_retries)
    return result

if __name__ == "__main__":
    import uvicorn
    # Run on port 8000
    uvicorn.run("api:app", host="127.0.0.1", port=8000, reload=True)
