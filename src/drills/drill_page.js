/**
 * Drill Page Logic
 *
 * Handles the full-page drill practice experience.
 */

(function (root, factory) {
    var exported = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = exported;
    } else {
        root.DrillPage = exported;
    }
    if (typeof window !== 'undefined') {
        window.DrillPage = exported;
    }
}(typeof self !== 'undefined' ? self : this, function () {

    function getI18n() {
        if (typeof window !== 'undefined' && window.EasyRepeatI18n) return window.EasyRepeatI18n;
        if (typeof EasyRepeatI18n !== 'undefined') return EasyRepeatI18n;
        return null;
    }

    function translate(key, values = {}, language = 'en') {
        const i18n = getI18n();
        return i18n ? i18n.t(key, values, language) : key;
    }

    const DRILL_ICONS = {
        'fill-in-blank': '✍️',
        'spot-bug': '🐛',
        'critique': '💬',
        'muscle-memory': '💪'
    };

    function getDrillFromURL(search) {
        const params = new URLSearchParams(search);
        return params.get('drillId') || null;
    }

    function getDrillPageURL(drillId) {
        const base = chrome.runtime.getURL('dist/src/drills/drills.html');
        return `${base}?drillId=${drillId}`;
    }

    function getSkillDisplayName(skillId) {
        return skillId
            .replace(/_/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
    }

    function getDrillTypeIcon(type) {
        return DRILL_ICONS[type] || '📝';
    }

    function getLocalizedDrillType(type, language = 'en') {
        const map = {
            'fill-in-blank': 'drill_type_fill_in_blank',
            'spot-bug': 'drill_type_spot_bug',
            'critique': 'drill_type_critique',
            'muscle-memory': 'drill_type_muscle_memory'
        };
        return translate(map[type] || 'drill_type_fill_in_blank', {}, language);
    }

    function renderDrillContent(drill, options = {}) {
        const language = options.language || 'en';
        const icon = getDrillTypeIcon(drill.type);
        const skillName = getSkillDisplayName(drill.skillId);

        let inputHTML = '';

        switch (drill.type) {
            case 'fill-in-blank':
                inputHTML = `
                    <div class="drill-prompt">
                        <pre class="code-block">${escapeHtml(drill.content)}</pre>
                    </div>
                    <div class="drill-input">
                        <label>${translate('drill_fill_blank_label', {}, language)}</label>
                        <input type="text" id="drill-answer" placeholder="${translate('drill_fill_blank_placeholder', {}, language)}" autofocus>
                    </div>
                `;
                break;

            case 'spot-bug': {
                const lines = drill.content.split('\n');
                const numberedLines = lines.map((line, i) => {
                    const tokens = line.split(/([a-zA-Z0-9_]+|[^\s\w]+)/g).filter(t => t);
                    const tokensHTML = tokens.map(token => {
                        if (/^\s+$/.test(token)) {
                            return `<span>${escapeHtml(token)}</span>`;
                        }
                        return `<span class="code-token">${escapeHtml(token)}</span>`;
                    }).join('');

                    return `<div class="code-line" data-line="${i + 1}">
                        <span class="line-num">${i + 1}</span>
                        <span class="line-content">${tokensHTML}</span>
                     </div>`;
                }).join('');

                inputHTML = `
                    <div class="drill-prompt">
                        <div class="code-interactive">${numberedLines}</div>
                    </div>
                    <div class="drill-instruction">
                        ${translate('drill_spot_bug_instruction', {}, language)}
                    </div>
                    <input type="hidden" id="drill-answer" value="">
                `;
                break;
            }

            case 'critique':
                inputHTML = `
                    <div class="drill-prompt">
                        <pre class="code-block">${escapeHtml(drill.content)}</pre>
                    </div>
                    <div class="drill-input">
                        <label>${translate('drill_critique_label', {}, language)}</label>
                        <textarea id="drill-answer" rows="6" placeholder="${translate('drill_critique_placeholder', {}, language)}"></textarea>
                    </div>
                `;
                break;

            case 'muscle-memory':
                inputHTML = `
                    <div class="drill-prompt">
                        <p>${escapeHtml(drill.content)}</p>
                    </div>
                    <div class="drill-input">
                        <div class="input-header">
                            <label>${translate('drill_write_solution_label', {}, language)}</label>
                            <span class="input-hint">✨ ${translate('drill_ai_hint', {}, language)}</span>
                        </div>
                        <textarea id="drill-answer" rows="12" placeholder="${translate('drill_write_solution_placeholder', {}, language)}" class="code-input"></textarea>
                    </div>
                `;
                break;

            default:
                inputHTML = `<div class="drill-input"><textarea id="drill-answer" rows="6"></textarea></div>`;
        }

        return `
            <div class="drill-container ${drill.type}">
                <div class="drill-header">
                    <span class="drill-icon">${icon}</span>
                    <span class="drill-type">${getLocalizedDrillType(drill.type, language)}</span>
                    <span class="drill-skill">${skillName}</span>
                </div>
                ${inputHTML}
                <div class="drill-actions">
                    <button id="btn-submit" class="btn-primary">${translate('drill_submit_answer', {}, language)}</button>
                    <button id="btn-skip" class="btn-secondary">${translate('common_skip', {}, language)}</button>
                </div>
            </div>
        `;
    }

    function getUserAnswer(drillType) {
        const input = document.getElementById('drill-answer');
        return input ? input.value : '';
    }

    function renderResult(result, options = {}) {
        const language = options.language || 'en';
        const statusClass = result.correct ? 'correct' : 'incorrect';
        const statusIcon = result.correct ? '✅' : '❌';

        return `
            <div class="drill-result ${statusClass}">
                <div class="result-icon">${statusIcon}</div>
                <div class="result-message">${result.correct ? translate('drill_correct', {}, language) : translate('drill_incorrect', {}, language)}</div>
                <div class="result-feedback">${escapeHtml(result.feedback || '')}</div>
                <div class="result-actions">
                    <button id="btn-next" class="btn-primary">${translate('drill_next', {}, language)}</button>
                    <button id="btn-finish" class="btn-secondary">${translate('drill_finish_session', {}, language)}</button>
                </div>
            </div>
        `;
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function openDrillPage(drillId) {
        const url = getDrillPageURL(drillId);
        window.open(url, '_blank');
    }

    return {
        getDrillFromURL,
        getDrillPageURL,
        getSkillDisplayName,
        getDrillTypeIcon,
        renderDrillContent,
        getUserAnswer,
        renderResult,
        openDrillPage,
        escapeHtml
    };
}));
