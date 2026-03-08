/**
 * Popup Filter Tests (TDD)
 *
 * Tests for in-memory problem filtering by difficulty, topic, and time range.
 */

describe('filterProblems', () => {
    let filterProblems;

    beforeAll(() => {
        const mod = require('../src/popup/popup_filter');
        filterProblems = mod.filterProblems;
    });

    const now = new Date('2026-03-07T12:00:00.000Z');

    const problems = [
        {
            slug: 'two-sum', title: '1. Two Sum', difficulty: 'Easy',
            topics: ['Array', 'Hash Table'],
            lastSolved: '2026-03-07T08:00:00.000Z', nextReviewDate: '2026-03-14T08:00:00.000Z'
        },
        {
            slug: 'merge-intervals', title: '56. Merge Intervals', difficulty: 'Medium',
            topics: ['Array', 'Sorting'],
            lastSolved: '2026-03-01T10:00:00.000Z', nextReviewDate: '2026-03-08T10:00:00.000Z'
        },
        {
            slug: 'median-of-two', title: '4. Median of Two Sorted Arrays', difficulty: 'Hard',
            topics: ['Binary Search', 'Array'],
            lastSolved: '2026-01-15T10:00:00.000Z', nextReviewDate: '2026-04-15T10:00:00.000Z'
        },
        {
            slug: 'valid-paren', title: '20. Valid Parentheses', difficulty: 'Easy',
            topics: ['Stack', 'String'],
            lastSolved: '2026-02-20T10:00:00.000Z', nextReviewDate: '2026-03-20T10:00:00.000Z'
        },
        {
            slug: 'no-topics', title: '999. No Topics', difficulty: 'Medium',
            topics: [],
            lastSolved: '2026-03-06T10:00:00.000Z', nextReviewDate: '2026-03-13T10:00:00.000Z'
        }
    ];

    describe('difficulty filter', () => {
        it('should return all when difficulty is "all"', () => {
            const result = filterProblems(problems, { difficulty: 'all' }, now);
            expect(result).toHaveLength(5);
        });

        it('should filter by Easy', () => {
            const result = filterProblems(problems, { difficulty: 'Easy' }, now);
            expect(result).toHaveLength(2);
            expect(result.every(p => p.difficulty === 'Easy')).toBe(true);
        });

        it('should filter by Medium', () => {
            const result = filterProblems(problems, { difficulty: 'Medium' }, now);
            expect(result).toHaveLength(2);
        });

        it('should filter by Hard', () => {
            const result = filterProblems(problems, { difficulty: 'Hard' }, now);
            expect(result).toHaveLength(1);
            expect(result[0].slug).toBe('median-of-two');
        });

        it('should be case-insensitive', () => {
            const result = filterProblems(problems, { difficulty: 'easy' }, now);
            expect(result).toHaveLength(2);
        });
    });

    describe('topic filter', () => {
        it('should return all when topic is "all"', () => {
            const result = filterProblems(problems, { topic: 'all' }, now);
            expect(result).toHaveLength(5);
        });

        it('should filter by specific topic', () => {
            const result = filterProblems(problems, { topic: 'Array' }, now);
            expect(result).toHaveLength(3);
        });

        it('should filter by Binary Search', () => {
            const result = filterProblems(problems, { topic: 'Binary Search' }, now);
            expect(result).toHaveLength(1);
            expect(result[0].slug).toBe('median-of-two');
        });

        it('should return empty for non-existent topic', () => {
            const result = filterProblems(problems, { topic: 'Nonexistent' }, now);
            expect(result).toHaveLength(0);
        });

        it('should not match problems with empty topics', () => {
            const result = filterProblems(problems, { topic: 'Stack' }, now);
            expect(result).toHaveLength(1);
            expect(result[0].slug).toBe('valid-paren');
        });
    });

    describe('time range filter', () => {
        it('should return all when timeRange is "all"', () => {
            const result = filterProblems(problems, { timeRange: 'all' }, now);
            expect(result).toHaveLength(5);
        });

        it('should filter last 7 days', () => {
            const result = filterProblems(problems, { timeRange: '7' }, now);
            // last 7 days from March 7: includes March 1, March 6, March 7
            expect(result).toHaveLength(3);
        });

        it('should filter last 30 days', () => {
            const result = filterProblems(problems, { timeRange: '30' }, now);
            // last 30 days from March 7: includes Feb 20, March 1, March 6, March 7
            expect(result).toHaveLength(4);
        });

        it('should filter last 90 days', () => {
            const result = filterProblems(problems, { timeRange: '90' }, now);
            // last 90 days from March 7: all 5 problems (Jan 15 is within 90 days)
            expect(result).toHaveLength(5);
        });

        it('should handle boundary - problem exactly at cutoff', () => {
            const exactCutoff = new Date('2026-03-07T12:00:00.000Z');
            // 7 days before exactCutoff is Feb 28 12:00 UTC
            // merge-intervals at March 1 should be included
            const result = filterProblems(problems, { timeRange: '7' }, exactCutoff);
            expect(result.some(p => p.slug === 'merge-intervals')).toBe(true);
        });
    });

    describe('combined filters', () => {
        it('should apply difficulty + topic together', () => {
            const result = filterProblems(problems, { difficulty: 'Easy', topic: 'Array' }, now);
            expect(result).toHaveLength(1);
            expect(result[0].slug).toBe('two-sum');
        });

        it('should apply all filters together', () => {
            const result = filterProblems(problems, { difficulty: 'Medium', topic: 'Array', timeRange: '7' }, now);
            expect(result).toHaveLength(1);
            expect(result[0].slug).toBe('merge-intervals');
        });

        it('should return empty when filters exclude everything', () => {
            const result = filterProblems(problems, { difficulty: 'Hard', topic: 'Stack' }, now);
            expect(result).toHaveLength(0);
        });
    });

    describe('edge cases', () => {
        it('should handle empty problem list', () => {
            const result = filterProblems([], { difficulty: 'Easy' }, now);
            expect(result).toHaveLength(0);
        });

        it('should handle null/undefined filters', () => {
            const result = filterProblems(problems, {}, now);
            expect(result).toHaveLength(5);
        });

        it('should handle problem with missing lastSolved', () => {
            const withMissing = [...problems, { slug: 'no-date', title: 'No Date', difficulty: 'Easy', topics: [] }];
            const result = filterProblems(withMissing, { timeRange: '7' }, now);
            // Problem with no lastSolved should be excluded from time filter
            expect(result.find(p => p.slug === 'no-date')).toBeUndefined();
        });

        it('should handle problem with missing difficulty', () => {
            const withMissing = [...problems, { slug: 'no-diff', title: 'No Diff', topics: [] }];
            const result = filterProblems(withMissing, { difficulty: 'Easy' }, now);
            expect(result.find(p => p.slug === 'no-diff')).toBeUndefined();
        });

        it('should handle problem with missing topics array', () => {
            const withNull = [...problems, { slug: 'null-topics', title: 'X', difficulty: 'Easy' }];
            const result = filterProblems(withNull, { topic: 'Array' }, now);
            expect(result.find(p => p.slug === 'null-topics')).toBeUndefined();
        });
    });
});

describe('extractAllTopics', () => {
    let extractAllTopics;

    beforeAll(() => {
        const mod = require('../src/popup/popup_filter');
        extractAllTopics = mod.extractAllTopics;
    });

    it('should extract unique topics sorted alphabetically', () => {
        const problems = [
            { topics: ['Array', 'Hash Table'] },
            { topics: ['Array', 'Sorting'] },
            { topics: ['Stack'] }
        ];
        const topics = extractAllTopics(problems);
        expect(topics).toEqual(['Array', 'Hash Table', 'Sorting', 'Stack']);
    });

    it('should handle empty list', () => {
        expect(extractAllTopics([])).toEqual([]);
    });

    it('should handle problems with no topics', () => {
        const problems = [{ topics: [] }, { topics: undefined }, {}];
        expect(extractAllTopics(problems)).toEqual([]);
    });
});
