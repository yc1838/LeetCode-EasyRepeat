/**
 * Anthropic API Client
 *
 * Handles communication with Anthropic API for analysis and generation.
 * Exposes the same interface as GeminiClient/OpenAIClient.
 */

(function (root, factory) {
    console.log('[AnthropicClient] UMD wrapper executing');

    const exports = factory();

    if (typeof self !== 'undefined') {
        self.AnthropicClient = exports;
        console.log('[AnthropicClient] Attached to self.AnthropicClient');
    }

    if (typeof module === 'object' && module.exports) {
        module.exports = exports;
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const ANTHROPIC_API_BASE = 'https://api.anthropic.com/v1/messages';
    const DEFAULT_MODEL = 'claude-3-5-sonnet-20240620';
    const DEFAULT_MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 1000;

    async function getApiKey() {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            const result = await chrome.storage.local.get(['keys']);
            return result.keys?.anthropic || null;
        }
        return null;
    }

    async function getModelId() {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            const result = await chrome.storage.local.get(['selectedModelId']);
            const selected = result.selectedModelId;
            if (selected && selected.startsWith('claude-')) {
                return selected;
            }
        }
        return DEFAULT_MODEL;
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
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

    async function generateContent(prompt, options = {}) {
        return analyzeSubmissions(prompt, options);
    }

    async function analyzeSubmissions(prompt, options = {}) {
        const maxRetries = options.maxRetries || DEFAULT_MAX_RETRIES;
        const apiKey = await getApiKey();
        const modelId = await getModelId();

        if (!apiKey) {
            return { error: 'No Anthropic API key configured' };
        }

        const requestBody = {
            model: modelId,
            max_tokens: options.max_tokens || 2048,
            messages: [
                { role: 'user', content: prompt }
            ]
        };

        if (typeof options.system === 'string' && options.system.trim()) {
            requestBody.system = options.system;
        }

        let attempts = 0;
        let lastError = null;

        while (attempts < maxRetries) {
            attempts++;
            try {
                const response = await fetch(ANTHROPIC_API_BASE, {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01'
                    },
                    body: JSON.stringify(requestBody)
                });

                if (!response.ok) {
                    let body = '';
                    try {
                        body = await response.text();
                    } catch (e) {
                        body = '';
                    }
                    lastError = `HTTP ${response.status}: ${response.statusText}`;
                    console.warn('[AnthropicClient] API Error:', body || lastError);

                    if (response.status >= 500 || response.status === 429) {
                        if (attempts < maxRetries) {
                            await sleep(RETRY_DELAY_MS * Math.pow(2, attempts - 1));
                            continue;
                        }
                    }

                    return { error: lastError };
                }

                const data = await response.json();
                const content = data.content?.[0]?.text;
                if (!content) {
                    return { error: 'Empty response from Anthropic' };
                }

                const parsed = extractJSON(content);
                if (parsed) {
                    return parsed;
                }

                return { text: content };
            } catch (e) {
                lastError = e.message;
                if (attempts < maxRetries) {
                    await sleep(RETRY_DELAY_MS * Math.pow(2, attempts - 1));
                    continue;
                }
            }
        }

        return { error: lastError || 'Unknown error' };
    }

    return {
        analyzeSubmissions,
        generateContent,
        getApiKey
    };
}));
