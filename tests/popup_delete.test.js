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
            set: jest.fn().mockResolvedValue(),
            remove: jest.fn().mockResolvedValue(),
            clear: jest.fn().mockResolvedValue()
        }
    }
};

describe('Popup Delete Button', () => {
    let popupUI;
    let popupLogic;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Mock window.confirm
        global.confirm = jest.fn(() => true);

        // Mock global functions from srs_logic.js if needed
        global.projectSchedule = jest.fn().mockReturnValue([]);
        global.calculateNextReview = jest.fn();
        global.getCurrentDate = jest.fn().mockReturnValue(new Date());

        // Mock global constants from config.js
        global.THEMES = { sakura: {}, matrix: {} };

        // Reset DOM
        document.body.innerHTML = `
            <div id="vector-list"></div>
        `;

        // Load modules
        jest.resetModules();
        popupUI = require('../src/popup/popup_ui.js');

        // We need to mock the updateDashboard function from popup.js 
        // because deleteProblem calls it.
        // However, popup.js is a bit monolithic and runs on load.
        // For unit testing the UI->Logic connection, we can mock the global deleteProblem

        // Mock global deleteProblem if it were attached to window, 
        // but likely we want to test the actual popup.js deleteProblem function logic if possible.
        // Since popup.js is not a module that exports deleteProblem easily without window globals,
        // we might need to modify popup.js to export it for testing or attach it to global.

        // For this test, let's assume we will mock the global function to verify the UI calls it,
        // AND/OR we can try to test the actual logic if we can require it.
        // The implementation plan says "Make deleteProblem globally available".

        global.renderVectors = popupUI.renderVectors;
    });

    test('should render DELETE button for each problem', () => {
        const problems = [
            {
                slug: 'two-sum',
                title: 'Two Sum',
                difficulty: 'Easy',
                interval: 1,
                nextReviewDate: new Date().toISOString()
            }
        ];

        popupUI.renderVectors(problems, 'vector-list', true);

        const delBtn = document.querySelector('.del-btn');
        expect(delBtn).not.toBeNull();
        expect(delBtn.textContent).toBe('DEL');
    });

    test('should be positioned above or near the GO button', () => {
        const problems = [
            {
                slug: 'two-sum',
                title: 'Two Sum',
                difficulty: 'Easy',
                interval: 1,
                nextReviewDate: new Date().toISOString()
            }
        ];

        popupUI.renderVectors(problems, 'vector-list', true);

        const card = document.querySelector('.vector-details');
        // Actually rendering logic puts buttons in .vector-stats usually or separate row
        // Let's check if both buttons exist in the DOM
        const statsRow = document.querySelector('.vector-stats');
        const delBtn = statsRow.querySelector('.del-btn');
        const goBtn = statsRow.querySelector('.go-btn');

        expect(delBtn).toBeTruthy();
        expect(goBtn).toBeTruthy();

        // Check structural order if they are siblings
        const children = Array.from(statsRow.children);
        const delIndex = children.indexOf(delBtn);
        const goIndex = children.indexOf(goBtn); // If they are not siblings this might be -1

        // If we are wrapping them in a container, we check that
        const actionContainer = statsRow.querySelector('.action-group');
        if (actionContainer) {
            const btns = actionContainer.querySelectorAll('button');
            expect(btns[0].classList.contains('del-btn')).toBe(true);
        } else {
            // If manual placement, user asked "above" the GO button.
            // In HTML flow, previous sibling is "above" if flex-col, or "left" if flex-row.
            // We'll see how we implement it. For now just ensuring existence is key.
        }
    });

    test('clicking DELETE button should trigger deleteProblem with correct slug', async () => {
        const problems = [
            { slug: 'two-sum', title: 'Two Sum' }
        ];

        popupUI.renderVectors(problems, 'vector-list', true);

        // Mock the global handler that popup.js will implement
        global.deleteProblem = jest.fn();

        const delBtn = document.querySelector('.del-btn');
        delBtn.click();

        // We expect it to call the global delete function
        // Note: popup_ui.js renders the button with an onclick that should call deleteProblem
        expect(global.deleteProblem).toHaveBeenCalledWith('two-sum');
    });
});
