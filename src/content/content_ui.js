/**
 * LeetCode EasyRepeat - Content UI Logic
 * 
 * Contains purely visual rendering functions for the content script (toasts, modals).
 * Separated from content.js to improve maintainability.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        // Node.js
        module.exports = factory();
    } else {
        // Browser
        const exported = factory();
        for (const key in exported) {
            root[key] = exported[key];
        }
    }
}(typeof self !== 'undefined' ? self : this, function () {

    // Helper to get theme safely
    function getTheme(themeName) {
        if (typeof TOAST_THEMES !== 'undefined') {
            return TOAST_THEMES[themeName] || TOAST_THEMES.sakura;
        }
        // Fallback if config.js not loaded for some reason
        return {
            terminal: '#FF10F0',
            electric: '#FF6B35',
            borderGlow: 'rgba(255, 16, 240, 0.4)',
            shadowMid: 'rgba(255, 16, 240, 0.2)',
            shadowInner: 'rgba(255, 16, 240, 0.05)',
            textShadow: 'rgba(255, 16, 240, 0.5)',
            electricShadow: 'rgba(255, 107, 53, 0.4)',
            electricBorderDash: 'rgba(255, 107, 53, 0.3)'
        };
    }

    /**
     * Resolve content theme for modals.
     * We currently support matrix and sakura in content overlays.
     */
    function resolveModalTheme(callback) {
        const fallback = 'matrix';
        if (!(typeof chrome !== 'undefined' && chrome.runtime?.id && chrome.storage && chrome.storage.local)) {
            callback(fallback);
            return;
        }

        chrome.storage.local.get({ theme: 'sakura' }, (result) => {
            if (chrome.runtime?.lastError) {
                callback(fallback);
                return;
            }
            callback(result.theme === 'sakura' ? 'sakura' : 'matrix');
        });
    }

    function applyNotesWidgetTheme(widget, themeName) {
        if (!widget) return;
        widget.classList.toggle('theme-sakura', themeName === 'sakura');
    }

    function getI18n() {
        if (typeof EasyRepeatI18n !== 'undefined') return EasyRepeatI18n;
        if (typeof window !== 'undefined' && window.EasyRepeatI18n) return window.EasyRepeatI18n;
        return null;
    }

    function getProblemTitles() {
        if (typeof EasyRepeatProblemTitles !== 'undefined') return EasyRepeatProblemTitles;
        if (typeof window !== 'undefined' && window.EasyRepeatProblemTitles) return window.EasyRepeatProblemTitles;
        return null;
    }

    async function getCurrentLanguage() {
        const i18n = getI18n();
        if (!i18n || typeof i18n.getLanguage !== 'function') return 'en';
        return await i18n.getLanguage();
    }

    function translate(key, values = {}, language = 'en') {
        const i18n = getI18n();
        return i18n ? i18n.t(key, values, language) : key;
    }

    function formatDate(dateValue, language = 'en') {
        const i18n = getI18n();
        if (!i18n || typeof i18n.formatDate !== 'function') {
            return new Date(dateValue).toLocaleDateString();
        }
        return i18n.formatDate(dateValue, language, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    }

    function ensureToastStack() {
        const existingStack = document.querySelector('.lc-toast-stack');
        if (existingStack) return existingStack;

        if (!document.getElementById('lc-toast-stack-style')) {
            const style = document.createElement('style');
            style.id = 'lc-toast-stack-style';
            style.textContent = `
                .lc-toast-stack {
                    position: fixed !important;
                    bottom: 30px !important;
                    right: 30px !important;
                    z-index: 999999 !important;
                    display: flex !important;
                    flex-direction: column !important;
                    align-items: flex-end !important;
                    gap: 12px !important;
                    pointer-events: none !important;
                    max-width: 360px !important;
                    cursor: grab !important;
                }
                .lc-toast-stack.lc-dragging { cursor: grabbing !important; }
                .lc-toast-stack > * { pointer-events: auto !important; }
            `;
            document.head.appendChild(style);
        }

        const stack = document.createElement('div');
        stack.className = 'lc-toast-stack';
        document.body.appendChild(stack);

        // --- Draggable toast stack ---
        let dragState = null;
        stack.addEventListener('mousedown', (e) => {
            // Don't intercept clicks on buttons/links inside toasts
            if (e.target.closest('button, a, input, select')) return;
            e.preventDefault();
            const rect = stack.getBoundingClientRect();
            dragState = { startX: e.clientX, startY: e.clientY, origLeft: rect.left, origTop: rect.top };
            stack.classList.add('lc-dragging');
        });
        document.addEventListener('mousemove', (e) => {
            if (!dragState) return;
            e.preventDefault();
            const dx = e.clientX - dragState.startX;
            const dy = e.clientY - dragState.startY;
            const newLeft = dragState.origLeft + dx;
            const newTop = dragState.origTop + dy;
            // Switch from bottom/right to top/left positioning for free placement
            stack.style.bottom = 'auto';
            stack.style.right = 'auto';
            stack.style.left = newLeft + 'px';
            stack.style.top = newTop + 'px';
        });
        document.addEventListener('mouseup', () => {
            if (!dragState) return;
            dragState = null;
            stack.classList.remove('lc-dragging');
        });

        return stack;
    }

    async function resolveDisplayTitle(title, options = {}) {
        const problemTitles = getProblemTitles();
        const language = options.language || await getCurrentLanguage();
        if (!problemTitles || typeof problemTitles.getDisplayTitle !== 'function') {
            return title;
        }

        return await problemTitles.getDisplayTitle({
            slug: options.slug,
            title: title
        }, language);
    }

    /**
     * Show a custom Toast notification on the page.
     */
    /**
     * Load user theme and inject shared toast CSS styles.
     * Returns { theme, language } for use by any toast function.
     */
    async function ensureToastStyles() {
        let themeName = 'sakura';
        try {
            if (typeof chrome !== 'undefined' && chrome.runtime?.id && chrome.storage && chrome.storage.local) {
                const storage = await chrome.storage.local.get({ theme: 'sakura' });
                themeName = storage.theme || 'sakura';
            }
        } catch (e) {
            console.log('[LeetCode EasyRepeat] Context invalidated or error reading theme');
        }

        const theme = getTheme(themeName);

        let style = document.getElementById('lc-srs-toast-styles');
        if (!style) {
            style = document.createElement('style');
            style.id = 'lc-srs-toast-styles';
            document.head.appendChild(style);
        }
        style.textContent = `
            @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap');
            .lc-srs-toast, .lc-srs-toast * { all: revert !important; box-sizing: border-box !important; }
            .lc-srs-toast {
                position: relative !important; opacity: 0 !important; transform: translateY(12px) !important;
                transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1) !important; pointer-events: none !important;
                width: 100% !important;
            }
            .lc-srs-toast.show { opacity: 1 !important; transform: translateY(0) !important; }
            .lc-srs-toast-content {
                background: rgba(10, 10, 10, 0.95) !important;
                border: 2px solid ${theme.terminal} !important;
                box-shadow: 0 0 20px ${theme.borderGlow}, inset 0 0 30px ${theme.shadowInner} !important;
                backdrop-filter: blur(10px) !important; padding: 16px 20px !important;
                font-family: 'JetBrains Mono', monospace !important; min-width: 280px !important;
                max-width: 350px !important; position: relative !important; overflow: hidden !important;
                border-radius: 4px !important;
            }
            .lc-srs-toast-content::before {
                content: ""; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
                background:
                    linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.12) 50%),
                    linear-gradient(90deg, ${theme.borderGlow}, ${theme.electricBorderDash});
                background-size: 100% 2px, 3px 100%;
                pointer-events: none;
                opacity: 0.22;
            }
            .lc-srs-toast-content::after {
                content: ""; position: absolute; top: 0; left: 0; width: 6px; height: 6px;
                background: ${theme.terminal}; box-shadow: 0 0 8px ${theme.terminal};
            }
            .lc-srs-toast-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
            .lc-srs-toast-icon { font-size: 16px; color: ${theme.terminal} !important; }
            .lc-srs-toast-title {
                font-weight: 700; font-size: 13px; color: ${theme.terminal} !important;
                text-transform: uppercase; text-shadow: 0 0 10px ${theme.textShadow};
            }
            .lc-srs-toast-problem {
                font-size: 14px; color: #ffffff !important; margin-bottom: 10px;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 300px;
            }
            .lc-srs-toast-meta {
                display: flex; justify-content: space-between; align-items: center; font-size: 11px;
                color: ${theme.electric} !important; border-top: 1px dashed ${theme.electricBorderDash};
                padding-top: 10px; margin-top: 4px;
            }
            .lc-srs-toast-date { font-weight: 700; color: ${theme.electric} !important; }
        `;

        return theme;
    }

    async function showCompletionToast(title, nextDate, options = {}) {
        const stack = ensureToastStack();
        await ensureToastStyles();
        const language = await getCurrentLanguage();
        const displayTitle = await resolveDisplayTitle(title, {
            slug: options.slug,
            language
        });

        const dateStr = formatDate(nextDate, language);
        const toast = document.createElement('div');
        toast.className = 'lc-srs-toast';
        toast.innerHTML = `
            <div class="lc-srs-toast-content">
                <div class="lc-srs-toast-header">
                    <span class="lc-srs-toast-icon">✓</span>
                    <span class="lc-srs-toast-title">${translate('content_submission_captured', {}, language)}</span>
                </div>
                <div class="lc-srs-toast-problem">${displayTitle}</div>
                <div class="lc-srs-toast-meta">
                    <span class="lc-srs-toast-label">${translate('content_next_review', {}, language)}</span>
                    <span class="lc-srs-toast-date">${dateStr}</span>
                </div>
            </div>
        `;
        stack.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 500);
            }, 4000);
        }, 100);
    }

    /**
     * Show a modal asking using FSRS ratings.
     */
    async function showRatingModal(title, options = {}) {
        const language = await getCurrentLanguage();
        const displayTitle = await resolveDisplayTitle(title, {
            slug: options.slug,
            language
        });

        return new Promise((resolve) => {
            resolveModalTheme((modalTheme) => {
                const maxRating = options.maxRating || 4;

                // Build the modal after reading the stored recommendation preference
                // to avoid a visual flash where buttons appear disabled then re-enable
                const buildModal = (recEnabled) => {
                    const backdrop = document.createElement('div');
                    backdrop.className = 'lc-rating-backdrop';

                    const modal = document.createElement('div');
                    modal.className = `lc-rating-modal theme-${modalTheme}`;

                    // Header Container
                    const header = document.createElement('div');
                    header.className = 'lc-rating-header';

                    const heading = document.createElement('h3');
                    heading.innerText = translate('content_difficulty_check', {}, language);
                    header.appendChild(heading);

                    const sub = document.createElement('div');
                    sub.className = 'lc-rating-subtitle';
                    sub.innerText = displayTitle;

                    const hint = document.createElement('div');
                    hint.className = 'lc-rating-hint';
                    hint.innerText = translate('content_difficulty_hint', {}, language);

                    const btnContainer = document.createElement('div');
                    btnContainer.className = 'lc-rating-btn-container';
                    btnContainer.classList.add('lc-rating-btn-container-ramp');

                    const ratings = [
                        { tone: 'again', label: translate('rating_again', {}, language), value: 1, desc: translate('rating_again_desc', {}, language) },
                        { tone: 'hard', label: translate('rating_hard', {}, language), value: 2, desc: translate('rating_hard_desc', {}, language) },
                        { tone: 'good', label: translate('rating_good', {}, language), value: 3, desc: translate('rating_good_desc', {}, language) },
                        { tone: 'easy', label: translate('rating_easy', {}, language), value: 4, desc: translate('rating_easy_desc', {}, language) }
                    ];

                    // Collect button references for the toggle to enable/disable dynamically
                    const buttonRefs = [];

                    ratings.forEach(r => {
                        const btn = document.createElement('button');
                        btn.className = `lc-rating-btn rating-btn-${r.tone}`;

                        // Only apply fail-count restrictions when recommendations are enabled
                        if (recEnabled && r.value > maxRating) {
                            btn.disabled = true;
                            btn.classList.add('lc-rating-btn-disabled');
                            btn.style.opacity = '0.35';
                            btn.style.pointerEvents = 'none';
                            btn.style.cursor = 'not-allowed';
                        }

                        // Construct button content
                        const labelDiv = document.createElement('div');
                        labelDiv.className = 'lc-rating-btn-label';
                        labelDiv.innerText = r.label;

                        const descDiv = document.createElement('div');
                        descDiv.className = 'lc-rating-btn-desc';
                        descDiv.innerText = r.desc;

                        btn.appendChild(labelDiv);
                        btn.appendChild(descDiv);

                        // Always attach click handler; guard with disabled check inside
                        // so that dynamically re-enabled buttons (via toggle) work without re-binding
                        btn.addEventListener('click', () => {
                            if (!btn.disabled) {
                                backdrop.remove();
                                resolve(r.value);
                            }
                        });
                        btnContainer.appendChild(btn);

                        // Store reference for the checkbox toggle to use
                        buttonRefs.push({ btn, value: r.value });
                    });

                    // --- Difficulty Recommendations Toggle (checkbox below rating buttons) ---
                    const toggleContainer = document.createElement('div');
                    toggleContainer.className = 'lc-rating-recommendation-toggle';

                    // Checkbox: controls whether fail-count restrictions are active
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.id = 'lc-difficulty-rec';
                    checkbox.checked = recEnabled; // Initial state matches stored preference

                    // Label for the checkbox
                    const toggleLabel = document.createElement('label');
                    toggleLabel.htmlFor = 'lc-difficulty-rec';
                    toggleLabel.innerText = translate('content_difficulty_recommendations', {}, language);

                    toggleContainer.appendChild(checkbox);
                    toggleContainer.appendChild(toggleLabel);

                    // Toggle change handler: enable/disable buttons and persist preference
                    checkbox.addEventListener('change', () => {
                        buttonRefs.forEach(({ btn, value }) => {
                            // Determine if this button should be disabled based on toggle state
                            const shouldDisable = checkbox.checked && value > maxRating;
                            btn.disabled = shouldDisable;
                            if (shouldDisable) {
                                btn.classList.add('lc-rating-btn-disabled');
                                btn.style.opacity = '0.35';
                                btn.style.pointerEvents = 'none';
                                btn.style.cursor = 'not-allowed';
                            } else {
                                btn.classList.remove('lc-rating-btn-disabled');
                                btn.style.opacity = '';
                                btn.style.pointerEvents = '';
                                btn.style.cursor = 'pointer';
                            }
                        });
                        // Persist the preference to chrome.storage.local
                        if (typeof chrome !== 'undefined' && chrome.runtime?.id && chrome.storage?.local) {
                            chrome.storage.local.set({ difficultyRecommendations: checkbox.checked });
                        }
                    });

                    modal.appendChild(header);
                    modal.appendChild(sub);
                    modal.appendChild(hint);
                    modal.appendChild(btnContainer);
                    modal.appendChild(toggleContainer); // Checkbox row below buttons
                    backdrop.appendChild(modal);
                    document.body.appendChild(backdrop);
                }; // end buildModal

                // Read recommendation preference from storage before building the modal
                if (typeof chrome !== 'undefined' && chrome.runtime?.id && chrome.storage?.local) {
                    chrome.storage.local.get({ difficultyRecommendations: true }, (res) => {
                        // Default to true (recommendations enabled) if storage read fails
                        const recEnabled = chrome.runtime?.lastError ? true : res.difficultyRecommendations;
                        buildModal(recEnabled);
                    });
                } else {
                    // No chrome storage available (e.g. test env without mock) — default to enabled
                    buildModal(true);
                }
            });
        });
    }

    /**
     * Inject shared styles (Fonts) if not already present.
     */
    function injectSharedStyles() {
        if (document.getElementById('lc-srs-global-styles')) return;

        const style = document.createElement('style');
        style.id = 'lc-srs-global-styles';
        style.textContent = `
            @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap');
            @import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;600&display=swap');
        `;
        document.head.appendChild(style);
    }

    /**
     * Inject the Notes interface (Floating widget).
     */
    function insertNotesButton(dependencies) {
        const { getCurrentProblemSlug, getNotes, saveNotes } = dependencies || {};

        // Safety Checks
        if (typeof getCurrentProblemSlug !== 'function' || typeof createNotesWidget !== 'function') {
            return;
        }

        // Ensure fonts are loaded
        injectSharedStyles();

        const slug = getCurrentProblemSlug();
        if (!slug) return;

        // Duplication check
        const existingContainer = document.querySelector('.lc-notes-container');
        if (existingContainer) {
            if (existingContainer.dataset.slug === slug) {
                if (typeof existingContainer._lcSyncTheme === 'function') {
                    try { void existingContainer._lcSyncTheme(); } catch (e) { /* context invalidated */ }
                }
                return; // Already exists
            } else {
                if (typeof existingContainer._lcNotesCleanup === 'function') {
                    existingContainer._lcNotesCleanup();
                }
                existingContainer.remove();
            }
        }

        console.log(`[LeetCode EasyRepeat] Injecting Floating Notes Widget for ${slug}`);

        // Define callbacks for the widget
        const onSave = async (content) => {
            if (saveNotes) {
                await saveNotes(slug, content);
            }
        };

        const loadContent = async () => {
            if (getNotes) {
                return await getNotes(slug);
            }
            return "";
        };

        const widget = createNotesWidget(slug, loadContent, onSave);
        const baseCleanup = widget._lcNotesCleanup;
        const extraCleanupFns = [];

        // --- THEME LOGIC ---
        if (typeof chrome !== 'undefined' && chrome.runtime?.id && chrome.storage && chrome.storage.local) {
            const syncWidgetTheme = () => new Promise((resolve) => {
                try {
                    if (!chrome.runtime?.id) { resolve(); return; }
                    chrome.storage.local.get({ theme: 'sakura' }, (result) => {
                        if (!chrome.runtime?.lastError) {
                            applyNotesWidgetTheme(widget, result.theme || 'sakura');
                        }
                        resolve();
                    });
                } catch (e) {
                    // Extension context invalidated — skip silently
                    resolve();
                }
            });

            widget._lcSyncTheme = syncWidgetTheme;
            void syncWidgetTheme();

            if (chrome.storage.onChanged) {
                const handleThemeChange = (changes, namespace) => {
                    try {
                        if (namespace === 'local' && changes.theme) {
                            void syncWidgetTheme();
                        }
                    } catch (e) { /* context invalidated */ }
                };

                chrome.storage.onChanged.addListener(handleThemeChange);
                extraCleanupFns.push(() => chrome.storage.onChanged.removeListener(handleThemeChange));
            }
        }

        widget._lcNotesCleanup = () => {
            extraCleanupFns.forEach((cleanup) => {
                try {
                    if (typeof cleanup === 'function') cleanup();
                } catch (e) {
                    console.warn('[LeetCode EasyRepeat] Notes theme cleanup failed:', e);
                }
            });

            if (typeof baseCleanup === 'function') {
                baseCleanup();
            }
        };

        document.body.appendChild(widget);

        // Tooltip logic (reuses existing storage check)
        checkAndShowTooltip(widget.querySelector('.lc-notes-handle'));
    }

    /**
     * Check and show tooltip if needed
     */
    function checkAndShowTooltip(targetBtn) {
        if (!targetBtn) return;
        if (typeof chrome !== 'undefined' && chrome.runtime?.id && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['seenDragTooltip'], (result) => {
                if (chrome.runtime?.lastError) return;
                if (!result.seenDragTooltip) {
                    showDragTooltip(targetBtn);
                    chrome.storage.local.set({ seenDragTooltip: true });
                }
            });
        }
    }

    // Helper helper for tooltip (fix scope issue if showDragTooltip is below)
    // Actually showDragTooltip is defined at bottom scope using hoisting, so it is safe.

    // ... showDragTooltip implementation remains mostly same ...

    /**
     * Show a modal asking if the user wants to analyze their mistake.
     * Returns Promise<boolean> (true = analyze, false = cancel)
     */
    async function showAnalysisModal(errorType) {
        console.log(`[LeetCode EasyRepeat] [DEBUG] showAnalysisModal triggered for: ${errorType}`);
        const language = await getCurrentLanguage();

        return new Promise((resolve) => {
            resolveModalTheme((modalTheme) => {
                const backdrop = document.createElement('div');
                backdrop.className = 'lc-rating-backdrop'; // Reuse rating backdrop style

                const modal = document.createElement('div');
                modal.className = `lc-rating-modal theme-${modalTheme}`; // Reuse rating modal style
                modal.style.minWidth = '400px';

                // Header
                const header = document.createElement('div');
                header.className = 'lc-rating-header';
                const heading = document.createElement('h3');
                heading.innerText = translate('content_mistake_detected', {}, language);
                heading.style.color = '#ef4444'; // Red for error
                header.appendChild(heading);

                // Subtitle
                const sub = document.createElement('div');
                sub.className = 'lc-rating-subtitle';
                sub.innerText = translate('content_error_type', { errorType }, language);
                sub.style.marginBottom = '20px';

                // Checkbox Container
                const checkContainer = document.createElement('div');
                checkContainer.style.marginBottom = '20px';
                checkContainer.style.display = 'flex';
                checkContainer.style.alignItems = 'center';
                checkContainer.style.justifyContent = 'center';
                checkContainer.style.gap = '8px';

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = 'lc-always-analyze';

                // Check storage for preference
                if (typeof chrome !== 'undefined' && chrome.runtime?.id && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.get(['alwaysAnalyze'], (res) => {
                        if (chrome.runtime?.lastError) return;
                        if (res && res.alwaysAnalyze) checkbox.checked = true;
                    });
                }

                const label = document.createElement('label');
                label.innerText = translate('content_always_analyze', {}, language);
                label.htmlFor = 'lc-always-analyze';
                label.style.fontFamily = 'var(--font-mono)';
                label.style.fontSize = '12px';
                label.style.color = 'rgba(255,255,255,0.7)';

                checkContainer.appendChild(checkbox);
                checkContainer.appendChild(label);


                // Buttons
                const btnContainer = document.createElement('div');
                btnContainer.className = 'lc-rating-btn-container';
                btnContainer.style.justifyContent = 'center';

                const cancelBtn = document.createElement('button');
                cancelBtn.className = 'lc-rating-btn';
                cancelBtn.style.textAlign = 'center';
                cancelBtn.style.width = '120px';
                cancelBtn.innerHTML = `<div class="lc-rating-btn-label">${translate('common_cancel', {}, language)}</div>`;
                cancelBtn.onclick = () => {
                    backdrop.remove();
                    resolve(false);
                };

                const analyzeBtn = document.createElement('button');
                analyzeBtn.className = 'lc-rating-btn';
                analyzeBtn.style.borderColor = '#22d3ee';
                analyzeBtn.style.background = 'rgba(34, 211, 238, 0.1)';
                analyzeBtn.style.textAlign = 'center';
                analyzeBtn.style.width = '120px';
                analyzeBtn.innerHTML = `<div class="lc-rating-btn-label" style="color:#22d3ee">${translate('common_analyze', {}, language)}</div>`;
                analyzeBtn.onclick = () => {
                    // Save preference logic
                    if (checkbox.checked && typeof chrome !== 'undefined' && chrome.runtime?.id) {
                        chrome.storage.local.set({ alwaysAnalyze: true });
                    }
                    backdrop.remove();
                    resolve(true);
                };

                btnContainer.appendChild(cancelBtn);
                btnContainer.appendChild(analyzeBtn);

                modal.appendChild(header);
                modal.appendChild(sub);
                modal.appendChild(checkContainer);
                modal.appendChild(btnContainer);
                backdrop.appendChild(modal);
                document.body.appendChild(backdrop);
            });
        });
    }




    /**
     * Create the Draggable Notes Widget (Handle + Dropdown Panel)
     */
    /**
     * Create the Draggable Notes Widget (Handle + Dropdown Panel)
     */
    function createNotesWidget(slug, loadContentFn, onSaveFn) {
        const container = document.createElement('div');
        container.className = 'lc-notes-container';
        container.dataset.slug = slug;

        const handle = document.createElement('div');
        handle.className = 'lc-notes-handle';
        handle.innerHTML = `
        <svg viewBox="0 0 24 24" style="pointer-events: none;">
            <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
        </svg>
        <span class="lc-notes-label"></span>
        <span class="lc-notes-toggle-icon" style="font-size: 10px; margin-left: auto;">▼</span>
    `;

        const panel = document.createElement('div');
        panel.className = 'lc-notes-panel';

        const textarea = document.createElement('textarea');
        textarea.className = 'lc-notes-textarea';

        const footer = document.createElement('div');
        footer.className = 'lc-notes-footer';

        const status = document.createElement('span');
        status.className = 'lc-notes-status';

        const saveBtn = document.createElement('button');
        saveBtn.className = 'lc-btn lc-btn-save';

        footer.appendChild(status);
        footer.appendChild(saveBtn);
        panel.appendChild(textarea);
        panel.appendChild(footer);
        container.appendChild(handle);
        container.appendChild(panel);

        let currentLanguage = 'en';
        let statusState = 'synced';
        let statusTimer = null;
        let isOpen = false;
        let isDragging = false;
        let dragTimer = null;
        let hasLoaded = false;
        let lastSyncedValue = '';
        let pendingExternalValue = null;
        const cleanupFns = [];

        const setStatusText = (state) => {
            statusState = state;
            if (statusTimer) {
                clearTimeout(statusTimer);
                statusTimer = null;
            }

            if (state === 'saving') {
                status.innerText = translate('content_saving', {}, currentLanguage);
                status.style.color = '#eab308';
                return;
            }

            if (state === 'saved') {
                status.innerText = translate('content_saved_via_sync', {}, currentLanguage);
                status.style.color = '#22c55e';
                statusTimer = setTimeout(() => setStatusText('synced'), 2000);
                return;
            }

            if (state === 'external') {
                status.innerText = translate('content_external_update_pending', {}, currentLanguage);
                status.style.color = '#38bdf8';
                return;
            }

            status.innerText = translate('common_synced', {}, currentLanguage);
            status.style.color = '#666';
        };

        const applyLanguage = (language) => {
            currentLanguage = language || 'en';
            const notesLabel = handle.querySelector('.lc-notes-label');
            if (notesLabel) {
                notesLabel.innerText = translate('content_notes', {}, currentLanguage);
            }
            textarea.placeholder = translate('content_notes_placeholder', {}, currentLanguage);
            saveBtn.innerText = translate('common_save', {}, currentLanguage);
            setStatusText(statusState);
        };

        const i18n = getI18n();
        if (i18n && typeof i18n.onLanguageChange === 'function') {
            cleanupFns.push(i18n.onLanguageChange(applyLanguage, { immediate: true }));
        } else {
            applyLanguage('en');
        }

        const applyExternalNotesUpdate = (nextValue) => {
            const normalized = nextValue || '';
            const hasUnsavedChanges = textarea.value !== lastSyncedValue;

            if (hasUnsavedChanges) {
                pendingExternalValue = normalized;
                if (isOpen) {
                    setStatusText('external');
                }
                return;
            }

            textarea.value = normalized;
            lastSyncedValue = normalized;
            pendingExternalValue = null;
            hasLoaded = true;

            if (isOpen) {
                setStatusText('synced');
            }
        };

        const togglePanel = async () => {
            if (isDragging) return;

            isOpen = !isOpen;
            if (isOpen) {
                container.classList.add('expanded');
                handle.querySelector('.lc-notes-toggle-icon').innerText = '▲';

                if (pendingExternalValue !== null) {
                    applyExternalNotesUpdate(pendingExternalValue);
                }
                if (!hasLoaded) {
                    textarea.value = translate('content_loading_notes', {}, currentLanguage);
                    const content = await loadContentFn();
                    const normalized = content || '';
                    textarea.value = normalized;
                    lastSyncedValue = normalized;
                    pendingExternalValue = null;
                    hasLoaded = true;
                    setStatusText('synced');
                }

                setTimeout(() => textarea.focus(), 100);
            } else {
                container.classList.remove('expanded');
                handle.querySelector('.lc-notes-toggle-icon').innerText = '▼';
            }
        };

        const performSave = async () => {
            setStatusText('saving');
            await onSaveFn(textarea.value);
            lastSyncedValue = textarea.value;
            pendingExternalValue = null;
            setStatusText('saved');
        };

        saveBtn.onclick = performSave;

        textarea.onkeydown = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                performSave();
            }
            if (e.key === 'Escape') {
                togglePanel();
            }
        };

        if (typeof chrome !== 'undefined' && chrome.runtime?.id && chrome.storage && chrome.storage.onChanged) {
            const handleStorageChange = (changes, namespace) => {
                if (namespace !== 'local' || !changes.problems) return;
                const updated = changes.problems.newValue;
                if (!updated || !updated[slug]) return;

                const nextNotes = updated[slug].notes || '';
                if (nextNotes === lastSyncedValue && textarea.value === lastSyncedValue) return;
                applyExternalNotesUpdate(nextNotes);
            };

            chrome.storage.onChanged.addListener(handleStorageChange);
            cleanupFns.push(() => chrome.storage.onChanged.removeListener(handleStorageChange));
        }

        let startX, startY, initialLeft, initialTop;
        const DRAG_DELAY = 300;

        const startDragCheck = (e) => {
            if (e.button !== 0) return;
            if (!handle.contains(e.target)) return;

            startX = e.clientX;
            startY = e.clientY;

            const rect = container.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;

            if (dragTimer) clearTimeout(dragTimer);

            dragTimer = setTimeout(() => {
                isDragging = true;
                container.classList.add('dragging');
                container.style.right = 'auto';
                container.style.bottom = 'auto';
                container.style.left = `${initialLeft}px`;
                container.style.top = `${initialTop}px`;
            }, DRAG_DELAY);
        };

        const performDrag = (e) => {
            if (!isDragging) return;
            e.preventDefault();

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            let newLeft = initialLeft + dx;
            let newTop = initialTop + dy;

            const maxLeft = window.innerWidth - container.offsetWidth;
            const maxTop = window.innerHeight - 40;
            newLeft = Math.max(0, Math.min(newLeft, maxLeft));
            newTop = Math.max(0, Math.min(newTop, maxTop));

            container.style.left = `${newLeft}px`;
            container.style.top = `${newTop}px`;
        };

        const endDrag = () => {
            if (dragTimer) {
                clearTimeout(dragTimer);
                dragTimer = null;
            }

            if (isDragging) {
                isDragging = false;
                container.classList.remove('dragging');
                handle.dataset.justDragged = 'true';
                setTimeout(() => { handle.dataset.justDragged = 'false'; }, 50);
            }
        };

        handle.onmousedown = startDragCheck;
        window.addEventListener('mousemove', performDrag);
        window.addEventListener('mouseup', endDrag);
        cleanupFns.push(() => window.removeEventListener('mousemove', performDrag));
        cleanupFns.push(() => window.removeEventListener('mouseup', endDrag));

        handle.onclick = (e) => {
            e.preventDefault();
            if (handle.dataset.justDragged === 'true') return;
            togglePanel();
        };

        container._lcNotesCleanup = () => {
            if (statusTimer) clearTimeout(statusTimer);
            cleanupFns.forEach((cleanup) => {
                try {
                    if (typeof cleanup === 'function') cleanup();
                } catch (e) {
                    console.warn('[LeetCode EasyRepeat] Notes cleanup failed:', e);
                }
            });
        };

        return container;
    }

    /**
     * Show a tooltip for the draggable button (Moved here for scope access if needed)
     */
    function showDragTooltip(targetElement) {
        if (!targetElement) return;
        // ... reused logic ...
        const languagePromise = getCurrentLanguage().catch(() => 'en');
        const tooltip = document.createElement('div');
        tooltip.className = 'lc-notes-tooltip';
        tooltip.innerHTML = `<span class="lc-tooltip-text"></span><div class="lc-notes-tooltip-arrow"></div><button class="lc-tooltip-close">×</button>`;
        document.body.appendChild(tooltip);

        languagePromise.then((language) => {
            const text = tooltip.querySelector('.lc-tooltip-text');
            if (text) {
                text.textContent = translate('content_drag_tooltip', {}, language);
            }
        });

        const updatePosition = () => {
            try {
                const rect = targetElement.getBoundingClientRect();
                const tipRect = tooltip.getBoundingClientRect();
                const top = rect.top + (rect.height / 2) - (tipRect.height / 2);
                const left = rect.left - tipRect.width - 12;
                tooltip.style.top = `${top}px`;
                tooltip.style.left = `${left}px`;
            } catch (e) { tooltip.remove(); }
        };

        updatePosition();
        requestAnimationFrame(() => tooltip.classList.add('show'));

        const close = () => { tooltip.remove(); };
        setTimeout(close, 15000);
        tooltip.querySelector('.lc-tooltip-close').onclick = close;
    }

    /**
     * Show a progress toast for AI Analysis with Cancel button.
     * @param {Function} onCancel - Callback when cancel is clicked
     * @returns {Object} - { close: Function, update: Function }
     */
    function showAnalysisProgress(onCancel) {
        // Remove existing
        const existing = document.querySelector('.lc-analysis-progress');
        if (existing) existing.remove();

        // Ensure styles
        if (!document.getElementById('lc-analysis-progress-style')) {
            const style = document.createElement('style');
            style.id = 'lc-analysis-progress-style';
            style.textContent = `
                .lc-analysis-progress {
                    position: relative;
                    background: rgba(10, 10, 10, 0.95);
                    border: 1px solid #333;
                    border-radius: 8px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                    padding: 16px;
                    width: 320px;
                    font-family: 'JetBrains Mono', monospace;
                    display: flex; flex-direction: column; gap: 12px;
                    transform: translateY(12px); opacity: 0;
                    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                }
                .lc-analysis-progress.show { transform: translateY(0); opacity: 1; }
                .lc-analysis-header {
                    display: flex; justify-content: space-between; align-items: center;
                    color: #fff; font-size: 13px; font-weight: 600;
                }
                .lc-analysis-status { display: flex; align-items: center; gap: 8px; }
                .lc-spinner {
                    width: 14px; height: 14px; border: 2px solid #333;
                    border-top-color: #22d3ee; border-radius: 50%;
                    animation: lc-spin 1s linear infinite;
                }
                @keyframes lc-spin { to { transform: rotate(360deg); } }

                .lc-analysis-steps {
                    display: flex; flex-direction: column; gap: 6px;
                    font-size: 12px; color: #d1d5db;
                }
                .lc-analysis-step {
                    display: flex; align-items: center; gap: 8px;
                }
                .lc-analysis-step.pending { opacity: 0.45; }
                .lc-analysis-step.active { color: #e5e7eb; }
                .lc-analysis-step.done { color: #86efac; }
                .lc-analysis-step.error { color: #fca5a5; }
                .lc-step-icon {
                    width: 16px; display: inline-flex; align-items: center; justify-content: center;
                    font-size: 12px;
                }
                .lc-step-message { opacity: 0.7; font-size: 11px; }

                .lc-analysis-cancel-btn {
                    background: transparent; border: 1px solid #ef4444;
                    color: #ef4444; border-radius: 4px; padding: 4px 8px;
                    font-size: 11px; cursor: pointer; transition: all 0.2s;
                    align-self: flex-end;
                }
                .lc-analysis-cancel-btn:hover { background: #ef4444; color: #fff; }

                .lc-step-stream {
                    margin-top: 4px;
                    margin-left: 24px;
                    padding: 6px 8px;
                    background: rgba(34, 211, 238, 0.06);
                    border-left: 2px solid rgba(34, 211, 238, 0.3);
                    border-radius: 0 4px 4px 0;
                    max-height: 80px;
                    overflow-y: auto;
                    font-family: 'JetBrains Mono', 'Fira Code', monospace;
                    font-size: 10.5px;
                    line-height: 1.5;
                    color: #94a3b8;
                    white-space: pre-wrap;
                    word-break: break-all;
                    display: none;
                }
                .lc-step-stream.visible { display: block; }
                .lc-stream-cursor {
                    display: inline-block;
                    width: 5px;
                    height: 11px;
                    background: #22d3ee;
                    animation: lc-blink 1s step-end infinite;
                    vertical-align: text-bottom;
                    margin-left: 1px;
                }
                @keyframes lc-blink { 50% { opacity: 0; } }
            `;
            document.head.appendChild(style);
        }

        const container = document.createElement('div');
        container.className = 'lc-analysis-progress';
        let liveLanguage = 'en';
        const steps = new Map();

        const renderProgressUI = (language) => {
            container.innerHTML = `
                <div class="lc-analysis-header">
                    <div class="lc-analysis-status">
                        <div class="lc-spinner"></div>
                        <span class="lc-analysis-status-text">${translate('content_analyzing_request', {}, language)}</span>
                    </div>
                </div>
                <div class="lc-analysis-steps"></div>
                <button class="lc-analysis-cancel-btn">${translate('content_cancel_analysis', {}, language)}</button>
            `;

            const cancelBtn = container.querySelector('.lc-analysis-cancel-btn');
            if (cancelBtn) {
                cancelBtn.onclick = () => {
                    if (onCancel) onCancel();
                    close();
                };
            }
        };

        renderProgressUI('en');
        ensureToastStack().appendChild(container);
        getCurrentLanguage().then((language) => {
            liveLanguage = language;
            renderProgressUI(language);
            renderSteps();
        }).catch(() => { });

        // Animate in
        requestAnimationFrame(() => container.classList.add('show'));

        function getStepLabel(stepKey, options = {}) {
            const attempt = options.attempt || options.index || 1;
            const total = options.total || options.maxAttempts || attempt;
            if (stepKey.startsWith('generate_fix_attempt_')) {
                return translate('content_step_generate_fix_attempt', { attempt, total }, liveLanguage);
            }
            if (stepKey.startsWith('execute_sandbox_attempt_')) {
                return translate('content_step_execute_sandbox_attempt', { attempt, total }, liveLanguage);
            }
            const labels = {
                captured_failed_submission: 'content_step_captured_failed',
                analyzing_error_pattern: 'content_step_analyzing_error',
                llm_searching_kb: 'content_step_searching_kb',
                llm_found_solution: 'content_step_found_solution',
                llm_verifying_safe_observer: 'content_step_safe_observer',
                generate_tests: 'content_step_generate_tests',
                verified_success: 'content_step_verified_success',
                verified_failed: 'content_step_verified_failed',
                llm_consulting_model: 'content_step_consulting_model',
                analysis_complete: 'content_step_analysis_complete',
                analysis_failed: 'content_step_analysis_failed'
            };
            const key = labels[stepKey];
            return key ? translate(key, {}, liveLanguage) : stepKey;
        }

        function getStepOrder(stepKey, attempt) {
            if (stepKey.startsWith('generate_fix_attempt_')) {
                return 60 + (attempt || 0) * 2;
            }
            if (stepKey.startsWith('execute_sandbox_attempt_')) {
                return 61 + (attempt || 0) * 2;
            }
            const order = {
                captured_failed_submission: 10,
                analyzing_error_pattern: 20,
                llm_searching_kb: 30,
                llm_found_solution: 32,
                llm_verifying_safe_observer: 40,
                generate_tests: 50,
                verified_success: 80,
                verified_failed: 80,
                llm_consulting_model: 90,
                analysis_complete: 100,
                analysis_failed: 100
            };
            return order[stepKey] || 75;
        }

        function normalizeStatus(status) {
            if (!status) return 'pending';
            const normalized = String(status).toLowerCase();
            if (['active', 'running', 'in_progress'].includes(normalized)) return 'active';
            if (['done', 'complete', 'completed', 'success'].includes(normalized)) return 'done';
            if (['error', 'failed', 'failure'].includes(normalized)) return 'error';
            return 'pending';
        }

        let currentStreamKey = null;

        function renderSteps() {
            const stepsEl = container.querySelector('.lc-analysis-steps');
            if (!stepsEl) return;
            const ordered = Array.from(steps.values()).sort((a, b) => a.order - b.order);
            const activeStep = ordered.find(step => step.status === 'active');
            stepsEl.innerHTML = '';
            ordered.forEach((step) => {
                const row = document.createElement('div');
                row.className = `lc-analysis-step ${step.status}`;
                const icon = document.createElement('span');
                icon.className = 'lc-step-icon';
                if (step.status === 'done') icon.textContent = '✓';
                else if (step.status === 'error') icon.textContent = '×';
                else if (step.status === 'active') icon.textContent = '◎';
                else icon.textContent = '•';
                const text = document.createElement('span');
                text.textContent = getStepLabel(step.key, { attempt: step.attempt, total: step.total });
                row.appendChild(icon);
                row.appendChild(text);
                if (step.message) {
                    const msg = document.createElement('span');
                    msg.className = 'lc-step-message';
                    msg.textContent = ` ${step.message}`;
                    row.appendChild(msg);
                }
                stepsEl.appendChild(row);

                // Add inline streaming area under the active step
                if (step === activeStep) {
                    const streamArea = document.createElement('div');
                    streamArea.className = 'lc-step-stream';
                    streamArea.id = 'lc-active-stream';
                    const streamText = document.createElement('span');
                    streamText.className = 'lc-stream-text';
                    const cursor = document.createElement('span');
                    cursor.className = 'lc-stream-cursor';
                    streamArea.appendChild(streamText);
                    streamArea.appendChild(cursor);

                    // Restore accumulated tokens if this is the same step
                    if (currentStreamKey === step.key && streamAccumulated) {
                        streamText.textContent = streamAccumulated;
                        streamArea.classList.add('visible');
                    }

                    stepsEl.appendChild(streamArea);
                }
            });
            const statusText = container.querySelector('.lc-analysis-status-text');
            if (statusText && activeStep) {
                statusText.textContent = getStepLabel(activeStep.key, { attempt: activeStep.attempt, total: activeStep.total });
            }
        }

        let streamAccumulated = '';

        function close() {
            container.classList.remove('show');
            setTimeout(() => container.remove(), 300);
        }

        function updateStep(payload) {
            if (!payload) return;
            const stepKey = payload.key || payload.step;
            if (!stepKey) return;
            const attemptMatch = stepKey.match(/_(\d+)$/);
            const attempt = payload.attempt || (attemptMatch ? Number(attemptMatch[1]) : undefined);
            const total = payload.total || payload.max_attempts || payload.maxAttempts;
            const status = normalizeStatus(payload.status);
            
            steps.set(stepKey, {
                key: stepKey,
                status,
                order: getStepOrder(stepKey, attempt),
                message: payload.message,
                attempt,
                total
            });
            const statusText = container.querySelector('.lc-analysis-status-text');
            if (statusText && status === 'active') {
                statusText.textContent = getStepLabel(stepKey, { attempt, total });
            }
            if (stepKey === 'analysis_complete' && statusText) {
                statusText.textContent = translate('content_analysis_complete', {}, liveLanguage);
            }
            if (stepKey === 'analysis_failed' && statusText) {
                statusText.textContent = translate('common_error', {}, liveLanguage);
            }
            renderSteps();
        }

        function update(text, percent) {
            if (text && typeof text === 'object') {
                updateStep(text);
                return;
            }
            const statusText = container.querySelector('.lc-analysis-status span');
            if (statusText) {
                if (text === 'Analysis Complete') {
                    statusText.innerText = translate('content_analysis_complete', {}, liveLanguage);
                    updateStep({ key: 'analysis_complete', status: 'done' });
                } else if (typeof text === 'string' && text.startsWith('Error: ')) {
                    statusText.innerText = `${translate('common_error', {}, liveLanguage)}: ${text.slice(7)}`;
                    updateStep({ key: 'analysis_failed', status: 'error', message: text.slice(7) });
                } else {
                    statusText.innerText = text;
                }
            }

            // If we ever want real progress
            // const bar = container.querySelector('.lc-progress-bar');
            // bar.classList.remove('indeterminate');
            // bar.style.width = percent + '%';
        }

        function appendToken(token) {
            streamAccumulated += token;
            const streamEl = container.querySelector('#lc-active-stream');
            const textEl = streamEl?.querySelector('.lc-stream-text');
            if (!streamEl || !textEl) return;
            if (!streamEl.classList.contains('visible')) {
                streamEl.classList.add('visible');
            }
            textEl.textContent = streamAccumulated;
            streamEl.scrollTop = streamEl.scrollHeight;
        }

        function clearStream() {
            streamAccumulated = '';
            currentStreamKey = null;
            const streamEl = container.querySelector('#lc-active-stream');
            if (streamEl) {
                streamEl.classList.remove('visible');
                const textEl = streamEl.querySelector('.lc-stream-text');
                if (textEl) textEl.textContent = '';
            }
        }

        // When a new step becomes active, reset the stream
        const origUpdateStep = updateStep;
        function updateStepWithStream(payload) {
            if (payload) {
                const status = normalizeStatus(payload.status);
                const key = payload.key || payload.step;
                if (status === 'active' && key !== currentStreamKey) {
                    // New active step — clear previous stream
                    streamAccumulated = '';
                    currentStreamKey = key;
                }
            }
            origUpdateStep(payload);
        }

        return { close, update, updateStep: updateStepWithStream, appendToken, clearStream };
    }

    /**
     * Show a small toast indicating the submission was already recorded today.
     */
    async function showDuplicateSkipToast(title, options = {}) {
        const stack = ensureToastStack();
        await ensureToastStyles();
        const language = await getCurrentLanguage();
        const displayTitle = await resolveDisplayTitle(title, { slug: options.slug, language });

        const toast = document.createElement('div');
        toast.className = 'lc-srs-toast';
        toast.innerHTML = `
            <div class="lc-srs-toast-content">
                <div class="lc-srs-toast-header">
                    <span class="lc-srs-toast-icon">↻</span>
                    <span class="lc-srs-toast-title">${translate('content_submission_captured', {}, language)}</span>
                </div>
                <div class="lc-srs-toast-problem">${displayTitle}</div>
                <div class="lc-srs-toast-meta">
                    <span>${translate('content_already_recorded_today', {}, language)}</span>
                </div>
            </div>
        `;
        stack.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 500);
            }, 3000);
        }, 100);
    }

    /**
     * Show a Monaco diff editor panel comparing original code vs the verified fix.
     * Uses a sandboxed iframe to load Monaco from CDN.
     * Only shown when Safe Observer successfully verifies a fix.
     */
    function showFixDiffViewer(originalCode, fixedCode, meta = {}) {
        // Remove existing
        const existing = document.querySelector('.lc-diff-viewer-overlay');
        if (existing) existing.remove();

        // Inject styles once
        if (!document.getElementById('lc-diff-viewer-style')) {
            const style = document.createElement('style');
            style.id = 'lc-diff-viewer-style';
            style.textContent = `
                .lc-diff-viewer-overlay {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    width: 700px;
                    height: 450px;
                    background: #1e1e1e;
                    border: 1px solid #3c3c3c;
                    border-radius: 10px;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.7);
                    z-index: 100001;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    transform: translateY(20px);
                    opacity: 0;
                    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                    resize: both;
                }
                .lc-diff-viewer-overlay.show { transform: translateY(0); opacity: 1; }
                .lc-diff-viewer-bar {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 6px 12px;
                    background: #252526;
                    border-bottom: 1px solid #3c3c3c;
                    cursor: move;
                    user-select: none;
                }
                .lc-diff-viewer-bar .title {
                    color: #3fb950;
                    font-size: 12px;
                    font-weight: 600;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                }
                .lc-diff-viewer-bar .meta {
                    color: #8b949e;
                    font-size: 11px;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    margin-left: 8px;
                }
                .lc-diff-viewer-bar .close-btn {
                    background: transparent;
                    border: none;
                    color: #8b949e;
                    cursor: pointer;
                    font-size: 18px;
                    line-height: 1;
                    padding: 0 4px;
                    transition: color 0.2s;
                }
                .lc-diff-viewer-bar .close-btn:hover { color: #f85149; }
                .lc-diff-viewer-iframe {
                    flex: 1;
                    border: none;
                    width: 100%;
                }
            `;
            document.head.appendChild(style);
        }

        // Create overlay
        const overlay = document.createElement('div');
        overlay.className = 'lc-diff-viewer-overlay';

        // Title bar (draggable)
        const bar = document.createElement('div');
        bar.className = 'lc-diff-viewer-bar';

        const titleSpan = document.createElement('span');
        titleSpan.className = 'title';
        titleSpan.textContent = '\u2705 Verified Fix';

        if (meta.attempts || meta.testCount) {
            const metaSpan = document.createElement('span');
            metaSpan.className = 'meta';
            metaSpan.textContent = `${meta.attempts || 1} attempt(s), ${meta.testCount || 0} tests passed`;
            titleSpan.appendChild(metaSpan);
        }

        const closeBtn = document.createElement('button');
        closeBtn.className = 'close-btn';
        closeBtn.textContent = '\u00d7';
        closeBtn.onclick = () => {
            overlay.classList.remove('show');
            setTimeout(() => overlay.remove(), 300);
        };

        bar.appendChild(titleSpan);
        bar.appendChild(closeBtn);

        // Make draggable
        let isDragging = false, dragX = 0, dragY = 0;
        bar.addEventListener('mousedown', (e) => {
            isDragging = true;
            dragX = e.clientX - overlay.offsetLeft;
            dragY = e.clientY - overlay.offsetTop;
            document.addEventListener('mousemove', onDrag);
            document.addEventListener('mouseup', () => {
                isDragging = false;
                document.removeEventListener('mousemove', onDrag);
            }, { once: true });
        });
        function onDrag(e) {
            if (!isDragging) return;
            overlay.style.left = (e.clientX - dragX) + 'px';
            overlay.style.top = (e.clientY - dragY) + 'px';
            overlay.style.right = 'auto';
            overlay.style.bottom = 'auto';
        }

        // Monaco iframe
        const iframe = document.createElement('iframe');
        iframe.className = 'lc-diff-viewer-iframe';
        iframe.src = chrome.runtime.getURL('src/diff_viewer.html');

        // Send data once iframe signals ready
        console.log(`[DiffViewer] showFixDiffViewer called. originalCode: ${originalCode?.length} chars, fixedCode: ${fixedCode?.length} chars`);
        window.addEventListener('message', function handler(event) {
            if (event.data && event.data.type === 'diff-viewer-ready') {
                window.removeEventListener('message', handler);
                console.log('[DiffViewer] iframe ready, sending diff data');
                iframe.contentWindow.postMessage({
                    type: 'diff-data',
                    originalCode,
                    fixedCode,
                    attempts: meta.attempts,
                    testCount: meta.testCount
                }, '*');
            }
        });

        overlay.appendChild(bar);
        overlay.appendChild(iframe);
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('show'));
    }

    return {
        showCompletionToast,
        showDuplicateSkipToast,
        showRatingModal,
        showAnalysisModal,
        showAnalysisProgress, // New Export
        showFixDiffViewer,
        createNotesWidget,
        insertNotesButton
    };
}));
