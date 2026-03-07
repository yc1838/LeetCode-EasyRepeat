/**
 * @jest-environment jsdom
 */

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

        // Reload module to ensure fresh state
        // Reload module to ensure fresh state
        jest.resetModules();
        // popup.js still needed for other logic if required, but renderVectors is in popup_ui
        // We can just require popup_ui directly for testing the UI
        popup = require('../src/popup/popup_ui.js');

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
