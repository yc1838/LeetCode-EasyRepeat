/**
 * @jest-environment jsdom
 */

global.chrome = {
    runtime: {
        id: 'mock-id',
        onMessage: {
            addListener: jest.fn()
        }
    },
    storage: {
        local: {
            get: jest.fn(),
            set: jest.fn()
        }
    }
};

describe('Storage Logic', () => {
    let saveSubmission;
    let srsLogic;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();

        // Mock srs_logic dependencies if needed, but for saveSubmission 
        // it mostly relies on chrome.storage and srs_logic calculations.
        // We'll trust the real srs_logic for calculations as it's pure logic.

        // Setup default mock return for storage.get
        global.chrome.storage.local.get.mockResolvedValue({ problems: {} });

        // Mock srs_logic and config
        global.calculateNextReview = require('../src/algorithms/srs_logic.js').calculateNextReview;
        const { TOAST_THEMES } = require('../src/shared/config.js');
        global.TOAST_THEMES = TOAST_THEMES;

        // Mock global showCompletionToast from content_ui
        global.showCompletionToast = jest.fn();

        const storageScript = require('../src/shared/storage.js');
        saveSubmission = storageScript.saveSubmission;
    });

    test('should allow difficulty update if difficulty changes on same day', async () => {
        const today = new Date().toISOString();
        const problemKey = 'two-sum';

        // ARRANGE: Pre-populate storage with an "incorrect" Medium entry solved today
        const existingData = {
            problems: {
                [problemKey]: {
                    title: '1. Two Sum',
                    slug: problemKey,
                    difficulty: 'Medium', // Incorrect!
                    lastSolved: today,    // Solved today
                    interval: 1,
                    repetition: 1,
                    easeFactor: 2.5,
                    history: [{ date: today, status: 'Accepted' }]
                }
            }
        };

        global.chrome.storage.local.get.mockResolvedValue(existingData);

        // ACT: Save the same problem again, but with "Easy" difficulty
        const result = await saveSubmission('1. Two Sum', problemKey, 'Easy');

        // ASSERT:
        // 1. chrome.storage.local.set SHOULD be called (problems update + activity log)
        expect(global.chrome.storage.local.set).toHaveBeenCalled();

        // 2. The saved data should have "Easy" difficulty
        const setCall = global.chrome.storage.local.set.mock.calls.find(call => call[0].problems);
        expect(setCall).toBeDefined();
        expect(setCall[0].problems[problemKey].difficulty).toBe('Easy');

        // 3. Result should be success (not duplicate/skipped)
        expect(result).toEqual(expect.objectContaining({ success: true }));
    });

    test('should still skip exact duplicate (same day, same difficulty)', async () => {
        const today = new Date().toISOString();
        const problemKey = 'two-sum';

        const existingData = {
            problems: {
                [problemKey]: {
                    title: '1. Two Sum',
                    slug: problemKey,
                    difficulty: 'Easy',
                    lastSolved: today,
                    interval: 1,
                    repetition: 1,
                    easeFactor: 2.5,
                    history: [{ date: today, status: 'Accepted' }]
                }
            }
        };

        global.chrome.storage.local.get.mockResolvedValue(existingData);

        // ACT: Save again with SAME difficulty
        const result = await saveSubmission('1. Two Sum', problemKey, 'Easy');

        // ASSERT: Should NOT save
        expect(global.chrome.storage.local.set).not.toHaveBeenCalled();
        expect(result).toEqual(expect.objectContaining({ duplicate: true }));
    });
});
