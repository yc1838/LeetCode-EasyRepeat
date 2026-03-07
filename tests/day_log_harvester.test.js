/**
 * Day Log Harvester Tests (TDD)
 * 
 * Tests for harvesting today's submissions from IndexedDB
 * and formatting them for Gemini analysis.
 */

// Setup fake IndexedDB
require('fake-indexeddb/auto');
const Dexie = require('dexie');
global.Dexie = Dexie;

const { ShadowLogger, getSessionId } = require('../src/content/shadow_logger');

// We'll import the harvester after creating it
let DayLogHarvester;

describe('Day Log Harvester', () => {
    let logger;

    beforeAll(() => {
        // Import after Dexie is available
        DayLogHarvester = require('../src/background/day_log_harvester');
    });

    beforeEach(async () => {
        // Create fresh logger and add test data
        logger = new ShadowLogger();
        await logger.init();
        await logger.clear();
    });

    afterEach(async () => {
        if (logger) {
            await logger.clear();
        }
    });

    describe('harvestToday', () => {
        it('should return empty array when no submissions today', async () => {
            const result = await DayLogHarvester.harvestToday();
            expect(result).toEqual([]);
        });

        it('should return all submissions from today', async () => {
            // Add test submissions
            await logger.log({ problemSlug: 'two-sum', result: 'Accepted' });
            await logger.log({ problemSlug: 'three-sum', result: 'Wrong Answer' });
            await logger.log({ problemSlug: 'two-sum', result: 'Accepted' });

            const result = await DayLogHarvester.harvestToday();

            expect(result.length).toBe(3);
        });

        it('should include all required fields for Gemini analysis', async () => {
            await logger.log({
                problemSlug: 'binary-search',
                problemTitle: '704. Binary Search',
                difficulty: 'Easy',
                topics: ['Array', 'Binary Search'],
                language: 'python3',
                code: 'def search(nums, target): return -1',
                result: 'Wrong Answer',
                errorDetails: {
                    type: 'Wrong Answer',
                    testInput: '[-1,0,3,5,9,12], 9',
                    expected: '4',
                    actual: '-1'
                }
            });

            const result = await DayLogHarvester.harvestToday();
            const entry = result[0];

            expect(entry).toHaveProperty('problemSlug');
            expect(entry).toHaveProperty('problemTitle');
            expect(entry).toHaveProperty('result');
            expect(entry).toHaveProperty('code');
            expect(entry).toHaveProperty('errorDetails');
        });
    });

    describe('formatForGemini', () => {
        it('should create a structured prompt for Gemini', async () => {
            await logger.log({
                problemSlug: 'two-sum',
                problemTitle: '1. Two Sum',
                difficulty: 'Easy',
                result: 'Wrong Answer',
                code: 'def twoSum(nums, target):\n    return []',
                errorDetails: { type: 'Wrong Answer', expected: '[0,1]', actual: '[]' }
            });

            const submissions = await DayLogHarvester.harvestToday();
            const prompt = DayLogHarvester.formatForGemini(submissions);

            expect(typeof prompt).toBe('string');
            expect(prompt).toContain('Two Sum');
            expect(prompt).toContain('Wrong Answer');
        });

        it('should handle empty submissions gracefully', () => {
            const prompt = DayLogHarvester.formatForGemini([]);
            expect(prompt).toContain('No submissions');
        });

        it('should group submissions by problem', async () => {
            await logger.log({ problemSlug: 'p1', result: 'Wrong Answer' });
            await logger.log({ problemSlug: 'p1', result: 'Wrong Answer' });
            await logger.log({ problemSlug: 'p1', result: 'Accepted' });
            await logger.log({ problemSlug: 'p2', result: 'Accepted' });

            const submissions = await DayLogHarvester.harvestToday();
            const prompt = DayLogHarvester.formatForGemini(submissions);

            // Should indicate multiple attempts
            expect(prompt).toContain('3 attempt');
        });

        it('should highlight failures for analysis', async () => {
            await logger.log({
                problemSlug: 'hard-problem',
                result: 'Time Limit Exceeded',
                errorDetails: { type: 'TLE' }
            });

            const submissions = await DayLogHarvester.harvestToday();
            const prompt = DayLogHarvester.formatForGemini(submissions);

            expect(prompt).toContain('Time Limit Exceeded');
        });
    });

    describe('extractSkillSignals', () => {
        it('should identify potential skill gaps from errors', async () => {
            await logger.log({
                problemSlug: 'binary-search',
                topics: ['Array', 'Binary Search'],
                result: 'Wrong Answer',
                errorDetails: { type: 'Wrong Answer' }
            });

            const submissions = await DayLogHarvester.harvestToday();
            const signals = DayLogHarvester.extractSkillSignals(submissions);

            expect(signals).toHaveProperty('failures');
            expect(signals).toHaveProperty('successes');
            expect(signals.failures.length).toBeGreaterThanOrEqual(1);
        });

        it('should track success patterns', async () => {
            await logger.log({
                problemSlug: 'two-sum',
                topics: ['Array', 'Hash Table'],
                result: 'Accepted'
            });

            const submissions = await DayLogHarvester.harvestToday();
            const signals = DayLogHarvester.extractSkillSignals(submissions);

            expect(signals.successes.length).toBe(1);
        });
    });

    describe('getSummaryStats', () => {
        it('should calculate daily stats', async () => {
            await logger.log({ problemSlug: 'p1', result: 'Wrong Answer' });
            await logger.log({ problemSlug: 'p1', result: 'Accepted' });
            await logger.log({ problemSlug: 'p2', result: 'Accepted' });
            await logger.log({ problemSlug: 'p3', result: 'TLE' });

            const submissions = await DayLogHarvester.harvestToday();
            const stats = DayLogHarvester.getSummaryStats(submissions);

            expect(stats.totalSubmissions).toBe(4);
            expect(stats.uniqueProblems).toBe(3);
            expect(stats.accepted).toBe(2);
            expect(stats.failed).toBe(2);
        });
    });
});
