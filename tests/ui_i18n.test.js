/**
 * Shared UI i18n tests
 */

const { JSDOM } = require('jsdom');

function setupDom() {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    global.window = dom.window;
    global.document = dom.window.document;
    global.HTMLElement = dom.window.HTMLElement;
}

describe('EasyRepeatI18n', () => {
    let EasyRepeatI18n;
    let storageState;
    let changeListeners;

    beforeEach(() => {
        jest.resetModules();
        setupDom();

        storageState = { uiLanguage: 'en' };
        changeListeners = [];

        global.chrome = {
            storage: {
                local: {
                    get: jest.fn((defaults) => Promise.resolve({ ...defaults, ...storageState })),
                    set: jest.fn((payload) => {
                        storageState = { ...storageState, ...payload };
                        return Promise.resolve();
                    })
                },
                onChanged: {
                    addListener: jest.fn((listener) => changeListeners.push(listener))
                }
            }
        };

        EasyRepeatI18n = require('../src/shared/ui_i18n');
    });

    it('normalizes language codes to supported languages', () => {
        expect(EasyRepeatI18n.normalizeLanguage('zh-CN')).toBe('zh');
        expect(EasyRepeatI18n.normalizeLanguage('en-US')).toBe('en');
        expect(EasyRepeatI18n.normalizeLanguage('fr-FR')).toBe('en');
    });

    it('normalizes difficulty across locales', () => {
        expect(EasyRepeatI18n.normalizeDifficulty('简单')).toBe('Easy');
        expect(EasyRepeatI18n.normalizeDifficulty('中等')).toBe('Medium');
        expect(EasyRepeatI18n.normalizeDifficulty('困难')).toBe('Hard');
        expect(EasyRepeatI18n.normalizeDifficulty('MEDIUM')).toBe('Medium');
    });

    it('formats difficulty using normalized inputs', () => {
        expect(EasyRepeatI18n.formatDifficulty('简单', 'en')).toBe('Easy');
        expect(EasyRepeatI18n.formatDifficulty('Hard', 'zh')).toBe('困难');
    });

    it('applies translations to text, placeholders, and titles', () => {
        document.body.innerHTML = `
            <div id="text" data-i18n="popup_welcome">fallback</div>
            <input id="input" data-i18n-placeholder="content_notes_placeholder" placeholder="fallback">
            <button id="button" data-i18n-title="common_language_toggle_title" title="fallback"></button>
        `;

        EasyRepeatI18n.applyTranslations(document, 'zh');

        expect(document.documentElement.lang).toBe('zh-CN');
        expect(document.getElementById('text').textContent).toBe('准备好继续刷题了吗？');
        expect(document.getElementById('input').getAttribute('placeholder')).toContain('在这里记笔记');
        expect(document.getElementById('button').getAttribute('title')).toBe('切换到 English');
    });

    it('toggles language and persists it to storage', async () => {
        await expect(EasyRepeatI18n.toggleLanguage()).resolves.toBe('zh');
        expect(storageState.uiLanguage).toBe('zh');
        expect(chrome.storage.local.set).toHaveBeenCalledWith({ uiLanguage: 'zh' });
    });

    it('notifies language listeners for storage changes', async () => {
        const listener = jest.fn();
        EasyRepeatI18n.onLanguageChange(listener);

        expect(chrome.storage.onChanged.addListener).toHaveBeenCalledTimes(1);
        changeListeners[0]({ uiLanguage: { newValue: 'zh' } }, 'local');

        expect(listener).toHaveBeenCalledWith('zh');
    });

    // Test: difficulty recommendations toggle label exists in both EN and ZH dictionaries
    it('contains difficulty recommendations toggle translation', () => {
        const en = EasyRepeatI18n.DICTIONARY.en;
        const zh = EasyRepeatI18n.DICTIONARY.zh;

        // Verify the key exists in both language dictionaries
        expect(en).toHaveProperty('content_difficulty_recommendations');
        expect(zh).toHaveProperty('content_difficulty_recommendations');

        // Verify the exact translation values
        expect(en.content_difficulty_recommendations).toBe('Enable difficulty recommendations');
        expect(zh.content_difficulty_recommendations).toBe('启用难度推荐');
    });

    it('contains all required filter translation keys', () => {
        const en = EasyRepeatI18n.DICTIONARY.en;
        const zh = EasyRepeatI18n.DICTIONARY.zh;

        const filterKeys = [
            'filter_all_difficulty',
            'filter_all_topics',
            'filter_all_time',
            'filter_last_7d',
            'filter_last_30d',
            'filter_last_90d'
        ];

        filterKeys.forEach(key => {
            expect(en).toHaveProperty(key);
            expect(zh).toHaveProperty(key);
        });

        // Verify specific values
        expect(en.filter_all_difficulty).toBe('Difficulty');
        expect(zh.filter_all_difficulty).toBe('全部难度');
        
        expect(en.filter_all_time).toBe('All Time');
        expect(zh.filter_all_time).toBe('全部时间');
        
        expect(en.filter_last_7d).toBe('Last 7 Days');
        expect(zh.filter_last_7d).toBe('最近7天');
    });
});
