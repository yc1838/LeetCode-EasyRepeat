/**
 * LeetCode EasyRepeat - Leave (请假) settings card on the options page.
 *
 * Self-contained: owns its own strings (en / zh) and reads `uiLanguage`
 * from storage, following the language selector on the page.
 */
import '../shared/leave_logic.js';

const STRINGS = {
    en: {
        heading: '🏖️ Leave',
        hint: 'Taking leave pauses your review clock for that day: every scheduled review shifts back one day and your streak is kept. Missed days can be back-dated within quota. Weeks run Sunday–Saturday.',
        weekly_label: 'Leave days per week',
        monthly_label: 'Leave days per month',
        save: 'Save Quota',
        lock_first_time: 'First-time setup: you can set the quota once now. After that it can only be changed on the 1st of a month.',
        lock_first_of_month: 'Today is the 1st — you can change the quota today.',
        lock_locked: 'Quota is locked. Next chance to change it: {date}.',
        saved: '✅ Quota saved.',
        usage: 'This week {weekUsed}/{weekLimit} used · this month {monthUsed}/{monthLimit} used',
        usage_unset: 'Set a quota to start using leave.',
        request_label: 'Request leave for a day (past days can be back-dated)',
        request_btn: 'Request Leave',
        requested: '✅ Leave booked for {date}.',
        list_heading: 'Leave days this month and upcoming',
        list_empty: 'No leave days yet.',
        cancel: 'Cancel',
        cancelled: 'Leave on {date} cancelled.',
        tag_today: 'today',
        tag_past: 'used',
        err_locked: 'Quota is locked until {date}.',
        err_invalid_limit: 'Enter whole numbers (0 or more).',
        err_weekly_over_7: 'A week has only 7 days.',
        err_monthly_over_31: 'A month has at most 31 days.',
        err_invalid_date: 'Pick a valid date.',
        err_not_configured: 'Set your quota first.',
        err_already: 'You already have leave on that day.',
        err_weekly_limit: 'That week\'s leave quota is used up.',
        err_monthly_limit: 'That month\'s leave quota is used up.',
        err_not_cancellable: 'Only future leave days can be cancelled.',
        err_not_found: 'Leave day not found.',
        confirm_today: 'Take this leave? Leave for today or a past day cannot be cancelled.'
    },
    zh: {
        heading: '🏖️ 请假',
        hint: '请假当天复习时钟暂停：所有待复习题目整体顺延一天，连续天数不会中断。漏掉的日子在额度内可以补请。一周按周日到周六计算。',
        weekly_label: '每周可请假天数',
        monthly_label: '每月可请假天数',
        save: '保存额度',
        lock_first_time: '首次设置：现在可以设定一次额度，之后只能在每月 1 号修改。',
        lock_first_of_month: '今天是 1 号，今天可以修改额度。',
        lock_locked: '额度已锁定，下次可修改的日期：{date}。',
        saved: '✅ 额度已保存。',
        usage: '本周已用 {weekUsed}/{weekLimit} · 本月已用 {monthUsed}/{monthLimit}',
        usage_unset: '先设置额度才能请假。',
        request_label: '为某一天请假（过去的日子可以补请）',
        request_btn: '请假',
        requested: '✅ 已为 {date} 请假。',
        list_heading: '本月及之后的请假',
        list_empty: '还没有请假记录。',
        cancel: '撤销',
        cancelled: '已撤销 {date} 的请假。',
        tag_today: '今天',
        tag_past: '已用',
        err_locked: '额度已锁定，{date} 才能修改。',
        err_invalid_limit: '请输入 0 或以上的整数。',
        err_weekly_over_7: '一周只有 7 天。',
        err_monthly_over_31: '一个月最多 31 天。',
        err_invalid_date: '请选择有效日期。',
        err_not_configured: '请先设置额度。',
        err_already: '这一天已经请过假了。',
        err_weekly_limit: '那一周的请假额度已用完。',
        err_monthly_limit: '那个月的请假额度已用完。',
        err_not_cancellable: '只能撤销未来日期的请假。',
        err_not_found: '没有找到这条请假。',
        confirm_today: '确定请假？今天或过去日期的请假不能撤销。'
    }
};

const L = () => (typeof self !== 'undefined' ? self.LeaveLogic : window.LeaveLogic);
let lang = 'en';

function t(key, values = {}) {
    const table = STRINGS[lang] || STRINGS.en;
    const template = table[key] ?? STRINGS.en[key] ?? key;
    return String(template).replace(/\{(\w+)\}/g, (m, k) => (k in values ? values[k] : m));
}

function langFrom(value) {
    return String(value || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function today() {
    return new Date();
}

function setStatus(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.className = 'status-text ' + (type || '');
}

function buildCard() {
    const card = document.createElement('section');
    card.className = 'card';
    card.id = 'leave-card';
    card.innerHTML = `
        <h2 data-leave="heading"></h2>
        <p class="hint" data-leave="hint"></p>
        <p class="hint" id="leave-lock-note"></p>
        <div class="grid" style="gap: 15px; margin-top: 10px;">
            <div class="field">
                <label for="leave-weekly" data-leave="weekly_label"></label>
                <input type="number" id="leave-weekly" min="0" max="7" step="1">
            </div>
            <div class="field">
                <label for="leave-monthly" data-leave="monthly_label"></label>
                <input type="number" id="leave-monthly" min="0" max="31" step="1">
            </div>
        </div>
        <div class="actions">
            <button id="leave-save-btn" class="btn" data-leave="save"></button>
            <span id="leave-save-status" class="status-text"></span>
        </div>
        <hr class="section-divider">
        <p class="hint" id="leave-usage"></p>
        <div class="grid" style="gap: 15px; margin-top: 10px;">
            <div class="field">
                <label for="leave-date" data-leave="request_label"></label>
                <input type="date" id="leave-date">
            </div>
        </div>
        <div class="actions">
            <button id="leave-request-btn" class="btn" data-leave="request_btn"></button>
            <span id="leave-request-status" class="status-text"></span>
        </div>
        <h3 style="margin: 16px 0 8px;" data-leave="list_heading"></h3>
        <ul id="leave-list" class="leave-list" style="list-style:none; padding:0; margin:0;"></ul>
    `;
    return card;
}

async function render(card) {
    const LeaveLogic = L();
    const state = await chrome.storage.local.get({ leaveDays: [], leaveSettings: null });
    const settings = LeaveLogic.normalizeSettings(state.leaveSettings);
    const now = today();
    const todayKey = LeaveLogic.toKey(now);

    card.querySelectorAll('[data-leave]').forEach(node => { node.textContent = t(node.dataset.leave); });

    const perm = LeaveLogic.canEditLimits(settings, now);
    const lockNote = card.querySelector('#leave-lock-note');
    lockNote.textContent = perm.reason === 'locked'
        ? t('lock_locked', { date: perm.nextEditableOn })
        : t(perm.reason === 'first_time' ? 'lock_first_time' : 'lock_first_of_month');

    const weekly = card.querySelector('#leave-weekly');
    const monthly = card.querySelector('#leave-monthly');
    if (document.activeElement !== weekly) weekly.value = settings.weeklyLimit ?? '';
    if (document.activeElement !== monthly) monthly.value = settings.monthlyLimit ?? '';
    weekly.disabled = !perm.allowed;
    monthly.disabled = !perm.allowed;
    card.querySelector('#leave-save-btn').disabled = !perm.allowed;

    const usageEl = card.querySelector('#leave-usage');
    if (settings.initialized) {
        const r = LeaveLogic.remaining(settings, state.leaveDays, now);
        usageEl.textContent = t('usage', {
            weekUsed: r.week.used, weekLimit: r.week.limit,
            monthUsed: r.month.used, monthLimit: r.month.limit
        });
    } else {
        usageEl.textContent = t('usage_unset');
    }

    const dateInput = card.querySelector('#leave-date');
    if (!dateInput.value) dateInput.value = todayKey;
    card.querySelector('#leave-request-btn').disabled = !settings.initialized;

    const list = card.querySelector('#leave-list');
    list.innerHTML = '';
    const monthStart = `${LeaveLogic.monthKey(todayKey)}-01`;
    const shown = (state.leaveDays || []).filter(d => d >= monthStart).sort();
    if (!shown.length) {
        const li = document.createElement('li');
        li.className = 'hint';
        li.textContent = t('list_empty');
        list.appendChild(li);
    }
    for (const day of shown) {
        const li = document.createElement('li');
        li.style.cssText = 'display:flex; align-items:center; gap:10px; padding:4px 0;';
        const label = document.createElement('span');
        const tag = day === todayKey ? ` (${t('tag_today')})` : (day < todayKey ? ` (${t('tag_past')})` : '');
        label.textContent = day + tag;
        li.appendChild(label);
        if (day > todayKey) {
            const btn = document.createElement('button');
            btn.className = 'btn';
            btn.textContent = t('cancel');
            btn.addEventListener('click', async () => {
                const fresh = await chrome.storage.local.get({ leaveDays: [] });
                const res = LeaveLogic.cancelLeave(day, { leaveDays: fresh.leaveDays, today: today() });
                const status = card.querySelector('#leave-request-status');
                if (!res.ok) return setStatus(status, t(`err_${res.reason}`), 'error');
                await chrome.storage.local.set({ leaveDays: res.leaveDays });
                setStatus(status, t('cancelled', { date: day }), 'success');
                await render(card);
            });
            li.appendChild(btn);
        }
        list.appendChild(li);
    }
}

async function init() {
    const LeaveLogic = L();
    if (!LeaveLogic || !chrome?.storage?.local) return;

    const anchor = document.getElementById('tools-card');
    const card = buildCard();
    if (anchor && anchor.parentNode) {
        anchor.parentNode.insertBefore(card, anchor);
    } else {
        (document.querySelector('main') || document.body).appendChild(card);
    }

    const stored = await chrome.storage.local.get({ uiLanguage: 'en' });
    lang = langFrom(stored.uiLanguage);
    const langSelect = document.getElementById('lang-select');
    if (langSelect) {
        langSelect.addEventListener('change', () => {
            lang = langFrom(langSelect.value);
            void render(card);
        });
    }

    card.querySelector('#leave-save-btn').addEventListener('click', async () => {
        const status = card.querySelector('#leave-save-status');
        const fresh = await chrome.storage.local.get({ leaveSettings: null });
        const res = LeaveLogic.updateLimits(fresh.leaveSettings, {
            weeklyLimit: card.querySelector('#leave-weekly').value,
            monthlyLimit: card.querySelector('#leave-monthly').value
        }, today());
        if (!res.ok) {
            setStatus(status, t(`err_${res.reason}`, { date: res.nextEditableOn }), 'error');
            return;
        }
        await chrome.storage.local.set({ leaveSettings: res.settings });
        setStatus(status, t('saved'), 'success');
        await render(card);
    });

    card.querySelector('#leave-request-btn').addEventListener('click', async () => {
        const status = card.querySelector('#leave-request-status');
        const dateKey = card.querySelector('#leave-date').value;
        const now = today();
        const fresh = await chrome.storage.local.get({ leaveDays: [], leaveSettings: null });
        const res = LeaveLogic.addLeave(dateKey, { leaveDays: fresh.leaveDays, settings: fresh.leaveSettings, today: now });
        if (!res.ok) {
            setStatus(status, t(`err_${res.reason}`), 'error');
            return;
        }
        if (dateKey <= LeaveLogic.toKey(now) && !confirm(t('confirm_today'))) return;
        // Today's / back-dated leave is applied (schedule shift) the next time the popup opens.
        await chrome.storage.local.set({ leaveDays: res.leaveDays });
        setStatus(status, t('requested', { date: dateKey }), 'success');
        await render(card);
    });

    chrome.storage.onChanged?.addListener((changes, area) => {
        if (area === 'local' && (changes.leaveDays || changes.leaveSettings)) void render(card);
    });

    await render(card);
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { void init(); });
    } else {
        void init();
    }
}

export { init as initLeaveSettings, STRINGS as LEAVE_STRINGS };
