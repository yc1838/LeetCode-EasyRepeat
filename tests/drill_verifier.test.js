/**
 * Drill Verifier Tests (TDD)
 * 
 * Tests for verifying drill answers and scoring AI-graded responses.
 */

// Mock chrome APIs
global.chrome = {
    storage: {
        local: {
            get: jest.fn(() => Promise.resolve({ geminiApiKey: 'test-key' })),
            set: jest.fn(() => Promise.resolve())
        }
    }
};

// Mock fetch
global.fetch = jest.fn();

// Setup fake IndexedDB
require('fake-indexeddb/auto');
const Dexie = require('dexie');
global.Dexie = Dexie;

describe('Drill Verifier', () => {
    let DrillVerifier;
    let DrillStore;

    beforeAll(() => {
        DrillStore = require('../src/background/drill_store');
        DrillVerifier = require('../src/background/drill_verifier');
    });

    beforeEach(async () => {
        jest.clearAllMocks();
        global.fetch.mockReset();
    });

    describe('verifyAnswer', () => {
        it('should verify fill-in-blank correct answer', async () => {
            const drill = {
                id: 'test1',
                type: 'fill-in-blank',
                content: 'Use ___ for FIFO',
                answer: 'queue',
                skillId: 'bfs'
            };

            const result = await DrillVerifier.verifyAnswer(drill, 'queue');

            expect(result.correct).toBe(true);
            expect(result.feedback).toContain('Correct');
        });

        it('should verify fill-in-blank wrong answer', async () => {
            const drill = {
                id: 'test2',
                type: 'fill-in-blank',
                answer: 'queue'
            };

            const result = await DrillVerifier.verifyAnswer(drill, 'stack');

            expect(result.correct).toBe(false);
            expect(result.feedback).toContain('queue');
        });

        it('should verify spot-bug correct line', async () => {
            const drill = {
                id: 'test3',
                type: 'spot-bug',
                answer: 'line 3'
            };

            const result = await DrillVerifier.verifyAnswer(drill, 3);

            expect(result.correct).toBe(true);
        });

        it('should verify spot-bug wrong line', async () => {
            const drill = {
                id: 'test4',
                type: 'spot-bug',
                answer: 'line 3'
            };

            const result = await DrillVerifier.verifyAnswer(drill, 1);

            expect(result.correct).toBe(false);
        });
    });

    describe('gradeWithAI', () => {
        it('should grade critique response with Gemini', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    candidates: [{
                        content: {
                            parts: [{
                                text: JSON.stringify({
                                    score: 0.8,
                                    correct: true,
                                    feedback: 'Good observation about time complexity'
                                })
                            }]
                        }
                    }]
                })
            });

            const drill = {
                type: 'critique',
                content: 'def fib(n): return fib(n-1) + fib(n-2)'
            };

            const result = await DrillVerifier.gradeWithAI(drill, 'Uses exponential time, should memoize');

            expect(result.correct).toBe(true);
            expect(result.score).toBe(0.8);
        });

        it('should grade muscle-memory with Gemini', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    candidates: [{
                        content: {
                            parts: [{
                                text: JSON.stringify({
                                    score: 0.9,
                                    correct: true,
                                    feedback: 'Correct BFS implementation'
                                })
                            }]
                        }
                    }]
                })
            });

            const drill = {
                type: 'muscle-memory',
                content: 'Write BFS traversal'
            };

            const result = await DrillVerifier.gradeWithAI(drill, 'def bfs(root): queue = [root] ...');

            expect(result.correct).toBe(true);
        });

        it('should handle AI grading failure gracefully', async () => {
            global.fetch.mockResolvedValueOnce({ ok: false, status: 500 });

            const drill = { type: 'critique', content: 'code' };

            const result = await DrillVerifier.gradeWithAI(drill, 'response');

            expect(result.error).toBeDefined();
            expect(result.correct).toBeNull();
        });
    });

    describe('buildGradingPrompt', () => {
        it('should include code and response for critique', () => {
            const prompt = DrillVerifier.buildGradingPrompt('critique', {
                original: 'def slow_fib(n): ...',
                response: 'Should use memoization'
            });

            expect(prompt).toContain('slow_fib');
            expect(prompt).toContain('memoization');
        });

        it('should include prompt and submission for muscle-memory', () => {
            const prompt = DrillVerifier.buildGradingPrompt('muscle-memory', {
                prompt: 'Write binary search',
                submission: 'def bs(arr, t): ...'
            });

            expect(prompt).toContain('binary search');
            expect(prompt).toContain('def bs');
        });
    });
});
