# Remove SSE Streaming, Replace with Polling + Token Buffer

**Date:** 2026-03-29
**Status:** Approved

## Problem

The autofix feature has 3 redundant code paths for getting results from the local Python backend:

1. **SSE streaming** (primary) — content script opens a `chrome.runtime.connect` port to background.js, which fetches an SSE endpoint on the FastAPI server. This path fails frequently because the chrome port disconnects before data flows (service worker idle kills, race conditions between job start and stream connection).
2. **Async polling** (fallback) — content script polls `/autofix/status/{job_id}` every 700ms via `proxyFetchJson`. Works reliably but currently lacks token streaming.
3. **Sync** (last resort) — blocking POST to `/autofix`. No progress feedback at all.

The SSE path adds significant complexity (3-layer proxy: FastAPI EventSourceResponse -> background.js ReadableStream parser -> chrome.runtime port -> content script) for a solo-developer localhost setup where polling latency is ~1ms.

## Solution

Remove the SSE streaming path entirely. Enhance the async polling path to also deliver LLM tokens via a `token_buffer` field on the status endpoint. Keep the sync path as a last-resort fallback.

### New architecture (single polling path)

```
content script -> proxyFetchJson -> background.js message handler -> fetch -> FastAPI /autofix/status/{job_id}
```

## Changes by file

### 1. `mcp-server/api.py` (server)

**Replace `stream_queue` with `token_buffer`:**
- In `_create_autofix_job`: replace `"stream_queue": asyncio.Queue(maxsize=512)` with `"token_buffer": ""`
- The job dict field `token_buffer` is a plain string that accumulates all LLM tokens as they are generated

**Replace `_push_stream_token` with `_append_token`:**
- New function `_append_token(job_id, token)` acquires the lock and appends `token` to `job["token_buffer"]`
- Called from the same `stream_cb` in the async autofix endpoint

**Remove SSE-only functions:**
- Delete `_push_stream_done` (the done signal is already conveyed by `job["state"]` being `"succeeded"` or `"failed"`)
- Remove all `stream_queue` references from `_record_autofix_event` (the events array already captures step progress)

**Update `/autofix/status/{job_id}` response:**
- Add `"token_buffer": job.get("token_buffer", "")` to the returned dict
- Add `"token_buffer_len": len(job.get("token_buffer", ""))` for efficient client-side diffing

**Remove `/autofix/stream/{job_id}` endpoint:**
- Delete the entire `autofix_stream_endpoint` function and its route

**Remove `sse-starlette` dependency** from `requirements.txt` if no other endpoint uses it.

### 2. `src/content/llm_sidecar.js` (client)

**Remove `runSafeObserverStreaming`:**
- Delete the entire function (currently lines 568-642)

**Enhance `runSafeObserverAsync` with token support:**
- Add `onToken` parameter to function signature: `async function runSafeObserverAsync(payload, baseUrl, onProgress, signal, onToken)`
- Track `let lastTokenLen = 0` alongside existing `lastEventCount`
- On each poll response, if `status.token_buffer_len > lastTokenLen`:
  - Extract new tokens: `const newTokens = status.token_buffer.slice(lastTokenLen)`
  - Call `onToken(newTokens)` if the callback exists
  - Update `lastTokenLen = status.token_buffer_len`
- Reduce poll interval from `700ms` to `300ms` for snappier token display

**Update `analyzeMistake` call site:**
- Remove the streaming try/catch wrapper (lines ~724-728)
- Call `runSafeObserverAsync` directly as the primary path, passing `onToken`
- Keep `runSafeObserverSync` as fallback if async fails

### 3. `src/background.js` (background service worker)

**Remove SSE port handler:**
- Delete the entire `chrome.runtime.onConnect.addListener` block for `autofix-stream` (lines 390-448)

## What is preserved

- **Progress step events** — already delivered via the `events` array in status polling (no change)
- **Token-by-token display** — delivered via `token_buffer` diffing instead of SSE (new mechanism, same `onToken` callback contract)
- **Sync fallback** — unchanged
- **`onProgress` and `onToken` callback signatures** — unchanged from the caller's perspective in `analyzeMistake`

## What is removed

- `runSafeObserverStreaming` function in llm_sidecar.js
- `chrome.runtime.onConnect` listener in background.js
- `/autofix/stream/{job_id}` SSE endpoint in api.py
- `_push_stream_token` and `_push_stream_done` functions in api.py
- `stream_queue` (asyncio.Queue) from job state
- `sse-starlette` pip dependency (if unused elsewhere)

## Trade-offs

- **Token latency**: ~300ms worst-case delay between token generation and display (vs near-zero with SSE). Imperceptible on localhost.
- **Payload size**: Status response grows as tokens accumulate. For a typical autofix response (~500 tokens, ~2KB), this is negligible. The `token_buffer_len` field lets the client skip parsing when no new tokens exist.
- **Simplicity**: One code path instead of three attempt-layers. No chrome port lifecycle issues. No background.js streaming code.
