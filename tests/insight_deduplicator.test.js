/**
 * Insight Deduplicator Tests (TDD)
 * 
 * Tests for similarity-based deduplication of insights.
 */

// Setup fake IndexedDB
require('fake-indexeddb/auto');
const Dexie = require('dexie');
global.Dexie = Dexie;

describe('Insight Deduplicator', () => {
    let InsightDeduplicator;
    let InsightsStore;

    beforeAll(() => {
        InsightsStore = require('../src/background/insights_store');
        InsightDeduplicator = require('../src/background/insight_deduplicator');
    });

    beforeEach(async () => {
        const store = new InsightsStore.InsightsStore();
        await store.init();
        await store.clear();
    });

    describe('calculateSimilarity', () => {
        it('should return 1 for identical strings', () => {
            const score = InsightDeduplicator.calculateSimilarity(
                'forgot empty array check',
                'forgot empty array check'
            );
            expect(score).toBe(1);
        });

        it('should return high score for similar strings', () => {
            const score = InsightDeduplicator.calculateSimilarity(
                'forgot to check empty array',
                'forgot empty array check'
            );
            expect(score).toBeGreaterThan(0.6);
        });

        it('should return low score for different strings', () => {
            const score = InsightDeduplicator.calculateSimilarity(
                'binary search off by one',
                'DFS recursion depth issue'
            );
            expect(score).toBeLessThan(0.3);
        });

        it('should handle empty strings', () => {
            expect(InsightDeduplicator.calculateSimilarity('', '')).toBe(1);
            expect(InsightDeduplicator.calculateSimilarity('test', '')).toBe(0);
        });
    });

    describe('findDuplicates', () => {
        it('should find duplicate insights above threshold', async () => {
            const insights = [
                { id: '1', content: 'Forgot to check empty array', skillIds: ['edge_empty'] },
                { id: '2', content: 'Check for empty array missing', skillIds: ['edge_empty'] },
                { id: '3', content: 'Binary search boundary error', skillIds: ['binary_search_basic'] }
            ];

            const duplicates = InsightDeduplicator.findDuplicates(insights, 0.5);

            expect(duplicates.length).toBeGreaterThan(0);
            expect(duplicates[0].ids).toContain('1');
            expect(duplicates[0].ids).toContain('2');
        });

        it('should not flag unique insights as duplicates', async () => {
            const insights = [
                { id: '1', content: 'Binary search error', skillIds: ['a'] },
                { id: '2', content: 'DFS recursion issue', skillIds: ['b'] },
                { id: '3', content: 'Hash map collision', skillIds: ['c'] }
            ];

            const duplicates = InsightDeduplicator.findDuplicates(insights, 0.7);

            expect(duplicates.length).toBe(0);
        });
    });

    describe('mergeInsights', () => {
        it('should merge insights into representative', () => {
            const insights = [
                { id: '1', content: 'Empty check missing', skillIds: ['edge_empty'], frequency: 3, weight: 1.0 },
                { id: '2', content: 'Forgot empty array', skillIds: ['edge_empty', 'off_by_one'], frequency: 2, weight: 0.8 }
            ];

            const merged = InsightDeduplicator.mergeInsights(insights);

            expect(merged.frequency).toBe(5); // Sum
            expect(merged.skillIds).toContain('edge_empty');
            expect(merged.skillIds).toContain('off_by_one');
            expect(merged.weight).toBeGreaterThanOrEqual(1.0); // Max
        });

        it('should use highest weight content as representative', () => {
            const insights = [
                { id: '1', content: 'Weak version', skillIds: [], frequency: 1, weight: 0.5 },
                { id: '2', content: 'Strong version', skillIds: [], frequency: 1, weight: 1.5 }
            ];

            const merged = InsightDeduplicator.mergeInsights(insights);

            expect(merged.content).toBe('Strong version');
        });
    });

    describe('deduplicateStore', () => {
        let store;

        beforeEach(async () => {
            store = new InsightsStore.InsightsStore();
            await store.init();
        });

        afterEach(async () => {
            await store.clear();
        });

        it('should deduplicate similar insights in store', async () => {
            // Add similar insights
            await store.add({
                ...InsightsStore.createInsight({
                    content: 'Empty array check',
                    skillIds: ['edge_empty']
                }),
                frequency: 2
            });
            await store.add({
                ...InsightsStore.createInsight({
                    content: 'Check empty array',
                    skillIds: ['edge_empty']
                }),
                frequency: 3
            });

            const result = await InsightDeduplicator.deduplicateStore({ threshold: 0.5 });

            const all = await store.getAll();
            expect(all.length).toBe(1);
            expect(all[0].frequency).toBe(5);
        });

        it('should preserve unique insights', async () => {
            await store.add(InsightsStore.createInsight({
                content: 'Binary search error',
                skillIds: ['a']
            }));
            await store.add(InsightsStore.createInsight({
                content: 'DFS recursion issue',
                skillIds: ['b']
            }));

            const result = await InsightDeduplicator.deduplicateStore({ threshold: 0.7 });

            const all = await store.getAll();
            expect(all.length).toBe(2);
            expect(result.merged).toBe(0);
        });
    });
});
