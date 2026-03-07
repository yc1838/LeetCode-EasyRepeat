/**
 * Local LLM Client
 *
 * Routes prompts to a locally running model server (Ollama by default).
 * Includes OpenAI-compatible fallback for LM Studio-style endpoints.
 */

(function (root, factory) {
    console.log('[LocalClient] UMD wrapper executing');

    const exports = factory();

    if (typeof self !== 'undefined') {
        self.LocalClient = exports;
        console.log('[LocalClient] Attached to self.LocalClient');
    }

    if (typeof module === 'object' && module.exports) {
        module.exports = exports;
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const DEFAULT_ENDPOINT = 'http://127.0.0.1:11434';
    const DEFAULT_MODEL = 'llama3.1';

    function normalizeEndpoint(endpoint) {
        const raw = typeof endpoint === 'string' ? endpoint.trim() : '';
        const base = raw || DEFAULT_ENDPOINT;
        return base.replace(/\/+$/, '');
    }

    function normalizeLocalModelId(modelId) {
        const selected = typeof modelId === 'string' ? modelId.trim() : '';
        if (!selected) return DEFAULT_MODEL;

        const lower = selected.toLowerCase();
        if (lower.startsWith('gemini-') || lower.startsWith('gpt-') || lower.startsWith('claude-')) {
            return DEFAULT_MODEL;
        }
        if (lower === 'llama3') return 'llama3.1';

        return selected;
    }

    async function getEndpoint() {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            const result = await chrome.storage.local.get(['localEndpoint']);
            return normalizeEndpoint(result.localEndpoint);
        }
        return DEFAULT_ENDPOINT;
    }

    async function getModelId() {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            const result = await chrome.storage.local.get(['selectedModelId']);
            return normalizeLocalModelId(result.selectedModelId);
        }
        return DEFAULT_MODEL;
    }

    async function getApiKey() {
        return 'local';
    }

    function extractJSON(text) {
        if (!text) return null;

        let jsonString = text.trim();
        const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) {
            jsonString = codeBlockMatch[1].trim();
        }

        const firstBrace = jsonString.indexOf('{');
        const lastBrace = jsonString.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            jsonString = jsonString.substring(firstBrace, lastBrace + 1);
        }

        try {
            return JSON.parse(jsonString);
        } catch (e) {
            return null;
        }
    }

    async function callOllama(prompt, modelId, endpoint) {
        const url = endpoint.endsWith('/api/chat') ? endpoint : `${endpoint}/api/chat`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: modelId,
                messages: [{ role: 'user', content: prompt }],
                stream: false
            })
        });

        if (!response.ok) {
            return {
                error: `HTTP ${response.status}: ${response.statusText}`,
                status: response.status
            };
        }

        const data = await response.json();
        const text = data?.message?.content || '';
        if (!text) {
            return { error: 'Empty response from local model' };
        }

        return { text };
    }

    async function callOpenAICompatible(prompt, modelId, endpoint) {
        const url = endpoint.endsWith('/v1/chat/completions')
            ? endpoint
            : `${endpoint}/v1/chat/completions`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: modelId,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.2
            })
        });

        if (!response.ok) {
            return {
                error: `HTTP ${response.status}: ${response.statusText}`,
                status: response.status
            };
        }

        const data = await response.json();
        const text = data?.choices?.[0]?.message?.content || '';
        if (!text) {
            return { error: 'Empty response from local OpenAI-compatible server' };
        }

        return { text };
    }

    async function runLocalPrompt(prompt) {
        const endpoint = await getEndpoint();
        const modelId = await getModelId();

        let result = await callOllama(prompt, modelId, endpoint);

        // Fallback to OpenAI-compatible route for LM Studio-style servers.
        // Some local gateways return 401/403/405 instead of 404 for unknown routes.
        if (result.error && [401, 403, 404, 405].includes(result.status)) {
            result = await callOpenAICompatible(prompt, modelId, endpoint);
        }

        return result;
    }

    async function generateContent(prompt, options = {}) {
        return analyzeSubmissions(prompt, options);
    }

    async function analyzeSubmissions(prompt, options = {}) {
        try {
            const result = await runLocalPrompt(prompt);
            if (result.error) {
                return { error: result.error };
            }

            const parsed = extractJSON(result.text);
            if (parsed) {
                return parsed;
            }

            return { text: result.text };
        } catch (e) {
            return { error: e.message || 'Local request failed' };
        }
    }

    return {
        analyzeSubmissions,
        generateContent,
        getApiKey,
        getEndpoint,
        getModelId
    };
}));
