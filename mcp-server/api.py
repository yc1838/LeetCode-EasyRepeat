from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse
import asyncio
import inspect
import os
import re
import anyio
import time
import uuid
from langchain_core.prompts import PromptTemplate
from langsmith import traceable

import json
import requests
import hashlib

from server import verify_solution_logic
from config import get_settings
from providers import PROVIDERS, get_llm

app = FastAPI()
settings = get_settings()

# In-memory job registry for async autofix progress
AUTOFIX_JOB_TTL_SECONDS = 60 * 10
_AUTOFIX_JOBS: dict[str, dict] = {}
_AUTOFIX_JOBS_LOCK = asyncio.Lock()

# Prompt Versions for LangSmith Evaluation
PROMPT_VERSIONS = {
    "fix_generation": "v1.1_structured_pydantic",
    "fix_generation_streaming": "v1.0_freeform_streaming",
    "test_generation": "v1.0_edge_case_json"
}

CAVEMAN_INSTRUCTION = (
    "CRITICAL: Respond like a SMART CAVEMAN. "
    "Cut ALL articles (a, an, the), filler, and pleasantries. "
    "Minimize pronouns and auxiliary verbs. "
    "Technical accuracy must remain 100%. "
    "Structure: [thing] [action] [reason]. [next step]."
)

async def _prune_autofix_jobs():
    now = time.time()
    async with _AUTOFIX_JOBS_LOCK:
        expired = [job_id for job_id, job in _AUTOFIX_JOBS.items()
                   if now - job.get("updated_at", now) > AUTOFIX_JOB_TTL_SECONDS]
        for job_id in expired:
            _AUTOFIX_JOBS.pop(job_id, None)

def get_prompt_hash(name: str, template: str) -> str:
    """Generates a unique version fingerprint based on the prompt content."""
    h = hashlib.md5(template.strip().encode()).hexdigest()[:6]
    return f"{name}_{h}"

async def _create_autofix_job(max_attempts: int) -> str:
    job_id = uuid.uuid4().hex
    now = time.time()
    async with _AUTOFIX_JOBS_LOCK:
        _AUTOFIX_JOBS[job_id] = {
            "job_id": job_id,
            "state": "queued",
            "step": None,
            "attempt": None,
            "max_attempts": max_attempts,
            "message": None,
            "result": None,
            "error": None,
            "events": [],
            "stream_queue": asyncio.Queue(maxsize=512),
            "created_at": now,
            "updated_at": now
        }
    return job_id

async def _record_autofix_event(job_id: str, event: dict):
    now = time.time()
    async with _AUTOFIX_JOBS_LOCK:
        job = _AUTOFIX_JOBS.get(job_id)
        if not job:
            return
        entry = {
            "ts": now,
            "step": event.get("step"),
            "status": event.get("status"),
            "attempt": event.get("attempt"),
            "max_attempts": event.get("max_attempts"),
            "message": event.get("message")
        }
        job["events"].append(entry)
        job["step"] = entry.get("step")
        job["attempt"] = entry.get("attempt")
        job["message"] = entry.get("message")
        job["updated_at"] = now
        # Push to SSE stream queue (non-blocking)
        queue = job.get("stream_queue")
        if queue:
            try:
                queue.put_nowait({"type": "step", **entry})
            except asyncio.QueueFull:
                pass

async def _push_stream_token(job_id: str, step: str, token: str):
    """Push a streaming token to the job's SSE queue."""
    async with _AUTOFIX_JOBS_LOCK:
        job = _AUTOFIX_JOBS.get(job_id)
        if not job:
            return
        queue = job.get("stream_queue")
        if queue:
            try:
                queue.put_nowait({"type": "token", "step": step, "token": token})
            except asyncio.QueueFull:
                pass

async def _push_stream_done(job_id: str, result: dict | None = None, error: str | None = None):
    """Signal end of SSE stream."""
    async with _AUTOFIX_JOBS_LOCK:
        job = _AUTOFIX_JOBS.get(job_id)
        if not job:
            return
        queue = job.get("stream_queue")
        if queue:
            if error:
                try:
                    queue.put_nowait({"type": "error", "error": error})
                except asyncio.QueueFull:
                    pass
            elif result:
                try:
                    queue.put_nowait({"type": "result", "result": result})
                except asyncio.QueueFull:
                    pass
            try:
                queue.put_nowait({"type": "done"})
            except asyncio.QueueFull:
                pass

async def _set_autofix_job_state(job_id: str, state: str, result: dict | None = None, error: str | None = None):
    now = time.time()
    async with _AUTOFIX_JOBS_LOCK:
        job = _AUTOFIX_JOBS.get(job_id)
        if not job:
            return
        job["state"] = state
        job["updated_at"] = now
        if result is not None:
            job["result"] = result
        if error is not None:
            job["error"] = error

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
                except Exception as e:
                    return _provider_validation_error("Google Gemini", e, final_key)

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
                except Exception as e:
                    return _provider_validation_error("OpenAI", e, final_key)

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
                except Exception as e:
                    return _provider_validation_error("Anthropic", e, final_key)

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


def _redact_error_detail(detail: str, *secrets: str | None) -> str:
    sanitized = detail or ""
    for secret in secrets:
        if secret:
            sanitized = sanitized.replace(secret, "[redacted]")
    return sanitized


def _provider_validation_error(provider_label: str, exc: Exception, *secrets: str | None) -> dict:
    raw_detail = str(exc).strip() or exc.__class__.__name__
    detail = _redact_error_detail(f"{exc.__class__.__name__}: {raw_detail}", *secrets)
    lowered = detail.lower()
    kind = exc.__class__.__name__.lower()

    network_markers = (
        "connecterror",
        "connectionerror",
        "name resolution",
        "nodename nor servname",
        "temporary failure in name resolution",
        "failed to resolve",
        "connection refused",
        "timeout",
        "timed out",
        "dns",
    )
    auth_markers = (
        "api key not valid",
        "invalid api key",
        "invalid_api_key",
        "permission denied",
        "permissiondenied",
        "unauthenticated",
        "authentication",
        "401",
        "403",
    )

    if any(marker in kind or marker in lowered for marker in network_markers):
        return {
            "error": f"{provider_label} connection failed",
            "error_type": "network_error",
            "error_detail": detail,
        }

    if any(marker in kind or marker in lowered for marker in auth_markers):
        return {
            "error": f"{provider_label} authentication failed",
            "error_type": "auth_error",
            "error_detail": detail,
        }

    return {
        "error": f"{provider_label} validation failed",
        "error_type": "provider_error",
        "error_detail": detail,
    }

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
    def __init__(self, llm, metadata: dict = None, *, caveman_mode: bool = False):
        """Accept a pre-built BaseChatModel — provider-agnostic.

        The caller (autofix_endpoint) is responsible for constructing the LLM
        via get_llm(provider, model, api_key, base_url).
        """
        self.llm = llm
        self.metadata = metadata or {}
        self.caveman_mode = caveman_mode

    def is_simple_fix(self, code: str) -> bool:
        # Heuristic: If code is < 10 lines, it's simple enough to show
        # Or if the diff is small (harder to calculate without original)
        return len(code.split('\n')) < 15

    async def generate_fix_details(self, code: str, error: str, test_input: str) -> CodeFix | None:
        """Return the structured code-fix payload, including explanation text."""
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

        if self.caveman_mode:
            template += f"\n        {CAVEMAN_INSTRUCTION}\n"

        # Auto-versioning: metadata changes whenever template changes
        call_metadata = {
            **self.metadata,
            "prompt_version": get_prompt_hash("fix", template)
        }

        prompt = PromptTemplate.from_template(template)

        try:
            # Enforce structured Pydantic output
            # Some models struggle with with_structured_output if they don't support tool calling.
            # We ensure the prompt is extra explicit as a backup.
            structured_llm = self.llm.with_structured_output(CodeFix)
            chain = prompt | structured_llm
            return await chain.ainvoke({
                "code": code,
                "error": error,
                "test_input": test_input
            }, config={"metadata": call_metadata})
        except Exception as e:
            # This is where 'Invalid json output' or 'OUTPUT_PARSING_FAILURE' is caught.
            print(f"LLM Generation Failed (Structured): {e}")
        return None

    @traceable(name="Generate_Fix", run_type="llm")
    async def generate_fix(self, code: str, error: str, test_input: str) -> str:
        """
        Generates a fixed Python code snippet using LangChain and Chat models.
        Uses Pydantic structured output to securely extract the executable code.
        """
        res = await self.generate_fix_details(code, error, test_input)
        if res and res.fixed_code:
            return res.fixed_code.strip()
        return None

    @traceable(name="Generate_Fix_Streaming", run_type="llm")
    async def generate_fix_streaming(self, code: str, error: str, test_input: str, stream_cb=None) -> str:
        """
        Streaming variant of generate_fix. Emits tokens via stream_cb as they arrive,
        then parses the final accumulated output to extract the code.
        Falls back to generate_fix if streaming fails.
        """
        template = """You are an expert Python coding assistant.
The user has the following buggy code which failed with an error.

CODE:
{code}

ERROR:
{error}

FAILING INPUT:
{test_input}

Task: Write a CORRECT, WORKING Python solution that fixes this error.
First, briefly analyze the bug and explain your thought process.
Then, provide the fixed code inside a single ```python code fence.
Do not provide additional explanations after the code fence.
"""

        call_metadata = {
            **self.metadata,
            "prompt_version": get_prompt_hash("fix_stream", template)
        }

        prompt = PromptTemplate.from_template(template)
        chain = prompt | self.llm

        try:
            accumulated = ""
            async for chunk in chain.astream(
                {"code": code, "error": error, "test_input": test_input},
                config={"metadata": call_metadata}
            ):
                token = chunk.content if hasattr(chunk, "content") else str(chunk)
                if isinstance(token, list):
                    text_parts = []
                    for t in token:
                        if isinstance(t, dict) and "text" in t:
                            text_parts.append(t["text"])
                        elif isinstance(t, str):
                            text_parts.append(t)
                    token = "".join(text_parts)
                elif not isinstance(token, str):
                    token = str(token)
                accumulated += token
                if stream_cb:
                    result = stream_cb(token)
                    if inspect.isawaitable(result):
                        await result

            # Extract code from ```python ... ``` fence
            match = re.search(r"```python\s*\n(.*?)```", accumulated, re.DOTALL)
            if match:
                return match.group(1).strip()
            # Fallback: if no fence, try the whole response stripped
            stripped = accumulated.strip()
            if stripped:
                return stripped
        except Exception as e:
            print(f"Streaming generation failed, falling back to structured: {e}")

        # Fallback to non-streaming structured output
        return await self.generate_fix(code, error, test_input)

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

        # Auto-versioning: metadata changes whenever template changes
        call_metadata = {
            **self.metadata,
            "prompt_version": get_prompt_hash("test_gen", template)
        }
        prompt = PromptTemplate.from_template(template)
        
        try:
            # Enforce structured Pydantic output
            structured_llm = self.llm.with_structured_output(GeneratedTests)
            chain = prompt | structured_llm
            result = await chain.ainvoke({
                "code": code,
                "error": error
            }, config={"metadata": call_metadata})
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
    async def attempt_fix(self, code: str, error: str, initial_inputs: list[str], max_retries: int = 3, progress_cb=None, stream_cb=None):
        # Bind metadata for logs
        # Any nested traceable calls can pick up this metadata if using LangChain's RunContext
        # but here we pass it explicitly to ainvoke calls.
        async def emit(step: str, status: str, message: str | None = None, attempt: int | None = None):
            if not progress_cb:
                return
            payload = {
                "step": step,
                "status": status,
                "message": message,
                "attempt": attempt,
                "max_attempts": max_retries
            }
            try:
                result = progress_cb(payload)
                if inspect.isawaitable(result):
                    await result
            except Exception as e:
                print(f"Progress callback failed: {e}")

        current_code = code
        current_error = error
        
        # 0. Generate Test Suite
        print("Generating Test Suite...")
        await emit("generate_tests", "active", "Generating edge-case tests")
        generated_tests = await self.generate_tests(code, error)
        await emit("generate_tests", "done", f"Generated {len(generated_tests)} tests")
        # Combine with user's failing inputs
        all_tests = initial_inputs + generated_tests
        print(f"Test Suite: {len(all_tests)} tests")
        
        history = [] 

        for attempt in range(max_retries):
            print(f"--- Attempt {attempt + 1}/{max_retries} ---")
            
            # 1. Generate Fix
            print("Generating fix...")
            await emit(f"generate_fix_attempt_{attempt + 1}", "active", "Generating fix", attempt + 1)
            retry_context = ""
            if attempt > 0:
                retry_context = f"PREVIOUS ATTEMPT FAILED.\nCode tried:\n{current_code}\n\nError/Failures:\n{current_error}\n\nFix these specific failures."
            
            # Use the first failing input as the context for the prompt
            first_input = initial_inputs[0] if initial_inputs else ""
            if stream_cb:
                candidate = await self.generate_fix_streaming(
                    current_code if attempt > 0 else code,
                    current_error if attempt == 0 else retry_context,
                    first_input,
                    stream_cb=stream_cb
                )
            else:
                candidate = await self.generate_fix(current_code if attempt > 0 else code, current_error if attempt == 0 else retry_context, first_input)
            
            if not candidate:
                await emit(f"generate_fix_attempt_{attempt + 1}", "error", "Failed to generate fix", attempt + 1)
                return {"verified": False, "error": "Failed to generate fix"}
            await emit(f"generate_fix_attempt_{attempt + 1}", "done", "Fix generated", attempt + 1)

            # 2. Verify against ALL tests (runs in separate synced thread to prevent event loop blocking)
            print("Verifying fix against suite...")
            await emit(f"execute_sandbox_attempt_{attempt + 1}", "active", "Executing in sandbox", attempt + 1)
            success, logs = await anyio.to_thread.run_sync(self.verify_fix, candidate, all_tests)
            if success:
                await emit(f"execute_sandbox_attempt_{attempt + 1}", "done", "Sandbox passed", attempt + 1)
                await emit("verified_success", "done", "Safe Observer verified", attempt + 1)
            else:
                await emit(f"execute_sandbox_attempt_{attempt + 1}", "error", "Sandbox failed", attempt + 1)
                await emit("verified_failed", "error", "Safe Observer failed", attempt + 1)
            
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

async def _run_autofix_job(job_id: str, req: VerificationRequest):
    provider = req.provider or "ollama"
    info = PROVIDERS.get(provider)
    if not info:
        await _set_autofix_job_state(job_id, "failed", error=f"Unsupported provider: {provider}")
        return

    model = req.model or info.default_model
    try:
        llm = get_llm(provider, model, api_key=req.api_key, base_url=req.base_url)
    except ValueError as e:
        await _set_autofix_job_state(job_id, "failed", error=str(e))
        return

    await _set_autofix_job_state(job_id, "running")

    async def progress_cb(event: dict):
        await _record_autofix_event(job_id, event)

    try:
        # Prepare Metadata for LangSmith
        metadata = {
            "job_id": job_id,
            "provider": provider,
            "model": model,
            "max_retries": settings.max_retries,
            "interface": "chrome_extension_async"
        }

        async def stream_cb(token: str):
            await _push_stream_token(job_id, "generate_fix", token)

        inputs = _parse_inputs(req.test_input)
        initial_logs = await anyio.to_thread.run_sync(verify_solution_logic, req.code, inputs)
        error_context = initial_logs
        agent = AgentFixer(llm, metadata=metadata)
        result = await agent.attempt_fix(req.code, error_context, inputs, max_retries=settings.max_retries, progress_cb=progress_cb, stream_cb=stream_cb)
        final_state = "succeeded" if result.get("verified") else "failed"
        await _set_autofix_job_state(job_id, final_state, result=result)
        await _push_stream_done(job_id, result=result)
    except Exception as e:
        await _set_autofix_job_state(job_id, "failed", error=str(e))
        await _push_stream_done(job_id, error=str(e))

@app.post("/autofix/async")
async def autofix_async_endpoint(req: VerificationRequest):
    await _prune_autofix_jobs()
    job_id = await _create_autofix_job(settings.max_retries)
    asyncio.create_task(_run_autofix_job(job_id, req))
    return {"job_id": job_id}

@app.get("/autofix/status/{job_id}")
async def autofix_status_endpoint(job_id: str):
    await _prune_autofix_jobs()
    async with _AUTOFIX_JOBS_LOCK:
        job = _AUTOFIX_JOBS.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        return {
            "job_id": job["job_id"],
            "state": job["state"],
            "step": job.get("step"),
            "attempt": job.get("attempt"),
            "max_attempts": job.get("max_attempts"),
            "message": job.get("message"),
            "events": job.get("events", []),
            "result": job.get("result"),
            "error": job.get("error")
        }

@app.get("/autofix/stream/{job_id}")
async def autofix_stream_endpoint(job_id: str):
    """SSE endpoint that streams step events and LLM tokens in real-time."""
    async with _AUTOFIX_JOBS_LOCK:
        job = _AUTOFIX_JOBS.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        queue = job.get("stream_queue")
        if not queue:
            raise HTTPException(status_code=400, detail="Streaming not available for this job")

    async def event_generator():
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=60.0)
            except asyncio.TimeoutError:
                yield {"event": "ping", "data": "{}"}
                continue

            event_type = event.get("type", "step")
            yield {"event": event_type, "data": json.dumps(event)}

            if event_type == "token":
                await asyncio.sleep(0.02)  # Artificial delay for visual streaming effect

            if event_type == "done":
                return

    return EventSourceResponse(event_generator())

if __name__ == "__main__":
    import uvicorn
    # Run on port 8000
    uvicorn.run("api:app", host="127.0.0.1", port=8000, reload=True)
