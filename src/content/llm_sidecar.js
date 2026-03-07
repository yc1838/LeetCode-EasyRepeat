/**
 * LLM Sidecar - Vanilla JS "Liquid Chrome" Implementation
 * Replicates the React component functionality in pure JS.
 */

(function () {
    // --- Constants ---

    const MODELS = {
        gemini: [
            { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro Preview', meta: 'NEXT-GEN', provider: 'google' },
            { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', meta: 'HYPER-SPEED', provider: 'google' },
            { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', meta: 'REASONING', provider: 'google' },
            { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', meta: 'BALANCED', provider: 'google' },
            { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', meta: 'EFFICIENT', provider: 'google' },
            { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', meta: 'FAST', provider: 'google' },
            // Embedding models (hidden from standard selection but used internally)
            { id: 'gemini-embedding-001', name: 'Gemini Embedding', meta: 'EMBED', provider: 'google', type: 'embedding' }
        ],
        openai: [
            { id: 'gpt-4o-mini', name: 'GPT-4o Mini', meta: 'EFFICIENT', provider: 'openai' },
            { id: 'gpt-4o', name: 'GPT-4o', meta: 'SOTA', provider: 'openai' },
            // Embedding models
            { id: 'text-embedding-3-small', name: 'OpenAI Embedding Small', meta: 'EMBED', provider: 'openai', type: 'embedding' }
        ],
        anthropic: [
            { id: 'claude-3-5-sonnet-20240620', name: 'Claude 3.5 Sonnet', meta: 'BALANCED', provider: 'anthropic' },
            { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', meta: 'SPEED', provider: 'anthropic' },
        ],
        local: [
            { id: 'llama3.1', name: 'Llama 3.1 (Recommended)', meta: 'LOCAL', provider: 'local' },
            { id: 'mistral-nemo', name: 'Mistral Nemo', meta: 'LOCAL', provider: 'local' },
            { id: 'llama3', name: 'Llama 3 (Legacy)', meta: 'LOCAL', provider: 'local' },
            { id: 'mistral', name: 'Mistral (Original)', meta: 'LOCAL', provider: 'local' },
            { id: 'deepseek-coder', name: 'DeepSeek Coder', meta: 'LOCAL', provider: 'local' }
        ]
    };

    const ALL_MODELS = [...MODELS.gemini, ...MODELS.openai, ...MODELS.anthropic, ...MODELS.local];

    const CHAT_MODELS = ALL_MODELS.filter(m => m.type !== 'embedding');
    const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
    const DEPRECATED_GEMINI_MODELS = new Set(['gemini-1.5-flash', 'gemini-1.5-pro']);
    const NEURAL_LINK_UI_ENABLED = false;

    function normalizeGeminiModelId(modelId) {
        if (!modelId || typeof modelId !== 'string') return DEFAULT_GEMINI_MODEL;
        if (!modelId.startsWith('gemini-')) return DEFAULT_GEMINI_MODEL;
        if (DEPRECATED_GEMINI_MODELS.has(modelId)) return DEFAULT_GEMINI_MODEL;
        return modelId;
    }

    // --- Icons (SVG Strings) ---
    const ICONS = {
        minimize: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>`,
        sparkles: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`,
        terminal: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/></svg>`,
        trash: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`,
        send: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" x2="11" y1="2" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
        key: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>`,
    };

    // --- State ---
    // --- State ---
    let state = {
        isOpen: false,
        position: { x: 20, y: 20 },
        activeTab: 'chat', // Only 'chat' remains as main tab

        // Loaded from global settings
        aiProvider: 'local',
        keys: { google: '', openai: '', anthropic: '' },
        localEndpoint: 'http://localhost:11434',
        selectedModelId: 'llama3.1',

        messages: [],
        input: '',
        isLoading: false
    };

    function inferProviderFromModelId(modelId) {
        if (!modelId || typeof modelId !== 'string') return null;
        const id = modelId.trim().toLowerCase();
        if (!id) return null;
        if (id.startsWith('gemini-')) return 'google';
        if (id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3')) return 'openai';
        if (id.startsWith('claude-')) return 'anthropic';
        if (MODELS.local.some(m => m.id === id)) return 'local';
        return null;
    }

    function getDefaultLocalModelId() {
        return MODELS.local[0]?.id || 'llama3.1';
    }

    function getDefaultCloudModelId() {
        return MODELS.gemini[0]?.id || DEFAULT_GEMINI_MODEL;
    }

    function ensureModelMatchesMode() {
        const providerFromModel = inferProviderFromModelId(state.selectedModelId);

        if (state.aiProvider === 'local') {
            if (providerFromModel !== 'local') {
                const fallback = getDefaultLocalModelId();
                console.warn(`[LLMSidecar] Local mode is active; switching model '${state.selectedModelId}' -> '${fallback}'.`);
                state.selectedModelId = fallback;
            }
            return;
        }

        // Cloud mode: avoid accidentally using a local model ID.
        if (providerFromModel === 'local' || !providerFromModel) {
            const fallback = getDefaultCloudModelId();
            console.warn(`[LLMSidecar] Cloud mode is active; switching model '${state.selectedModelId}' -> '${fallback}'.`);
            state.selectedModelId = fallback;
        }
    }

    function getActiveProvider() {
        ensureModelMatchesMode();
        if (state.aiProvider === 'local') return 'local';
        return inferProviderFromModelId(state.selectedModelId) || 'google';
    }

    // --- References ---
    let container = null;
    let dragOffset = { x: 0, y: 0 };
    let isDragging = false;

    // --- Persistence ---
    async function loadState() {
        try {
            // Load position from local storage (UI state)
            const savedPos = localStorage.getItem('llm_sidecar_pos');
            if (savedPos) state.position = JSON.parse(savedPos);

            // Load CONFIG from Chrome Storage (Global)
            const globalSettings = await chrome.storage.local.get({
                aiProvider: 'local',
                keys: { google: '', openai: '', anthropic: '' },
                selectedModelId: 'llama3.1',
                localEndpoint: 'http://localhost:11434'
            });

            state.aiProvider = globalSettings.aiProvider;
            state.keys = globalSettings.keys;
            state.selectedModelId = globalSettings.selectedModelId;
            state.localEndpoint = globalSettings.localEndpoint;
            ensureModelMatchesMode();

            console.log("[LLMSidecar] Configuration loaded:", {
                mode: state.aiProvider,
                model: state.selectedModelId,
                provider: getActiveProvider()
            });
            render(); // Re-render with new config
        } catch (e) { console.error("Error loading state", e); }
    }

    function saveState() {
        // Only save UI state (position) locally
        localStorage.setItem('llm_sidecar_pos', JSON.stringify(state.position));
    }

    // Listen for changes in options page
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local') {
            if (changes.aiProvider) state.aiProvider = changes.aiProvider.newValue;
            if (changes.keys) state.keys = changes.keys.newValue;
            if (changes.selectedModelId) state.selectedModelId = changes.selectedModelId.newValue;
            if (changes.localEndpoint) state.localEndpoint = changes.localEndpoint.newValue;
            ensureModelMatchesMode();
            render();
        }
    });

    // --- API Logic ---
    async function callLLM(prompt, systemPrompt = '', signal = null) {
        const provider = getActiveProvider();
        let modelId = state.selectedModelId;

        if (provider === 'local' && modelId === 'llama3') {
            modelId = 'llama3.1';
            state.selectedModelId = modelId;
        }

        console.log(`[LLMSidecar] Calling LLM. Mode=${state.aiProvider} Model=${modelId} Provider=${provider}`);

        const apiKey = state.keys[provider];

        if (provider !== 'local' && !apiKey) throw new Error(`Missing API Key for ${provider} (Model: ${modelId})`);

        const fetchOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: signal
        };

        if (provider === 'google') {
            const normalizedGeminiModelId = normalizeGeminiModelId(modelId);
            if (normalizedGeminiModelId !== modelId) {
                console.warn(`[LLMSidecar] Deprecated or invalid Gemini model '${modelId}', using '${normalizedGeminiModelId}'.`);
                modelId = normalizedGeminiModelId;
                state.selectedModelId = normalizedGeminiModelId;
            }
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
            const res = await fetch(url, {
                ...fetchOptions,
                body: JSON.stringify({ contents: [{ parts: [{ text: systemPrompt ? `${systemPrompt}\n${prompt}` : prompt }] }] })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error.message);
            return data.candidates?.[0]?.content?.parts?.[0]?.text;
        }

        if (provider === 'openai') {
            const res = await fetch('https://api.openai.com/v1/chat/completions', {
                ...fetchOptions,
                headers: { ...fetchOptions.headers, 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model: modelId,
                    messages: [...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []), { role: 'user', content: prompt }]
                })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error.message);
            return data.choices?.[0]?.message?.content;
        }

        if (provider === 'anthropic') {
            const res = await fetch('https://api.anthropic.com/v1/messages', {
                ...fetchOptions,
                headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
                body: JSON.stringify({ model: modelId, max_tokens: 1024, system: systemPrompt, messages: [{ role: 'user', content: prompt }] })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error.message);
            return data.content?.[0]?.text;
        }

        if (provider === 'local') {
            const host = state.localEndpoint || 'http://localhost:11434';
            const url = `${host}/api/chat`;

            const options = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: modelId,
                    messages: [...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []), { role: 'user', content: prompt }],
                    stream: false
                })
            };

            // Use background proxy to bypass CORS
            const response = await new Promise((resolve, reject) => {
                try {
                    console.log("[LLMSidecar] Sending proxyFetch message to background...");
                    chrome.runtime.sendMessage({ action: 'proxyFetch', url, options }, (res) => {
                        console.log("[LLMSidecar] Received response from background:", res);

                        // Check for orphaned script or messaging error
                        if (chrome.runtime.lastError) {
                            console.error("[LLMSidecar] Runtime Error:", chrome.runtime.lastError);
                            return reject(new Error("Extension Disconnected. Please REFRESH the LeetCode page."));
                        }
                        if (!res) {
                            console.error("[LLMSidecar] Empty response.");
                            return reject(new Error("No response from background proxy."));
                        }

                        if (res.success) {
                            console.log(`[LLMSidecar] Proxy Response: ${res.status} ${res.ok ? 'OK' : 'FAIL'}`);

                            // 1. Check for Origin Block (403)
                            if (res.status === 403) {
                                reject(new Error("Ollama Connection Refused (403). You likely need to set OLLAMA_ORIGINS=\"*\" when running Ollama."));
                                return;
                            }

                            // 2. Check for empty body
                            if (!res.data || res.data.trim() === "") {
                                reject(new Error(`Ollama returned empty response (Status: ${res.status}). Check if model '${state.selectedModelId}' is installed ('ollama list') and loaded.`));
                                return;
                            }

                            // 3. Try Parse
                            try {
                                console.log("[LLMSidecar] Raw Response Data:", res.data);
                                const json = JSON.parse(res.data);
                                if (!res.ok) {
                                    // API returned specific error json
                                    reject(new Error(json.error || `HTTP ${res.status} Error from Local Provider`));
                                } else {
                                    resolve(json);
                                }
                            } catch (e) {
                                console.error("[LLMSidecar] JSON Parse Error. Raw data:", res.data);
                                reject(new Error("Failed to parse JSON from Local LLM response."));
                            }
                        } else {
                            // Network call failed (e.g. Connection Refused)
                            reject(new Error(res.error || "Connection to Local LLM failed. Is Ollama running?"));
                        }
                    });
                } catch (e) {
                    console.error("[LLMSidecar] Exception in sendMessage:", e);
                    reject(new Error("Extension Context Invalidated. Please REFRESH the page."));
                }
            });

            if (response.error) throw new Error(response.error);
            return response.message?.content;
        }
    }

    async function embed(text) {
        let provider = getActiveProvider();

        // Fallback: If current provider doesn't support embeddings (e.g. Anthropic), try others.
        const SUPPORTS_EMBED = ['google', 'openai', 'local'];
        if (!SUPPORTS_EMBED.includes(provider)) {
            if (state.aiProvider === 'local') provider = 'local';
            else if (state.keys.openai) provider = 'openai';
            else if (state.keys.google) provider = 'google';
            else provider = 'local';
        }

        const apiKey = state.keys[provider];

        if (provider !== 'local' && !apiKey) throw new Error(`Missing API Key for ${provider} (or fallback) to generate embeddings`);

        if (provider === 'google') {
            const modelId = 'gemini-embedding-001';
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:embedContent?key=${apiKey}`;

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: { parts: [{ text: text }] },
                    model: `models/${modelId}`
                })
            });
            const data = await res.json();
            if (data.error) throw new Error("Embedding Error: " + data.error.message);
            return data.embedding.values;
        }

        if (provider === 'openai') {
            const res = await fetch('https://api.openai.com/v1/embeddings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    input: text,
                    model: 'text-embedding-3-small'
                })
            });
            const data = await res.json();
            if (data.error) throw new Error("Embedding Error: " + data.error.message);
            return data.data[0].embedding;
        }

        // Fallback or error for Anthropic (no embedding API yet publicly strictly standard)
        // Or mock it with local hashing if needed, but for now throw.
        if (provider === 'local') {
            const host = state.localEndpoint || 'http://localhost:11434';
            const fetchProxied = (targetUrl, body) => {
                return new Promise((resolve, reject) => {
                    try {
                        chrome.runtime.sendMessage({
                            action: 'proxyFetch',
                            url: targetUrl,
                            options: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
                        }, res => {
                            if (chrome.runtime.lastError) return reject(new Error("Extension Disconnected. Refresh Page."));
                            if (!res) return reject(new Error("No response."));

                            if (res.success) {
                                // Network Success
                                try {
                                    const json = JSON.parse(res.data);
                                    if (res.ok) resolve(json);
                                    else reject(new Error(json.error || `HTTP ${res.status}`));
                                } catch (e) { reject(new Error("Invalid JSON")); }
                            } else {
                                // Network Error
                                reject(new Error(res.error));
                            }
                        });
                    } catch (e) { reject(new Error("Extension Disconnected.")); }
                });
            };

            try {
                // Try mxbai first
                const data = await fetchProxied(`${host}/api/embeddings`, {
                    model: 'mxbai-embed-large',
                    prompt: text
                });
                if (data.embedding) return data.embedding;
            } catch (e) { /* ignore fallback */ }

            // Fallback to selected model (with mapping)
            let embedModelId = state.selectedModelId;
            if (embedModelId === 'llama3') embedModelId = 'llama3.1';

            const data2 = await fetchProxied(`${host}/api/embeddings`, {
                model: embedModelId,
                prompt: text
            });

            if (data2.error) throw new Error("Embedding Error: " + data2.error);
            return data2.embedding;
        }

        throw new Error("Embeddings not supported for this provider yet.");
    }

    function hasAnyKey() {
        if (state.aiProvider === 'local') return true;
        const provider = getActiveProvider();
        if (provider === 'local') return true;
        return Boolean(state.keys?.[provider]);
    }

    function isAnalysisEnabled() {
        // Always enabled if local is selected or keys exist
        return true;
    }

    async function analyzeMistake(code, errorDetails, meta = {}, signal = null, onProgress = null) {
        const title = meta.title || 'Unknown Problem';
        const difficulty = meta.difficulty || 'Unknown';
        const queryText = `Error: ${errorDetails}\nCode Snippet: ${code.substring(0, 300)}`; // Truncate for embedding

        let contextMsg = "";
        let isRecurrence = false;

        // --- RAG: Retrieval Step (First) ---
        // Check Knowledge Base first to avoid expensive re-verification of known issues.
        // Call Site: llm_sidecar.js:400 (Approx)
        if (window.VectorDB) {
            try {
                if (onProgress) onProgress("🧠 Searching Knowledge Base...");
                // 1. Embed
                // Only embed if we have an API key for the provider
                if (hasAnyKey()) {
                    const vector = await embed(queryText);

                    // 2. Search
                    const matches = await window.VectorDB.search(vector, 3, 0.75); // Threshold 0.75

                    if (matches && matches.length > 0) {
                        const topMatch = matches[0];
                        console.log(`[LLMSidecar] RAG Match Found! Score: ${topMatch.score.toFixed(2)}`);

                        // 3. Decision Gate
                        if (topMatch.score > 0.92) {
                            // High Confidence -> Return Cached Advice IMMEDIATELY
                            // Call Site: llm_sidecar.js:420 (Approx logic gate)
                            console.log(`%c[AI Service] 🟢 LOCAL HIT (RAG) | Similarity: ${(topMatch.score * 100).toFixed(1)}%`, "color: #4ade80; font-weight: bold;");
                            if (onProgress) onProgress("✨ Found existing solution!");
                            return `💡 **Recurring Mistake Detected**\n\nIt seems you've made a very similar mistake before (${(topMatch.score * 100).toFixed(0)}% match).\n\n**Previous Advice:**\n${topMatch.advice}`;
                        }

                        // Medium Confidence -> Add Context but continue to verification
                        contextMsg = `\n\nCONTEXT: The user previously made a similar mistake (Similarity: ${topMatch.score.toFixed(2)}). Their previous advice was: "${topMatch.advice}". If this is the same issue, be brief and reference this.`;
                        isRecurrence = true;
                    }
                }
            } catch (e) {
                console.warn("[LLMSidecar] RAG step failed (continuing with standard analysis):", e);
            }
        }

        // --- SAFE OBSERVER: Verification Step (Second) ---
        // Only run if we didn't find a high-confidence match in RAG.
        // Call Site: llm_sidecar.js:450 (Approx)
        let verificationResult = "";
        if (meta.test_input) {
            try {
                if (onProgress) onProgress("🛡️ Verifying with Safe Observer...");
                // Determine API endpoint (default to localhost for now, user configurable later)
                const verifyUrl = state.localEndpoint.replace('11434', '8000').replace('/api/chat', '') + '/autofix';
                const SAFE_OBSERVER_URL = verifyUrl;

                console.log(`[LLMSidecar] 🛡️ Requesting Auto-Fix at ${SAFE_OBSERVER_URL}...`);
                const res = await fetch(SAFE_OBSERVER_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code, test_input: meta.test_input })
                });

                if (res.ok) {
                    const data = await res.json();

                    if (data.verified) {
                        console.log("%c[LLMSidecar] ✅ AUTO-FIX SUCCESS", "color: #00ff00; font-weight: bold;");

                        // Append the verified fix to the advice context
                        let fixDisplay = "";
                        const attempts = data.attempts || 1;
                        const testCount = data.test_count || 1;
                        const effortMsg = ` (Took ${attempts} attempts, Passed ${testCount}/${testCount} Tests)`;

                        if (data.fixed_code) {
                            fixDisplay = `\n\n**✅ VERIFIED FIX${effortMsg}**\nI have generated and tested a fix for your code against a suite of ${testCount} edge-case tests.\n\`\`\`python\n${data.fixed_code}\n\`\`\`\n`;
                        } else if (data.explanation) {
                            fixDisplay = `\n\n**✅ VERIFIED FIX${effortMsg}**\nI generated a complex fix that passes the test suite. Strategy: ${data.explanation}\n`;
                        }

                        // We inject this into the prompt or return it as part of the analysis?
                        // Let's modify the prompt to include it, so the final analysis references it.
                        verificationResult = `\n\n--- 🛡️ SAFE OBSERVER LOGS ---\nAUTO-FIX STATUS: VERIFIED${effortMsg}\n${fixDisplay}\nEXECUTION LOGS:\n${data.logs}\n--------------------------------------`;
                    } else {
                        console.warn("[LLMSidecar] ⚠️ Auto-Fix attempted but failed verification.");
                        console.log("[LLMSidecar] 🔍 DEBUG: Verification Data:", data);
                        verificationResult = `\n\n--- 🛡️ SAFE OBSERVER LOGS ---\nAuto-Fix Attempted: FAILED\nExecution Logs:\n${data.logs}\n--------------------------------------`;
                    }
                } else {
                    console.warn(`[LLMSidecar] ⚠️ Safe Observer returned ${res.status}`);
                    console.log("%c[LLMSidecar] ⚠️ SAFE OBSERVER FAILED", "color: orange; font-weight: bold;");
                }
            } catch (e) {
                console.warn("[LLMSidecar] Safe Observer connection failed:", e);
                console.log("%c[LLMSidecar] ❌ SAFE OBSERVER UNREACHABLE", "color: red; font-weight: bold;");
            }
        }

        const systemPrompt = [
            'You are a LeetCode mentor.',
            'Analyze the failure, point out the likely bug or misconception, and suggest a fix.',
            'If "Safe Observer Verification" logs are provided, use them as GROUND TRUTH for what happened. Do not guess.',
            isRecurrence ? 'Be VERY CONCISE. The user has seen this before.' : 'Be concise and focus on actionable guidance.'
        ].join(' ');

        const prompt = [
            `Problem: ${title}`,
            `Difficulty: ${difficulty}`,
            `Error: ${errorDetails || 'Unknown Error'}`,
            meta.test_input ? `Failing Test Input: ${meta.test_input}` : '',
            'Code:',
            code || '// No code captured',
            verificationResult, // Include detailed execution logs
            contextMsg,
            '',
            'Classify the error into one of these SPECIFIC TAGS.',
            'CRITICAL: Do NOT invent new tags. You MUST choose exactly one from the list below.',
            'If the error fits multiple, choose the most specific one.',
            '',
            '--- PYTHON SPECIFIC ---',
            '- PY_LIST_INDEX (IndexError: list index out of range)',
            '- PY_DICT_KEY (KeyError: key not found)',
            '- PY_STR_IMMUTABLE (TypeError: object does not support item assignment)',
            '- PY_SCOPE_UNBOUND (UnboundLocalError)',
            '- PY_SHALLOW_COPY (Modifying copy affected original)',
            '- PY_INDENTATION (IndentationError)',
            '',
            '--- ITERATION & POINTERS ---',
            '- OFF_BY_ONE (Loop range error or index alignment)',
            '- TWO_POINTER_COLLISION (Pointers crossed incorrectly)',
            '- SLIDING_WINDOW_INVALID (Window constraint violation)',
            '- INFINITE_LOOP (While condition never false)',
            '',
            '--- GRAPH & TREES ---',
            '- VISITED_MISSING (Forgot to track visited nodes)',
            '- NULL_NODE_ACCESS (Accessing val/left on None)',
            '- DISCONNECTED_GRAPH (Handling only one component)',
            '- CYCLE_DETECTION_FAIL (Failed to detect cycle)',
            '',
            '--- RECURSION & DP ---',
            '- BASE_CASE_MISSING (No recursion stop condition)',
            '- MEMOIZATION_MISSING (Brute force without cache)',
            '- DP_INIT_ERROR (Table init size/value wrong)',
            '- OVERLAPPING_LOGIC (Recomputing subproblems)',
            '',
            '--- MATH & DATA ---',
            '- MODULO_MISSING (Forgot mod 10^9+7)',
            '- INT_OVERFLOW (Exceeded integer limits)',
            '- FLOAT_PRECISION (Comparing floats with ==)',
            '- TYPE_MISMATCH (Comparing int vs str)',
            '',
            '--- SETUP ---',
            '- STATE_RESET_MISSING (Global vars not cleared)',
            '- EDGE_CASE_EMPTY (Failed on [] or 0)',
            '- RETURN_MISSING (Function returns None)',
            '',
            '--- STACK & QUEUE ---',
            '- STACK_UNDERFLOW (Pop from empty)',
            '- ORDER_MISMATCH (LIFO/FIFO confusion)',
            '',
            '--- BIT MANIPULATION ---',
            '- NEGATIVE_SHIFT (ValueError: negative shift count)',
            '- BITWISE_PRECEDENCE (Forgot parentheses around & |)',
            '',
            'Respond with this JSON format only (NO MARKDOWN, NO ```json WRAPPERS, JUST THE RAW JSON):',
            '{',
            '  "root_cause": "1 sentence explanation",',
            '  "fix": "Code fix or strategy",',
            '  "family": "PYTHON" or "LOGIC" or "ALGO" or "STACK" or "BIT_MANIPULATION",',
            '  "specific_tag": "TAG_FROM_LIST (or NEW_TAG if distinct)",',
            '  "is_recurring": false,',
            '  "micro_skill": "Specific sub-skill missing (e.g. Loop Invariants, Boundary Conditions)",',
            '  "anti_pattern": "Name of the bad habit (e.g. Off-by-one, Premature Optimization)",',
            '  "rationale": "Why this is an error (conceptual reason)"',
            '}'
        ].join('\n');

        const activeModel = ALL_MODELS.find(m => m.id === state.selectedModelId);
        const activeProvider = getActiveProvider();
        const modeLabel = state.aiProvider === 'local' ? '🏠 LOCAL REQUEST' : '☁️ CLOUD REQUEST';
        console.log(`%c[AI Service] ${modeLabel} | Model: ${activeModel?.name || state.selectedModelId} (${activeProvider})`, "color: #38bdf8; font-weight: bold;");

        if (onProgress) onProgress("🤖 Consulting AI Model...");
        let advice = await callLLM(prompt, systemPrompt, signal);

        // 1. Parse JSON Response
        let parsed = null;
        try {
            // Robust Parsing: Extract JSON substring first
            const firstBrace = advice.indexOf('{');
            const lastBrace = advice.lastIndexOf('}');

            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                const jsonCandidate = advice.substring(firstBrace, lastBrace + 1);
                parsed = JSON.parse(jsonCandidate);
            } else {
                throw new Error("No JSON object found in response");
            }
        } catch (e) {
            console.warn("[LLMSidecar] JSON Parse Failed. Fallback to raw text.", e);
            // Attempt fallback extraction for legacy/malformed responses
            const catMatch = advice.match(/Category:?\s*([A-Z_]+)/i);
            parsed = {
                root_cause: advice, // Use the full text as explanation
                fix: "See detailed analysis.",
                family: catMatch ? catMatch[1].toUpperCase() : 'UNCATEGORIZED',
                specific_tag: 'GENERAL',
                is_recurring: false,
                micro_skill: 'General Problem Solving',
                anti_pattern: 'Unknown',
                rationale: 'Parsing failed'
            };
        }

        // 2. Format for Display (Markdown)
        const displayAdvice = `### 🤖 Analysis: ${parsed.anti_pattern || parsed.specific_tag}\n\n**Cause:** ${parsed.root_cause}\n\n**Fix:** ${parsed.fix}\n\n*(Skill: ${parsed.micro_skill || 'General'})*`;

        // 3. RAG Indexing
        if (window.VectorDB) {
            try {
                const vector = await embed(queryText);
                await window.VectorDB.add({
                    vector,
                    text: queryText,
                    advice: displayAdvice, // Save the readble version
                    metadata: {
                        title,
                        difficulty,
                        category: parsed.family,   // Legacy support
                        family: parsed.family,
                        tag: parsed.specific_tag,
                        micro_skill: parsed.micro_skill,
                        anti_pattern: parsed.anti_pattern,
                        rationale: parsed.rationale,
                        timestamp: Date.now()
                    }
                });
                console.log(`[LLMSidecar] Saved mistake: ${parsed.family}/${parsed.specific_tag}`);
                console.log(`[LLMSidecar] Deep Metadata: ${parsed.micro_skill} / ${parsed.anti_pattern}`);
            } catch (e) {
                console.warn("[LLMSidecar] Failed to index mistake:", e);
            }
        }

        return displayAdvice;
    }

    async function reclassifyMistakes(onProgress) {
        if (!window.VectorDB || !hasAnyKey()) return;

        try {
            const records = await window.VectorDB.getAllWithKeys();
            // multiple legacy formats: no tag, or tag is GENERAL, OR missing micro_skill
            const legacy = records.filter(r => !r.metadata.micro_skill || r.metadata.micro_skill === 'Unknown');

            if (legacy.length === 0) {
                if (onProgress) onProgress("No legacy records found.");
                return;
            }

            let completed = 0;
            if (onProgress) onProgress(`Found ${legacy.length} legacy records without Deep Tags. Starting...`);

            for (const r of legacy) {
                // Extract original context
                // Format was: "Error: ...\nCode Snippet: ..."
                const parts = r.text.split('\nCode Snippet:');
                const errorDetails = parts[0].replace('Error: ', '').trim();
                const code = parts[1] ? parts[1].trim() : '';

                // Re-use the SAME prompt structure as analyzeMistake to get granular tags
                const prompt = [
                    `Problem: ${r.metadata.title || 'Unknown'}`,
                    `Error: ${errorDetails}`,
                    `Code: ${code.substring(0, 500)}`, // truncated
                    '',
                    'Classify this OLD mistake into a specific tag from this list (JSON only):',
                    '--- PYTHON SPECIFIC ---',
                    '- PY_LIST_INDEX, PY_DICT_KEY, PY_STR_IMMUTABLE, PY_SCOPE_UNBOUND',
                    '--- LOGIC ---',
                    '- OFF_BY_ONE, VISITED_MISSING, BASE_CASE_MISSING, INFINITE_LOOP, EDGE_CASE_EMPTY',
                    '--- DATA ---',
                    '- INT_OVERFLOW, TYPE_MISMATCH',
                    '',
                    'Respond with JSON:',
                    '{',
                    '  "family": "...", "specific_tag": "...",',
                    '  "micro_skill": "One specific skill missing",',
                    '  "anti_pattern": "Name of the bad habit"',
                    '}'
                ].join('\n');

                try {
                    const advice = await callLLM(prompt, "You are a code classifier. output JSON.");

                    // Parse
                    const cleanJson = advice.replace(/```json/g, '').replace(/```/g, '').trim();
                    const parsed = JSON.parse(cleanJson);

                    if (parsed.specific_tag && parsed.family) {
                        // Update DB
                        const newMeta = {
                            ...r.metadata,
                            family: parsed.family,
                            tag: parsed.specific_tag,
                            micro_skill: parsed.micro_skill || 'General',
                            anti_pattern: parsed.anti_pattern || 'Unknown'
                        };
                        await window.VectorDB.update(r.id, { metadata: newMeta });
                    }
                } catch (e) {
                    console.warn(`[Reclassify] Failed for ${r.id}`, e);
                }

                completed++;
                if (onProgress) onProgress(`Processed ${completed}/${legacy.length}...`);
            }
            if (onProgress) onProgress("Done! Refresh Stats.");

        } catch (e) {
            console.error(e);
            if (onProgress) onProgress("Error: " + e.message);
        }
    }

    // --- UI Rendering ---

    function createElement(tag, className, innerHTML = '') {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (innerHTML) el.innerHTML = innerHTML;
        return el;
    }

    function render() {
        if (!container) return; // Should allow re-render if needed

        // Clear existing content to re-render (naive React imitation)
        // Optimization: In real prod, modify DOM instead of full rebuild, but this is fine for this scale.
        container.innerHTML = '';
        container.className = `llm-sidecar-container ${state.isOpen ? 'llm-sidecar-expanded' : 'llm-sidecar-collapsed'}`;
        container.style.top = `${state.position.y}px`;
        container.style.left = `${state.position.x}px`;

        // === Header ===
        const header = createElement('div', state.isOpen ? 'llm-header llm-header-expanded' : 'llm-header llm-header-collapsed');

        // Drag Logic
        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('.no-drag')) return;
            isDragging = true;
            const rect = container.getBoundingClientRect();
            dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });

        const currentModel = ALL_MODELS.find(m => m.id === state.selectedModelId);
        const activeProvider = getActiveProvider();
        const hasKey = activeProvider === 'local' ? true : Boolean(state.keys[activeProvider]);

        if (state.isOpen) {
            const titleBlock = createElement('div', '');
            titleBlock.appendChild(createElement('h2', 'llm-title', 'NEURAL LINK'));
            const statusRow = createElement('div', 'llm-status-row');
            statusRow.appendChild(createElement('div', `llm-status-dot ${hasKey ? 'llm-status-online' : 'llm-status-offline'}`));
            statusRow.appendChild(createElement('p', 'llm-model-name', currentModel?.id.toUpperCase() || 'UNKNOWN'));
            titleBlock.appendChild(statusRow);

            const controls = createElement('div', 'no-drag');
            const minBtn = createElement('button', 'llm-icon-btn', ICONS.minimize);
            minBtn.onclick = () => { state.isOpen = false; render(); };
            controls.appendChild(minBtn);

            header.appendChild(titleBlock);
            header.appendChild(controls);
        } else {
            // Collapsed Sparkle
            const spark = createElement('div', '', ICONS.sparkles);
            spark.style.color = 'var(--color-cyan)';
            if (!hasKey) {
                // Add red dot
                const dot = createElement('div', '');
                dot.style.cssText = "position:absolute; top:-2px; right:-2px; width:8px; height:8px; background:red; border-radius:50%; animation: pulse 1s infinite;";
                spark.appendChild(dot);
            }
            header.appendChild(spark);
            header.onclick = () => { if (!isDragging) { state.isOpen = true; render(); } };
        }

        container.appendChild(header);

        if (!state.isOpen) return; // Stop here if collapsed

        // === Content ===
        const content = createElement('div', 'llm-content');

        // Tabs
        const tabs = createElement('div', 'llm-tabs no-drag');
        const configTab = createElement('button', `llm-tab-btn ${state.activeTab === 'settings' ? 'active' : ''}`, '// SYSTEM');
        configTab.onclick = () => { state.activeTab = 'settings'; render(); };
        const chatTab = createElement('button', `llm-tab-btn ${state.activeTab === 'chat' ? 'active' : ''}`, '// TERMINAL');
        chatTab.onclick = () => { state.activeTab = 'chat'; render(); };
        tabs.appendChild(configTab);
        tabs.appendChild(chatTab);
        content.appendChild(tabs);

        // Views
        if (state.activeTab === 'settings') renderStatus(content);
        else renderChat(content);

        // Footer
        const footer = createElement('div', 'llm-footer');
        footer.appendChild(createElement('span', 'llm-footer-text', 'V.2.0.5 // STABLE'));
        footer.appendChild(createElement('span', 'llm-footer-text', 'SECURE STORE'));
        content.appendChild(footer);

        container.appendChild(content);
    }

    function renderStatus(parent) {
        const area = createElement('div', 'llm-settings-area llm-custom-scroll no-drag');

        // Current Configuration (Read Only)
        area.appendChild(createElement('span', 'llm-section-label', 'ACTIVE CONFIGURATION'));
        const modelName = ALL_MODELS.find(m => m.id === state.selectedModelId)?.name || state.selectedModelId;
        const providerLabel = state.aiProvider === 'local'
            ? 'LOCAL'
            : getActiveProvider().toUpperCase();

        const configCard = createElement('div', 'llm-config-card');
        configCard.style.cssText = "background: rgba(45, 226, 230, 0.05); padding: 10px; border: 1px solid var(--color-cyan-dim); margin-bottom: 15px;";
        configCard.innerHTML = `
            <div style="font-size:0.8rem; color:var(--color-cyan); margin-bottom:5px;">MODEL: <b style="color:white;">${modelName}</b></div>
            <div style="font-size:0.8rem; color:var(--color-cyan);">PROVIDER: <b style="color:white;">${providerLabel}</b></div>
        `;
        area.appendChild(configCard);

        // Link to Options
        const optionsBtn = createElement('button', 'llm-action-btn', '⚙️ OPEN FULL SETTINGS');
        optionsBtn.onclick = () => {
            // Use chrome runtime to open options
            chrome.runtime.sendMessage({ action: "openOptions" });
        };
        area.appendChild(optionsBtn);

        // Migration Tool
        area.appendChild(createElement('div', 'llm-spacer', ''));
        area.appendChild(createElement('span', 'llm-section-label', 'MAINTENANCE TOOLS'));

        const fixBtn = createElement('button', 'llm-action-btn', '⚡ FIX LEGACY DATA');
        fixBtn.onclick = async () => {
            fixBtn.disabled = true;
            fixBtn.innerText = "Scanning...";
            await reclassifyMistakes((status) => {
                fixBtn.innerText = status;
            });
            setTimeout(() => {
                fixBtn.disabled = false;
                fixBtn.innerText = "⚡ FIX LEGACY DATA";
            }, 3000);
        };
        area.appendChild(fixBtn);

        parent.appendChild(area);
    }

    function renderChat(parent) {
        const area = createElement('div', 'llm-chat-area');

        // Messages
        const msgList = createElement('div', 'llm-messages llm-custom-scroll');
        if (state.messages.length === 0) {
            msgList.innerHTML = `<div class="llm-empty-state"><div style="opacity:0.5; margin-bottom:10px">${ICONS.terminal}</div><p>SYSTEM READY<br>AWAITING INPUT...</p></div>`;
        } else {
            state.messages.forEach(msg => {
                const wrapper = createElement('div', `llm-msg-wrapper llm-msg-${msg.role}`);
                wrapper.innerHTML = `
                    <span class="llm-msg-label">${msg.role === 'user' ? 'USR_01' : 'SYS_CORE'}</span>
                    <div class="llm-msg-bubble">${msg.content}</div>
                `;
                msgList.appendChild(wrapper);
            });
            if (state.isLoading) {
                const loading = createElement('div', 'llm-loading');
                loading.innerHTML = `<span>PROCESSING</span> <span class="animate-spin">.</span>`;
                msgList.appendChild(loading);
            }
        }
        area.appendChild(msgList);
        // Auto scroll
        setTimeout(() => msgList.scrollTop = msgList.scrollHeight, 0);

        // Input
        const inputRow = createElement('div', 'llm-input-row no-drag');

        const trashBtn = createElement('button', 'llm-action-btn llm-btn-trash', ICONS.trash);
        trashBtn.onclick = () => { state.messages = []; render(); };

        const input = createElement('input', 'llm-input');
        input.placeholder = "Enter command...";
        input.value = state.input;
        input.oninput = (e) => { state.input = e.target.value; }; // Bind
        input.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) handleSend();
        };

        const sendBtn = createElement('button', 'llm-action-btn llm-btn-send', ICONS.send);
        sendBtn.disabled = state.isLoading;
        sendBtn.onclick = handleSend;

        inputRow.appendChild(trashBtn);
        inputRow.appendChild(input);
        inputRow.appendChild(sendBtn);
        area.appendChild(inputRow);

        parent.appendChild(area);

        // Focus input if not loading
        if (!state.isLoading) setTimeout(() => input.focus(), 50);
    }

    // --- Actions ---

    async function handleSend() {
        const prompt = state.input.trim();
        if (!prompt) return;

        state.messages.push({ role: 'user', content: prompt });
        state.input = '';
        state.isLoading = true;
        render();

        try {
            const res = await callLLM(prompt);
            state.messages.push({ role: 'assistant', content: res });
        } catch (e) {
            state.messages.push({ role: 'system', content: `Error: ${e.message}` });
        } finally {
            state.isLoading = false;
            render();
        }
    }

    function handleMouseMove(e) {
        if (!isDragging) return;
        const newX = e.clientX - dragOffset.x;
        const newY = e.clientY - dragOffset.y;

        state.position = {
            x: Math.min(Math.max(0, newX), Math.max(0, window.innerWidth - 80)),
            y: Math.min(Math.max(0, newY), Math.max(0, window.innerHeight - 80))
        };

        // Direct DOM update for performance
        if (container) {
            container.style.left = `${state.position.x}px`;
            container.style.top = `${state.position.y}px`;
        }
    }

    function handleMouseUp() {
        if (isDragging) {
            isDragging = false;
            saveState(); // Save position on drop
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        }
    }

    // --- Initialization ---

    function init() {
        // Remove any stale UI from previous injections, then keep logic APIs active.
        const existingRoot = document.getElementById('llm-sidecar-root');
        if (existingRoot) existingRoot.remove();
        container = null;
        loadState();

        if (!NEURAL_LINK_UI_ENABLED) {
            state.isOpen = false;
            console.log("[LLMSidecar] Neural Link UI disabled. Analysis APIs remain active.");
            return;
        }

        // Create root container
        container = createElement('div', 'llm-sidecar-container');
        container.id = 'llm-sidecar-root';
        document.body.appendChild(container);
        render();
        console.log("[LLMSidecar] Neural Link Active.");
    }

    // Expose API globally
    window.LLMSidecar = {
        init,
        callLLM,
        embed,
        analyzeMistake,
        reclassifyMistakes,
        isAnalysisEnabled
    };

})();
