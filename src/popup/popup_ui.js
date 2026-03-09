/**
 * LeetCode EasyRepeat - Popup UI Logic
 *
 * Contains purely visual rendering functions for the extension popup.
 * Separated from popup.js to improve maintainability.
 */

function getI18n() {
    if (typeof window !== 'undefined' && window.EasyRepeatI18n) return window.EasyRepeatI18n;
    return null;
}

function getProblemTitles() {
    if (typeof window !== 'undefined' && window.EasyRepeatProblemTitles) return window.EasyRepeatProblemTitles;
    return null;
}

function t(key, values = {}, language = 'en') {
    const i18n = getI18n();
    return i18n ? i18n.t(key, values, language) : key;
}

function formatDate(dateValue, language = 'en') {
    const i18n = getI18n();
    if (i18n && typeof i18n.formatDate === 'function') {
        return i18n.formatDate(dateValue, language, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    }
    return new Date(dateValue).toLocaleDateString();
}

function formatDifficulty(difficulty, language = 'en') {
    const i18n = getI18n();
    if (i18n && typeof i18n.formatDifficulty === 'function') {
        return i18n.formatDifficulty(difficulty, language);
    }
    return difficulty || 'Medium';
}

function getProblemDisplayTitle(problem, language = 'en', titleCache = {}) {
    const problemTitles = getProblemTitles();
    const fallback = problem?.title || problem?.slug || '';
    if (!problemTitles || typeof problemTitles.getDisplayTitleSync !== 'function') {
        return fallback;
    }
    return problemTitles.getDisplayTitleSync(problem, language, titleCache) || fallback;
}

function formatCardTitle(problem, language = 'en', titleCache = {}) {
    const displayTitle = getProblemDisplayTitle(problem, language, titleCache);
    return language === 'en' ? String(displayTitle).toUpperCase() : displayTitle;
}

function formatTagLabel(label, language = 'en') {
    return language === 'en' ? String(label).toUpperCase() : String(label);
}

/**
 * Render the list of problem cards (vectors).
 * @param {Array} problemList - Array of problem objects
 * @param {string} containerId - Element ID to inject into
 * @param {boolean} isInteractive - True for "Due" list (shows buttons), False for "All"
 * @param {object} options - Rendering options
 */
export function renderVectors(problemList, containerId, isInteractive, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    const language = options.language || 'en';
    const titleCache = options.titleCache || {};

    if (problemList.length === 0) {
        container.innerHTML = `<div style="padding:20px; text-align:center; color:#555; font-size:0.7rem;">${t('popup_empty_buffer', {}, language)}</div>`;
        return;
    }

    problemList.forEach(problem => {
        const uniqueId = problem.slug;
        const interval = problem.interval;
        const nextReview = formatDate(problem.nextReviewDate, language);
        const displayTitle = formatCardTitle(problem, language, titleCache);
        const diffStyle = `difficulty-${(problem.difficulty || 'medium').toLowerCase()}`;
        const difficultyText = formatTagLabel(formatDifficulty(problem.difficulty || 'medium', language), language);
        const actionGroupClass = language === 'zh' ? 'action-group action-group-zh' : 'action-group';
        const deleteButtonClass = language === 'zh' ? 'del-btn del-btn-zh' : 'del-btn';
        const goButtonClass = language === 'zh' ? 'go-btn go-btn-zh' : 'go-btn';

        const card = document.createElement('div');
        card.className = 'vector-card';

        card.innerHTML = `
            <div class="vector-meta">
                <span>#${problem.slug}</span>
                <span>${t('popup_retention', {}, language)}: ${Math.min(100, Math.round(problem.easeFactor * 40))}%</span>
            </div>
            <div class="vector-title">${displayTitle}</div>
            ${(problem.topics && problem.topics.length > 0) ? `
                <div class="topic-row" style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:6px;">
                    ${problem.topics.slice(0, 3).map(topic => {
                        const i18n = getI18n();
                        const translated = (i18n && typeof i18n.translateTopic === 'function') ? i18n.translateTopic(topic, language) : topic;
                        return `<span class="stat-tag topic-tag">${formatTagLabel(translated, language)}</span>`;
                    }).join('')}
                </div>
            ` : ''}
            <div class="vector-stats" style="flex-wrap: wrap;">
                <span class="stat-tag ${diffStyle}">${difficultyText}</span>
                <span class="stat-tag">${t('popup_interval_days', { days: interval }, language)}</span>
                <span class="stat-tag">${t('popup_due_date', { date: nextReview }, language)}</span>
                <div class="${actionGroupClass}">
                    <button class="${deleteButtonClass}" data-slug="${problem.slug}">${t('popup_action_delete', {}, language)}</button>
                    <button class="${goButtonClass}" data-slug="${problem.slug}">${t('popup_action_go', {}, language)}</button>
                </div>
            </div>
            <button class="tactical-btn">${t('popup_action_initialize', {}, language)}</button>
            <div class="vector-details">
                <div class="mini-heatmap-label">${t('popup_timeline', {}, language)}</div>
                <div class="heatmap-grid mini-heatmap" id="grid-${uniqueId}"></div>
                ${problem.notes ? `
                    <div class="notes-flashcard">
                        <div class="notes-label">${t('popup_user_notes', {}, language)}</div>
                        <div class="notes-content">${problem.notes.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</div>
                        <div class="notes-edit-hint" title="${t('popup_edit_notes_title', {}, language)}">
                            <svg class="notes-edit-icon" viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.21a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0L15.12 4.1l3.75 3.75 1.84-1.81z"/>
                            </svg>
                            <span>${t('popup_edit_notes', {}, language)}</span>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;

        card.onclick = (e) => {
            if (e.target.classList.contains('go-btn')) return;
            card.classList.toggle('expanded');
            if (card.classList.contains('expanded')) {
                renderMiniHeatmap(problem, `grid-${uniqueId}`, { language });
            }
        };

        const goBtn = card.querySelector('.go-btn');
        if (goBtn) {
            goBtn.onclick = (e) => {
                e.stopPropagation();
                if (typeof chrome !== 'undefined' && chrome.tabs) {
                    chrome.tabs.create({ url: `https://leetcode.com/problems/${problem.slug}/` });
                }
            };
        }

        const delBtn = card.querySelector('.del-btn');
        if (delBtn) {
            delBtn.onclick = async (e) => {
                e.stopPropagation();
                if (typeof window !== 'undefined' && typeof window.deleteProblem === 'function') {
                    await window.deleteProblem(problem.slug);
                } else {
                    console.error('deleteProblem is not defined');
                }
            };
        }

        const attachEditListener = () => {
            const editBtn = card.querySelector('.notes-edit-hint');
            if (!editBtn) return;

            editBtn.onclick = (e) => {
                e.stopPropagation();
                const flashcard = card.querySelector('.notes-flashcard');
                if (!flashcard) return;

                const rawNotes = problem.notes || '';
                const textarea = document.createElement('textarea');
                textarea.value = rawNotes;
                textarea.placeholder = t('content_notes_placeholder', {}, language);
                textarea.style.cssText = `
                    width: 100%;
                    min-height: 80px;
                    background: rgba(0,0,0,0.3);
                    border: 1px solid var(--electric);
                    color: var(--font-main);
                    font-family: 'JetBrains Mono', monospace;
                    font-size: 0.8rem;
                    padding: 8px;
                    margin-bottom: 8px;
                    resize: vertical;
                    border-radius: 4px;
                `;
                textarea.onclick = (ev) => ev.stopPropagation();
                textarea.onkeydown = (ev) => ev.stopPropagation();

                const btnRow = document.createElement('div');
                btnRow.style.cssText = 'display: flex; gap: 8px; justify-content: flex-end;';

                const saveBtn = document.createElement('button');
                saveBtn.innerText = t('common_save', {}, language);
                saveBtn.style.cssText = `
                    background: var(--terminal);
                    color: #000;
                    border: none;
                    padding: 4px 12px;
                    font-family: inherit;
                    font-weight: bold;
                    cursor: pointer;
                    font-size: 0.7rem;
                `;

                const cancelBtn = document.createElement('button');
                cancelBtn.innerText = t('common_cancel', {}, language);
                cancelBtn.style.cssText = `
                    background: transparent;
                    color: var(--electric);
                    border: 1px solid var(--electric);
                    padding: 4px 12px;
                    font-family: inherit;
                    font-weight: bold;
                    cursor: pointer;
                    font-size: 0.7rem;
                `;

                saveBtn.onclick = async (ev) => {
                    ev.stopPropagation();
                    saveBtn.innerText = t('content_saving', {}, language);
                    if (typeof window !== 'undefined' && typeof window.saveNotes === 'function') {
                        await window.saveNotes(problem.slug, textarea.value);
                    } else {
                        console.error('saveNotes not found');
                    }
                };

                cancelBtn.onclick = (ev) => {
                    ev.stopPropagation();
                    const formattedNotes = (problem.notes || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
                    flashcard.innerHTML = `
                        <div class="notes-label">${t('popup_user_notes', {}, language)}</div>
                        <div class="notes-content">${formattedNotes}</div>
                        <div class="notes-edit-hint" title="${t('popup_edit_notes_title', {}, language)}">
                            <svg class="notes-edit-icon" viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.21a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0L15.12 4.1l3.75 3.75 1.84-1.81z"/>
                            </svg>
                            <span>${t('popup_edit_notes', {}, language)}</span>
                        </div>
                    `;
                    attachEditListener();
                };

                flashcard.innerHTML = '';
                flashcard.appendChild(textarea);
                btnRow.appendChild(cancelBtn);
                btnRow.appendChild(saveBtn);
                flashcard.appendChild(btnRow);
            };
        };
        attachEditListener();

        container.appendChild(card);
    });
}

export function renderMiniHeatmap(problem, gridId, options = {}) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    grid.innerHTML = '';

    const language = options.language || 'en';
    const i18n = getI18n();
    const toDateStr = (date) => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');

    const history = (problem.history || []).map(entry => ({
        date: new Date(entry.date),
        dateStr: toDateStr(new Date(entry.date)),
        rating: entry.rating || 3
    })).sort((a, b) => a.date - b.date);

    const today = typeof window.getCurrentDate === 'function' ? window.getCurrentDate() : new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = toDateStr(today);

    let startDate = history.length > 0 ? new Date(history[0].date) : new Date(today);
    startDate.setHours(0, 0, 0, 0);

    let endLimit = new Date(today);
    endLimit.setDate(today.getDate() + 30);

    const nextReviewDate = new Date(problem.nextReviewDate);
    if (nextReviewDate > endLimit) {
        endLimit = new Date(nextReviewDate);
        endLimit.setDate(endLimit.getDate() + 7);
    }

    const doneDates = new Set(history.map(entry => entry.dateStr));
    const missedDates = new Set();

    const nextDueObj = new Date(problem.nextReviewDate);
    nextDueObj.setHours(0, 0, 0, 0);

    if (nextDueObj < today) {
        const cursor = new Date(nextDueObj);
        while (cursor < today) {
            const cursorStr = toDateStr(cursor);
            if (!doneDates.has(cursorStr)) {
                missedDates.add(cursorStr);
            }
            cursor.setDate(cursor.getDate() + 1);
        }
    }

    const futureProjectedDates = new Set();
    if (nextDueObj > today) {
        futureProjectedDates.add(toDateStr(nextDueObj));
    }

    const simulationStartDate = nextDueObj > today ? nextDueObj : today;

    if (typeof fsrs !== 'undefined' && fsrs.projectScheduleFSRS) {
        const card = {
            stability: problem.fsrs_stability,
            difficulty: problem.fsrs_difficulty,
            state: problem.fsrs_state,
            last_review: problem.fsrs_last_review || problem.lastSolved
        };
        const projected = fsrs.projectScheduleFSRS(card, simulationStartDate);
        projected.forEach(dateStr => futureProjectedDates.add(dateStr));
    } else if (typeof projectSchedule === 'function') {
        const projected = projectSchedule(problem.interval, problem.repetition, problem.easeFactor, simulationStartDate);
        projected.forEach(dateStr => futureProjectedDates.add(dateStr));
    }

    const formatter = new Intl.DateTimeFormat(i18n ? i18n.getLocaleTag(language) : 'en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    });

    let currentDate = new Date(startDate);
    const MAX_DAYS = 90;
    let count = 0;

    while (currentDate <= endLimit && count < MAX_DAYS) {
        const dayStr = toDateStr(currentDate);
        const cell = document.createElement('div');
        cell.className = 'cell';

        const dateText = formatter.format(currentDate);
        cell.setAttribute('title', dateText);

        let statusLabel = '';

        if (doneDates.has(dayStr)) {
            cell.style.background = 'var(--status-done)';
            cell.style.boxShadow = '0 0 6px var(--status-done)';
            cell.classList.add('status-done');
            statusLabel = t('popup_status_completed', {}, language);
        } else if (missedDates.has(dayStr)) {
            cell.style.background = 'var(--status-missed)';
            cell.classList.add('status-missed');
            statusLabel = t('popup_status_missed', {}, language);
        } else if (dayStr === todayStr && nextDueObj <= today) {
            cell.style.background = 'var(--status-due)';
            cell.style.boxShadow = '0 0 8px var(--status-due)';
            cell.classList.add('status-due');
            statusLabel = t('popup_status_due_today', {}, language);
        } else if (futureProjectedDates.has(dayStr) && currentDate > today) {
            cell.style.background = 'var(--status-projected)';
            cell.classList.add('status-projected');
            statusLabel = t('popup_status_scheduled', {}, language);
        }

        cell.onmouseenter = () => {
            const tooltip = document.getElementById('global-tooltip');
            if (tooltip) {
                tooltip.textContent = statusLabel ? `${dateText} (${statusLabel})` : dateText;
                tooltip.classList.add('visible');
                const rect = cell.getBoundingClientRect();
                tooltip.style.left = `${rect.left + rect.width / 2}px`;
                tooltip.style.top = `${rect.top}px`;
            }
        };
        cell.onmouseleave = () => {
            const tooltip = document.getElementById('global-tooltip');
            if (tooltip) tooltip.classList.remove('visible');
        };

        grid.appendChild(cell);
        currentDate.setDate(currentDate.getDate() + 1);
        count++;
    }
}

export function renderGlobalHeatmap() {
    const grid = document.getElementById('global-heatmap');
    if (!grid) return;
    grid.innerHTML = '';

    for (let i = 0; i < 140; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';

        const initialColor = Math.random();
        if (initialColor > 0.95) cell.classList.add('v-4');
        else if (initialColor > 0.85) cell.classList.add('v-3');
        else if (initialColor > 0.70) cell.classList.add('v-2');
        else if (initialColor > 0.50) cell.classList.add('v-1');

        const animationType = Math.floor(Math.random() * 5);
        cell.classList.add(`pulse-${animationType + 1}`);

        const delay = Math.random() * 3;
        cell.style.animationDelay = `${delay}s`;

        const duration = 3 + Math.random() * 3;
        cell.style.animationDuration = `${duration}s`;

        grid.appendChild(cell);
    }
}

export function showNotification(type, code, message, options = {}) {
    const existing = document.querySelector('.srs-notification');
    if (existing) existing.remove();

    const language = options.language || 'en';
    const colors = {
        error: { border: '#ff2a6d', bg: 'rgba(255, 42, 109, 0.1)', icon: '✕' },
        warning: { border: '#f1c40f', bg: 'rgba(241, 196, 15, 0.1)', icon: '⚠' },
        info: { border: '#2DE2E6', bg: 'rgba(45, 226, 230, 0.1)', icon: 'ℹ' }
    };
    const style = colors[type] || colors.info;

    const notification = document.createElement('div');
    notification.className = 'srs-notification';
    notification.innerHTML = `
        <div class="notif-header">
            <span class="notif-icon">${style.icon}</span>
            <span class="notif-code">[${code}]</span>
        </div>
        <div class="notif-message">${message}</div>
        <button class="notif-close">${t('common_dismiss', {}, language)}</button>
    `;

    notification.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #111;
        border: 2px solid ${style.border};
        padding: 16px 24px;
        font-family: 'JetBrains Mono', monospace;
        z-index: 1000;
        animation: slideUp 0.2s ease;
        box-shadow: 0 0 20px ${style.bg}, 0 0 0 1000px rgba(0,0,0,0.5);
        min-width: 300px;
        max-width: 80%;
        text-align: center;
    `;

    notification.querySelector('.notif-header').style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
        font-size: 11px;
        color: ${style.border};
    `;

    notification.querySelector('.notif-icon').style.cssText = 'font-size: 14px;';
    notification.querySelector('.notif-code').style.cssText = 'letter-spacing: 1px;';

    notification.querySelector('.notif-message').style.cssText = `
        font-size: 12px;
        color: #fff;
        margin-bottom: 10px;
        line-height: 1.4;
    `;

    notification.querySelector('.notif-close').style.cssText = `
        background: transparent;
        border: 1px solid ${style.border};
        color: ${style.border};
        font-family: inherit;
        font-size: 10px;
        padding: 6px 12px;
        cursor: pointer;
        width: 100%;
    `;

    notification.querySelector('.notif-close').onclick = () => notification.remove();

    document.body.appendChild(notification);

    setTimeout(() => {
        if (notification.parentElement) notification.remove();
    }, 8000);
}
