/**
 * SRS Logic Unit Tests
 * 
 * WHAT IS UNIT TESTING?
 * Unit testing means testing individual "units" (functions/methods) of code in isolation.
 * The goal is to verify that each piece of code works correctly on its own.
 * This helps catch bugs early and gives confidence when making changes.
 * 
 * WHY JEST?
 * Jest is a popular JavaScript testing framework created by Facebook.
 * It includes everything you need: test runner, assertion library, and mocking utilities.
 * Other popular alternatives: Mocha, Jasmine, Vitest
 * 
 * RUNNING TESTS:
 * - `npm test` or `npx jest` runs all test files
 * - Jest automatically finds files matching: *.test.js, *.spec.js, or in __tests__ folders
 */

/**
 * REQUIRE STATEMENT (CommonJS):
 * This imports the functions we want to test from srs_logic.js.
 * 
 * DESTRUCTURING SYNTAX:
 * const { calculateNextReview, projectSchedule } = require('../srs_logic');
 * is equivalent to:
 *   const module = require('../srs_logic');
 *   const calculateNextReview = module.calculateNextReview;
 *   const projectSchedule = module.projectSchedule;
 * 
 * The '..' means "go up one directory" (from /tests to the root folder)
 */
const { calculateNextReview, projectSchedule } = require('../src/algorithms/srs_logic');

/**
 * DESCRIBE BLOCK:
 * Groups related tests together. Think of it as a "test suite".
 * You can nest describe blocks for better organization.
 * 
 * Structure: describe('Description of what we're testing', () => { ...tests... });
 * 
 * ARROW FUNCTION SYNTAX:
 * () => { } is a shorter way to write function() { }
 * Arrow functions also handle 'this' differently, but that doesn't matter here.
 */
describe('SRS Logic Extended Coverage', () => {

    /**
     * NESTED DESCRIBE:
     * Groups all tests for the calculateNextReview function.
     * This creates a hierarchical structure in test output.
     */
    describe('calculateNextReview', () => {

        /**
         * TEST BLOCK (also called "it"):
         * Defines a single test case.
         * 
         * Structure: test('description of expected behavior', () => { ...assertions... });
         * You can also use: it('should do something', () => { });
         * 'it' and 'test' are aliases - they do the same thing.
         * 
         * GOOD TEST NAMING:
         * The description should clearly state WHAT is being tested and WHAT the expected outcome is.
         * Common patterns: "should [do something]" or "returns [X] when [Y]"
         */
        test('initial repetition (0 -> 1)', () => {
            // ARRANGE: Set up the test inputs
            // (In this case, we pass values directly to the function)

            // ACT: Call the function we're testing
            const res = calculateNextReview(0, 0, 2.5);

            // ASSERT: Check that the result matches our expectations
            /**
             * EXPECT & MATCHERS:
             * expect(value) wraps a value you want to test
             * .toBe(expected) checks for exact equality (===)
             * 
             * Other common matchers:
             * .toEqual() - deep equality for objects/arrays
             * .toBeTruthy() / .toBeFalsy() - truthy/falsy checks
             * .toContain() - array/string contains value
             * .toThrow() - function throws an error
             * .toBeGreaterThan() / .toBeLessThan() - numeric comparisons
             */
            expect(res.nextInterval).toBe(1);       // First review = 1 day interval
            expect(res.nextRepetition).toBe(1);    // Repetition increments from 0 to 1
            expect(res.nextEaseFactor).toBe(2.5);  // Ease factor unchanged
        });

        test('second repetition (1 -> 6)', () => {
            const res = calculateNextReview(1, 1, 2.5);
            expect(res.nextInterval).toBe(6);      // Second review = 6 day interval
            expect(res.nextRepetition).toBe(2);
        });

        test('third repetition uses ease factor (6 * 2.5 = 15)', () => {
            const res = calculateNextReview(6, 2, 2.5);
            expect(res.nextInterval).toBe(15);     // 6 days * 2.5 ease = 15 days
            expect(res.nextRepetition).toBe(3);
        });

        /**
         * EDGE CASE TESTING:
         * Edge cases are unusual inputs or boundary conditions that might break your code.
         * Testing them ensures your code handles unexpected situations gracefully.
         * 
         * Examples of edge cases:
         * - Zero, negative numbers, very large numbers
         * - Empty strings, null, undefined
         * - Boundary values (first/last item, max/min)
         */
        test('rounding intervals (15 * 2.5 = 37.5 -> 38)', () => {
            const res = calculateNextReview(15, 3, 2.5);
            // 15 * 2.5 = 37.5, which should round to 38
            // This tests that Math.round() is working correctly
            expect(res.nextInterval).toBe(38);
        });

        test('ease factor reduction handled by caller, logic just passes through', () => {
            /**
             * TEST ISOLATION:
             * Each test should be independent and not rely on other tests.
             * This test verifies one specific behavior: ease factor is preserved.
             * 
             * DOCUMENTATION IN TESTS:
             * Comments in tests serve as documentation for expected behavior.
             * When a test fails, these comments help understand what was expected.
             */
            const res = calculateNextReview(10, 2, 1.3);
            expect(res.nextEaseFactor).toBe(1.3); // Should preserve input ease
            expect(res.nextInterval).toBe(13);     // 10 * 1.3 = 13
        });

        /**
         * TESTING DATE-DEPENDENT CODE:
         * When code depends on the current date, tests can be flaky (pass sometimes, fail others).
         * Solution: Allow passing a mock/fixed date for testing.
         * 
         * This test uses a fixed date to ensure consistent, reproducible results.
         */
        test('handles currentDate override correctly', () => {
            // Use a specific date instead of "now"
            const mockDate = "2025-12-25T12:00:00.000Z";
            const res = calculateNextReview(0, 0, 2.5, mockDate);

            const nextDate = new Date(res.nextReviewDate);
            const baseDate = new Date(mockDate);

            // Calculate the difference in days
            const diffTime = Math.abs(nextDate - baseDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            // First review should be 1 day after the mock date
            expect(diffDays).toBe(1);
        });

        /**
         * LEAP YEAR EDGE CASE:
         * Dates around Feb 28/29 can cause bugs if not handled properly.
         * JavaScript's Date object handles this automatically, but it's good to verify.
         */
        test('handles leap years in date calculation', () => {
            // 2024 is a leap year, so Feb 28 + 1 day = Feb 29 (not March 1)
            const mockDate = "2024-02-28T12:00:00.000Z";
            const res = calculateNextReview(0, 0, 2.5, mockDate);
            const nextDate = new Date(res.nextReviewDate);

            /**
             * STRING STARTWITH CHECK:
             * .startsWith() is a String method that checks if a string begins with a substring
             * Here we check if the ISO date string starts with "2024-02-29"
             */
            expect(nextDate.toISOString().startsWith("2024-02-29")).toBe(true);
        });
    });

    /**
     * SECOND TEST SUITE:
     * Tests for the projectSchedule function
     */
    describe('projectSchedule', () => {

        test('returns array of dates', () => {
            const schedule = projectSchedule(0, 0, 2.5);

            /**
             * ARRAY ASSERTIONS:
             * Array.isArray() is a built-in method to check if something is an array
             * This is more reliable than typeof (which returns 'object' for arrays)
             */
            expect(Array.isArray(schedule)).toBe(true);

            /**
             * NUMERIC COMPARISON MATCHER:
             * .toBeGreaterThan(0) checks that the array has at least one element
             * This is less brittle than expecting an exact length
             */
            expect(schedule.length).toBeGreaterThan(0);
        });

        test('caps projection at ~90 days', () => {
            const mockDate = "2023-01-01";
            const schedule = projectSchedule(0, 0, 2.5, mockDate);

            // Get the last date in the schedule
            const lastReview = new Date(schedule[schedule.length - 1]);
            const start = new Date(mockDate);
            const diffDays = (lastReview - start) / (1000 * 3600 * 24);

            /**
             * BOUNDARY TESTING:
             * The function should stop projecting after ~90 days.
             * We allow some buffer (120 days) because the exact last date
             * depends on how intervals align with the 90-day limit.
             */
            expect(diffDays).toBeLessThanOrEqual(120);
        });

        /**
         * TESTING EDGE CASE: Very long intervals
         * If the current interval is already > 90 days, we should get an empty schedule
         */
        test('handles long intervals immediately', () => {
            const schedule = projectSchedule(100, 5, 2.5, "2023-01-01");
            expect(schedule.length).toBe(0); // Empty array - no reviews within 90 days
        });

        test('handles intervals that project within 90 days', () => {
            // 30 day interval * 2.5 ease = 75 days, which is < 90
            // So we should get exactly 1 review in the schedule
            const schedule = projectSchedule(30, 5, 2.5, "2023-01-01");
            expect(schedule.length).toBe(1);
        });

        test('handles custom start date correctly', () => {
            const mockDate = "2030-01-01T00:00:00.000Z";
            const schedule = projectSchedule(0, 0, 2.5, mockDate);

            // First review should be 1 day after start (Jan 2, 2030)
            expect(schedule[0]).toBe("2030-01-02");
        });

        /**
         * LOW EASE FACTOR TEST:
         * Lower ease factors mean slower interval growth.
         * This tests that the algorithm handles different ease values correctly.
         */
        test('projects correctly with low ease factor', () => {
            const schedule = projectSchedule(0, 0, 1.3, "2023-01-01");

            /**
             * .toContain() MATCHER:
             * Checks if an array includes a specific value.
             * More readable than: expect(schedule.includes("2023-01-02")).toBe(true)
             */
            expect(schedule).toContain("2023-01-02"); // Day 1 + 1 = Jan 2
            expect(schedule).toContain("2023-01-08"); // Jan 2 + 6 = Jan 8
        });
    });
});

