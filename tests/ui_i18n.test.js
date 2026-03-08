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
});
