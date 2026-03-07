/**
 * Agent Content Initializer
 * 
 * Initializes the Neural Agent UI on LeetCode pages.
 */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.AgentContentInit = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    // UI selectors
    const AGENT_UI_SELECTORS = [
        '.morning-greeting',
        '.skill-graph',
        '.drill-queue',
        '.neural-agent-ui'
    ];

    /**
     * Check if we should initialize on this page.
     */
    function shouldInitialize(url) {
        const problemPagePattern = /leetcode\.com\/problems\/.+/;
        return problemPagePattern.test(url);
    }

    /**
     * Check if agent is enabled in settings.
     */
    async function isAgentEnabled() {
        const result = await chrome.storage.local.get('agentEnabled');
        return result.agentEnabled || false;
    }

    /**
     * Inject combined CSS styles.
     */
    function injectStyles() {
        if (document.querySelector('style[data-agent-styles]')) {
            return;
        }

        const style = document.createElement('style');
        style.setAttribute('data-agent-styles', 'true');

        // Combine all component styles
        let css = '';

        if (typeof MorningGreeting !== 'undefined' && MorningGreeting.styles) {
            css += MorningGreeting.styles;
        }
        if (typeof SkillGraph !== 'undefined' && SkillGraph.styles) {
            css += SkillGraph.styles;
        }
        if (typeof DrillQueue !== 'undefined' && DrillQueue.styles) {
            css += DrillQueue.styles;
        }
        if (typeof SkillAnimations !== 'undefined' && SkillAnimations.getCSS) {
            css += SkillAnimations.getCSS();
        }

        style.textContent = css;
        document.head.appendChild(style);
    }

    /**
     * Initialize morning greeting.
     */
    async function initializeMorningGreeting(skillSummary) {
        const enabled = await isAgentEnabled();
        if (!enabled) return null;

        // Check if already shown today
        const result = await chrome.storage.local.get('greetingLastShown');
        const today = new Date().toDateString();
        if (result.greetingLastShown === today) return null;

        // Create greeting
        if (typeof MorningGreeting !== 'undefined') {
            const message = MorningGreeting.createGreetingMessage({
                hour: new Date().getHours(),
                ...skillSummary
            });

            const banner = MorningGreeting.renderBanner({
                message,
                pendingDrills: skillSummary.pendingDrills || 0
            });

            MorningGreeting.injectIntoPage(banner, '.problem-content, #qd-content, main');

            // Mark as shown
            await chrome.storage.local.set({ greetingLastShown: today });

            return banner;
        }

        return null;
    }

    /**
     * Remove all agent UI elements.
     */
    function cleanup() {
        AGENT_UI_SELECTORS.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => el.remove());
        });
    }

    /**
     * Main initialization entry point.
     */
    async function initialize() {
        if (!shouldInitialize(window.location.href)) {
            return { initialized: false, reason: 'not-problem-page' };
        }

        const enabled = await isAgentEnabled();
        if (!enabled) {
            return { initialized: false, reason: 'agent-disabled' };
        }

        console.log('[AgentContentInit] Initializing Neural Agent UI...');

        // Inject styles
        injectStyles();

        // Get skill data (would fetch from background)
        // For now, use placeholder
        const skillSummary = {
            totalSkills: 0,
            weakSkills: 0,
            pendingDrills: 0
        };

        // Initialize greeting
        await initializeMorningGreeting(skillSummary);

        console.log('[AgentContentInit] Neural Agent UI initialized.');
        return { initialized: true };
    }

    return {
        shouldInitialize,
        isAgentEnabled,
        injectStyles,
        initializeMorningGreeting,
        cleanup,
        initialize
    };
}));
