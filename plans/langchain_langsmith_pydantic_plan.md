# LangChain & LangSmith Integration Plan

This plan outlines the refactoring of the Python backend to use LangChain for LLM calls and LangSmith for observability.

## User Review Required
Please review the plan below. If everything looks good, approve it so we can proceed with execution.

## Proposed Changes

### Python Backend (MCP Server)

#### [MODIFY] requirements.txt
- Add the following packages to manage dependencies, tracing, structured output formats, and async utilities:
  - `langchain-google-genai`
  - `langchain-core` (minimal dependency, avoiding the huge `langchain` package)
  - `langsmith`
  - `pydantic>=2`
  - `pydantic-settings>=2`
  - `anyio`
  - `pytest-asyncio` (for async test migration)

#### [NEW] config.py
- **Pydantic Settings**: Create a `Settings(BaseSettings)` class to manage `.env` configuration. This centralized configuration will govern `model`, `max_retries`, `temperature`, and tracing variables, making multi-model switching trivial.
- **Important**: Uses `GOOGLE_API_KEY` for Google Gemini authentication.
- **Required env vars** (best-effort tracing):
  - `GOOGLE_API_KEY` (for Gemini)
  - `LANGCHAIN_API_KEY`
  - `LANGCHAIN_TRACING_V2=true`
  - `LANGCHAIN_PROJECT` (optional but recommended)
  - `MAX_RETRIES`, `TEMPERATURE`

#### [MODIFY] api.py
- **Imports**: Add LangChain components (`ChatGoogleGenerativeAI`, `PromptTemplate`), LangSmith decorator (`@traceable`), Pydantic (`BaseModel`, `Field`), and `anyio`. Import `settings` from `config.py`.
- **Make Handlers Async**: Convert the FastAPI endpoints `/verify` and `/autofix` from `def` to `async def`.
- **Batch Input Handling**: In `/verify` and `/autofix`, parse `req.test_input`. If it's a JSON string representing a list (e.g., `["test1", "test2"]`), expand it. If not, treat it as a single string. The output interface MUST remain `{ "result": ... }` compatible.
- **Thread Blocking Calls**: Wrap the synchronous E2B sandbox execution `verify_solution_logic(req.code, inputs)` inside `await anyio.to_thread.run_sync(...)`. This ensures the FastAPI event loop is never blocked by the execution sandbox.
- **Define Pydantic Schemas**: 
  - `GeneratedTests(BaseModel)`: `test_cases: list[str] = Field(...)`
  - `CodeFix(BaseModel)`: `code: str = Field(...)`, `explanation: str = Field(...)` (Optional confidence).
- **API Compatibility (Do not break extension)**:
  - `/verify` returns `{ "result": ... }` unchanged.
  - `/autofix` returns fields used by the extension: `verified`, `fixed_code`, `attempts`, `test_count`, `logs`, optional `explanation`.
  - `test_input` accepts JSON array strings to support `verifyBatch`.
- **`AgentFixer.__init__`**: Read `model` from `settings`. Initialize `ChatGoogleGenerativeAI` client with the Google API key.
- **`AgentFixer.generate_fix`**: 
  - Change to `async def`.
  - Convert the raw string prompt into a `PromptTemplate`.
  - Use `await llm.with_structured_output(CodeFix).ainvoke(...)`. By forcing structured output for the fix too, we eliminate fragile regex (`re.sub(...)`) cleaning.
  - Add `@traceable(name="Generate_Fix", run_type="llm")`.
- **`AgentFixer.generate_tests`**:
  - Change to `async def`.
  - Convert the testing prompt into a `PromptTemplate`.
  - Replace raw LLM calls with `await llm.with_structured_output(GeneratedTests).ainvoke(...)`.
  - Add `@traceable(name="Generate_Edge_Case_Tests", run_type="llm")`.
- **`AgentFixer.attempt_fix`**:
  - Change to `async def` and `await` the inner calls. Use `settings.max_retries`.
  - Add `@traceable(name="Auto_Fix_Agent_Loop", run_type="chain")`.
- **Best-Effort Tracing**: Ensure tracing decorators do not crash the app if `LANGCHAIN_API_KEY` is missing. The agent should gracefully fallback to untraced local execution.
- **No Legacy Path**: Remove legacy fallback. LangChain path is the only supported implementation.

## Verification Plan

### Manual Verification
1. We will install the new dependencies.
2. The user will need to add their `LANGCHAIN_API_KEY` to the `mcp-server/.env` file and set `LANGCHAIN_TRACING_V2="true"`.
3. We will start the FastAPI server: `cd mcp-server && python api.py`.
4. We will trigger the `/autofix` endpoint using a sample payload via `curl`.
5. We will verify that the Google Gemini model successfully generates tests and a fix.
6. The user will log into their LangSmith dashboard to verify that the nested traces (Agent Loop -> Test Generation -> Code Generation) are perfectly captured with full prompt visibility.

### Automated Testing
1. Add `pytest-asyncio` and migrate existing tests to async.
2. `pytest` should cover:
   - JSON array parsing for `test_input`.
   - Structured output validation for `GeneratedTests` and `CodeFix`.
   - End-to-end async flow for `/verify` and `/autofix` (mocking LLM calls).
