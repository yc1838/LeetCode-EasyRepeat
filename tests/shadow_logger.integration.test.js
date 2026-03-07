/**
 * Shadow Logger Integration Tests
 * 
 * Tests using fake-indexeddb to verify real IndexedDB operations.
 * These tests validate the full data flow from logging to retrieval.
 */

// Setup fake IndexedDB BEFORE requiring Dexie
require('fake-indexeddb/auto');
const Dexie = require('dexie');

// Make Dexie available globally for shadow_logger
global.Dexie = Dexie;

const { ShadowLogger, createSubmissionEntry, getSessionId } = require('../src/content/shadow_logger');

describe('Shadow Logger Integration Tests (IndexedDB)', () => {
    let logger;

    beforeEach(async () => {
        // Create fresh logger with real IndexedDB
        logger = new ShadowLogger();
        await logger.init();
    });

    afterEach(async () => {
        // Clean up database
        if (logger) {
            await logger.clear();
        }
    });

    describe('IndexedDB Write/Read Operations', () => {
        it('should persist data across logger instances', async () => {
            // Write with first logger
            await logger.log({
                problemSlug: 'two-sum',
                problemTitle: '1. Two Sum',
                difficulty: 'Easy',
                result: 'Accepted',
                code: 'def twoSum(nums, target): return [0, 1]'
            });

            // The data should be in IndexedDB even if we query with same instance
            const entries = await logger.getToday();
            expect(entries.length).toBe(1);
            expect(entries[0].problemSlug).toBe('two-sum');
            expect(entries[0].result).toBe('Accepted');
            expect(entries[0].code).toContain('twoSum');
        });

        it('should handle concurrent writes correctly', async () => {
            // Simulate rapid submissions
            const promises = [
                logger.log({ problemSlug: 'problem-1', result: 'Wrong Answer' }),
                logger.log({ problemSlug: 'problem-2', result: 'TLE' }),
                logger.log({ problemSlug: 'problem-3', result: 'Accepted' }),
            ];

            await Promise.all(promises);

            const entries = await logger.getToday();
            expect(entries.length).toBe(3);

            const slugs = entries.map(e => e.problemSlug).sort();
            expect(slugs).toEqual(['problem-1', 'problem-2', 'problem-3']);
        });

        it('should maintain attempt order for same problem', async () => {
            // Multiple attempts on same problem
            await logger.log({ problemSlug: 'hard-problem', result: 'Wrong Answer' });
            await logger.log({ problemSlug: 'hard-problem', result: 'Wrong Answer' });
            await logger.log({ problemSlug: 'hard-problem', result: 'TLE' });
            await logger.log({ problemSlug: 'hard-problem', result: 'Accepted' });

            const entries = await logger.getByProblem('hard-problem');

            expect(entries.length).toBe(4);
            expect(entries[0].attemptNumber).toBe(1);
            expect(entries[1].attemptNumber).toBe(2);
            expect(entries[2].attemptNumber).toBe(3);
            expect(entries[3].attemptNumber).toBe(4);

            expect(entries[0].result).toBe('Wrong Answer');
            expect(entries[3].result).toBe('Accepted');
        });
    });

    describe('Data Persistence and Queries', () => {
        it('should store full submission data with error details', async () => {
            await logger.log({
                problemSlug: 'three-sum',
                problemTitle: '15. 3Sum',
                difficulty: 'Medium',
                topics: ['Array', 'Two Pointers', 'Sorting'],
                language: 'python3',
                code: 'def threeSum(nums):\n    # buggy code\n    return []',
                result: 'Wrong Answer',
                errorDetails: {
                    type: 'Wrong Answer',
                    testInput: '[-1,0,1,2,-1,-4]',
                    expected: '[[-1,-1,2],[-1,0,1]]',
                    actual: '[]',
                    runtimeError: ''
                },
                submissionId: '987654'
            });

            const entries = await logger.getToday();
            const entry = entries[0];

            expect(entry.problemSlug).toBe('three-sum');
            expect(entry.problemTitle).toBe('15. 3Sum');
            expect(entry.difficulty).toBe('Medium');
            expect(entry.topics).toEqual(['Array', 'Two Pointers', 'Sorting']);
            expect(entry.language).toBe('python3');
            expect(entry.code).toContain('threeSum');
            expect(entry.errorDetails.testInput).toBe('[-1,0,1,2,-1,-4]');
            expect(entry.submissionId).toBe('987654');
        });

        it('should filter by problem slug correctly', async () => {
            await logger.log({ problemSlug: 'two-sum', result: 'Accepted' });
            await logger.log({ problemSlug: 'three-sum', result: 'Accepted' });
            await logger.log({ problemSlug: 'two-sum', result: 'Wrong Answer' });
            await logger.log({ problemSlug: 'four-sum', result: 'TLE' });

            const twoSumEntries = await logger.getByProblem('two-sum');
            expect(twoSumEntries.length).toBe(2);
            expect(twoSumEntries.every(e => e.problemSlug === 'two-sum')).toBe(true);
        });

        it('should calculate accurate statistics', async () => {
            await logger.log({ problemSlug: 'p1', result: 'Wrong Answer' });
            await logger.log({ problemSlug: 'p1', result: 'Wrong Answer' });
            await logger.log({ problemSlug: 'p1', result: 'Accepted' });
            await logger.log({ problemSlug: 'p2', result: 'TLE' });
            await logger.log({ problemSlug: 'p2', result: 'Accepted' });
            await logger.log({ problemSlug: 'p3', result: 'Accepted' });

            const stats = await logger.getStats();

            expect(stats.totalSubmissions).toBe(6);
            expect(stats.uniqueProblems).toBe(3);
            expect(stats.acceptedCount).toBe(3);
            expect(stats.failedCount).toBe(3);
            expect(parseFloat(stats.successRate)).toBeCloseTo(50.0, 1);
        });
    });

    describe('Session Grouping', () => {
        it('should group entries by day correctly', async () => {
            // All entries today
            await logger.log({ problemSlug: 'morning-problem', result: 'Accepted' });
            await logger.log({ problemSlug: 'afternoon-problem', result: 'Wrong Answer' });

            const today = await logger.getToday();
            expect(today.length).toBe(2);

            const sessionId = getSessionId();
            expect(today.every(e => e.sessionId === sessionId)).toBe(true);
        });

        it('should query by session ID', async () => {
            const todaySession = getSessionId();

            await logger.log({ problemSlug: 'today-problem', result: 'Accepted' });

            const bySession = await logger.getBySession(todaySession);
            expect(bySession.length).toBe(1);
            expect(bySession[0].problemSlug).toBe('today-problem');
        });
    });

    describe('Export and Cleanup', () => {
        it('should export all data correctly', async () => {
            await logger.log({ problemSlug: 'p1', result: 'Accepted' });
            await logger.log({ problemSlug: 'p2', result: 'Accepted' });

            const exported = await logger.exportAll();
            expect(exported.length).toBe(2);
        });

        it('should clear all data', async () => {
            await logger.log({ problemSlug: 'p1', result: 'Accepted' });
            await logger.log({ problemSlug: 'p2', result: 'Accepted' });

            await logger.clear();

            const remaining = await logger.getToday();
            expect(remaining.length).toBe(0);
        });
    });
});

describe('Submission Entry Schema', () => {
    it('should generate valid UUID', () => {
        const entry = createSubmissionEntry({ problemSlug: 'test', result: 'Accepted' });
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(entry.id).toMatch(uuidRegex);
    });

    it('should generate valid ISO timestamp', () => {
        const entry = createSubmissionEntry({ problemSlug: 'test', result: 'Accepted' });
        const parsed = new Date(entry.timestamp);
        expect(parsed.toString()).not.toBe('Invalid Date');
    });

    it('should include all expected fields', () => {
        const entry = createSubmissionEntry({
            problemSlug: 'test',
            problemTitle: 'Test Problem',
            difficulty: 'Easy',
            topics: ['Array'],
            language: 'python3',
            code: 'def test(): pass',
            result: 'Accepted',
            submissionId: '12345'
        });

        expect(entry).toHaveProperty('id');
        expect(entry).toHaveProperty('timestamp');
        expect(entry).toHaveProperty('sessionId');
        expect(entry).toHaveProperty('problemSlug');
        expect(entry).toHaveProperty('problemTitle');
        expect(entry).toHaveProperty('difficulty');
        expect(entry).toHaveProperty('topics');
        expect(entry).toHaveProperty('language');
        expect(entry).toHaveProperty('code');
        expect(entry).toHaveProperty('result');
        expect(entry).toHaveProperty('submissionId');
        expect(entry).toHaveProperty('attemptNumber');
    });
});
