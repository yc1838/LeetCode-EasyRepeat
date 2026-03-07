/**
 * Agent Loader
 *
 * Loads and initializes all Neural Agent modules.
 * Manages feature flags and agent enable/disable state.
 */

(function (root, factory) {
    var exported = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = exported;
    } else {
        root.AgentLoader = exported;
    }
    // Also set on window for bundled contexts
    if (typeof window !== 'undefined') {
        window.AgentLoader = exported;
    }
}(typeof self !== 'undefined' ? self : this, function () {

    // All available agent modules
    const AGENT_MODULES = [
        'SkillMatrix',
        'InsightsStore',
        'DrillStore',
        'DigestScheduler',
        'DigestOrchestrator',
        'DrillGenerator',
        'DrillVerifier',
        'DrillTracker',
        'InsightCompressor',
        'RetentionPolicy',
        'InsightDeduplicator'
    ];

    // Default feature flags
    const DEFAULT_FEATURES = {
        drillGenerator: true,
        morningGreeting: true,
        nightlyDigest: true,
        skillGraph: true,
        insightCompression: true
    };

    // Module initialization status
    let moduleStatus = {};
    let isInitialized = false;

    /**
     * Get current agent status.
     */
    async function getAgentStatus() {
        const result = await chrome.storage.local.get('agentEnabled');
        return {
            enabled: result.agentEnabled || false,
            initialized: isInitialized
        };
    }

    /**
     * Set agent enabled/disabled.
     */
    async function setAgentEnabled(enabled) {
        await chrome.storage.local.set({ agentEnabled: enabled });

        if (enabled && !isInitialized) {
            await initializeModules();
        }
    }

    /**
     * Get feature flags.
     */
    async function getFeatureFlags() {
        const result = await chrome.storage.local.get(['agentEnabled', 'features']);

        if (!result.agentEnabled) {
            return Object.fromEntries(
                Object.keys(DEFAULT_FEATURES).map(k => [k, false])
            );
        }

        return {
            ...DEFAULT_FEATURES,
            ...(result.features || {})
        };
    }

    /**
     * Set a feature flag.
     */
    async function setFeatureFlag(feature, enabled) {
        const result = await chrome.storage.local.get('features');
        const features = result.features || {};
        features[feature] = enabled;
        await chrome.storage.local.set({ features });
    }

    /**
     * Get list of available modules.
     */
    function getAvailableModules() {
        return [...AGENT_MODULES];
    }

    /**
     * Get module initialization status.
     */
    function getModuleStatus() {
        return { ...moduleStatus };
    }

    /**
     * Initialize all agent modules.
     */
    async function initializeModules() {
        const status = await getAgentStatus();

        if (!status.enabled) {
            return { initialized: false, modules: [] };
        }

        console.log('[AgentLoader] Initializing Neural Agent modules...');

        const initializedModules = [];

        try {
            // Initialize stores first
            moduleStatus.SkillMatrix = await initModule('SkillMatrix');
            initializedModules.push('SkillMatrix');

            moduleStatus.InsightsStore = await initModule('InsightsStore');
            initializedModules.push('InsightsStore');

            moduleStatus.DrillStore = await initModule('DrillStore');
            initializedModules.push('DrillStore');

            // Initialize processors
            moduleStatus.InsightCompressor = await initModule('InsightCompressor');
            initializedModules.push('InsightCompressor');

            moduleStatus.DrillGenerator = await initModule('DrillGenerator');
            initializedModules.push('DrillGenerator');

            // Initialize scheduler
            moduleStatus.DigestScheduler = await initModule('DigestScheduler');
            initializedModules.push('DigestScheduler');

            isInitialized = true;
            console.log('[AgentLoader] All modules initialized:', initializedModules);

        } catch (e) {
            console.error('[AgentLoader] Initialization error:', e);
        }

        return { initialized: isInitialized, modules: initializedModules };
    }

    /**
     * Initialize a single module.
     */
    async function initModule(name) {
        try {
            // In browser, modules are loaded via script tags
            // This is a placeholder for actual initialization
            return { name, status: 'ready', initializedAt: new Date().toISOString() };
        } catch (e) {
            console.error(`[AgentLoader] Failed to init ${name}:`, e);
            return { name, status: 'error', error: e.message };
        }
    }

    /**
     * Shutdown all modules.
     */
    async function shutdown() {
        console.log('[AgentLoader] Shutting down Neural Agent...');
        moduleStatus = {};
        isInitialized = false;
    }

    return {
        getAgentStatus,
        setAgentEnabled,
        getFeatureFlags,
        setFeatureFlag,
        getAvailableModules,
        getModuleStatus,
        initializeModules,
        shutdown,
        AGENT_MODULES,
        DEFAULT_FEATURES
    };
}));
