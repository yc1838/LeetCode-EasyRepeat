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
    async function showCompletionToast(title, nextDate, options = {}) {
        const existing = document.querySelector('.lc-srs-toast');
        if (existing) existing.remove();

        const existingStyles = document.querySelector('#lc-srs-toast-styles');
        if (existingStyles) existingStyles.remove();

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
        const language = await getCurrentLanguage();
        const displayTitle = await resolveDisplayTitle(title, {
            slug: options.slug,
            language
        });

        const style = document.createElement('style');
        style.id = 'lc-srs-toast-styles';
        style.textContent = `
            @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap');
            .lc-srs-toast, .lc-srs-toast * { all: revert !important; box-sizing: border-box !important; }
            .lc-srs-toast {
                position: fixed !important; bottom: 30px !important; right: 30px !important;
                z-index: 999999 !important; opacity: 0 !important; transform: translateY(20px) !important;
                transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1) !important; pointer-events: none !important;
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
        document.head.appendChild(style);

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
        document.body.appendChild(toast);

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

                ratings.forEach(r => {
                    const btn = document.createElement('button');
                    btn.className = `lc-rating-btn rating-btn-${r.tone}`;

                    // Construct button content
                    const labelDiv = document.createElement('div');
                    labelDiv.className = 'lc-rating-btn-label';
                    labelDiv.innerText = r.label;

                    const descDiv = document.createElement('div');
                    descDiv.className = 'lc-rating-btn-desc';
                    descDiv.innerText = r.desc;

                    btn.appendChild(labelDiv);
                    btn.appendChild(descDiv);

                    btn.addEventListener('click', () => {
                        backdrop.remove();
                        resolve(r.value);
                    });
                    btnContainer.appendChild(btn);
                });

                modal.appendChild(header);
                modal.appendChild(sub);
                modal.appendChild(hint);
                modal.appendChild(btnContainer);
                backdrop.appendChild(modal);
                document.body.appendChild(backdrop);

                // Allow closing by clicking backdrop (optional safety, returning null/undefined)
                /*
                backdrop.onclick = (e) => {
                    if (e.target === backdrop) {
                        backdrop.remove();
                        // resolve(null); // Or just close
                    }
                };
                */
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
                    position: fixed; bottom: 30px; right: 30px;
                    z-index: 999999;
                    background: rgba(10, 10, 10, 0.95);
                    border: 1px solid #333;
                    border-radius: 8px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                    padding: 16px;
                    width: 300px;
                    font-family: 'JetBrains Mono', monospace;
                    display: flex; flex-direction: column; gap: 12px;
                    transform: translateY(100px); opacity: 0;
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
                
                .lc-progress-track {
                    height: 4px; background: #333; border-radius: 2px; overflow: hidden;
                    position: relative;
                }
                .lc-progress-bar {
                    height: 100%; background: #22d3ee; width: 0%;
                    transition: width 0.3s linear;
                    position: absolute; left: 0; top: 0;
                }
                /* Indeterminate animation */
                .lc-progress-bar.indeterminate {
                    width: 30%;
                    animation: lc-indeterminate 1.5s infinite ease-in-out;
                }
                @keyframes lc-indeterminate {
                    0% { left: -30%; }
                    100% { left: 100%; }
                }

                .lc-analysis-cancel-btn {
                    background: transparent; border: 1px solid #ef4444;
                    color: #ef4444; border-radius: 4px; padding: 4px 8px;
                    font-size: 11px; cursor: pointer; transition: all 0.2s;
                    align-self: flex-end;
                }
                .lc-analysis-cancel-btn:hover { background: #ef4444; color: #fff; }
            `;
            document.head.appendChild(style);
        }

        const container = document.createElement('div');
        container.className = 'lc-analysis-progress';
        let liveLanguage = 'en';

        const renderProgressUI = (language) => {
            container.innerHTML = `
                <div class="lc-analysis-header">
                    <div class="lc-analysis-status">
                        <div class="lc-spinner"></div>
                        <span>${translate('content_analyzing_request', {}, language)}</span>
                    </div>
                </div>
                <div class="lc-progress-track">
                    <div class="lc-progress-bar indeterminate"></div>
                </div>
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
        document.body.appendChild(container); // Fix: Append to body immediately
        getCurrentLanguage().then((language) => {
            liveLanguage = language;
            renderProgressUI(language);
        }).catch(() => { });

        // Animate in
        requestAnimationFrame(() => container.classList.add('show'));

        function close() {
            container.classList.remove('show');
            setTimeout(() => container.remove(), 300);
        }

        function update(text, percent) {
            const statusText = container.querySelector('.lc-analysis-status span');
            if (statusText) {
                if (text === 'Analysis Complete') {
                    statusText.innerText = translate('content_analysis_complete', {}, liveLanguage);
                } else if (typeof text === 'string' && text.startsWith('Error: ')) {
                    statusText.innerText = `${translate('common_error', {}, liveLanguage)}: ${text.slice(7)}`;
                } else {
                    statusText.innerText = text;
                }
            }

            // If we ever want real progress
            // const bar = container.querySelector('.lc-progress-bar');
            // bar.classList.remove('indeterminate');
            // bar.style.width = percent + '%';
        }

        return { close, update };
    }

    return {
        showCompletionToast,
        showRatingModal,
        showAnalysisModal,
        showAnalysisProgress, // New Export
        createNotesWidget,
        insertNotesButton
    };
}));
