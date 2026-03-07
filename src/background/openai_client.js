/**
 * OpenAI API Client
 * 
 * Handles communication with OpenAI API for skill analysis and code generation.
 * Compatible interface with GeminiClient.
 */

(function (root, factory) {
    console.log('[OpenAIClient] UMD wrapper executing');

    const exports = factory();

    // Always attach to self in browser contexts (including ES modules)
    if (typeof self !== 'undefined') {
        self.OpenAIClient = exports;
        console.log('[OpenAIClient] Attached to self.OpenAIClient');
    }

    // Also support CommonJS for tests
    if (typeof module === 'object' && module.exports) {
        module.exports = exports;
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const OPENAI_API_BASE = 'https://api.openai.com/v1/chat/completions';
    const DEFAULT_MODEL = 'gpt-4o';
    const DEFAULT_MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 1000;

    /**
     * Get API key from chrome storage.
     */
    async function getApiKey() {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            const result = await chrome.storage.local.get(['keys']);
            return result.keys?.openai || null;
        }
        return null;
    }

    /**
     * Get the selected model ID.
     */
    async function getModelId() {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            const result = await chrome.storage.local.get(['selectedModelId']);
            const selected = result.selectedModelId;
            // Validate it's an OpenAI model (starts with gpt-)
            if (selected && selected.startsWith('gpt-')) {
                return selected;
            }
        }
        return DEFAULT_MODEL;
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Extract JSON from text (handles markdown code blocks).
     */
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

    /**
     * Generate content (chat completion).
     * @param {string} prompt 
     * @param {object} options 
     */
    async function generateContent(prompt, options = {}) {
        return analyzeSubmissions(prompt, options);
    }

    /**
     * Analyze submissions (or generic generation).
     * Compatible with GeminiClient.analyzeSubmissions signature.
     */
    async function analyzeSubmissions(prompt, options = {}) {
        const maxRetries = options.maxRetries || DEFAULT_MAX_RETRIES;
        const apiKey = await getApiKey();
        const modelId = await getModelId();

        if (!apiKey) {
            return { error: 'No OpenAI API key configured' };
        }

        const requestBody = {
            model: modelId,
            messages: [
                { role: 'system', content: 'You are a helpful coding assistant. Output JSON when requested.' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.2,
            response_format: { type: "json_object" } // Force JSON mode for better reliability
        };

        // Note: response_format: { type: "json_object" } requires "json" in prompt.
        // If prompt doesn't strictly say "JSON", this might fail on 4o.
        // But our prompts usually say "Respond with JSON ONLY".
        // Let's safe check: if prompt doesn't contain "JSON", maybe don't force it?
        // Actually, for analysis/drills we always want JSON. For code gen, maybe not?
        // CodeGenAgent uses ```python blocks.
        if (!prompt.toLowerCase().includes('json')) {
            delete requestBody.response_format;
        }

        let lastError = null;
        let attempts = 0;

        while (attempts < maxRetries) {
            attempts++;

            try {
                const response = await fetch(OPENAI_API_BASE, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify(requestBody)
                });

                if (!response.ok) {
                    const errorBody = await response.text();
                    lastError = `HTTP ${response.status}: ${response.statusText}`;
                    console.warn('[OpenAIClient] API Error:', errorBody);

                    if (response.status >= 500) {
                        await sleep(RETRY_DELAY_MS * Math.pow(2, attempts - 1));
                        continue;
                    }
                    return { error: lastError };
                }

                const data = await response.json();
                const content = data.choices?.[0]?.message?.content;

                if (!content) {
                    return { error: 'Empty response from OpenAI' };
                }

                // If caller expects JSON (based on our usage patterns like drill gen),
                // we should try to parse it.
                // However, `generateContent` for CodeGeneratorAgent might expect raw text or object wrapper.
                // GeminiClient returns parsed JSON for analysis, but CodeGeneratorAgent handles raw text too?
                // Checking GeminiClient: it ALWAYS tries to extractJSON.
                // So we should do the same to maintain compatibility.

                const parsed = extractJSON(content);
                if (parsed) {
                    return parsed;
                }

                // If not JSON, return as text wrapped in object (GeminiClient style mostly returns parsed or error)
                // But CodeGeneratorAgent expects `response.text` or similar if structure differs?
                // GeminiClient returns the parsed object directly.
                // If it can't parse JSON, it returns { error: ... } in GeminiClient?
                // Let's look at GeminiClient again.
                // Logic: extractJSON -> if fail return error. 
                // Wait, CodeGeneratorAgent uses `GeminiClient.generateContent`.
                // In `CodeGeneratorAgent.js`: `this._extractPythonCode(response)`
                // It checks `response.candidates[0].content...` OR `response.text`.
                // If we return a simple object { text: content }, generic agent might handle it.

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
