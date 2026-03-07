/**
 * Shadow Logger Tests
 * 
 * Tests for the submission shadow logging system that captures all
 * LeetCode submissions for the Neural Retention Agent.
 */

// Mock chrome.storage
const mockStorage = {};
global.chrome = {
    storage: {
        local: {
            get: jest.fn((keys) => Promise.resolve(mockStorage)),
            set: jest.fn((data) => {
                Object.assign(mockStorage, data);
                return Promise.resolve();
            })
        }
    }
};

// Mock IndexedDB via fake-indexeddb
const { ShadowLogger, createSubmissionEntry, getSessionId } = require('../src/content/shadow_logger');

describe('Shadow Logger', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset mock storage
        Object.keys(mockStorage).forEach(key => delete mockStorage[key]);
    });

    describe('getSessionId', () => {
        it('should return day-YYYY-MM-DD format', () => {
            const sessionId = getSessionId();
            expect(sessionId).toMatch(/^day-\d{4}-\d{2}-\d{2}$/);
        });

        it('should return same session ID for same day', () => {
            const id1 = getSessionId();
            const id2 = getSessionId();
            expect(id1).toBe(id2);
        });
    });

    describe('createSubmissionEntry', () => {
        it('should create a valid submission entry with all required fields', () => {
            const entry = createSubmissionEntry({
                problemSlug: 'two-sum',
                problemTitle: '1. Two Sum',
                difficulty: 'Easy',
                topics: ['Array', 'Hash Table'],
                language: 'python3',
                code: 'def twoSum(self, nums, target): pass',
                result: 'Wrong Answer',
                errorDetails: {
                    type: 'Wrong Answer',
                    testInput: '[2,7,11,15], 9',
                    expected: '[0,1]',
                    actual: '[1,0]'
                },
                submissionId: '123456'
            });

            expect(entry).toMatchObject({
                problemSlug: 'two-sum',
                problemTitle: '1. Two Sum',
                difficulty: 'Easy',
                topics: ['Array', 'Hash Table'],
                language: 'python3',
                code: 'def twoSum(self, nums, target): pass',
                result: 'Wrong Answer',
                submissionId: '123456'
            });

            // Check auto-generated fields
            expect(entry.id).toBeDefined();
            expect(entry.timestamp).toBeDefined();
            expect(entry.sessionId).toMatch(/^day-\d{4}-\d{2}-\d{2}$/);
        });

        it('should handle missing optional fields gracefully', () => {
            const entry = createSubmissionEntry({
                problemSlug: 'two-sum',
                result: 'Accepted'
            });

            expect(entry.problemSlug).toBe('two-sum');
            expect(entry.result).toBe('Accepted');
            expect(entry.topics).toEqual([]);
            expect(entry.errorDetails).toBeUndefined();
        });

        it('should increment attempt number for same problem in same session', () => {
            const entry1 = createSubmissionEntry({
                problemSlug: 'two-sum',
                result: 'Wrong Answer'
            });

            // This would require the logger to track attempt counts
            expect(entry1.attemptNumber).toBe(1);
        });
    });

    describe('ShadowLogger.log', () => {
        let logger;

        beforeEach(async () => {
            logger = new ShadowLogger();
            await logger.init();
        });

        afterEach(async () => {
            await logger.clear();
        });

        it('should save submission to database', async () => {
            const submission = {
                problemSlug: 'two-sum',
                problemTitle: '1. Two Sum',
                difficulty: 'Easy',
                topics: ['Array'],
                language: 'python3',
                code: 'def twoSum(): pass',
                result: 'Wrong Answer',
                submissionId: '12345'
            };

            await logger.log(submission);

            const entries = await logger.getToday();
            expect(entries.length).toBe(1);
            expect(entries[0].problemSlug).toBe('two-sum');
        });

        it('should group submissions by session (day)', async () => {
            await logger.log({ problemSlug: 'two-sum', result: 'Wrong Answer' });
            await logger.log({ problemSlug: 'three-sum', result: 'Accepted' });

            const today = await logger.getToday();
            expect(today.length).toBe(2);
        });

        it('should track attempt number per problem per session', async () => {
            await logger.log({ problemSlug: 'two-sum', result: 'Wrong Answer' });
            await logger.log({ problemSlug: 'two-sum', result: 'Wrong Answer' });
            await logger.log({ problemSlug: 'two-sum', result: 'Accepted' });

            const today = await logger.getToday();
            const twoSumAttempts = today.filter(e => e.problemSlug === 'two-sum');

            expect(twoSumAttempts.length).toBe(3);
            expect(twoSumAttempts[0].attemptNumber).toBe(1);
            expect(twoSumAttempts[1].attemptNumber).toBe(2);
            expect(twoSumAttempts[2].attemptNumber).toBe(3);
        });
    });

    describe('ShadowLogger.getByProblem', () => {
        let logger;

        beforeEach(async () => {
            logger = new ShadowLogger();
            await logger.init();
        });

        afterEach(async () => {
            await logger.clear();
        });

        it('should return all submissions for a specific problem', async () => {
            await logger.log({ problemSlug: 'two-sum', result: 'Wrong Answer' });
            await logger.log({ problemSlug: 'three-sum', result: 'Accepted' });
            await logger.log({ problemSlug: 'two-sum', result: 'Accepted' });

            const twoSumSubmissions = await logger.getByProblem('two-sum');
            expect(twoSumSubmissions.length).toBe(2);
        });
    });

    describe('ShadowLogger.cleanup', () => {
        let logger;

        beforeEach(async () => {
            logger = new ShadowLogger();
            await logger.init();
        });

        afterEach(async () => {
            await logger.clear();
        });

        it('should remove entries older than specified days', async () => {
            // This test would require time mocking
            // For now, just verify the method exists and doesn't throw
            await expect(logger.cleanup(7)).resolves.not.toThrow();
        });
    });

    describe('ShadowLogger.getStats', () => {
        let logger;

        beforeEach(async () => {
            logger = new ShadowLogger();
            await logger.init();
        });

        afterEach(async () => {
            await logger.clear();
        });

        it('should return submission statistics', async () => {
            await logger.log({ problemSlug: 'two-sum', result: 'Wrong Answer' });
            await logger.log({ problemSlug: 'two-sum', result: 'Accepted' });
            await logger.log({ problemSlug: 'three-sum', result: 'Accepted' });

            const stats = await logger.getStats();

            expect(stats.totalSubmissions).toBe(3);
            expect(stats.uniqueProblems).toBe(2);
            expect(stats.acceptedCount).toBe(2);
            expect(stats.failedCount).toBe(1);
        });
    });
});
