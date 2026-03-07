// Mock global fetch
global.fetch = jest.fn();

// Mock chrome global
global.chrome = {
    runtime: {
        onMessage: {
            addListener: jest.fn()
        },
        id: 'test-id'
    },
    storage: {
        local: {
            get: jest.fn().mockImplementation(() => Promise.resolve({ problems: {} })),
            set: jest.fn()
        }
    }
};

// Mock window and document
global.window = {
    location: {
        pathname: '/problems/two-sum'
    }
};

global.document = {
    addEventListener: jest.fn(),
    querySelector: jest.fn(),
    querySelectorAll: jest.fn(),
    getElementsByTagName: jest.fn(),
    getElementsByTagName: jest.fn(),
    referrer: '',
    head: { appendChild: jest.fn() },
    body: { appendChild: jest.fn() },
    createElement: jest.fn().mockImplementation((tag) => {
        return {
            tagName: tag.toUpperCase(),
            style: {},
            classList: { add: jest.fn(), remove: jest.fn() },
            remove: jest.fn(),
            setAttribute: jest.fn(),
            appendChild: jest.fn(),
            // Auto-click buttons to bypass modal in these tests
            addEventListener: jest.fn((evt, cb) => {
                if (tag === 'button' && evt === 'click') {
                    // Execute immediately to simulate instant user interaction
                    cb();
                }
            }),
            // Legacy support if specific tests use it
            click: jest.fn()
        };
    })
};

global.MutationObserver = class {
    constructor(callback) { }
    observe(element, options) { }
    disconnect() { }
};

// Mock calculateNextReview
global.calculateNextReview = jest.fn().mockReturnValue({
    nextInterval: 1,
    nextRepetition: 1,
    nextEaseFactor: 2.5,
    nextReviewDate: '2025-01-01'
});

const {
    pollSubmissionResult,
    checkSubmissionStatus,
    checkLatestSubmissionViaApi
} = require('../src/content/leetcode_api.js');

const { saveSubmission } = require('../src/shared/storage.js');

describe('API Submission Check Logic', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        const { TOAST_THEMES } = require('../src/shared/config.js');
        global.TOAST_THEMES = TOAST_THEMES;

        const { showCompletionToast, showRatingModal } = require('../src/content/content_ui.js');
        global.showCompletionToast = showCompletionToast;
        global.showRatingModal = showRatingModal;

        const { extractProblemDetails, getCurrentProblemSlug } = require('../src/content/leetcode_dom.js');
        global.extractProblemDetails = extractProblemDetails;
        global.getCurrentProblemSlug = getCurrentProblemSlug;

        // Make saveSubmission global for leetcode_api.js
        global.saveSubmission = jest.fn().mockResolvedValue({ success: true });

        // Reset document body
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('should find the latest submission after a click', async () => {
        const mockSubmissionId = "12345";
        const clickTime = Math.floor(Date.now() / 1000);

        // Mock /api/submissions response
        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                submissions_dump: [
                    { id: "12345", timestamp: clickTime + 1, status_display: "Pending" },
                    { id: "11111", timestamp: clickTime - 100, status_display: "Accepted" }
                ]
            })
        });

        // Mock /submissions/detail/12345/check/ response (first Pending, then Accepted)
        fetch
            .mockResolvedValueOnce({ // 1st poll
                ok: true,
                json: async () => ({ state: "PENDING" })
            })
            .mockResolvedValueOnce({ // 2nd poll
                ok: true,
                json: async () => ({ state: "SUCCESS", status_msg: "Accepted", status_code: 10 })
            });

        // We execute the poll function. It doesn't return anything but logs/saves.
        // Since we use fake timers and pollSubmissionResult waits, we must not await it immediately
        // if it enters a wait loop.
        const pollPromise = pollSubmissionResult("two-sum", clickTime, "Two Sum", "Medium");

        // Advance time to allow retries/polling intervals to trigger
        // We know checkSubmissionStatus waits 1000ms
        await jest.advanceTimersByTimeAsync(2000);

        await pollPromise;
    });
});

describe('Manual API Scan Logic (checkLatestSubmissionViaApi)', () => {
    let mockSaveSubmission;

    beforeEach(() => {
        fetch.mockReset();
        mockSaveSubmission = jest.fn().mockResolvedValue({ success: true });
        global.saveSubmission = mockSaveSubmission;

        // Ensure legacy deps are there if needed
        global.showRatingModal = jest.fn().mockResolvedValue(null);
        global.extractProblemDetails = jest.fn().mockReturnValue({ title: "Two Sum", slug: "two-sum", difficulty: "Medium" });

        // Fix for fetchQuestionDetails
        Object.defineProperty(document, 'cookie', {
            writable: true,
            value: 'csrftoken=test-token',
        });
    });

    test('returns success if latest submission is Accepted', async () => {
        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                submissions_dump: [
                    { id: "999", status_display: "Accepted", timestamp: 1234567890 }
                ]
            })
        });

        const result = await checkLatestSubmissionViaApi("two-sum");
        expect(result).toEqual({ success: true });
    });

    test('should pass topics to saveSubmission', async () => {
        // Mock finding the submission
        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                submission_list: [
                    { id: "999", status_display: "Accepted", timestamp: 1234567890 }
                ]
            })
        });

        // Mock GraphQL details fetch
        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                data: {
                    question: {
                        difficulty: "Hard",
                        title: "Two Sum",
                        questionFrontendId: "1",
                        topicTags: [{ name: "Array", slug: "array" }, { name: "Hash Table", slug: "hash-table" }]
                    }
                }
            })
        });

        await checkLatestSubmissionViaApi("two-sum");

        expect(mockSaveSubmission).toHaveBeenCalledWith(
            "1. Two Sum",
            "two-sum",
            "Hard",
            "manual_api_scan",
            null, // rating (mocked to null)
            ["Array", "Hash Table"] // topics
        );
    });

    test('returns success if latest submission is Accepted (Legacy Format)', async () => {
        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                submission_list: [
                    { id: "999", status_display: "Accepted", timestamp: 1234567890 }
                ]
            })
        });

        const result = await checkLatestSubmissionViaApi("two-sum");
        expect(result).toEqual({ success: true });
    });

    test('returns false if latest submission is Wrong Answer', async () => {
        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                submission_list: [
                    { id: "998", status_display: "Wrong Answer", timestamp: 1234567890 }
                ]
            })
        });

        const result = await checkLatestSubmissionViaApi("two-sum");
        expect(result.success).toBe(false);
        expect(result.status).toBe("Wrong Answer");
    });

    test('returns false if no submissions found', async () => {
        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                submission_list: []
            })
        });

        const result = await checkLatestSubmissionViaApi("two-sum");
        expect(result.success).toBe(false);
        expect(result.error).toContain("No submissions");
    });
});

describe('AI Analysis Hook (Wrong Answer path)', () => {
    beforeEach(() => {
        fetch.mockReset();
        jest.clearAllMocks();

        global.window.LLMSidecar = {
            analyzeMistake: jest.fn().mockResolvedValue('AI analysis')
        };

        global.showAnalysisModal = jest.fn().mockResolvedValue(true);
        global.saveNotes = jest.fn().mockResolvedValue({ success: true });
        global.getNotes = jest.fn().mockResolvedValue('Existing Notes');

        global.chrome.storage.local.get = jest.fn().mockImplementation((keys) => {
            if (Array.isArray(keys) && keys.includes('alwaysAnalyze')) {
                return Promise.resolve({ alwaysAnalyze: false });
            }
            if (typeof keys === 'object' && keys.aiAnalysisEnabled !== undefined) {
                return Promise.resolve({ aiAnalysisEnabled: true });
            }
            return Promise.resolve({});
        });
    });

    test('does not run analysis when AI mode is disabled', async () => {
        global.chrome.storage.local.get.mockImplementation((keys) => {
            if (Array.isArray(keys) && keys.includes('alwaysAnalyze')) {
                return Promise.resolve({ alwaysAnalyze: false });
            }
            if (typeof keys === 'object' && keys.aiAnalysisEnabled !== undefined) {
                return Promise.resolve({ aiAnalysisEnabled: false });
            }
            return Promise.resolve({});
        });

        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                state: 'SUCCESS',
                status_msg: 'Wrong Answer'
            })
        });

        await checkSubmissionStatus('123', 'Two Sum', 'two-sum', 'Medium');
        await new Promise((r) => setImmediate(r));

        expect(global.window.LLMSidecar.analyzeMistake).not.toHaveBeenCalled();
        expect(global.saveNotes).not.toHaveBeenCalled();
    });

    test('runs analysis and saves notes when AI mode is enabled', async () => {
        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                state: 'SUCCESS',
                status_msg: 'Wrong Answer'
            })
        });

        await checkSubmissionStatus('123', 'Two Sum', 'two-sum', 'Medium');
        await new Promise((r) => setImmediate(r));

        expect(global.window.LLMSidecar.analyzeMistake).toHaveBeenCalledTimes(1);
        expect(global.saveNotes).toHaveBeenCalledTimes(1);

        const args = global.saveNotes.mock.calls[0];
        expect(args[0]).toBe('two-sum');
        expect(args[1]).toContain('AI Analysis');
    });
});
