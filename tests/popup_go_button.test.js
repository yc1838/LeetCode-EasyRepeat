/**
 * @jest-environment jsdom
 */

const path = require('path');
const fs = require('fs');
const vm = require('vm');

function loadPopupUiModule() {
    const sourcePath = path.resolve(__dirname, '../src/popup/popup_ui.js');
    const source = fs.readFileSync(sourcePath, 'utf8')
        .replace(/export function /g, 'function ');
    const context = {
        window,
        document,
        chrome: global.chrome,
        console,
        Date,
        Math,
        Intl,
        setTimeout,
        clearTimeout,
        fsrs: global.fsrs,
        projectSchedule: global.projectSchedule,
        module: { exports: {} },
        exports: {}
    };
    context.global = context;
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(`${source}\nmodule.exports = { renderVectors, renderMiniHeatmap, renderGlobalHeatmap, showNotification };`, context);
    return context.module.exports;
}

// Mock Chrome API
global.chrome = {
    tabs: {
        create: jest.fn()
    },
    storage: {
        local: {
            get: jest.fn().mockResolvedValue({}),
            set: jest.fn().mockResolvedValue()
        }
    }
};

describe('Popup GO Button', () => {
    let popup;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Mock global functions from srs_logic.js
        global.projectSchedule = jest.fn().mockReturnValue([]);
        global.calculateNextReview = jest.fn().mockReturnValue({ nextInterval: 1, nextRepetition: 1, nextEaseFactor: 2.5, nextReviewDate: '' });

        // Mock global constants from config.js
        const { THEMES } = require('../src/shared/config.js');
        global.THEMES = THEMES;

        // Reset DOM
        document.body.innerHTML = `
            <div id="vector-list"></div>
        `;

        window.EasyRepeatI18n = require('../src/shared/ui_i18n.js');
        popup = loadPopupUiModule();

        // Mock global updateProblemSRS if needed
        global.updateProblemSRS = jest.fn();
        global.getCurrentDate = jest.fn().mockReturnValue(new Date());
    });

    test('should render GO button for each problem', () => {
        const problems = [
            {
                slug: 'two-sum',
                title: 'Two Sum',
                difficulty: 'Easy',
                interval: 1,
                nextReviewDate: new Date().toISOString()
            }
        ];

        popup.renderVectors(problems, 'vector-list', true);

        // Look for the buttn
        // We will likely give it a class 'go-btn' or similar
        const goBtn = document.querySelector('.go-btn');
        expect(goBtn).not.toBeNull();
        expect(goBtn.textContent).toBe('GO');
    });

    test('should open new tab when GO button is clicked', () => {
        const problems = [
            {
                slug: 'valid-anagram',
                title: 'Valid Anagram',
                difficulty: 'Easy',
                interval: 1,
                nextReviewDate: new Date().toISOString()
            }
        ];

        popup.renderVectors(problems, 'vector-list', true);

        const goBtn = document.querySelector('.go-btn');
        expect(goBtn).not.toBeNull();

        // Simulate click
        goBtn.click();

        expect(chrome.tabs.create).toHaveBeenCalledWith({
            url: 'https://leetcode.com/problems/valid-anagram/'
        });
    });

    test('should respect custom base URL for GO button', () => {
        const problems = [
            {
                slug: 'valid-anagram',
                title: 'Valid Anagram',
                difficulty: 'Easy',
                interval: 1,
                nextReviewDate: new Date().toISOString()
            }
        ];

        popup.renderVectors(problems, 'vector-list', true, { problemUrlBase: 'https://leetcode.cn' });

        const goBtn = document.querySelector('.go-btn');
        expect(goBtn).not.toBeNull();

        goBtn.click();

        expect(chrome.tabs.create).toHaveBeenCalledWith({
            url: 'https://leetcode.cn/problems/valid-anagram/'
        });
    });

    test('should prevent event propagation (checking card expansion)', () => {
        const problems = [{ slug: 'test', title: 'Test', difficulty: 'Easy', interval: 1, nextReviewDate: '' }];
        popup.renderVectors(problems, 'vector-list', true);

        const card = document.querySelector('.vector-card');
        const goBtn = document.querySelector('.go-btn');

        // Spy on classList toggle? 
        // Or check if 'expanded' class is added.
        // The card adds 'expanded' on click.

        expect(card.classList.contains('expanded')).toBe(false);

        goBtn.click();

        // Should STILL be false because we stopped propagation
        expect(card.classList.contains('expanded')).toBe(false);

        // Click card itself
        card.click();
        expect(card.classList.contains('expanded')).toBe(true);
    });
});
