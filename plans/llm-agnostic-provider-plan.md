# LLM-Agnostic Provider Refactor Plan

## Problem

1. `AgentFixer` hardcodes `ChatGoogleGenerativeAI` — the `provider` field in `VerificationRequest` is accepted but silently ignored.
2. `/models` requires a Gemini API key to fetch models — chicken-and-egg: users can't discover available models without already having a key configured.
3. No way for users to configure API keys through the UI — they must manually edit `.env`.
4. Ollama (local, free, no key) is already in `requirements.txt` (`langchain-ollama`) but completely unused.

## Goal

Let users pick any supported provider + model from the UI, supply their API key in the frontend, and have the backend route to the correct LangChain `BaseChatModel` — with zero changes to the downstream `generate_fix` / `generate_tests` / `attempt_fix` logic.

## Architecture

```
Frontend (Chrome Extension)
  ├── Settings panel: provider dropdown, API key input, model dropdown
  ├── GET /providers         → static list of supported providers + key requirements
  ├── POST /models           → dynamic model list (user sends api_key in body)
  └── POST /autofix          → sends { code, test_input, provider, model, api_key }

Backend (api.py)
  ├── get_llm(provider, model, api_key, base_url) → BaseChatModel   ← NEW factory
  ├── AgentFixer(llm: BaseChatModel)                       ← inject LLM, don't construct it
  └── /models, /autofix use the factory
```

## Implementation Steps

### Phase 1: Backend — LLM Factory + Provider Registry

#### Step 1.1: Create `providers.py` — provider registry and LLM factory

```python
from dataclasses import dataclass

@dataclass
class ProviderInfo:
    name: str           # "google", "openai", "ollama"
    display_name: str   # "Google Gemini", "OpenAI", "Ollama (Local)"
    requires_api_key: bool
    default_model: str
    # Static list of well-known models as fallback when dynamic fetch fails or no key
    fallback_models: list[str]

PROVIDERS: dict[str, ProviderInfo] = {
    "ollama": ProviderInfo(
        name="ollama",
        display_name="Ollama (Local)",
        requires_api_key=False,
        default_model="gemma3:latest",
        fallback_models=["gemma3:latest", "llama3.2:latest", "qwen2.5-coder:latest"],
    ),
    "google": ProviderInfo(
        name="google",
        display_name="Google Gemini",
        requires_api_key=True,
        default_model="gemini-2.5-flash",
        fallback_models=["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
    ),
    "openai": ProviderInfo(
        name="openai",
        display_name="OpenAI",
        requires_api_key=True,
        default_model="gpt-4o-mini",
        fallback_models=["gpt-4o", "gpt-4o-mini", "o1-mini", "o3-mini"],
    ),
    "anthropic": ProviderInfo(
        name="anthropic",
        display_name="Anthropic",
        requires_api_key=True,
        default_model="claude-3-5-sonnet-latest",
        fallback_models=["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest", "claude-3-opus-latest"],
    ),
}

def get_llm(provider: str, model: str, api_key: str | None = None, base_url: str | None = None):
    """
    Factory that returns a LangChain BaseChatModel.
    All returned objects share the same interface:
      .with_structured_output(), .ainvoke(), prompt | llm, etc.
    """
    match provider:
        case "google":
            from langchain_google_genai import ChatGoogleGenerativeAI
            from config import google_api_key
            
            # Fallback to .env config if no key provided by frontend
            final_key = api_key or google_api_key
            if not final_key:
                raise ValueError("Google Gemini requires an API key. Check settings or .env.")
            
            return ChatGoogleGenerativeAI(
                model=model, api_key=final_key,
                temperature=0.4, max_retries=3,
            )
        case "ollama":
            from langchain_ollama import ChatOllama
            # Use base_url from frontend, fallback to default
            b_url = base_url or "http://localhost:11434"
            return ChatOllama(model=model, base_url=b_url, temperature=0.4)
        case "openai":
            from langchain_openai import ChatOpenAI
            from config import openai_api_key
            final_key = api_key or openai_api_key
            if not final_key:
                raise ValueError("OpenAI requires an API key. Check settings or .env.")
            return ChatOpenAI(model=model, api_key=final_key, temperature=0.4, max_retries=3)
        case "anthropic":
            from langchain_anthropic import ChatAnthropic
            from config import anthropic_api_key
            final_key = api_key or anthropic_api_key
            if not final_key:
                raise ValueError("Anthropic requires an API key. Check settings or .env.")
            return ChatAnthropic(model_name=model, api_key=final_key, temperature=0.4, max_retries=3)
        case _:
            raise ValueError(f"Unsupported provider: {provider}")
```

Key point: Ollama needs zero API key — this breaks the chicken-and-egg loop.

#### Step 1.2: New endpoint `GET /providers` — static, no key needed

```python
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
```

#### Step 1.3: Refactor `POST /models` — accept provider + optional api_key in body

```python
class ModelsRequest(BaseModel):
    provider: str
    api_key: str | None = None
    base_url: str | None = None

@app.post("/models")
def list_models(req: ModelsRequest):
    """Dynamically fetch models for a given provider.
    For Ollama: no key needed, queries local server.
    For Google: requires api_key, queries Google API.
    Falls back to static list on failure."""
    info = PROVIDERS.get(req.provider)
    if not info:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"Unknown provider: {req.provider}")

    try:
        match req.provider:
            case "google":
                from config import google_api_key
                final_key = req.api_key or google_api_key
                if not final_key:
                    return {"models": info.fallback_models, "source": "fallback"}
                
                # Dynamic fetch via google-genai SDK
                try:
                    import google.generativeai as genai
                    genai.configure(api_key=final_key)
                    models = [m.name for m in genai.list_models() if "generateContent" in m.supported_generation_methods]
                    return {"models": models, "source": "dynamic"}
                except Exception as e:
                    # Explicit error if validation fails instead of silently falling back
                    return {"error": "Invalid API key or validation failed"}
            case "openai":
                from config import openai_api_key
                final_key = req.api_key or openai_api_key
                if not final_key:
                    return {"models": info.fallback_models, "source": "fallback"}
                try:
                    import openai
                    client = openai.OpenAI(api_key=final_key)
                    # Filter for typical chat models
                    models = [m.id for m in client.models.list().data if m.id.startswith(("gpt-", "o1-", "o3-"))]
                    return {"models": sorted(models, reverse=True), "source": "dynamic"}
                except Exception:
                    return {"error": "Invalid OpenAI API key or validation failed"}
            case "anthropic":
                from config import anthropic_api_key
                final_key = req.api_key or anthropic_api_key
                if not final_key:
                    return {"models": info.fallback_models, "source": "fallback"}
                try:
                    import anthropic
                    client = anthropic.Anthropic(api_key=final_key)
                    # Attempt to list models to validate key. (Requires anthropic>=0.38)
                    models = client.models.list().data
                    model_names = [m.id for m in models]
                    return {"models": model_names, "source": "dynamic"}
                except Exception:
                    # In case of older SDK or generic error, but we want to fail strict if key is bad
                    return {"error": "Invalid Anthropic API key or validation failed"}
            case "ollama":
                # Query local Ollama server — no key needed
                import requests
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
```

This solves the chicken-and-egg:
- Ollama: no key required; if reachable → dynamic list, otherwise fallback list + warning
- Google: without key → returns well-known fallback list so UI isn't empty
- Google: with key → dynamic fetch from API

UI validation should only treat a cloud API key as valid when `source === "dynamic"`.
If `source === "fallback"` or `error` is present, show a warning and keep the model dropdown hidden.

#### Step 1.4: Refactor `AgentFixer` — inject LLM instead of constructing it

```python
class AgentFixer:
    def __init__(self, llm):  # Accept a BaseChatModel, not a model name
        self.llm = llm
        # Everything else stays the same — generate_fix, generate_tests,
        # attempt_fix all use self.llm which is provider-agnostic
```

No other changes to `AgentFixer` internals. `PromptTemplate | llm.with_structured_output(...)` works identically across all LangChain chat models.

#### Step 1.5: Refactor `autofix_endpoint` — use factory

```python
@app.post("/autofix")
async def autofix_endpoint(req: VerificationRequest):
    provider = req.provider or "ollama"  # Default to local, no key needed
    info = PROVIDERS.get(provider)
    if not info:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}")
        
    model = req.model or info.default_model

    try:
        llm = get_llm(provider, model, api_key=req.api_key, base_url=req.base_url)
    except ValueError as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=str(e))
        
    agent = AgentFixer(llm)
    ...
```

#### Step 1.6: Update `VerificationRequest` schema

```python
class VerificationRequest(BaseModel):
    code: str
    test_input: str
    provider: str | None = None   # already exists, now actually used
    model: str | None = None      # already exists
    api_key: str | None = None    # NEW — frontend sends user's key per-request
    base_url: str | None = None   # NEW — frontend sends local endpoint
```

Note: API key is sent per-request from the frontend, not stored in `.env`. This means:
- Users don't need to touch `.env`
- Different users can use different keys
- Keys are stored in Chrome extension's `chrome.storage.local` (local to the user's browser; no guarantee of encryption at rest)

### Phase 2: Frontend — Options Page Progressive Disclosure UI

The options page (`src/options/options.html` + `options.js`) already has:
- Local / Cloud radio cards (`#mode-local`, `#mode-cloud`)
- Three API key inputs (`#key-google`, `#key-openai`, `#key-anthropic`)
- A model select dropdown (`#model-select`)
- A "Save All Settings" button

The current flow is flat — everything is visible at once after picking a mode. The new flow introduces **progressive disclosure**: each step only appears after the previous one is completed.

#### Step 2.1: New UI Flow — Cloud Mode (Progressive Disclosure)

```
Step 1: User clicks "Cloud API" radio card
        → Cloud provider selector appears (Google / OpenAI / Anthropic)
        → Everything below is hidden

Step 2: User picks a cloud provider (e.g. "Google Gemini")
        → API key input appears for ONLY that provider
        → "Validate & Save Key" button appears
        → Model dropdown is still hidden

Step 3: User enters API key, clicks "Validate & Save Key"
        → Backend call: POST /models { provider: "google", api_key: "AIza..." }
        → If `source === "dynamic"`: model dropdown appears, populated with model list
        → If `source === "fallback"` or `error`: show warning/error, model dropdown stays hidden

Step 4: User picks a model from dropdown
        → "Save All Settings" saves { provider, model, api_key } to chrome.storage.local
```

#### Step 2.2: New UI Flow — Local Mode (Simpler)

```
Step 1: User clicks "Local (Private)" radio card
        → Local endpoint input + "Test Connection" button appear (same as today)
        → No API key input shown

Step 2: User clicks "Test Connection" (or it auto-runs)
        → Backend call: POST /models { provider: "ollama", base_url: localEndpoint }
        → If Ollama running: model dropdown appears with locally installed models
        → If Ollama not running: fallback static model list shown + warning

Step 3: User picks model, saves
```

#### Step 2.3: HTML Changes (`src/options/options.html`)

Replace the current `#section-cloud` content. Instead of showing all 3 key inputs at once, use a stepped layout:

```html
<div class="hidden-section setup-panel" id="section-cloud">
    <!-- Step 1: Cloud provider selector (NEW) -->
    <h3 data-i18n="cloud_provider_heading">Choose Cloud Provider</h3>
    <div class="row mode-row" id="cloud-provider-row">
        <label class="radio-card">
            <input type="radio" name="cloud-provider" value="google" id="cp-google">
            <div class="card-content">
                <span class="title">Google Gemini</span>
                <span class="subtitle">Free tier available</span>
            </div>
        </label>
        <label class="radio-card">
            <input type="radio" name="cloud-provider" value="openai" id="cp-openai">
            <div class="card-content">
                <span class="title">OpenAI</span>
                <span class="subtitle">GPT-4o, GPT-4o Mini</span>
            </div>
        </label>
        <label class="radio-card">
            <input type="radio" name="cloud-provider" value="anthropic" id="cp-anthropic">
            <div class="card-content">
                <span class="title">Anthropic</span>
                <span class="subtitle">Claude 3.5 Sonnet</span>
            </div>
        </label>
    </div>

    <!-- Step 2: API key input (shown after provider selected) -->
    <div id="cloud-key-section" style="display:none;">
        <div class="field">
            <label id="cloud-key-label">API Key</label>
            <input id="cloud-key-input" type="password" placeholder="">
            <a id="cloud-key-help" href="#" target="_blank" class="hint">
                How to get this key?
            </a>
        </div>
        <div class="actions">
            <button id="validate-key" class="btn">Validate & Save Key</button>
            <span id="key-status" class="status-text"></span>
        </div>
    </div>

    <!-- Step 3: Model dropdown (shown after key validated) -->
    <!-- Reuses existing #model-select, but hidden until key is valid -->
</div>
```

#### Step 2.4: JS Changes (`src/options/options.js`)

**Remove from `MODELS` constant**: The hardcoded model lists become fallbacks only. Primary source is the backend `POST /models`.

**New state tracking**:
```javascript
let cloudProviderSelected = null;  // 'google' | 'openai' | 'anthropic'
let keyValidated = false;
```

**New event handlers**:

```javascript
// Cloud provider radio change → show API key input for that provider
document.querySelectorAll('input[name="cloud-provider"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        cloudProviderSelected = e.target.value;
        keyValidated = false;

        // Show key input, hide model dropdown
        cloudKeySection.style.display = 'block';
        modelSelectField.style.display = 'none';

        // Update placeholder and help link per provider
        const config = {
            google:    { placeholder: 'AIzaSy...', helpUrl: '...', label: 'Google Gemini API Key' },
            openai:    { placeholder: 'sk-...',    helpUrl: '...', label: 'OpenAI API Key' },
            anthropic: { placeholder: 'sk-ant-...', helpUrl: '...', label: 'Anthropic API Key' },
        };
        const c = config[cloudProviderSelected];
        cloudKeyInput.placeholder = c.placeholder;
        cloudKeyLabel.textContent = c.label;
        cloudKeyHelp.href = c.helpUrl;
    });
});

// Validate key → call POST /models → populate model dropdown
validateKeyBtn.addEventListener('click', async () => {
    const apiKey = cloudKeyInput.value.trim();
    if (!apiKey) return showStatus(keyStatus, 'Please enter an API key', 'error');

    showStatus(keyStatus, 'Validating...', 'loading');

    try {
        const baseUrl = 'http://127.0.0.1:8000';
        // Note: direct fetch from options page may require host_permissions or CORS allowance.
        const resp = await fetch(`${baseUrl}/models`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: cloudProviderSelected, api_key: apiKey })
        });
        const data = await resp.json();

        if (data.error) {
            showStatus(keyStatus, data.error, 'error');
        } else if (data.source === 'dynamic' && data.models && data.models.length > 0) {
            keyValidated = true;
            // Save key immediately
            const keys = { ...currentKeys, [cloudProviderSelected]: apiKey };
            await chrome.storage.local.set({ keys });

            // Show and populate model dropdown
            populateModelSelectFromList(data.models, cloudProviderSelected);
            modelSelectField.style.display = 'block';
            showStatus(keyStatus, `Valid! Found ${data.models.length} models.`, 'ok');
        } else {
            showStatus(keyStatus, 'Invalid key or connection error.', 'error');
        }
    } catch (e) {
        showStatus(keyStatus, `Connection failed: ${e.message}`, 'error');
    }
});
```

**Update `saveSettings()`** — include `provider` (not just `aiProvider: 'cloud'`):
```javascript
async function saveSettings() {
    const mode = els.modeLocal.checked ? 'local' : 'cloud';
    const payload = {
        aiProvider: mode,
        cloudProvider: cloudProviderSelected,  // NEW: 'google' | 'openai' | 'anthropic'
        keys: { ... },
        selectedModelId: els.modelSelect.value,
        localEndpoint: els.localEndpoint.value.trim(),
        uiLanguage: currentLanguage
    };
    await chrome.storage.local.set(payload);
}
```

**Update `loadSettings()`** — restore cloud provider selection and re-run progressive disclosure:
```javascript
async function loadSettings() {
    const settings = await chrome.storage.local.get({ ...DEFAULTS, cloudProvider: '' });
    // ... existing logic ...

    if (mode === 'cloud' && settings.cloudProvider) {
        // Re-select the cloud provider radio
        document.getElementById(`cp-${settings.cloudProvider}`).checked = true;
        cloudProviderSelected = settings.cloudProvider;

        // If key exists, show key input pre-filled + model dropdown
        const savedKey = settings.keys?.[settings.cloudProvider];
        if (savedKey) {
            cloudKeyInput.value = savedKey;
            keyValidated = true;
            cloudKeySection.style.display = 'block';
            // Fetch models to populate dropdown
            await populateModelSelect('cloud', settings.selectedModelId);
        }
    }
}
```

#### Step 2.5: Update `llm_sidecar.js` — pass provider + api_key to backend

Currently `llm_sidecar.js` sends `/autofix` with only `{ code, test_input }`. Update to include the user's saved provider/model/key:

```javascript
// In the autofix fetch call:
const settings = await chrome.storage.local.get({
    aiProvider: 'local',
    cloudProvider: '',
    selectedModelId: '',
    keys: {},
    localEndpoint: 'http://127.0.0.1:11434'
});

// Remove the old logic that hardcoded 'google' vs 'local' or had fallback code
// Replace it entirely with reading from the global settings (which now includes openai/anthropic)
const settings = await chrome.storage.local.get({
    aiProvider: 'local',
    cloudProvider: '',
    selectedModelId: '',
    keys: {},
    localEndpoint: 'http://127.0.0.1:11434'
});

const provider = settings.aiProvider === 'cloud'
    ? settings.cloudProvider
    : 'ollama';
const apiKey = settings.aiProvider === 'cloud'
    ? settings.keys[settings.cloudProvider] || ''
    : null;

const res = await fetch(verifyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        code: userCode,
        test_input: testInput,
        provider: provider,
        model: settings.selectedModelId,
        api_key: apiKey,
        base_url: settings.localEndpoint
    })
});
```

#### Step 2.6: Update `sandbox_client.js` — same pattern for `/verify`

Same change: read provider/model/key from storage, include in request body (and `base_url` for Ollama).

#### Step 2.7: i18n — Add new translation keys

Add to all locale packs in `options.js`:
```javascript
cloud_provider_heading: 'Choose Cloud Provider',
cloud_provider_google_subtitle: 'Free tier available',
cloud_provider_openai_subtitle: 'GPT-4o, GPT-4o Mini',
cloud_provider_anthropic_subtitle: 'Claude 3.5 Sonnet',
validate_key_button: 'Validate & Save Key',
status_validating_key: 'Validating...',
status_key_valid: 'Valid! Found {count} models.',
status_key_invalid: 'Invalid key or connection error.',
status_key_no_models: 'Key accepted but no models found.',
```

This needs translation for all 11 supported languages (en, zh, hi-IN, ja-JP, pt-BR, de-DE, ko-KR, fr-FR, pl-PL, es-ES, tr-TR).

### Phase 3: Cleanup

#### Step 3.1: Remove hardcoded Google references
- Delete `from google import genai` import (only needed inside `/models` handler now)
- Remove `google_api_key` logic from `AgentFixer.__init__`
- Remove `settings.default_model` (replaced by `PROVIDERS[provider].default_model`)
- Clean up `config.py` — `google_api_key` becomes optional, not central

#### Step 3.2: Update tests
- Test `get_llm()` factory for each provider
- Test `/providers` endpoint (static, always works)
- Test `/models` with and without API keys, and ensure `source` drives key validation
- Test unknown provider returns 4xx for `/models` and `/autofix`
- Test `base_url` is honored for Ollama (UI → `/models` → `get_llm`)
- Test `AgentFixer` with a mock `BaseChatModel` (provider-agnostic)
- Ensure existing tests still pass

## User Flow After Refactor

### Flow A: First-Time User (Local / Free)

```
1. User installs extension, starts mcp-server + Ollama
2. Opens options page → AI Configuration card
3. "Local (Private)" is selected by default
4. "Test Connection" auto-detects Ollama → model dropdown appears with installed models
5. User picks model, clicks "Save All Settings"
6. User goes to LeetCode, submits wrong answer → autofix works immediately (no API key)
```

### Flow B: Cloud User (Progressive Disclosure)

```
1. User clicks "Cloud API" radio card
2. Three cloud provider cards appear: Google Gemini / OpenAI / Anthropic
3. User clicks "Google Gemini"
4. Single API key input appears with "How to get this key?" link
5. User pastes key, clicks "Validate & Save Key"
6. Backend validates key via POST /models → returns model list
7. Model dropdown appears with dynamic Gemini models
8. User picks model, clicks "Save All Settings"
9. Autofix now routes to Gemini with user's key
```

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `mcp-server/providers.py` | NEW | Provider registry + `get_llm()` factory |
| `mcp-server/api.py` | MODIFY | Use factory, add `GET /providers`, refactor `/models` to POST, inject LLM into AgentFixer |
| `mcp-server/config.py` | MODIFY | Remove `google_api_key` as central, simplify |
| `mcp-server/tests/test_providers.py` | NEW | Test factory + provider/model endpoints |
| `mcp-server/tests/test_*.py` | MODIFY | Update mocks to inject LLM instead of patching constructor |
| `src/options/options.html` | MODIFY | Replace flat cloud key inputs with progressive disclosure (provider cards → key input → model dropdown) |
| `src/options/options.js` | MODIFY | Add cloud provider selection logic, key validation via `POST /models`, progressive show/hide, new i18n keys for all 11 languages |
| `src/options/options.css` | MODIFY | Styles for cloud provider radio cards |
| `src/content/llm_sidecar.js` | MODIFY | Pass `provider`, `model`, `api_key` in `/autofix` request body |
| `src/background/sandbox_client.js` | MODIFY | Pass `provider`, `model`, `api_key` in `/verify` request body |

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Ollama not installed locally | `/models` returns fallback list; `/autofix` returns clear error "Ollama not running" |
| API key sent in request body (not HTTPS in dev) | Local-only server (`127.0.0.1`); production should use HTTPS |
| Breaking existing extension users | Default to Ollama (same as original pre-Gemini behavior); existing `.env` keys still work via config fallback |
| `with_structured_output` behavior differs across providers | LangChain normalizes this; Ollama + Gemini both support it. Add integration test per provider. |

## Compatibility & Permissions

- If you need to preserve legacy clients that call `GET /models`, keep a thin GET wrapper or version the API.
- Options page `fetch` to `http://127.0.0.1:8000` may require `host_permissions` or CORS allowances.
  If that's not viable, route `/models` via background messaging instead of direct fetch.

## Priority

Phase 1 (backend) first — this unblocks local usage without any API key.
Phase 2 (frontend) can follow incrementally.
Phase 3 (cleanup) after both are stable.
