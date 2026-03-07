const { projectSchedule, calculateNextReview } = require('../src/algorithms/srs_logic.js');

describe('SRS Logic Resilience', () => {
    test('calculateNextReview should never return interval < 1 for repetitions > 1', () => {
        // Edge case: Interval 0, Repetition 2, Ease 2.5
        // Without fix, 0 * 2.5 = 0. Next interval 0.
        const result = calculateNextReview(0, 2, 2.5);
        expect(result.nextInterval).toBeGreaterThanOrEqual(1);
    });

    test('projectSchedule should not infinite loop with corrupted data (interval 0)', () => {
        const interval = 0;
        const repetition = 5; // Should trigger multiplier logic
        const easeFactor = 2.5;

        // This function would time out / hang if the bug wasn't fixed
        const schedule = projectSchedule(interval, repetition, easeFactor);

        // Should generate a schedule (max 90 days or similar limit)
        // With interval growing, it should produce a finite list
        expect(schedule.length).toBeGreaterThan(0);
        expect(schedule.length).toBeLessThan(1000); // Sanity check
    });
});
