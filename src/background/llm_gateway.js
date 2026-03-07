/**
 * LLM Gateway
 *
 * Routes requests to the appropriate AI provider (Gemini, OpenAI, Local, etc.)
 * based on user settings.
 */

// ============================================================================
// ⚠️ CRITICAL: DO NOT MODIFY THIS UMD WRAPPER - SAME AS SkillMatrix ⚠️
// ============================================================================
// See skill_matrix.js for detailed explanation. This MUST follow the same
// pattern to work with Vite bundling. DO NOT CHANGE.
// ============================================================================
(function (root, factory) {
    console.log('[LLMGateway] UMD wrapper executing');

    const exports = factory();

    // Always attach to self in browser contexts (including ES modules)
    if (typeof self !== 'undefined') {
        self.LLMGateway = exports;
        console.log('[LLMGateway] Attached to self.LLMGateway');
    }

    // Also support CommonJS for tests
    if (typeof module === 'object' && module.exports) {
        module.exports = exports;
    }
}(typeof self !== 'undefined' ? self : this, function () {

    let GeminiClient, OpenAIClient, AnthropicClient, LocalClient;
    const globalRoot = typeof self !== 'undefined' ? self : this;
    const KNOWN_LOCAL_MODELS = new Set([
        'llama3.1',
        'llama3',
        'mistral-nemo',
        'mistral',
        'deepseek-coder',
        'qwen2.5-coder',
        'codellama'
    ]);

    // Load dependencies from globals (Browser/Worker)
    if (globalRoot.GeminiClient) {
        GeminiClient = globalRoot.GeminiClient;
        console.log('[LLMGateway] GeminiClient loaded from global');
    } else {
        console.warn('[LLMGateway] GeminiClient not found on global');
    }

    if (globalRoot.OpenAIClient) {
        OpenAIClient = globalRoot.OpenAIClient;
        console.log('[LLMGateway] OpenAIClient loaded from global');
    } else {
        console.warn('[LLMGateway] OpenAIClient not found on global');
    }

    if (globalRoot.AnthropicClient) {
        AnthropicClient = globalRoot.AnthropicClient;
        console.log('[LLMGateway] AnthropicClient loaded from global');
    } else {
        console.warn('[LLMGateway] AnthropicClient not found on global');
    }

    if (globalRoot.LocalClient) {
        LocalClient = globalRoot.LocalClient;
        console.log('[LLMGateway] LocalClient loaded from global');
    } else {
        console.warn('[LLMGateway] LocalClient not found on global');
    }

    // Load dependencies via CommonJS for tests/node.
    if (typeof require === 'function') {
        if (!GeminiClient) {
            try { GeminiClient = require('./gemini_client'); } catch (e) { }
        }
        if (!OpenAIClient) {
            try { OpenAIClient = require('./openai_client'); } catch (e) { }
        }
        if (!AnthropicClient) {
            try { AnthropicClient = require('./anthropic_client'); } catch (e) { }
        }
        if (!LocalClient) {
            try { LocalClient = require('./local_client'); } catch (e) { }
        }
    }

    function inferProviderFromModelId(modelId) {
        const normalized = typeof modelId === 'string' ? modelId.trim().toLowerCase() : '';
        if (!normalized) return null;

        if (normalized.startsWith('gemini-')) return 'google';
        if (normalized.startsWith('gpt-') || normalized.startsWith('o1') || normalized.startsWith('o3')) return 'openai';
        if (normalized.startsWith('claude-')) return 'anthropic';
        if (KNOWN_LOCAL_MODELS.has(normalized)) return 'local';

        return null;
    }

    function getClientForProvider(provider) {
        if (provider === 'google') return GeminiClient;
        if (provider === 'openai') return OpenAIClient;
        if (provider === 'anthropic') return AnthropicClient;
        if (provider === 'local') return LocalClient;
        return null;
    }

    async function getSettings() {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            return chrome.storage.local.get(['aiProvider', 'selectedModelId', 'keys', 'geminiApiKey']);
        }
        return {};
    }

    function inferModeFromSettings(settings) {
        const explicitMode = settings?.aiProvider;
        if (explicitMode === 'local' || explicitMode === 'cloud') {
            return explicitMode;
        }

        const providerFromModel = inferProviderFromModelId(settings?.selectedModelId);
        if (providerFromModel === 'local') return 'local';
        if (providerFromModel) return 'cloud';

        const keys = settings?.keys || {};
        const hasCloudKey = Boolean(
            settings?.geminiApiKey ||
            keys.google ||
            keys.openai ||
            keys.anthropic
        );
        return hasCloudKey ? 'cloud' : 'local';
    }

    function resolveCloudProvider(settings) {
        const providerFromModel = inferProviderFromModelId(settings?.selectedModelId);
        if (providerFromModel && providerFromModel !== 'local') {
            return providerFromModel;
        }

        const keys = settings?.keys || {};
        if (keys.google || settings?.geminiApiKey) return 'google';
        if (keys.openai) return 'openai';
        if (keys.anthropic) return 'anthropic';

        return 'google';
    }

    async function resolveClient() {
        const settings = await getSettings();
        const mode = inferModeFromSettings(settings);

        if (mode === 'local') {
            return {
                mode,
                provider: 'local',
                client: getClientForProvider('local'),
                selectedModelId: settings?.selectedModelId || ''
            };
        }

        const provider = resolveCloudProvider(settings);
        return {
            mode,
            provider,
            client: getClientForProvider(provider),
            selectedModelId: settings?.selectedModelId || ''
        };
    }

    function providerLabel(provider) {
        if (provider === 'google') return 'Gemini';
        if (provider === 'openai') return 'OpenAI';
        if (provider === 'anthropic') return 'Anthropic';
        if (provider === 'local') return 'Local';
        return provider || 'Unknown';
    }

    /**
     * Unified generation method.
     */
    async function generateContent(prompt, options = {}) {
        const resolved = await resolveClient();
        if (!resolved.client) {
            return { error: `No client available for provider "${resolved.provider}" (mode: ${resolved.mode})` };
        }

        if (typeof resolved.client.generateContent !== 'function') {
            return { error: `${providerLabel(resolved.provider)} client does not support generateContent` };
        }

        console.log(`[LLMGateway] Routing generateContent to ${providerLabel(resolved.provider)} (model=${resolved.selectedModelId || 'default'})`);
        return resolved.client.generateContent(prompt, options);
    }

    /**
     * Unified analysis method.
     */
    async function analyzeSubmissions(prompt, options = {}) {
        const resolved = await resolveClient();
        if (!resolved.client) {
            return { error: `No client available for provider "${resolved.provider}" (mode: ${resolved.mode})` };
        }

        if (typeof resolved.client.analyzeSubmissions !== 'function') {
            return { error: `${providerLabel(resolved.provider)} client does not support analyzeSubmissions` };
        }

        console.log(`[LLMGateway] Routing analyzeSubmissions to ${providerLabel(resolved.provider)} (model=${resolved.selectedModelId || 'default'})`);
        return resolved.client.analyzeSubmissions(prompt, options);
    }

    /**
     * Check if an API key is configured for the currently selected provider.
     * Returns the API key if present, null otherwise.
     */
    async function getApiKey() {
        const resolved = await resolveClient();
        console.log('[LLMGateway] getApiKey - mode/provider:', resolved.mode, resolved.provider);

        if (resolved.provider === 'local') {
            // Local mode doesn't need an API key
            console.log('[LLMGateway] getApiKey - returning "local" for local mode');
            return 'local';
        }

        console.log('[LLMGateway] getApiKey - client:', resolved.client ? 'found' : 'null', {
            provider: resolved.provider,
            hasGetApiKey: resolved.client && typeof resolved.client.getApiKey === 'function'
        });

        if (resolved.client && typeof resolved.client.getApiKey === 'function') {
            const key = await resolved.client.getApiKey();
            console.log('[LLMGateway] getApiKey - retrieved key:', key ? `${key.substring(0, 10)}...` : 'null');
            return key;
        }

        console.warn('[LLMGateway] getApiKey - no suitable client found for provider:', resolved.provider);
        return null;
    }

    return {
        generateContent,
        analyzeSubmissions,
        getApiKey,
        inferProviderFromModelId
    };
}));
