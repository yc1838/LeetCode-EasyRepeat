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

/**
 * Focused tests for showRatingModal click handler behavior.
 * Uses callback-style chrome.storage.local.get mock to match resolveModalTheme's API.
 */
describe('Rating Modal - Click Handler Guard', () => {
    let showRatingModal;
    let modalElements;

    beforeEach(() => {
        jest.resetModules();
        modalElements = [];

        // Override chrome.storage.local.get to support callback style (used by resolveModalTheme)
        global.chrome.storage.local.get = jest.fn((defaults, callback) => {
            // If callback provided, invoke it synchronously with defaults (callback style)
            if (typeof callback === 'function') {
                callback(typeof defaults === 'object' ? defaults : {});
                return;
            }
            // Otherwise return promise (promise style)
            return Promise.resolve(typeof defaults === 'object' ? defaults : {});
        });

        // Track created elements for inspection
        createdElements.length = 0;

        // Re-require content_ui to pick up fresh mocks
        const contentUi = require('../src/content/content_ui.js');
        showRatingModal = contentUi.showRatingModal;
    });

    // Test: disabled button click should NOT resolve the modal (guard prevents it)
    test('clicking a disabled button does not resolve the modal', async () => {
        // maxRating=2 means Good(3) and Easy(4) are disabled
        const promise = showRatingModal('Two Sum', { slug: 'two-sum', maxRating: 2 });

        // Wait for async modal construction
        await new Promise(r => setTimeout(r, 10));

        // Find the Easy button (value 4, should be disabled)
        const easyBtn = createdElements.find(el =>
            el.className && el.className.includes('rating-btn-easy')
        );
        expect(easyBtn).toBeDefined();
        expect(easyBtn.disabled).toBe(true);

        // Click the disabled button — should NOT resolve the promise
        easyBtn.click();

        // Verify the modal backdrop was NOT removed (modal still open)
        const backdrop = createdElements.find(el =>
            el.className && el.className.includes('lc-rating-backdrop')
        );
        expect(backdrop.remove).not.toHaveBeenCalled();
    });

    // Test: enabled button click should resolve the modal with correct value
    test('clicking an enabled button resolves the modal with its rating value', async () => {
        // maxRating=2 means Again(1) and Hard(2) are enabled
        const promise = showRatingModal('Two Sum', { slug: 'two-sum', maxRating: 2 });

        // Wait for async modal construction
        await new Promise(r => setTimeout(r, 10));

        // Find the Hard button (value 2, should be enabled)
        const hardBtn = createdElements.find(el =>
            el.className && el.className.includes('rating-btn-hard')
        );
        expect(hardBtn).toBeDefined();
        expect(hardBtn.disabled).toBeFalsy();

        // Click the enabled button — should resolve the promise with value 2
        hardBtn.click();

        const result = await promise;
        expect(result).toBe(2);
    });

    // Test: when stored preference is false, all buttons should be enabled regardless of maxRating
    test('stored difficultyRecommendations=false enables all buttons despite maxRating', async () => {
        // Override storage mock to return difficultyRecommendations=false
        global.chrome.storage.local.get = jest.fn((defaults, callback) => {
            if (typeof callback === 'function') {
                // Merge defaults with our override: recommendations disabled
                const result = typeof defaults === 'object' ? { ...defaults } : {};
                result.difficultyRecommendations = false;
                callback(result);
                return;
            }
            return Promise.resolve(typeof defaults === 'object' ? defaults : {});
        });

        // Re-require to pick up new mock
        jest.resetModules();
        createdElements.length = 0;
        const contentUi = require('../src/content/content_ui.js');
        showRatingModal = contentUi.showRatingModal;

        // maxRating=2 would normally disable Good(3) and Easy(4)
        const promise = showRatingModal('Two Sum', { slug: 'two-sum', maxRating: 2 });
        await new Promise(r => setTimeout(r, 10));

        // Easy button should be ENABLED because recommendations are disabled
        const easyBtn = createdElements.find(el =>
            el.className && el.className.includes('rating-btn-easy')
        );
        expect(easyBtn).toBeDefined();
        expect(easyBtn.disabled).toBeFalsy();

        // Good button should also be ENABLED
        const goodBtn = createdElements.find(el =>
            el.className && el.className.includes('rating-btn-good')
        );
        expect(goodBtn).toBeDefined();
        expect(goodBtn.disabled).toBeFalsy();
    });

    // Test: when stored preference is true (default), maxRating restrictions apply normally
    test('stored difficultyRecommendations=true keeps maxRating restrictions', async () => {
        // Storage returns default (true) — recommendations enabled
        global.chrome.storage.local.get = jest.fn((defaults, callback) => {
            if (typeof callback === 'function') {
                const result = typeof defaults === 'object' ? { ...defaults } : {};
                // difficultyRecommendations defaults to true, no override needed
                callback(result);
                return;
            }
            return Promise.resolve(typeof defaults === 'object' ? defaults : {});
        });

        jest.resetModules();
        createdElements.length = 0;
        const contentUi = require('../src/content/content_ui.js');
        showRatingModal = contentUi.showRatingModal;

        // maxRating=2 should disable Good(3) and Easy(4)
        const promise = showRatingModal('Two Sum', { slug: 'two-sum', maxRating: 2 });
        await new Promise(r => setTimeout(r, 10));

        const easyBtn = createdElements.find(el =>
            el.className && el.className.includes('rating-btn-easy')
        );
        expect(easyBtn).toBeDefined();
        expect(easyBtn.disabled).toBe(true);
    });
});

/**
 * Tests for the difficulty recommendations checkbox toggle inside the rating modal.
 * Verifies: checkbox creation, toggle enable/disable, and storage persistence.
 */
describe('Rating Modal - Recommendations Checkbox Toggle', () => {
    let showRatingModal;

    beforeEach(() => {
        jest.resetModules();
        createdElements.length = 0;

        // Callback-style mock that returns defaults (difficultyRecommendations defaults to true)
        global.chrome.storage.local.get = jest.fn((defaults, callback) => {
            if (typeof callback === 'function') {
                callback(typeof defaults === 'object' ? { ...defaults } : {});
                return;
            }
            return Promise.resolve(typeof defaults === 'object' ? defaults : {});
        });
        global.chrome.storage.local.set = jest.fn();

        const contentUi = require('../src/content/content_ui.js');
        showRatingModal = contentUi.showRatingModal;
    });

    // Test: checkbox element exists in the modal with correct default state
    test('checkbox is created with id lc-difficulty-rec and default checked=true', async () => {
        const promise = showRatingModal('Two Sum', { slug: 'two-sum', maxRating: 3 });
        await new Promise(r => setTimeout(r, 10));

        // Find the checkbox input by id
        const checkbox = createdElements.find(el =>
            el.tagName === 'INPUT' && el.type === 'checkbox' && el.id === 'lc-difficulty-rec'
        );
        expect(checkbox).toBeDefined();
        // Default: recommendations enabled = checked
        expect(checkbox.checked).toBe(true);
    });

    // Test: unchecking the toggle enables all previously disabled buttons
    test('unchecking toggle enables all buttons regardless of maxRating', async () => {
        // maxRating=2 disables Good(3) and Easy(4)
        const promise = showRatingModal('Two Sum', { slug: 'two-sum', maxRating: 2 });
        await new Promise(r => setTimeout(r, 10));

        // Verify Easy is initially disabled
        const easyBtn = createdElements.find(el =>
            el.className && el.className.includes('rating-btn-easy')
        );
        expect(easyBtn.disabled).toBe(true);

        // Find checkbox and uncheck it
        const checkbox = createdElements.find(el =>
            el.tagName === 'INPUT' && el.id === 'lc-difficulty-rec'
        );
        checkbox.checked = false;
        // Trigger the change event handler
        checkbox._listeners['change']();

        // Easy button should now be enabled
        expect(easyBtn.disabled).toBe(false);
        expect(easyBtn.style.opacity).toBe('');
        expect(easyBtn.style.pointerEvents).toBe('');
    });

    // Test: re-checking the toggle re-applies maxRating restrictions
    test('re-checking toggle re-disables restricted buttons', async () => {
        const promise = showRatingModal('Two Sum', { slug: 'two-sum', maxRating: 2 });
        await new Promise(r => setTimeout(r, 10));

        const checkbox = createdElements.find(el =>
            el.tagName === 'INPUT' && el.id === 'lc-difficulty-rec'
        );
        const easyBtn = createdElements.find(el =>
            el.className && el.className.includes('rating-btn-easy')
        );

        // Uncheck first
        checkbox.checked = false;
        checkbox._listeners['change']();
        expect(easyBtn.disabled).toBe(false);

        // Re-check — restrictions should re-apply
        checkbox.checked = true;
        checkbox._listeners['change']();
        expect(easyBtn.disabled).toBe(true);
        expect(easyBtn.style.opacity).toBe('0.35');
    });

    // Test: toggling the checkbox persists preference to chrome.storage.local
    test('change event writes difficultyRecommendations to storage', async () => {
        const promise = showRatingModal('Two Sum', { slug: 'two-sum', maxRating: 3 });
        await new Promise(r => setTimeout(r, 10));

        const checkbox = createdElements.find(el =>
            el.tagName === 'INPUT' && el.id === 'lc-difficulty-rec'
        );

        // Uncheck — should write false
        checkbox.checked = false;
        checkbox._listeners['change']();
        expect(global.chrome.storage.local.set).toHaveBeenCalledWith({ difficultyRecommendations: false });

        // Re-check — should write true
        checkbox.checked = true;
        checkbox._listeners['change']();
        expect(global.chrome.storage.local.set).toHaveBeenCalledWith({ difficultyRecommendations: true });
    });
});

/**
 * End-to-end integration tests for the full difficulty recommendation toggle flow.
 * Simulates: restricted modal → user unchecks toggle → clicks Easy → verifies result.
 */
describe('Rating Modal - E2E Toggle Override Flow', () => {
    let showRatingModal;

    beforeEach(() => {
        jest.resetModules();
        createdElements.length = 0;

        // Default storage: recommendations enabled (true)
        global.chrome.storage.local.get = jest.fn((defaults, callback) => {
            if (typeof callback === 'function') {
                callback(typeof defaults === 'object' ? { ...defaults } : {});
                return;
            }
            return Promise.resolve(typeof defaults === 'object' ? defaults : {});
        });
        global.chrome.storage.local.set = jest.fn();

        const contentUi = require('../src/content/content_ui.js');
        showRatingModal = contentUi.showRatingModal;
    });

    // E2E: user overrides restriction via toggle and selects Easy (rating=4)
    test('user unchecks toggle then clicks Easy, modal resolves with rating 4', async () => {
        // maxRating=2 simulates 3+ failures: only Again(1) and Hard(2) enabled
        const promise = showRatingModal('Two Sum', { slug: 'two-sum', maxRating: 2 });
        await new Promise(r => setTimeout(r, 10));

        // Step 1: Verify Easy is initially disabled
        const easyBtn = createdElements.find(el =>
            el.className && el.className.includes('rating-btn-easy')
        );
        expect(easyBtn).toBeDefined();
        expect(easyBtn.disabled).toBe(true);

        // Step 2: User unchecks the recommendations toggle
        const checkbox = createdElements.find(el =>
            el.tagName === 'INPUT' && el.id === 'lc-difficulty-rec'
        );
        expect(checkbox).toBeDefined();
        checkbox.checked = false;
        checkbox._listeners['change']();

        // Step 3: Easy should now be enabled
        expect(easyBtn.disabled).toBe(false);

        // Step 4: User clicks Easy
        easyBtn.click();

        // Step 5: Modal resolves with rating 4 (Easy)
        const result = await promise;
        expect(result).toBe(4);

        // Step 6: Verify the toggle preference was persisted
        expect(global.chrome.storage.local.set).toHaveBeenCalledWith({ difficultyRecommendations: false });
    });

    // E2E: user with stored preference=false sees all buttons enabled from the start
    test('returning user with saved preference=false sees all buttons enabled', async () => {
        // Override storage to return difficultyRecommendations=false
        global.chrome.storage.local.get = jest.fn((defaults, callback) => {
            if (typeof callback === 'function') {
                const result = typeof defaults === 'object' ? { ...defaults } : {};
                result.difficultyRecommendations = false; // Previously saved preference
                callback(result);
                return;
            }
            return Promise.resolve(typeof defaults === 'object' ? defaults : {});
        });

        // Re-require with new mock
        jest.resetModules();
        createdElements.length = 0;
        const contentUi = require('../src/content/content_ui.js');
        showRatingModal = contentUi.showRatingModal;

        // maxRating=2 would normally disable Good and Easy
        const promise = showRatingModal('Two Sum', { slug: 'two-sum', maxRating: 2 });
        await new Promise(r => setTimeout(r, 10));

        // Checkbox should be unchecked (matching stored preference)
        const checkbox = createdElements.find(el =>
            el.tagName === 'INPUT' && el.id === 'lc-difficulty-rec'
        );
        expect(checkbox).toBeDefined();
        expect(checkbox.checked).toBe(false);

        // All buttons should be enabled — no restrictions applied
        const easyBtn = createdElements.find(el =>
            el.className && el.className.includes('rating-btn-easy')
        );
        const goodBtn = createdElements.find(el =>
            el.className && el.className.includes('rating-btn-good')
        );
        expect(easyBtn.disabled).toBeFalsy();
        expect(goodBtn.disabled).toBeFalsy();

        // User clicks Good — modal resolves with rating 3
        goodBtn.click();
        const result = await promise;
        expect(result).toBe(3);
    });

    // E2E: with maxRating=4 (no failures), toggle has no visible effect
    test('toggle has no effect when maxRating=4 (no restrictions to begin with)', async () => {
        const promise = showRatingModal('Two Sum', { slug: 'two-sum', maxRating: 4 });
        await new Promise(r => setTimeout(r, 10));

        // All buttons already enabled
        const easyBtn = createdElements.find(el =>
            el.className && el.className.includes('rating-btn-easy')
        );
        expect(easyBtn.disabled).toBeFalsy();

        // Uncheck toggle — buttons should stay enabled (nothing to change)
        const checkbox = createdElements.find(el =>
            el.tagName === 'INPUT' && el.id === 'lc-difficulty-rec'
        );
        checkbox.checked = false;
        checkbox._listeners['change']();
        expect(easyBtn.disabled).toBe(false);

        // Re-check toggle — still all enabled (maxRating=4 means no restrictions)
        checkbox.checked = true;
        checkbox._listeners['change']();
        expect(easyBtn.disabled).toBe(false);
    });
});
