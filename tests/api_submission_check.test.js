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
    checkLatestSubmissionViaApi,
    captureEditorCodeFromDom,
    clearQuestionInfoCache
} = require('../src/content/leetcode_api.js');

const { saveSubmission } = require('../src/shared/storage.js');

async function flushDetachedAnalysis() {
    // The production hook is intentionally detached from submission polling.
    // Give each awaited mock in that hook a chance to settle before assertions.
    for (let i = 0; i < 3; i++) {
        await new Promise((resolve) => setImmediate(resolve));
    }
}

describe('Monaco editor snapshot capture', () => {
    beforeEach(() => {
        document.querySelectorAll.mockReset();
    });

    test('marks capture as failed when no Monaco lines are available', () => {
        document.querySelectorAll.mockReturnValue([]);

        expect(captureEditorCodeFromDom()).toEqual({
            status: 'failed',
            source: 'dom_viewport',
            code: '',
            reason: 'editor_lines_not_found'
        });
    });

    test('marks Monaco DOM text as partial instead of exact source', () => {
        document.querySelectorAll.mockImplementation((selector) => {
            if (selector === '.monaco-editor.focused .view-lines .view-line') {
                return [
                    { innerText: 'class Solution {' },
                    { innerText: '  return 1;' },
                    { innerText: '}' }
                ];
            }
            return [];
        });

        expect(captureEditorCodeFromDom()).toEqual({
            status: 'partial',
            source: 'dom_viewport',
            code: 'class Solution {\n  return 1;\n}',
            reason: 'monaco_virtualized_dom'
        });
    });
});

describe('API Submission Check Logic', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        clearQuestionInfoCache();

        const { TOAST_THEMES } = require('../src/shared/config.js');
        global.TOAST_THEMES = TOAST_THEMES;

        // Mock UI functions — this test focuses on API flow, not modal rendering
        global.showCompletionToast = jest.fn();
        global.showRatingModal = jest.fn().mockResolvedValue(3);

        global.getCurrentProblemSlug = jest.fn().mockReturnValue('two-sum');

        // Make saveSubmission global for leetcode_api.js
        global.saveSubmission = jest.fn().mockResolvedValue({ success: true });

        // Set document.cookie for fetchQuestionDetails GraphQL calls
        Object.defineProperty(document, 'cookie', {
            writable: true,
            value: 'csrftoken=test-token',
        });

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
            })
            // Mock getQuestionInfo -> fetchQuestionDetails (GraphQL call)
            .mockResolvedValueOnce({
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
        clearQuestionInfoCache();
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
        // Mock getQuestionInfo -> fetchQuestionDetails (GraphQL call)
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
        // Mock getQuestionInfo -> fetchQuestionDetails (GraphQL call)
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
    let uiLanguage;

    function mockWrongAnswerResponses(status = 'Wrong Answer') {
        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                state: 'SUCCESS',
                status_msg: status
            })
        });
        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                data: {
                    question: {
                        difficulty: 'Medium',
                        title: 'Two Sum',
                        questionFrontendId: '1',
                        topicTags: []
                    }
                }
            })
        });
    }

    beforeEach(() => {
        fetch.mockReset();
        jest.clearAllMocks();
        clearQuestionInfoCache();
        uiLanguage = 'en';
        delete global.window.EasyRepeatI18n;
        document.querySelectorAll.mockReturnValue([]);

        global.window.LLMSidecar = {
            analyzeMistake: jest.fn().mockResolvedValue('AI analysis')
        };

        global.showAnalysisModal = jest.fn().mockResolvedValue(true);
        global.saveNotes = jest.fn().mockResolvedValue({ success: true });
        global.getNotes = jest.fn().mockResolvedValue('Existing Notes');

        global.chrome.storage.local.get = jest.fn().mockImplementation((keys) => {
            if (typeof keys === 'object' && keys.aiAnalysisEnabled !== undefined) {
                return Promise.resolve({ aiAnalysisEnabled: true, alwaysAnalyze: false });
            }
            if (typeof keys === 'object' && keys.uiLanguage !== undefined) {
                return Promise.resolve({ uiLanguage });
            }
            return Promise.resolve({});
        });
    });

    test('does not run analysis when AI mode is disabled', async () => {
        global.chrome.storage.local.get.mockImplementation((keys) => {
            if (typeof keys === 'object' && keys.aiAnalysisEnabled !== undefined) {
                return Promise.resolve({ aiAnalysisEnabled: false, alwaysAnalyze: false });
            }
            return Promise.resolve({});
        });

        mockWrongAnswerResponses();

        await checkSubmissionStatus('123', 'Two Sum', 'two-sum', 'Medium');
        await flushDetachedAnalysis();

        expect(global.window.LLMSidecar.analyzeMistake).not.toHaveBeenCalled();
        expect(global.saveNotes).not.toHaveBeenCalled();
    });

    test('forwards a partial click-time snapshot and saves an English note', async () => {
        mockWrongAnswerResponses();
        const capture = {
            status: 'partial',
            source: 'dom_viewport',
            code: 'return nums[0];',
            reason: 'monaco_virtualized_dom'
        };

        await checkSubmissionStatus('123', 'Two Sum', 'two-sum', 'Medium', { capture });
        await flushDetachedAnalysis();

        expect(global.window.LLMSidecar.analyzeMistake).toHaveBeenCalledTimes(1);
        const analysisArgs = global.window.LLMSidecar.analyzeMistake.mock.calls[0];
        expect(analysisArgs[0]).toBe('return nums[0];');
        expect(analysisArgs[2]).toEqual(expect.objectContaining({
            ui_language: 'en',
            code_capture_status: 'partial',
            code_capture_source: 'dom_viewport',
            code_capture_reason: 'monaco_virtualized_dom'
        }));
        expect(global.saveNotes).toHaveBeenCalledTimes(1);

        const noteArgs = global.saveNotes.mock.calls[0];
        expect(noteArgs[0]).toBe('two-sum');
        expect(noteArgs[1]).toContain('### 🤖 AI Analysis');
        expect(noteArgs[1]).toContain('**Mistake:** Wrong Answer');

        const languageReads = global.chrome.storage.local.get.mock.calls
            .filter(([defaults]) => defaults && defaults.uiLanguage !== undefined);
        expect(languageReads).toHaveLength(1);
    });

    test('forwards a failed capture as empty code without a fake code comment', async () => {
        mockWrongAnswerResponses('Compile Error');
        const capture = {
            status: 'failed',
            source: 'dom_viewport',
            code: '',
            reason: 'editor_lines_not_found'
        };

        await checkSubmissionStatus('123', 'Two Sum', 'two-sum', 'Medium', { capture });
        await flushDetachedAnalysis();

        expect(global.window.LLMSidecar.analyzeMistake).toHaveBeenCalledTimes(1);
        const analysisArgs = global.window.LLMSidecar.analyzeMistake.mock.calls[0];
        expect(analysisArgs[0]).toBe('');
        expect(analysisArgs[0]).not.toContain('Code could not be scraped');
        expect(analysisArgs[2]).toEqual(expect.objectContaining({
            code_capture_status: 'failed',
            code_capture_source: 'dom_viewport',
            code_capture_reason: 'editor_lines_not_found'
        }));
    });

    test('uses Chinese for both model metadata and the saved note wrapper', async () => {
        global.window.EasyRepeatI18n = {
            getLanguage: jest.fn().mockResolvedValue('zh-CN'),
            normalizeLanguage: jest.fn().mockReturnValue('zh')
        };
        global.window.LLMSidecar.analyzeMistake.mockResolvedValue('这里是中文分析。');
        mockWrongAnswerResponses();

        await checkSubmissionStatus('123', 'Two Sum', 'two-sum', 'Medium', {
            capture: {
                status: 'partial',
                source: 'dom_viewport',
                code: 'return [];',
                reason: 'monaco_virtualized_dom'
            }
        });
        await flushDetachedAnalysis();

        const analysisArgs = global.window.LLMSidecar.analyzeMistake.mock.calls[0];
        expect(analysisArgs[2].ui_language).toBe('zh');

        const savedNote = global.saveNotes.mock.calls[0][1];
        expect(savedNote).toContain('### 🤖 AI 错误分析');
        expect(savedNote).toContain('**错误类型：** 答案错误');
        expect(savedNote).toContain('这里是中文分析。');

        expect(global.window.EasyRepeatI18n.getLanguage).toHaveBeenCalledTimes(1);
        const storageLanguageReads = global.chrome.storage.local.get.mock.calls
            .filter(([defaults]) => defaults && defaults.uiLanguage !== undefined);
        expect(storageLanguageReads).toHaveLength(0);
    });
});
