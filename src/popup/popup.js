/**
 * LeetCode EasyRepeat - Popup Script
 */
const THEMES = window.THEMES || {};

console.log('[Popup] Resolved THEMES:', THEMES);

import { renderGlobalHeatmap, renderVectors, showNotification } from './popup_ui.js';

let currentTheme = 'sakura';
let currentLanguage = 'en';
let currentView = 'dashboard';
let currentDueProblems = [];
let currentAllProblems = [];
let currentTitleCache = {};
let storageListenersReady = false;
let clockIntervalId = null;
let sidebarReady = false;
let localizedTitleHydrationInFlight = false;
let themePersistInFlight = false;
let queuedThemeForPersist = null;
let currentFilters = { difficulty: 'all', topic: 'all', timeRange: 'all' };
let currentLeetCodeBase = 'https://leetcode.com';

const LEETCODE_HOSTS = new Set(['leetcode.com', 'leetcode.cn']);

function deriveLeetCodeBase(url) {
    if (!url) return null;
    try {
        const parsed = new URL(url);
        if (!LEETCODE_HOSTS.has(parsed.hostname)) return null;
        return `${parsed.protocol}//${parsed.hostname}`;
    } catch (e) {
        return null;
    }
}

function isLeetCodeProblemUrl(url) {
    if (!url) return false;
    try {
        const parsed = new URL(url);
        if (!LEETCODE_HOSTS.has(parsed.hostname)) return false;
        return /^\/problems\/[^/]+/.test(parsed.pathname);
    } catch (e) {
        return false;
    }
}

async function resolveLeetCodeBaseUrl() {
    const fallbackBase = currentLeetCodeBase || 'https://leetcode.com';

    if (chrome?.tabs?.query) {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const base = deriveLeetCodeBase(tab && tab.url);
            if (base) {
                currentLeetCodeBase = base;
                if (chrome?.storage?.local?.set) {
                    await chrome.storage.local.set({ lastLeetCodeBase: base });
                }
                return base;
            }
        } catch (e) {
            console.warn('[Popup] Could not resolve active tab base URL:', e);
        }
    }

    if (chrome?.storage?.local?.get) {
        try {
            const result = await chrome.storage.local.get({ lastLeetCodeBase: fallbackBase });
            return result.lastLeetCodeBase || fallbackBase;
        } catch (e) {
            console.warn('[Popup] Could not read stored base URL:', e);
        }
    }

    return fallbackBase;
}

function getI18n() {
    return window.EasyRepeatI18n || null;
}

function getProblemTitles() {
    return window.EasyRepeatProblemTitles || null;
}

function t(key, values = {}) {
    const i18n = getI18n();
    return i18n ? i18n.t(key, values, currentLanguage) : key;
}

function getThemeNames() {
    const themeNames = Object.keys(THEMES);
    return themeNames.length > 0 ? themeNames : ['sakura'];
}

function getNextThemeName(themeName) {
    const themeNames = getThemeNames();
    const currentIndex = themeNames.indexOf(themeName);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    return themeNames[(safeIndex + 1) % themeNames.length];
}

async function flushQueuedThemePersist() {
    if (themePersistInFlight || !chrome?.storage?.local?.set) return;
    themePersistInFlight = true;

    try {
        while (queuedThemeForPersist !== null) {
            const themeToPersist = queuedThemeForPersist;
            queuedThemeForPersist = null;
            await chrome.storage.local.set({ theme: themeToPersist });
        }
    } catch (error) {
        console.warn('[Popup] Failed to persist theme:', error);
    } finally {
        themePersistInFlight = false;
    }
}

function queueThemePersist(themeName) {
    queuedThemeForPersist = themeName;
    void flushQueuedThemePersist();
}

document.addEventListener('DOMContentLoaded', async () => {
    await setupTheme();
    await setupLanguage();
    setupOptionsButton();
    setupSidebar();
    await setupFilters();
    await updateDashboard();
    setupStorageListeners();
});

function setupStorageListeners() {
    if (storageListenersReady) return;
    if (!chrome?.storage?.onChanged) return;
    storageListenersReady = true;

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local') return;
        if (changes.problems || changes.localizedProblemTitles) {
            void updateDashboard();
        }
    });
}

async function setupTheme() {
    const storage = await chrome.storage.local.get({ theme: 'sakura' });
    currentTheme = storage.theme === 'neural' ? 'typography' : storage.theme;
    applyTheme(currentTheme);

    const themeButton = document.getElementById('btn-theme');
    if (!themeButton) return;

    themeButton.onclick = () => {
        currentTheme = getNextThemeName(currentTheme);
        applyTheme(currentTheme);
        queueThemePersist(currentTheme);
    };
}

async function setupLanguage() {
    const i18n = getI18n();
    const button = document.getElementById('lang-toggle');
    currentLanguage = i18n ? await i18n.getLanguage() : 'en';
    applyLanguage(currentLanguage);

    if (button) {
        button.onclick = async () => {
            if (!i18n) return;
            currentLanguage = await i18n.toggleLanguage();
            applyLanguage(currentLanguage);
            await updateDashboard();
        };
    }

    if (i18n && typeof i18n.onLanguageChange === 'function') {
        i18n.onLanguageChange((nextLanguage) => {
            if (nextLanguage === currentLanguage) return;
            currentLanguage = nextLanguage;
            applyLanguage(currentLanguage);
            void updateDashboard();
        });
    }
}

function applyLanguage(language) {
    const i18n = getI18n();
    currentLanguage = language;

    if (i18n && typeof i18n.applyTranslations === 'function') {
        i18n.applyTranslations(document, currentLanguage);
    }

    const button = document.getElementById('lang-toggle');
    const label = document.getElementById('lang-toggle-label');
    if (button && i18n) {
        if (label) {
            label.textContent = i18n.getToggleLabel(currentLanguage);
        }
        button.title = t('common_ui_language');
    }

    applyTheme(currentTheme);
    updateQueueTitle();
    rerenderCurrentView();
}

function setupOptionsButton() {
    const btn = document.getElementById('btn-setup');
    if (!btn) return;

    btn.onclick = () => {
        if (chrome?.runtime?.openOptionsPage) {
            chrome.runtime.openOptionsPage();
        } else {
            const url = chrome.runtime.getURL('dist/src/options/options.html');
            window.open(url, '_blank');
        }
    };
}

function applyTheme(themeName) {
    const theme = THEMES[themeName];
    if (!theme) return;

    const root = document.documentElement;
    root.style.setProperty('--terminal', theme.terminal);
    root.style.setProperty('--electric', theme.electric);
    root.style.setProperty('--accent', theme.accent);
    root.style.setProperty('--border-glow', theme.borderGlow);
    root.style.setProperty('--border-dim', theme.borderDim);
    root.style.setProperty('--cell-1', theme.cellColors[0]);
    root.style.setProperty('--cell-2', theme.cellColors[1]);
    root.style.setProperty('--cell-3', theme.cellColors[2]);
    root.style.setProperty('--cell-4', theme.cellColors[3]);
    root.style.setProperty('--font-main', theme.fontMain);
    root.style.setProperty('--font-data', theme.fontData);
    root.style.setProperty('--radius', theme.borderRadius);
    root.style.setProperty('--scanline-opacity', theme.scanlineOpacity);
    root.style.setProperty('--glass-opacity', theme.glassOpacity);
    root.style.setProperty('--backdrop-filter', theme.backdropFilter);
    root.style.setProperty('--bg-main', theme.bgMain);
    root.style.setProperty('--hover-bg', theme.hoverBg);
    root.style.setProperty('--glass', theme.glass || 'rgba(20, 10, 15, 0.85)');

    document.body.className = `theme-${themeName}`;

    const statusBar = document.querySelector('.status-bar');
    if (statusBar) statusBar.style.background = theme.statusBg;

    const container = document.querySelector('.extension-container');
    if (container) container.style.boxShadow = `0 0 20px ${theme.containerShadow}`;

    renderGlobalHeatmap();

    const brandTitle = document.getElementById('brand-title');
    if (brandTitle) {
        brandTitle.innerText = themeName === 'brnd' ? 'BRND.OS' : t('popup_brand');
    }
}

async function updateDashboard() {
    const result = await chrome.storage.local.get({ problems: {}, localizedProblemTitles: {} });
    const problems = Object.values(result.problems);
    const now = getCurrentDate();

    const dueProblems = problems.filter(problem => new Date(problem.nextReviewDate) <= now);
    dueProblems.sort((a, b) => new Date(a.nextReviewDate) - new Date(b.nextReviewDate));
    problems.sort((a, b) => new Date(a.nextReviewDate) - new Date(b.nextReviewDate));

    currentDueProblems = dueProblems;
    currentAllProblems = problems;
    currentTitleCache = result.localizedProblemTitles || {};

    currentLeetCodeBase = await resolveLeetCodeBaseUrl();

    const streakValueEl = document.getElementById('streak-value');
    if (streakValueEl) {
        const streakCount = await calculateStreakFn();
        streakValueEl.innerText = String(streakCount);
    } else {
        const streakEl = document.getElementById('streak-display');
        if (streakEl) {
            const streakCount = await calculateStreakFn();
            streakEl.innerText = `${t('popup_streak_days')} ${streakCount}`;
        }
    }

    rerenderCurrentView();
    populateTopicDropdown(problems);
    renderGlobalHeatmap();
    updateClock();
    if (!clockIntervalId) {
        clockIntervalId = setInterval(updateClock, 1000);
    }

    await syncCurrentProblemDifficulty();
    void hydrateLocalizedTitles(problems);
}

function rerenderCurrentView() {
    const baseProblems = currentView === 'all' ? currentAllProblems : currentDueProblems;

    // Apply filters
    const PopupFilter = window.PopupFilter;
    let problems = baseProblems;
    if (PopupFilter && PopupFilter.filterProblems) {
        problems = PopupFilter.filterProblems(baseProblems, currentFilters);
    }

    renderVectors(problems, 'vector-list', currentView === 'dashboard', {
        language: currentLanguage,
        titleCache: currentTitleCache,
        problemUrlBase: currentLeetCodeBase
    });
    updateQueueTitle();
    syncSidebarState();
}

function setupSidebar() {
    if (sidebarReady) {
        syncSidebarState();
        return;
    }

    sidebarReady = true;
    const tabDash = document.getElementById('tab-dashboard');
    const tabAll = document.getElementById('tab-all');

    if (tabDash) {
        tabDash.onclick = () => {
            currentView = 'dashboard';
            rerenderCurrentView();
        };
    }

    if (tabAll) {
        tabAll.onclick = () => {
            currentView = 'all';
            rerenderCurrentView();
        };
    }

    syncSidebarState();
}

function syncSidebarState() {
    const tabDash = document.getElementById('tab-dashboard');
    const tabAll = document.getElementById('tab-all');
    if (!tabDash || !tabAll) return;

    tabDash.classList.toggle('active', currentView === 'dashboard');
    tabAll.classList.toggle('active', currentView === 'all');
}

function updateQueueTitle() {
    const title = document.getElementById('queue-title');
    if (!title) return;
    title.innerText = currentView === 'all'
        ? t('popup_queue_all_problems')
        : t('popup_queue_due_today');
}

/**
 * Set up filter dropdowns: restore persisted selections, populate topic list.
 */
async function setupFilters() {
    // Restore persisted filter selections
    try {
        const stored = await chrome.storage.local.get({ popupFilters: null });
        if (stored.popupFilters) {
            currentFilters = { ...currentFilters, ...stored.popupFilters };
        }
    } catch (e) {
        console.warn('[Popup] Could not restore filters:', e);
    }

    const difficultySelect = document.getElementById('filter-difficulty');
    const topicSelect = document.getElementById('filter-topic');
    const timeSelect = document.getElementById('filter-time');

    // Set initial values from persisted state
    if (difficultySelect) difficultySelect.value = currentFilters.difficulty || 'all';
    if (timeSelect) timeSelect.value = currentFilters.timeRange || 'all';

    // Wire change listeners
    const onFilterChange = () => {
        if (difficultySelect) currentFilters.difficulty = difficultySelect.value;
        if (topicSelect) currentFilters.topic = topicSelect.value;
        if (timeSelect) currentFilters.timeRange = timeSelect.value;

        rerenderCurrentView();
        void persistFilters();
    };

    if (difficultySelect) difficultySelect.addEventListener('change', onFilterChange);
    if (topicSelect) topicSelect.addEventListener('change', onFilterChange);
    if (timeSelect) timeSelect.addEventListener('change', onFilterChange);
}

/**
 * Populate the topic dropdown from all known problems.
 */
function populateTopicDropdown(allProblems) {
    const topicSelect = document.getElementById('filter-topic');
    if (!topicSelect) return;

    const PopupFilter = window.PopupFilter;
    const topics = PopupFilter ? PopupFilter.extractAllTopics(allProblems) : [];

    // Preserve current selection
    const currentValue = topicSelect.value;

    // Clear existing options except the first ("All Topics")
    while (topicSelect.options.length > 1) {
        topicSelect.remove(1);
    }

    // Add topic options
    for (const topic of topics) {
        const option = document.createElement('option');
        option.value = topic;
        const i18n = getI18n();
        option.textContent = (i18n && typeof i18n.translateTopic === 'function') 
            ? i18n.translateTopic(topic, currentLanguage) 
            : topic;
        topicSelect.appendChild(option);
    }

    // Restore selection if it still exists
    if (currentValue && topics.includes(currentValue)) {
        topicSelect.value = currentValue;
    } else {
        topicSelect.value = 'all';
        currentFilters.topic = 'all';
    }
}

/**
 * Persist current filter selections across popup open/close.
 */
async function persistFilters() {
    try {
        await chrome.storage.local.set({ popupFilters: currentFilters });
    } catch (e) {
        console.warn('[Popup] Could not persist filters:', e);
    }
}

async function hydrateLocalizedTitles(problems) {
    if (currentLanguage !== 'zh') return;
    const problemTitles = getProblemTitles();
    if (!problemTitles || localizedTitleHydrationInFlight) return;

    const missing = (problems || [])
        .map(problem => problem.slug)
        .filter(slug => slug && !currentTitleCache[slug]?.zh);

    if (!missing.length) return;

    localizedTitleHydrationInFlight = true;
    try {
        await problemTitles.ensureLocalizedTitles(missing, { language: currentLanguage });
    } finally {
        localizedTitleHydrationInFlight = false;
    }
}

async function syncCurrentProblemDifficulty() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url || !isLeetCodeProblemUrl(tab.url)) return;

        const derivedBase = deriveLeetCodeBase(tab.url);
        if (derivedBase) {
            currentLeetCodeBase = derivedBase;
        }

        const match = tab.url.match(/\/problems\/([^\/]+)/);
        if (!match) return;
        const currentSlug = match[1];

        chrome.tabs.sendMessage(tab.id, { action: 'getDifficulty' }, async (response) => {
            if (chrome.runtime.lastError || !response || !response.difficulty) return;

            const result = await chrome.storage.local.get({ problems: {} });
            const problems = result.problems;

            if (problems[currentSlug] && problems[currentSlug].difficulty !== response.difficulty) {
                console.log(`[Popup] Syncing difficulty for ${currentSlug}: ${problems[currentSlug].difficulty} -> ${response.difficulty}`);
                problems[currentSlug].difficulty = response.difficulty;
                await chrome.storage.local.set({ problems });
                await updateDashboard();
            }
        });
    } catch (e) {
        console.warn('[Popup] Could not sync difficulty:', e);
    }
}

function updateClock() {
    const now = new Date();
    const dateStr = now.getFullYear() + '-' +
        (now.getMonth() + 1).toString().padStart(2, '0') + '-' +
        now.getDate().toString().padStart(2, '0');
    const time = now.getHours().toString().padStart(2, '0') + ':' +
        now.getMinutes().toString().padStart(2, '0') + ':' +
        now.getSeconds().toString().padStart(2, '0');
    const el = document.getElementById('clock');
    if (el) el.innerText = `${dateStr} ${time}`;
}

function toggleViews() {
    const dash = document.querySelector('.heatmap-container');
    const list = document.querySelector('#vector-list')?.parentElement;
    if (dash) dash.style.display = 'block';
    if (list) list.style.display = 'block';
}

toggleViews();

async function calculateStreakFn() {
    const res = await chrome.storage.local.get({ problems: {}, activityLog: null });
    let log = res.activityLog;
    const problems = res.problems;

    if (!log) {
        log = [];
        Object.values(problems).forEach(problem => {
            if (problem.history) {
                problem.history.forEach(historyEntry => {
                    const dateObj = new Date(historyEntry.date);
                    const dateStr = dateObj.getFullYear() + '-' +
                        (dateObj.getMonth() + 1).toString().padStart(2, '0') + '-' +
                        dateObj.getDate().toString().padStart(2, '0');
                    if (!log.includes(dateStr)) log.push(dateStr);
                });
            }
        });
        log.sort();
        console.log('[Streak] Migrated history to Activity Log:', log);
        await chrome.storage.local.set({ activityLog: log });
    }

    let streak = 0;
    const checkDate = getCurrentDate();

    for (let i = 0; i < 3650; i++) {
        const checkStr = checkDate.getFullYear() + '-' +
            (checkDate.getMonth() + 1).toString().padStart(2, '0') + '-' +
            checkDate.getDate().toString().padStart(2, '0');

        if (log.includes(checkStr)) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
        } else if (i === 0) {
            checkDate.setDate(checkDate.getDate() - 1);
        } else {
            break;
        }
    }
    return streak;
}

function getCurrentDate() {
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    return now;
}

async function updateProblemSRS(slug, ease) {
    const result = await chrome.storage.local.get({ problems: {} });
    const problems = result.problems;
    const problem = problems[slug];

    if (!problem) return;

    let nextStep;
    const now = getCurrentDate();
    const nowISO = now.toISOString();

    let rating = 3;
    if (ease <= 1.1) rating = 1;
    else if (ease < 2.0) rating = 2;
    else if (ease > 3.0) rating = 4;

    if (typeof fsrs !== 'undefined' && fsrs.calculateFSRS) {
        const lastReview = problem.fsrs_last_review ? new Date(problem.fsrs_last_review) : (problem.lastSolved ? new Date(problem.lastSolved) : new Date());
        const elapsed = Math.max(0, (now - lastReview) / (1000 * 60 * 60 * 24));
        const card = {
            state: problem.fsrs_state || (problem.repetition > 0 ? 'Review' : 'New'),
            stability: problem.fsrs_stability || 0,
            difficulty: problem.fsrs_difficulty || 0,
            last_review: lastReview
        };

        const res = fsrs.calculateFSRS(card, rating, elapsed);
        nextStep = {
            nextInterval: res.nextInterval,
            nextRepetition: problem.repetition + 1,
            nextEaseFactor: problem.easeFactor,
            nextReviewDate: (() => {
                const date = new Date(now);
                date.setDate(date.getDate() + res.nextInterval);
                return date.toISOString();
            })(),
            fsrs_stability: res.newStability,
            fsrs_difficulty: res.newDifficulty,
            fsrs_state: res.nextState,
            fsrs_last_review: nowISO
        };
    } else {
        if (typeof calculateNextReview !== 'function') {
            console.error('SRS Logic not loaded');
            return;
        }
        nextStep = calculateNextReview(problem.interval, problem.repetition, ease, now);
    }

    problems[slug] = {
        ...problem,
        interval: nextStep.nextInterval,
        repetition: nextStep.nextRepetition,
        easeFactor: nextStep.nextEaseFactor,
        nextReviewDate: nextStep.nextReviewDate,
        fsrs_stability: nextStep.fsrs_stability,
        fsrs_difficulty: nextStep.fsrs_difficulty,
        fsrs_state: nextStep.fsrs_state,
        fsrs_last_review: nextStep.fsrs_last_review,
        history: [...problem.history, { date: nowISO, status: 'Reviewed', rating }]
    };

    await chrome.storage.local.set({ problems });
    await updateDashboard();
}

async function deleteProblem(slug) {
    if (!confirm(t('popup_delete_confirm', { slug }))) {
        return;
    }

    const result = await chrome.storage.local.get({ problems: {} });
    const problems = result.problems;

    if (problems[slug]) {
        delete problems[slug];
        await chrome.storage.local.set({ problems });
        await updateDashboard();
    }
}

if (typeof window !== 'undefined') {
    window.deleteProblem = deleteProblem;
    window.updateProblemSRS = updateProblemSRS;
    window.getCurrentDate = getCurrentDate;
    window.showNotification = showNotification;
}

if (typeof module !== 'undefined') {
    module.exports = {
        updateDashboard,
        calculateStreak: calculateStreakFn,
        setupSidebar
    };
}
