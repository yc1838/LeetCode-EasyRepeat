/**
 * Tests for code scraping sanitization — stripping U+00A0 (non-breaking space)
 * from code scraped via Monaco editor DOM lines.
 *
 * The root bug: LeetCode's Monaco editor renders non-breaking spaces (\u00A0)
 * which get scraped as innerText, causing Python "SyntaxError: invalid
 * non-printable character U+00A0" when the code is sent to the autofix agent.
 */

// Mock global fetch
global.fetch = jest.fn();

// Mock chrome global
global.chrome = {
    runtime: {
        onMessage: { addListener: jest.fn() },
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
    location: { pathname: '/problems/two-sum' }
};

global.document = {
    addEventListener: jest.fn(),
    querySelector: jest.fn(),
    querySelectorAll: jest.fn(),
    getElementsByTagName: jest.fn(),
    referrer: '',
    head: { appendChild: jest.fn() },
    body: { appendChild: jest.fn() },
    createElement: jest.fn().mockImplementation((tag) => ({
        tagName: tag.toUpperCase(),
        style: {},
        classList: { add: jest.fn(), remove: jest.fn() },
        remove: jest.fn(),
        setAttribute: jest.fn(),
        appendChild: jest.fn(),
        addEventListener: jest.fn(),
        click: jest.fn()
    }))
};

global.MutationObserver = class {
    constructor() {}
    observe() {}
    disconnect() {}
};

global.calculateNextReview = jest.fn().mockReturnValue({
    nextInterval: 1,
    nextRepetition: 1,
    nextEaseFactor: 2.5,
    nextReviewDate: '2025-01-01'
});

// Deps for checkSubmissionStatus
global.showRatingModal = jest.fn().mockResolvedValue(3);
global.showCompletionToast = jest.fn();
global.saveSubmission = jest.fn().mockResolvedValue({ success: true });

Object.defineProperty(document, 'cookie', {
    writable: true,
    value: 'csrftoken=test-token',
});

const {
    checkSubmissionStatus,
    clearQuestionInfoCache
} = require('../src/content/leetcode_api.js');


describe('Code scraping: U+00A0 sanitization', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        clearQuestionInfoCache();

        // Enable AI analysis so the code scraping path executes
        global.window.LLMSidecar = {
            analyzeMistake: jest.fn().mockResolvedValue('AI analysis')
        };
        global.showAnalysisModal = jest.fn().mockResolvedValue(true);
        global.saveNotes = jest.fn().mockResolvedValue({ success: true });
        global.getNotes = jest.fn().mockResolvedValue('');

        global.chrome.storage.local.get.mockImplementation((keys) => {
            if (typeof keys === 'object' && keys.activeSession !== undefined) {
                return Promise.resolve({ activeSession: null });
            }
            if (typeof keys === 'object' && keys.aiAnalysisEnabled !== undefined) {
                return Promise.resolve({ aiAnalysisEnabled: true, alwaysAnalyze: true });
            }
            return Promise.resolve({});
        });
    });

    // Helper: simulate Monaco editor DOM lines with given texts
    function mockMonacoLines(lineTexts) {
        const fakeLines = lineTexts.map(text => ({ innerText: text }));
        document.querySelectorAll.mockImplementation((selector) => {
            if (selector === '.view-lines .view-line') return fakeLines;
            return [];
        });
    }

    // Helper: trigger the Wrong Answer code path and return the code that was
    // passed to analyzeMistake
    async function triggerWrongAnswerAndGetCode(lineTexts) {
        mockMonacoLines(lineTexts);

        // Mock submission check: Wrong Answer
        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                state: 'SUCCESS',
                status_msg: 'Wrong Answer',
                status_code: 11,
            })
        });
        // Mock GraphQL question details
        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                data: {
                    question: {
                        difficulty: 'Easy',
                        title: 'Two Sum',
                        questionFrontendId: '1',
                        topicTags: []
                    }
                }
            })
        });

        await checkSubmissionStatus('123', 'Two Sum', 'two-sum', 'Easy');
        // Wait for the async IIFE inside checkSubmissionStatus
        await new Promise(r => setImmediate(r));

        // Return the code argument that was passed to analyzeMistake
        if (global.window.LLMSidecar.analyzeMistake.mock.calls.length === 0) {
            return null;
        }
        return global.window.LLMSidecar.analyzeMistake.mock.calls[0][0];
    }

    test('strips non-breaking spaces (\\u00A0) from scraped code', async () => {
        const code = await triggerWrongAnswerAndGetCode([
            'def\u00A0twoSum(self,\u00A0nums,\u00A0target):',
            '\u00A0\u00A0\u00A0\u00A0return\u00A0[]',
        ]);

        expect(code).not.toBeNull();
        // Should NOT contain any U+00A0 characters
        expect(code).not.toContain('\u00A0');
        // Should still contain regular spaces
        expect(code).toContain('def twoSum(self, nums, target):');
        expect(code).toContain('    return []');
    });

    test('preserves already-clean code without modification', async () => {
        const code = await triggerWrongAnswerAndGetCode([
            'def twoSum(self, nums, target):',
            '    seen = {}',
            '    for i, n in enumerate(nums):',
            '        if target - n in seen:',
            '            return [seen[target - n], i]',
            '        seen[n] = i',
        ]);

        expect(code).not.toBeNull();
        expect(code).toContain('def twoSum(self, nums, target):');
        expect(code).toContain('    seen = {}');
    });

    test('handles code with mixed regular spaces and \\u00A0', async () => {
        const code = await triggerWrongAnswerAndGetCode([
            'class\u00A0Solution:',          // NBSP between class and Solution
            '    def solve(self):',           // Regular indentation
            '\u00A0\u00A0\u00A0\u00A0pass',   // NBSP indentation
        ]);

        expect(code).not.toBeNull();
        expect(code).not.toContain('\u00A0');
        expect(code).toContain('class Solution:');
        expect(code).toContain('    pass');
    });

    test('handles empty Monaco lines', async () => {
        const code = await triggerWrongAnswerAndGetCode([]);

        // With no lines, code should be the fallback comment
        expect(code).toContain('Code could not be scraped');
    });

    test('handles lines with ONLY \\u00A0 characters', async () => {
        const code = await triggerWrongAnswerAndGetCode([
            '\u00A0\u00A0\u00A0\u00A0',
            'x = 1',
        ]);

        expect(code).not.toBeNull();
        expect(code).not.toContain('\u00A0');
        // The NBSP-only line becomes spaces
        expect(code).toContain('x = 1');
    });

    test('handles multiple \\u00A0 in a row (common in deep indentation)', async () => {
        const code = await triggerWrongAnswerAndGetCode([
            'def\u00A0f():',
            '\u00A0\u00A0\u00A0\u00A0if\u00A0True:',
            '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0return\u00A01',
        ]);

        expect(code).not.toBeNull();
        expect(code).not.toContain('\u00A0');
        expect(code).toContain('def f():');
        expect(code).toContain('        return 1');
    });
});
