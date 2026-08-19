/** DeepSeek API client using its OpenAI-compatible chat endpoint. */
(function (root, factory) {
    const exports = factory();
    if (typeof self !== 'undefined') self.DeepSeekClient = exports;
    if (typeof module === 'object' && module.exports) module.exports = exports;
}(typeof self !== 'undefined' ? self : this, function () {
    const API_URL = 'https://api.deepseek.com/chat/completions';
    const DEFAULT_MODEL = 'deepseek-chat';

    async function getApiKey() {
        if (typeof chrome === 'undefined' || !chrome.storage) return null;
        const result = await chrome.storage.local.get(['keys']);
        return result.keys?.deepseek || null;
    }

    async function getModelId() {
        if (typeof chrome === 'undefined' || !chrome.storage) return DEFAULT_MODEL;
        const result = await chrome.storage.local.get(['selectedModelId', 'cloudProvider']);
        return result.cloudProvider === 'deepseek' && String(result.selectedModelId || '').trim()
            ? result.selectedModelId.trim() : DEFAULT_MODEL;
    }

    function extractJSON(text) {
        if (!text) return null;
        let value = text.trim();
        const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenced) value = fenced[1].trim();
        const start = value.indexOf('{');
        const end = value.lastIndexOf('}');
        if (start !== -1 && end > start) value = value.slice(start, end + 1);
        try { return JSON.parse(value); } catch (_) { return null; }
    }

    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    async function analyzeSubmissions(prompt, options = {}) {
        const apiKey = await getApiKey();
        const model = await getModelId();
        if (!apiKey) return { error: 'No DeepSeek API key configured' };

        const body = {
            model,
            messages: [
                { role: 'system', content: 'You are a helpful coding assistant. Output JSON when requested.' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.2,
            stream: false
        };
        if (prompt.toLowerCase().includes('json')) body.response_format = { type: 'json_object' };

        let lastError = 'Unknown error';
        const maxRetries = options.maxRetries || 3;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const response = await fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                    body: JSON.stringify(body)
                });
                if (!response.ok) {
                    const detail = await response.text();
                    lastError = `HTTP ${response.status}: ${detail || response.statusText}`;
                    if (response.status >= 500 && attempt + 1 < maxRetries) {
                        await sleep(1000 * Math.pow(2, attempt));
                        continue;
                    }
                    return { error: lastError };
                }
                const data = await response.json();
                const content = data.choices?.[0]?.message?.content;
                if (!content) return { error: 'Empty response from DeepSeek' };
                return extractJSON(content) || { text: content };
            } catch (error) {
                lastError = error.message;
                if (attempt + 1 < maxRetries) await sleep(1000 * Math.pow(2, attempt));
            }
        }
        return { error: lastError };
    }

    return { analyzeSubmissions, generateContent: analyzeSubmissions, getApiKey };
}));
