const srs = require('../src/algorithms/srs_logic');

describe('SRS Logic - analyzeProblemTimeline', () => {
    test('should analyze timeline correctly with history', () => {
        const problem = {
            history: [
                { date: '2024-01-01T12:00:00.000Z', rating: 3 },
                { date: '2024-01-02T12:00:00.000Z', rating: 3 },
                { date: '2024-01-08T12:00:00.000Z', rating: 3 },
                { date: '2024-01-30T12:00:00.000Z', rating: 3 } // Late! Due Jan 23 (Jan 8+15).
            ],
            nextReviewDate: '2024-03-01T00:00:00.000Z',
            interval: 38,
            repetition: 4,
            easeFactor: 2.5
        };

        // Analyze as of Feb 01, 2024
        const now = new Date('2024-02-01T12:00:00.000Z');

        const timeline = srs.analyzeProblemTimeline(problem, now);

        expect(timeline['2024-01-01']).toBe('completed');
        expect(timeline['2024-01-02']).toBe('completed');
        expect(timeline['2024-01-08']).toBe('completed');
        expect(timeline['2024-01-30']).toBe('completed');

        // Due date after Jan 8 was Jan 23 (interval 15).
        // It was missed until Jan 30.
        // So Jan 24...Jan 29 are missed.

        expect(timeline['2024-01-24']).toBe('missed');
        expect(timeline['2024-01-25']).toBe('missed');
        expect(timeline['2024-01-29']).toBe('missed');

        // Jan 14 was NOT missed.
        expect(timeline['2024-01-14']).toBeUndefined();
    });
});
