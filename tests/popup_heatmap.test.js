
/**
 * @jest-environment jsdom
 */

// Mock dependencies before requiring popup_ui
const fsrs = require('../src/algorithms/fsrs_logic');
global.fsrs = fsrs;

// Mock window globals
global.window = window;

// Can't easily require popup_ui.js directly if it assumes global context or IIFE attachment strictly.
// But we can test the logic by extracting or mocking the render function.
// Actually, popup_ui.js exports: renderMiniHeatmap (via UMD)

// We need to load popup_ui.js such that it exports to our test.
// Since it follows UMD: (root, factory) -> module.exports = factory()
const PopupUI = require('../src/popup/popup_ui');
const { renderMiniHeatmap } = PopupUI;

describe('Popup UI Heatmap', () => {
    let container;

    beforeEach(() => {
        // Setup DOM
        document.body.innerHTML = '<div id="test-grid"></div>';
        container = document.getElementById('test-grid');
    });

    test('should include stored nextReviewDate in projection even if FSRS projects later', () => {
        const today = new Date('2026-01-24');
        // Use Noon UTC to avoid timezone rollback to previous day
        const nextReview = new Date('2026-01-26T12:00:00Z'); // Future scheduled date

        // Mock global date provider if necessary, or we rely on renderMiniHeatmap using "new Date()"
        // Popup_ui logic: 
        // const today = typeof window.getCurrentDate === 'function' ? window.getCurrentDate() : new Date();
        window.getCurrentDate = () => new Date('2026-01-24T10:00:00');

        const problem = {
            slug: 'test-problem',
            nextReviewDate: nextReview.toISOString(), // 2026-01-26
            history: [],
            fsrs_stability: 5,
            fsrs_difficulty: 5,
            fsrs_state: 'Review'
        };

        // Execute
        renderMiniHeatmap(problem, 'test-grid');

        // Verify
        // We expect a cell for 2026-01-26 to have class 'scheduled' or style background var(--status-projected)
        const cells = container.querySelectorAll('.cell');
        let foundScheduled = false;

        cells.forEach(cell => {
            // Check tooltip or attribute to identify date
            // The tooltip is set as title="Sat, Jan 24" etc.
            // 1/26 is Monday
            if (cell.getAttribute('title').includes('Jan 26')) {
                // Check class
                if (cell.classList.contains('status-projected')) {
                    foundScheduled = true;
                }
            }
        });

        expect(foundScheduled).toBe(true);
    });

    test('should project subsequent dates starting AFTER nextReviewDate', () => {
        // If next review is 1/26.
        // FSRS (S=5) might give +5 days.
        // Next projection should be 1/26 + 5 = 1/31.
        // It should NOT be 1/24 + 5 = 1/29.

        window.getCurrentDate = () => new Date('2026-01-24T10:00:00');

        const nextReview = new Date('2026-01-26T12:00:00Z');
        const problem = {
            slug: 'test-problem',
            nextReviewDate: nextReview.toISOString(),
            // Must provide last_review or FSRS treats as New (resets stability)
            fsrs_last_review: new Date('2026-01-20').toISOString(),
            history: [],
            fsrs_stability: 5, // ~5 days interval
            fsrs_difficulty: 5,
            fsrs_state: 'Review'
        };

        renderMiniHeatmap(problem, 'test-grid');

        const cells = container.querySelectorAll('.cell');

        // Check for Feb 09 (approximate FSRS growth from S=5, elapsed=6 -> I~14)
        let foundFeb09 = false;
        let found29 = false; // Incorrect (too early)

        cells.forEach(cell => {
            const title = cell.getAttribute('title');
            if (title.includes('Feb 9') && cell.classList.contains('status-projected')) {
                foundFeb09 = true;
            }
            if (title.includes('Jan 29') && cell.classList.contains('status-projected')) {
                found29 = true;
            }
        });

        expect(foundFeb09).toBe(true);
        expect(found29).toBe(false);
    });

});
