/** Client for OpenAI-compatible providers such as DashScope and custom gateways. */
(function (root, factory) {
    const exports = factory();
    if (typeof self !== 'undefined') self.OpenAICompatibleClient = exports;
    if (typeof module === 'object' && module.exports) module.exports = exports;
}(typeof self !== 'undefined' ? self : this, function () {
    const DEFAULT_BASE_URLS = {
        qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    };

    function normalizeBaseUrl(value) {
        return String(value || '').trim().replace(/\/+$/, '');
    }

    async function getSettings() {
        if (typeof chrome === 'undefined' || !chrome.storage) return {};
        return chrome.storage.local.get(['cloudProvider', 'keys', 'selectedModelId', 'providerBaseUrls']);
    }

    async function getApiKey() {
        const settings = await getSettings();
        return settings.keys?.[settings.cloudProvider] || null;
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

    async function analyzeSubmissions(prompt) {
        const settings = await getSettings();
        const provider = settings.cloudProvider;
        const apiKey = settings.keys?.[provider];
        const model = settings.selectedModelId;
        const baseUrl = normalizeBaseUrl(settings.providerBaseUrls?.[provider] || DEFAULT_BASE_URLS[provider]);
        if (!apiKey) return { error: `No API key configured for ${provider || 'compatible provider'}` };
        if (!model) return { error: 'No model selected' };
        if (!baseUrl) return { error: 'No compatible API Base URL configured' };

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

        try {
            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify(body)
            });
            const data = await response.json();
            if (!response.ok || data.error) {
                return { error: data.error?.message || `HTTP ${response.status}` };
            }
            const content = data.choices?.[0]?.message?.content;
            if (!content) return { error: 'Compatible provider returned an empty response' };
            return extractJSON(content) || { text: content };
        } catch (error) {
            return { error: error.message };
        }
    }

    return { analyzeSubmissions, generateContent: analyzeSubmissions, getApiKey };
}));
