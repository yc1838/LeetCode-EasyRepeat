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
let dataLoaded = false;
let currentLeetCodeBase = 'https://leetcode.com';
let currentLeave = { leaveDays: [], settings: null, isLeaveToday: false };
let currentBatchSize = 3;
let currentVisibleProblems = [];
let currentPlan = null;
let showAllDue = false;

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

function getLeaveLogic() {
    return (typeof window !== 'undefined' && window.LeaveLogic) || null;
}

function getReviewReset() {
    return (typeof window !== 'undefined' && window.ReviewReset) || null;
}

/* ------------------------------------------------------------------ */
/* Batch open (一次打开 N 题)                                           */
/* ------------------------------------------------------------------ */

async function setupBatchBar() {
    const RR = getReviewReset();
    const input = document.getElementById('batch-count');
    const button = document.getElementById('btn-open-batch');
    if (!input || !button) return;

    try {
        const stored = await chrome.storage.local.get({ [RR ? RR.BATCH_KEY : 'reviewBatchSize']: 3 });
        currentBatchSize = RR ? RR.clampBatch(stored[RR.BATCH_KEY]) : 3;
    } catch (e) {
        currentBatchSize = 3;
    }
    input.value = String(currentBatchSize);
    if (RR) input.max = String(RR.MAX_BATCH);

    input.addEventListener('change', () => {
        currentBatchSize = RR ? RR.clampBatch(input.value) : Math.max(1, Number(input.value) || 1);
        input.value = String(currentBatchSize);
        renderBatchBar();
        void chrome.storage.local.set({ [RR ? RR.BATCH_KEY : 'reviewBatchSize']: currentBatchSize });
    });

    button.addEventListener('click', () => {
        const RRx = getReviewReset();
        const count = RRx ? RRx.clampBatch(currentBatchSize, currentVisibleProblems.length) : currentBatchSize;
        if (count <= 0) return;
        void openReviewTabs(currentVisibleProblems.slice(0, count));
    });
}

function renderBatchBar() {
    const bar = document.getElementById('batch-bar');
    if (!bar) return;
    const isDashboard = currentView === 'dashboard';
    bar.style.display = isDashboard ? 'flex' : 'none';
    const button = document.getElementById('btn-open-batch');
    const RR = getReviewReset();
    const available = currentVisibleProblems.length;
    const count = RR ? RR.clampBatch(currentBatchSize, available) : Math.min(currentBatchSize, available);
    if (button) {
        button.disabled = count <= 0;
        button.innerText = t('popup_batch_open', { count });
    }
    const pre = document.getElementById('batch-label-pre');
    const post = document.getElementById('batch-label-post');
    if (pre) pre.innerText = t('popup_batch_label_pre');
    if (post) post.innerText = t('popup_batch_label_post', { available });
}

/**
 * Open problems as review tabs: mark each slug for an editor reset, then open
 * the tabs in the background (activating the first one last, because focusing a
 * tab closes the popup and would stop this loop).
 */
async function openReviewTabs(problemList) {
    const RR = getReviewReset();
    const list = (problemList || []).filter(p => p && p.slug);
    if (!list.length || !chrome?.tabs?.create) return;

    if (RR) {
        try {
            const nowMs = Date.now();
            const stored = await chrome.storage.local.get({ [RR.STORAGE_KEY]: {} });
            const markers = RR.mark(stored[RR.STORAGE_KEY], list.map(p => p.slug), nowMs);
            await chrome.storage.local.set({ [RR.STORAGE_KEY]: markers });
        } catch (e) {
            console.warn('[Popup] Could not mark review resets:', e);
        }
    }

    const urlFor = (slug) => (RR ? RR.problemUrl(currentLeetCodeBase, slug) : `${currentLeetCodeBase}/problems/${slug}/`);
    const created = [];
    for (const problem of list) {
        try {
            created.push(await chrome.tabs.create({ url: urlFor(problem.slug), active: false }));
        } catch (e) {
            console.warn('[Popup] Could not open tab for', problem.slug, e);
        }
    }
    const first = created.find(tab => tab && tab.id !== undefined);
    if (first && chrome.tabs.update) {
        await chrome.tabs.update(first.id, { active: true });
    }
}

/* ------------------------------------------------------------------ */
/* Daily reviews (每天推荐复习量)                                        */
/* ------------------------------------------------------------------ */

/**
 * Today's recommended number of reviews, logged for tomorrow's adjustment,
 * and the due list split into today's share and the rest.
 */
async function computeDailyPlan(problemMap, dueProblems) {
    const DR = window.DailyReviews;
    if (!DR) return null;
    const RL = window.Relearn;
    const now = new Date();
    const stored = await chrome.storage.local.get({ dailyReviews: null, dailyReviewSettings: null });
    const day = DR.today(problemMap, now, stored.dailyReviews, stored.dailyReviewSettings, currentLeave.leaveDays);
    const done = DR.reviewsOn(problemMap, DR.toKey(now));
    let state = day.state;
    let changed = day.changed;
    if (!currentLeave.isLeaveToday) {
        const logged = DR.logDay(state, now, day.recommended, done + dueProblems.length);
        state = logged.state;
        changed = changed || logged.changed;
    }
    if (changed) await chrome.storage.local.set({ dailyReviews: state });
    const parts = DR.split(dueProblems, day.recommended - done, RL ? RL.currentStep : undefined);
    return { recommended: day.recommended, fixed: day.fixed, done, today: parts.today, later: parts.later };
}

function setupPlanBar() {
    const button = document.getElementById('btn-plan-toggle');
    if (!button) return;
    button.addEventListener('click', () => {
        showAllDue = !showAllDue;
        void updateDashboard();
    });
}

function renderPlanBar() {
    const bar = document.getElementById('plan-bar');
    const status = document.getElementById('plan-status');
    const button = document.getElementById('btn-plan-toggle');
    if (!bar || !status || !button) return;
    const p = currentPlan;
    if (!p || currentView !== 'dashboard') {
        bar.style.display = 'none';
        return;
    }
    bar.style.display = 'flex';
    const left = Math.max(0, p.recommended - p.done);
    let text = t(p.fixed ? 'popup_plan_line_fixed' : 'popup_plan_line', { rec: p.recommended, done: p.done, left });
    if (p.later.length) text += ` · ${t('popup_plan_more', { count: p.later.length })}`;
    status.innerText = text;
    button.style.display = p.later.length ? '' : 'none';
    button.innerText = showAllDue ? t('popup_plan_show_today') : t('popup_plan_show_all');
}

/* ------------------------------------------------------------------ */
/* Leave (请假)                                                         */
/* ------------------------------------------------------------------ */

/**
 * Apply the one-day schedule shift for leave days that have arrived.
 * Returns the (possibly updated) problem map.
 */
async function applyArrivedLeaveDays(problemMap, now) {
    const LeaveLogic = getLeaveLogic();
    const stored = await chrome.storage.local.get({ leaveDays: [], leaveApplied: [], leaveSettings: null });
    currentLeave = {
        leaveDays: Array.isArray(stored.leaveDays) ? stored.leaveDays : [],
        settings: stored.leaveSettings,
        isLeaveToday: false
    };
    if (!LeaveLogic) return problemMap;

    currentLeave.isLeaveToday = currentLeave.leaveDays.includes(LeaveLogic.toKey(now));

    const result = LeaveLogic.applyArrivedLeaves(problemMap, currentLeave.leaveDays, stored.leaveApplied, now);
    if (!result.changed) return problemMap;

    // Re-read right before writing to keep any concurrent submission save.
    const fresh = await chrome.storage.local.get({ problems: {}, leaveApplied: [] });
    const recomputed = LeaveLogic.applyArrivedLeaves(fresh.problems, currentLeave.leaveDays, fresh.leaveApplied, now);
    if (!recomputed.changed) return fresh.problems;
    await chrome.storage.local.set({ problems: recomputed.problems, leaveApplied: recomputed.leaveApplied });
    console.log('[Popup] Applied leave days:', recomputed.appliedNow);
    return recomputed.problems;
}

function setupLeaveBar() {
    const button = document.getElementById('btn-leave-today');
    if (!button) return;
    button.addEventListener('click', () => { void requestLeaveToday(); });
}

function renderLeaveBar() {
    const bar = document.getElementById('leave-bar');
    const status = document.getElementById('leave-status');
    const button = document.getElementById('btn-leave-today');
    const LeaveLogic = getLeaveLogic();
    if (!bar || !status || !button || !LeaveLogic) return;

    bar.style.display = currentView === 'dashboard' ? 'flex' : 'none';
    const today = getCurrentDate();
    const settings = LeaveLogic.normalizeSettings(currentLeave.settings);

    if (!settings.initialized) {
        status.innerText = t('popup_leave_not_configured');
        button.innerText = t('popup_leave_setup');
        button.disabled = false;
        button.dataset.mode = 'setup';
        return;
    }

    const r = LeaveLogic.remaining(settings, currentLeave.leaveDays, today);
    status.innerText = t('popup_leave_remaining', {
        week: r.week.left, weekLimit: r.week.limit,
        month: r.month.left, monthLimit: r.month.limit
    });
    button.dataset.mode = 'request';
    if (currentLeave.isLeaveToday) {
        button.innerText = t('popup_leave_taken');
        button.disabled = true;
    } else {
        button.innerText = t('popup_leave_request');
        button.disabled = r.week.left <= 0 || r.month.left <= 0;
    }
}

async function requestLeaveToday() {
    const LeaveLogic = getLeaveLogic();
    const button = document.getElementById('btn-leave-today');
    if (!LeaveLogic) return;

    if (button && button.dataset.mode === 'setup') {
        if (chrome?.runtime?.openOptionsPage) chrome.runtime.openOptionsPage();
        return;
    }

    const today = getCurrentDate();
    const todayKey = LeaveLogic.toKey(today);
    const stored = await chrome.storage.local.get({ leaveDays: [], leaveSettings: null });
    const result = LeaveLogic.addLeave(todayKey, { leaveDays: stored.leaveDays, settings: stored.leaveSettings, today });
    if (!result.ok) {
        showNotification('error', t('popup_leave_failed'), t(`leave_reason_${result.reason}`), { language: currentLanguage });
        return;
    }
    if (!confirm(t('popup_leave_confirm'))) return;

    await chrome.storage.local.set({ leaveDays: result.leaveDays });
    await updateDashboard();
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
    console.log('[Popup][DIAG] DOMContentLoaded fired at', Date.now());
    try {
        console.log('[Popup][DIAG] Step 1: setupTheme...');
        await setupTheme();
        console.log('[Popup][DIAG] Step 2: setupLanguage...');
        await setupLanguage();
        console.log('[Popup][DIAG] Step 3: setupOptionsButton...');
        setupOptionsButton();
        console.log('[Popup][DIAG] Step 4: setupSidebar...');
        setupSidebar();
        console.log('[Popup][DIAG] Step 5: setupFilters...');
        await setupFilters();
        await setupBatchBar();
        setupLeaveBar();
        setupPlanBar();
        console.log('[Popup][DIAG] Step 6: updateDashboard...');
        await updateDashboard();
        console.log('[Popup][DIAG] Step 7: setupStorageListeners...');
        setupStorageListeners();
        console.log('[Popup][DIAG] ✅ All init steps completed');
    } catch (err) {
        console.error('[Popup][DIAG] ❌ Init CRASHED at some step:', err);
    }
});

function setupStorageListeners() {
    if (storageListenersReady) return;
    if (!chrome?.storage?.onChanged) return;
    storageListenersReady = true;

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local') return;
        if (changes.problems || changes.localizedProblemTitles || changes.leaveDays || changes.leaveSettings) {
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
    console.log('[Popup][DIAG] setupLanguage: i18n=', !!i18n);
    currentLanguage = i18n ? await i18n.getLanguage() : 'en';
    console.log('[Popup][DIAG] setupLanguage: language=', currentLanguage);
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
            console.log('[Popup][DIAG] onLanguageChange fired:', nextLanguage);
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
    if (dataLoaded) {
        console.log('[Popup][DIAG] applyLanguage: dataLoaded=true, calling rerenderCurrentView');
        rerenderCurrentView();
    } else {
        console.log('[Popup][DIAG] applyLanguage: dataLoaded=false, SKIPPING rerenderCurrentView');
    }
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
    console.log('[Popup][DIAG] updateDashboard: START');
    const result = await chrome.storage.local.get({ problems: {}, localizedProblemTitles: {} });
    const now = getCurrentDate();
    const problemMap = await applyArrivedLeaveDays(result.problems, now);
    const problems = Object.values(problemMap);

    console.log('[Popup][DIAG] updateDashboard: total problems =', problems.length, ', now =', now.toISOString());

    const dueProblems = problems.filter(problem => new Date(problem.nextReviewDate) <= now);
    dueProblems.sort((a, b) => new Date(a.nextReviewDate) - new Date(b.nextReviewDate));
    problems.sort((a, b) => new Date(a.nextReviewDate) - new Date(b.nextReviewDate));

    console.log('[Popup][DIAG] updateDashboard: due =', dueProblems.length, ', all =', problems.length);

    currentPlan = await computeDailyPlan(problemMap, dueProblems);
    currentDueProblems = currentPlan && !showAllDue ? currentPlan.today : (currentPlan ? [...currentPlan.today, ...currentPlan.later] : dueProblems);
    currentAllProblems = problems;
    currentTitleCache = result.localizedProblemTitles || {};

    console.log('[Popup][DIAG] updateDashboard: calling resolveLeetCodeBaseUrl...');
    currentLeetCodeBase = await resolveLeetCodeBaseUrl();
    console.log('[Popup][DIAG] updateDashboard: baseUrl resolved =', currentLeetCodeBase);

    // Render immediately after data is ready — before streak/sync which can fail
    dataLoaded = true;
    // IMPORTANT: populateTopicDropdown MUST run before rerenderCurrentView!
    // It validates persisted topic filters (e.g. "NeetCode") against the actual
    // topics in the loaded problems. If the persisted topic no longer exists,
    // it resets currentFilters.topic to 'all'. Without this, a stale topic
    // filter would cause rerenderCurrentView to show 0 results.
    populateTopicDropdown(problems);
    console.log('[Popup][DIAG] updateDashboard: calling rerenderCurrentView, currentView =', currentView, ', filters =', JSON.stringify(currentFilters));
    rerenderCurrentView();
    renderGlobalHeatmap();
    updateClock();
    if (!clockIntervalId) {
        clockIntervalId = setInterval(updateClock, 1000);
    }

    // Streak calculation — non-critical, wrapped in try-catch
    try {
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
    } catch (e) {
        console.warn('[Popup] Streak calculation failed:', e);
    }

    console.log('[Popup][DIAG] updateDashboard: calling syncCurrentProblemDifficulty...');
    await syncCurrentProblemDifficulty();
    void hydrateLocalizedTitles(problems);
    console.log('[Popup][DIAG] updateDashboard: END');
}

function rerenderCurrentView() {
    const baseProblems = currentView === 'all' ? currentAllProblems : currentDueProblems;

    // Apply filters
    const PopupFilter = window.PopupFilter;
    let problems = baseProblems;
    if (PopupFilter && PopupFilter.filterProblems) {
        problems = PopupFilter.filterProblems(baseProblems, currentFilters);
    }

    console.log('[Popup][DIAG] rerenderCurrentView: view=', currentView,
        ', base=', baseProblems.length,
        ', after filter=', problems.length,
        ', filters=', JSON.stringify(currentFilters));

    const isDashboard = currentView === 'dashboard';
    currentVisibleProblems = problems;
    renderVectors(problems, 'vector-list', isDashboard, {
        language: currentLanguage,
        titleCache: currentTitleCache,
        problemUrlBase: currentLeetCodeBase,
        // GO from the due queue opens the problem as a review (editor auto-reset)
        onGo: isDashboard ? (problem) => { void openReviewTabs([problem]); } : undefined
    });
    updateQueueTitle();
    renderPlanBar();
    renderBatchBar();
    renderLeaveBar();
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
    if (currentView === 'all') {
        title.innerText = t('popup_queue_all_problems');
    } else {
        title.innerText = currentLeave.isLeaveToday
            ? `${t('popup_queue_due_today')} · ${t('popup_leave_today_tag')}`
            : t('popup_queue_due_today');
    }
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
        console.log('[Popup][DIAG] setupFilters: restored filters =', JSON.stringify(currentFilters));
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

    const leaveRes = await chrome.storage.local.get({ leaveDays: [] });
    const LeaveLogic = getLeaveLogic();
    if (LeaveLogic) {
        return LeaveLogic.calculateStreak(log, leaveRes.leaveDays, getCurrentDate());
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

    // Hard/Again: short-term review after 1, 3, 7 days (see relearn.js).
    const relearnFields = window.Relearn ? window.Relearn.fields(problem, rating, now, nextStep.nextReviewDate) : {};
    if (relearnFields.nextReviewDate) nextStep.nextReviewDate = relearnFields.nextReviewDate;

    problems[slug] = {
        ...problem,
        ...relearnFields,
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
        setupSidebar,
        setupFilters
    };
}
