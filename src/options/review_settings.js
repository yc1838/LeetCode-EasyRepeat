/**
 * LeetCode EasyRepeat - Review settings card on the options page:
 * how reviews are scheduled, and the daily review number (auto or fixed).
 *
 * Self-contained like leave_settings.js: own strings, follows `uiLanguage`.
 */
import '../algorithms/daily_reviews.js';

const STRINGS = {
    en: {
        heading: '🔁 Reviews',
        rules: [
            'Reviews are scheduled with FSRS v4.5 from your rating (Again / Hard / Good / Easy).',
            'Hard or Again: the problem comes back after 1 day, then 3, then 7. Good/Easy moves it on a step; Hard/Again during these steps goes back one step. After the 7-day step it returns to the normal schedule.',
            'New problems are not limited. Reviews get a recommended number a day: it starts from your recent pace (5 if there is little history), goes up 10% when you did nearly all of it over the last week and down 10% when you did under 70%. Due problems beyond it stay in the list for later.'
        ],
        fixed_label: 'Reviews a day (blank = recommended automatically)',
        fixed_hint: 'A whole number from 1 to 60 sets it; leave blank to let it float.',
        save: 'Save',
        saved: '✅ Saved.',
        invalid: 'Enter a whole number from 1 to 60, or leave it blank.',
        today_auto: 'Today: {rec} reviews recommended.',
        today_fixed: 'Today: {rec} reviews (your number).'
    },
    zh: {
        heading: '🔁 复习',
        rules: [
            '复习时间按 FSRS v4.5 根据你的评分（重来 / 困难 / 正常 / 简单）计算。',
            '评「困难」或「重来」：隔 1 天、3 天、7 天各复习一次。评「正常/简单」进入下一步，中途又评差就退回一步。7 天那一步过了就回到正常排期。',
            '新题不限量。复习每天有一个推荐量：从你最近的复习节奏起步（记录少时为 5 道），最近一周基本做完就 +10%，完成不到 70% 就 −10%。超出推荐量的到期题留在列表里，之后再做。'
        ],
        fixed_label: '每天复习量（留空 = 自动推荐）',
        fixed_hint: '填 1 到 60 的整数就固定为这个数；留空则自动浮动。',
        save: '保存',
        saved: '✅ 已保存。',
        invalid: '请输入 1 到 60 的整数，或者留空。',
        today_auto: '今天：建议复习 {rec} 道。',
        today_fixed: '今天：复习 {rec} 道（你设定的）。'
    }
};

const DR = () => (typeof self !== 'undefined' ? self.DailyReviews : window.DailyReviews);
let lang = 'en';

function t(key, values = {}) {
    const table = STRINGS[lang] || STRINGS.en;
    const template = table[key] ?? STRINGS.en[key] ?? key;
    if (Array.isArray(template)) return template;
    return String(template).replace(/\{(\w+)\}/g, (m, k) => (k in values ? values[k] : m));
}

function langFrom(value) {
    return String(value || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function buildCard() {
    const card = document.createElement('section');
    card.className = 'card';
    card.id = 'review-card';
    card.innerHTML = `
        <h2 data-rv="heading"></h2>
        <ul class="hint" id="rv-rules" style="margin: 6px 0 12px; padding-left: 18px;"></ul>
        <div class="grid" style="gap: 15px;">
            <div class="field">
                <label for="rv-fixed" data-rv="fixed_label"></label>
                <input type="number" id="rv-fixed" min="1" max="60" step="1">
                <span class="hint" data-rv="fixed_hint"></span>
            </div>
        </div>
        <div class="actions">
            <button id="rv-save-btn" class="btn" data-rv="save"></button>
            <span id="rv-save-status" class="status-text"></span>
        </div>
        <p class="hint" id="rv-today" style="margin-top: 10px;"></p>
    `;
    return card;
}

async function render(card) {
    card.querySelectorAll('[data-rv]').forEach(el => { el.textContent = t(el.dataset.rv); });
    const rules = card.querySelector('#rv-rules');
    rules.innerHTML = '';
    for (const line of t('rules')) {
        const li = document.createElement('li');
        li.textContent = line;
        rules.appendChild(li);
    }
    const state = await chrome.storage.local.get({ problems: {}, dailyReviews: null, dailyReviewSettings: null, leaveDays: [] });
    const input = card.querySelector('#rv-fixed');
    const fixed = Number(state.dailyReviewSettings && state.dailyReviewSettings.fixed);
    if (document.activeElement !== input) input.value = Number.isInteger(fixed) && fixed > 0 ? String(fixed) : '';
    const D = DR();
    if (D) {
        const day = D.today(state.problems || {}, new Date(), state.dailyReviews, state.dailyReviewSettings, state.leaveDays);
        card.querySelector('#rv-today').textContent = t(day.fixed ? 'today_fixed' : 'today_auto', { rec: day.recommended });
    }
}

async function init() {
    if (!chrome?.storage?.local) return;
    const anchor = document.getElementById('leave-card') || document.getElementById('tools-card');
    const card = buildCard();
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(card, anchor);
    else (document.querySelector('main') || document.body).appendChild(card);

    const stored = await chrome.storage.local.get({ uiLanguage: 'en' });
    lang = langFrom(stored.uiLanguage);
    const langSelect = document.getElementById('lang-select');
    if (langSelect) {
        langSelect.addEventListener('change', () => {
            lang = langFrom(langSelect.value);
            void render(card);
        });
    }

    card.querySelector('#rv-save-btn').addEventListener('click', async () => {
        const status = card.querySelector('#rv-save-status');
        const raw = card.querySelector('#rv-fixed').value.trim();
        const n = Number(raw);
        if (raw !== '' && (!Number.isInteger(n) || n < 1 || n > 60)) {
            status.textContent = t('invalid');
            status.className = 'status-text error';
            return;
        }
        await chrome.storage.local.set({ dailyReviewSettings: { fixed: raw === '' ? null : n } });
        status.textContent = t('saved');
        status.className = 'status-text success';
        await render(card);
    });

    chrome.storage.onChanged?.addListener((changes, area) => {
        if (area === 'local' && (changes.dailyReviews || changes.dailyReviewSettings)) void render(card);
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

export { init as initReviewSettings, STRINGS as REVIEW_STRINGS };
