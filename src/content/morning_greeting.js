/**
 * Morning Greeting Component
 * 
 * Displays a personalized greeting banner on LeetCode with skill summary.
 */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.MorningGreeting = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const WEAK_THRESHOLD = 0.5;
    const STRONG_THRESHOLD = 0.7;

    function getI18n() {
        if (typeof EasyRepeatI18n !== 'undefined') return EasyRepeatI18n;
        if (typeof window !== 'undefined' && window.EasyRepeatI18n) return window.EasyRepeatI18n;
        return null;
    }

    function translate(key, values = {}, language = 'en') {
        const i18n = getI18n();
        return i18n ? i18n.t(key, values, language) : key;
    }

    /**
     * Create a time-based greeting message.
     */
    function createGreetingMessage(options) {
        const { hour, totalSkills, weakSkills, topWeakSkill, language = 'en' } = options;

        // Time-based greeting
        let greeting;
        if (hour < 12) {
            greeting = translate('greeting_morning', {}, language);
        } else if (hour < 17) {
            greeting = translate('greeting_afternoon', {}, language);
        } else {
            greeting = translate('greeting_evening', {}, language);
        }

        // Skill message
        let skillMessage;
        if (weakSkills === 0) {
            skillMessage = translate('greeting_all_strong', {}, language);
        } else if (weakSkills === 1) {
            skillMessage = translate('greeting_one_skill', {
                skill: topWeakSkill ? ` (${formatSkillName(topWeakSkill)})` : ''
            }, language);
        } else {
            skillMessage = translate('greeting_many_skills', { count: weakSkills }, language);
        }

        return `${greeting}! ${skillMessage}`;
    }

    /**
     * Format skill ID to readable name.
     */
    function formatSkillName(skillId) {
        return skillId
            .replace(/_/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
    }

    /**
     * Render the greeting banner HTML element.
     */
    function renderBanner(options) {
        const { message, pendingDrills, language = 'en' } = options;

        const banner = document.createElement('div');
        banner.className = 'morning-greeting neural-agent-ui';
        banner.dataset.pendingDrills = String(pendingDrills || 0);
        banner.dataset.message = message;
        banner.dataset.language = language;

        banner.innerHTML = `
            <div class="greeting-content">
                <div class="greeting-icon">🧠</div>
                <div class="greeting-text">
                    <p class="greeting-message">${message}</p>
                    ${pendingDrills > 0 ? `
                        <span class="drill-badge">${pendingDrills === 1
                            ? translate('greeting_drills_ready_one', { count: pendingDrills }, language)
                            : translate('greeting_drills_ready_many', { count: pendingDrills }, language)}</span>
                    ` : ''}
                </div>
                <button class="dismiss-btn" title="${translate('greeting_dismiss', {}, language)}">×</button>
            </div>
        `;

        // Attach dismiss handler
        const dismissBtn = banner.querySelector('.dismiss-btn');
        if (dismissBtn) {
            dismissBtn.addEventListener('click', () => {
                banner.classList.add('dismissing');
                setTimeout(() => {
                    if (typeof banner._cleanupI18n === 'function') {
                        banner._cleanupI18n();
                    }
                    banner.remove();
                }, 300);
                markAsShown();
            });
        }

        return banner;
    }

    /**
     * Inject banner into the page before target selector.
     */
    function injectIntoPage(banner, targetSelector) {
        // Don't inject if already exists
        if (document.querySelector('.morning-greeting')) {
            return false;
        }

        const target = document.querySelector(targetSelector);
        if (target && target.parentNode) {
            target.parentNode.insertBefore(banner, target);
            return true;
        }

        // Fallback: prepend to body
        document.body.prepend(banner);
        return true;
    }

    /**
     * Get skill summary from skill matrix.
     */
    function getSkillSummary(matrix) {
        const skills = matrix?.dna?.skills || {};
        const entries = Object.entries(skills);

        const weak = entries.filter(([, s]) => s.confidence < WEAK_THRESHOLD);
        const strong = entries.filter(([, s]) => s.confidence >= STRONG_THRESHOLD);

        // Find weakest skill
        let topWeakSkill = null;
        let minConfidence = 1;
        for (const [id, skill] of weak) {
            if (skill.confidence < minConfidence) {
                minConfidence = skill.confidence;
                topWeakSkill = id;
            }
        }

        return {
            totalSkills: entries.length,
            weakSkills: weak.length,
            strongSkills: strong.length,
            topWeakSkill
        };
    }

    /**
     * Check if we should show the greeting (once per day).
     */
    function shouldShowGreeting(state) {
        const today = new Date().toDateString();
        return state.lastShown !== today;
    }

    /**
     * Mark greeting as shown today.
     */
    function markAsShown() {
        const today = new Date().toDateString();
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.set({ greetingLastShown: today });
        }
    }

    /**
     * Main entry point: show morning greeting if appropriate.
     */
    async function show(options = {}) {
        const targetSelector = options.targetSelector || '.problem-content, #qd-content, main';
        const i18n = getI18n();
        const language = i18n && typeof i18n.getLanguage === 'function'
            ? await i18n.getLanguage()
            : 'en';

        // Check if already shown today
        let state = { lastShown: null };
        if (typeof chrome !== 'undefined' && chrome.storage) {
            const result = await chrome.storage.local.get('greetingLastShown');
            state.lastShown = result.greetingLastShown;
        }

        if (!shouldShowGreeting(state)) {
            return null;
        }

        // Get skill summary (would need actual SkillMatrix in production)
        const summary = options.summary || {
            totalSkills: 0,
            weakSkills: 0,
            topWeakSkill: null
        };

        const message = createGreetingMessage({
            hour: new Date().getHours(),
            language,
            ...summary
        });

        const banner = renderBanner({
            message,
            pendingDrills: options.pendingDrills || 0,
            language
        });

        if (i18n && typeof i18n.onLanguageChange === 'function') {
            const unsubscribe = i18n.onLanguageChange((nextLanguage) => {
                const nextMessage = createGreetingMessage({
                    hour: new Date().getHours(),
                    language: nextLanguage,
                    ...summary
                });
                banner.dataset.message = nextMessage;
                banner.dataset.language = nextLanguage;

                const messageEl = banner.querySelector('.greeting-message');
                if (messageEl) messageEl.textContent = nextMessage;

                const badgeEl = banner.querySelector('.drill-badge');
                const pending = Number(options.pendingDrills || 0);
                if (badgeEl) {
                    badgeEl.textContent = pending === 1
                        ? translate('greeting_drills_ready_one', { count: pending }, nextLanguage)
                        : translate('greeting_drills_ready_many', { count: pending }, nextLanguage);
                }

                const dismissBtn = banner.querySelector('.dismiss-btn');
                if (dismissBtn) dismissBtn.title = translate('greeting_dismiss', {}, nextLanguage);
            });
            banner._cleanupI18n = unsubscribe;
        }

        injectIntoPage(banner, targetSelector);
        markAsShown();

        return banner;
    }

    // CSS styles for the greeting
    const styles = `
        .morning-greeting {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            margin: 10px;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
            animation: slideDown 0.3s ease-out;
        }
        
        .morning-greeting.dismissing {
            animation: slideUp 0.3s ease-out forwards;
        }
        
        .greeting-content {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        
        .greeting-icon {
            font-size: 24px;
        }
        
        .greeting-text {
            flex: 1;
        }
        
        .greeting-message {
            margin: 0;
            font-size: 14px;
        }
        
        .drill-badge {
            display: inline-block;
            background: rgba(255,255,255,0.2);
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
            margin-top: 4px;
        }
        
        .dismiss-btn {
            background: transparent;
            border: none;
            color: white;
            font-size: 20px;
            cursor: pointer;
            opacity: 0.7;
            transition: opacity 0.2s;
        }
        
        .dismiss-btn:hover {
            opacity: 1;
        }
        
        @keyframes slideDown {
            from { transform: translateY(-20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
        
        @keyframes slideUp {
            from { transform: translateY(0); opacity: 1; }
            to { transform: translateY(-20px); opacity: 0; }
        }
    `;

    return {
        createGreetingMessage,
        renderBanner,
        injectIntoPage,
        getSkillSummary,
        shouldShowGreeting,
        markAsShown,
        show,
        styles,
        formatSkillName
    };
}));
