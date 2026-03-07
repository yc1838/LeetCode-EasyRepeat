// Mock global fetch
global.fetch = jest.fn();

// Mock chrome global
global.chrome = {
    runtime: {
        onMessage: { addListener: jest.fn() },
        sendMessage: jest.fn(),
        id: 'mock-id',
        lastError: null
    },
    storage: {
        local: {
            get: jest.fn().mockImplementation((defaults) => Promise.resolve(defaults || {})),
            set: jest.fn().mockResolvedValue()
        }
    }
};

// Mock global constants
const { TOAST_THEMES } = require('../src/shared/config.js');
global.TOAST_THEMES = TOAST_THEMES;

// Mock window and document
global.window = {
    location: {
        pathname: '/problems/two-sum'
    }
};

// Advanced DOM Mocking captures created elements so we can interact with them
const createdElements = [];

global.document = {
    addEventListener: jest.fn(),
    head: { appendChild: jest.fn() },
    body: {
        appendChild: jest.fn(),
        removeChild: jest.fn()
    },
    // Mock getElementById/querySelector if needed
    querySelector: jest.fn(),
    cookie: '',

    createElement: jest.fn().mockImplementation((tag) => {
        const el = {
            tagName: tag.toUpperCase(),
            className: '',
            style: {},
            classList: { add: jest.fn(), remove: jest.fn() },
            remove: jest.fn(),
            appendChild: jest.fn(),
            innerHTML: '',
            _listeners: {},
            addEventListener: jest.fn((event, handler) => {
                el._listeners[event] = handler;
            }),
            click: jest.fn(() => {
                if (el._listeners['click']) el._listeners['click']();
            }),
            // Basic querySelector support for finding buttons inside modal
            querySelector: jest.fn((selector) => {
                // Return a mock button if the selector looks like a button
                if (selector.includes('btn') || selector.includes('button')) {
                    const btn = {
                        className: selector,
                        _listeners: {},
                        addEventListener: jest.fn((evt, h) => { btn._listeners[evt] = h; }),
                        click: jest.fn(() => { if (btn._listeners.click) btn._listeners.click(); })
                    }
                    // We might need to store these to trigger them from the test
                    el._mockChildren = el._mockChildren || [];
                    el._mockChildren.push(btn);
                    return btn;
                }
                return null;
            }),
            // Helper to get children for testing
            _getMockButton: (selectorPart) => {
                return el._mockChildren?.find(c => c.className.includes(selectorPart));
            }
        };
        createdElements.push(el);
        return el;
    })
};

// Mock FSRS logic
const mockCalculateFSRS = jest.fn().mockReturnValue({
    nextInterval: 5,
    nextRepetition: 1,
    nextEaseFactor: 2.5,
    nextReviewDate: '2025-01-06T00:00:00.000Z',
    newStability: 5,
    newDifficulty: 5,
    nextState: 'Review'
});

jest.mock('../src/algorithms/fsrs_logic.js', () => ({
    calculateFSRS: mockCalculateFSRS
}));

const fsrs = require('../src/algorithms/fsrs_logic.js');
global.fsrs = fsrs; // Make it global for content.js

// Mock SM-2 logic
global.calculateNextReview = jest.fn().mockReturnValue({
    nextInterval: 1,
    nextRepetition: 1,
    nextEaseFactor: 2.5,
    nextReviewDate: '2025-01-01T00:00:00.000Z'
});


// We need to require content.js dynamically for each test
let contentScript;

describe('Rating Integration Flow', () => {
    beforeEach(() => {
        jest.resetModules();
        fetch.mockReset();
        mockCalculateFSRS.mockClear();
        createdElements.length = 0; // Clear tracked elements

        // Default Storage Mock
        global.chrome.storage.local.get.mockResolvedValue({ problems: {} });
        global.chrome.storage.local.set.mockResolvedValue();

        // Mock local functions from content_ui.js
        const contentUi = require('../src/content/content_ui.js');
        // IMPORTANT: Assign to global BEFORE running tests that use content.js functions
        global.showRatingModal = contentUi.showRatingModal;
        global.showCompletionToast = contentUi.showCompletionToast;
        global.document.head = { appendChild: jest.fn() }; // Required by content_ui

        const { saveSubmission } = require('../src/shared/storage.js');
        global.saveSubmission = saveSubmission;

        // Require the module under test
        // Require the module under test
        contentScript = require('../src/content/content.js');
        const leetcodeApi = require('../src/content/leetcode_api.js');
        global.checkSubmissionStatus = leetcodeApi.checkSubmissionStatus;
    });

    test('Step 1: Modal appears on Accepted submission', async () => {
        // Setup: Mock API returning "Accepted"
        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ state: "SUCCESS", status_msg: "Accepted", status_code: 10 })
        });
        // Mock GraphQL question details
        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                data: {
                    question: {
                        difficulty: "Medium",
                        title: "Two Sum",
                        questionFrontendId: "1",
                        topicTags: []
                    }
                }
            })
        });

        // Since checkSubmissionStatus awaits the user input, we run it without await first
        // Since checkSubmissionStatus awaits the user input, we run it without await first
        const promise = global.checkSubmissionStatus('123', 'Two Sum', 'two-sum', 'Medium');

        // Wait for async operations to hit the modal point
        await new Promise(r => setTimeout(r, 10));

        // Check if modal was added to body
        // We look for a div that was appended to body
        const appended = document.body.appendChild.mock.calls;
        // The function appends user backdrop to body
        const backdrop = appended.find(call => call[0].className.includes('lc-rating-backdrop'));

        expect(backdrop).toBeDefined();

        // Note: 'rating-modal' class needs to be added in implementation
    });

    test('Step 2: Clicking Good (3) saves submission with rating', async () => {
        // Setup: Mock API returning "Accepted"
        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ state: "SUCCESS", status_msg: "Accepted", status_code: 10 })
        });
        // Mock GraphQL question details
        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                data: {
                    question: {
                        difficulty: "Medium",
                        title: "Two Sum",
                        questionFrontendId: "1",
                        topicTags: []
                    }
                }
            })
        });

        // Setup: Spy on saveSubmission (it's internal to contentScript, but we can spy on storage.local.set)

        // Run Status Check
        // Run Status Check
        const statusPromise = global.checkSubmissionStatus('123', 'Two Sum', 'two-sum', 'Medium');
        await new Promise(r => setTimeout(r, 10));

        // Find Modal Backdrop
        const backdropInfo = document.body.appendChild.mock.calls.find(call => call[0].className.includes('lc-srs-rating-backdrop'));

        // Use createdElements to find the button
        const goodBtn = createdElements.find(el => el.className && el.className.includes('rating-btn-good'));
        expect(goodBtn).toBeDefined();

        // Simulate Click
        goodBtn.click();

        // Await the main promise to finish (it waits for the click)
        await statusPromise;

        // Verify Storage Save
        expect(global.chrome.storage.local.set).toHaveBeenCalled();
        const saveCall = global.chrome.storage.local.set.mock.calls[0][0]; // { problems: ... }
        const savedProblem = saveCall.problems['two-sum'];

        expect(savedProblem).toBeDefined();
        // Check History for rating
        const latestHistory = savedProblem.history[savedProblem.history.length - 1];
        expect(latestHistory.rating).toBe(3);

        // Check FSRS fields (from our mock fsrs_logic)
        expect(savedProblem.fsrs_stability).toBe(5);
        expect(savedProblem.fsrs_difficulty).toBe(5);
    });
});
