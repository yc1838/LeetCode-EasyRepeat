/**
 * Localized problem title tests
 */

const { JSDOM } = require('jsdom');

function setupDom() {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    global.window = dom.window;
    global.document = dom.window.document;
    global.HTMLElement = dom.window.HTMLElement;
}

describe('EasyRepeatProblemTitles', () => {
    let EasyRepeatProblemTitles;
    let storageState;

    beforeEach(() => {
        jest.resetModules();
        setupDom();

        storageState = {
            localizedProblemTitles: {}
        };

        global.EasyRepeatI18n = {
            normalizeLanguage: jest.fn((code) => String(code || '').startsWith('zh') ? 'zh' : 'en'),
            getLanguage: jest.fn(() => Promise.resolve('en'))
        };

        global.chrome = {
            storage: {
                local: {
                    get: jest.fn((defaults) => Promise.resolve({ ...defaults, ...storageState })),
                    set: jest.fn((payload) => {
                        storageState = { ...storageState, ...payload };
                        return Promise.resolve();
                    })
                }
            },
            runtime: {
                sendMessage: jest.fn(() => Promise.resolve({ success: true, titles: {} }))
            }
        };

        EasyRepeatProblemTitles = require('../src/shared/problem_titles');
    });

    it('returns english title without localization fetch when language is en', async () => {
        const title = await EasyRepeatProblemTitles.getDisplayTitle({
            slug: 'two-sum',
            title: '1. Two Sum'
        }, 'en');

        expect(title).toBe('1. Two Sum');
        expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });

    it('returns cached chinese title when available', async () => {
        storageState.localizedProblemTitles = {
            'two-sum': { zh: '1. 两数之和' }
        };

        const title = await EasyRepeatProblemTitles.getDisplayTitle({
            slug: 'two-sum',
            title: '1. Two Sum'
        }, 'zh');

        expect(title).toBe('1. 两数之和');
        expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });

    it('fetches and returns chinese title when cache misses', async () => {
        chrome.runtime.sendMessage.mockResolvedValue({
            success: true,
            titles: {
                'two-sum': { zh: '1. 两数之和' }
            }
        });

        const title = await EasyRepeatProblemTitles.getDisplayTitle({
            slug: 'two-sum',
            title: '1. Two Sum'
        }, 'zh-CN');

        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'fetchLocalizedProblemTitles',
            slugs: ['two-sum'],
            language: 'zh'
        });
        expect(title).toBe('1. 两数之和');
    });

    it('builds numbered title entries consistently', () => {
        expect(EasyRepeatProblemTitles.buildNumberedTitle('两数之和', '1')).toBe('1. 两数之和');
        expect(EasyRepeatProblemTitles.buildTitleEntry({
            translatedTitle: '两数之和',
            questionId: '1',
            source: 'test'
        })).toMatchObject({
            zh: '1. 两数之和',
            zhRaw: '两数之和',
            questionId: '1',
            source: 'test'
        });
    });
});
