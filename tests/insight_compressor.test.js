/**
 * Insight Compressor Tests (TDD)
 * 
 * Tests for compressing raw insights into atomic patterns.
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

describe('Insight Compressor', () => {
    let InsightCompressor;
    let InsightsStore;

    beforeAll(() => {
        InsightsStore = require('../src/background/insights_store');
        InsightCompressor = require('../src/background/insight_compressor');
    });

    beforeEach(async () => {
        jest.clearAllMocks();
        global.fetch.mockReset();

        // Clear store
        const store = new InsightsStore.InsightsStore();
        await store.init();
        await store.clear();
    });

    describe('compressInsights', () => {
        it('should return empty array when no insights', async () => {
            const result = await InsightCompressor.compressInsights([]);
            expect(result.atomicInsights).toEqual([]);
        });

        it('should compress multiple similar insights into one', async () => {
            const rawInsights = [
                { id: '1', content: 'Forgot to check empty array', skillIds: ['edge_empty'], frequency: 3 },
                { id: '2', content: 'Did not handle empty input', skillIds: ['edge_empty'], frequency: 2 },
                { id: '3', content: 'Missing empty array check', skillIds: ['edge_empty', 'off_by_one'], frequency: 1 }
            ];

            // Mock Gemini response
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    candidates: [{
                        content: {
                            parts: [{
                                text: JSON.stringify({
                                    atomicInsights: [{
                                        content: 'Check for empty array input',
                                        skillIds: ['edge_empty', 'off_by_one'],
                                        mergedFrom: [0, 1, 2],
                                        frequency: 6
                                    }],
                                    droppedIndices: []
                                })
                            }]
                        }
                    }]
                })
            });

            const result = await InsightCompressor.compressInsights(rawInsights);

            expect(result.atomicInsights.length).toBe(1);
            expect(result.atomicInsights[0].frequency).toBe(6);
        });

        it('should preserve unique insights', async () => {
            const rawInsights = [
                { id: '1', content: 'Off-by-one in binary search', skillIds: ['binary_search_basic'], frequency: 1 },
                { id: '2', content: 'DFS recursion depth issue', skillIds: ['dfs'], frequency: 1 }
            ];

            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    candidates: [{
                        content: {
                            parts: [{
                                text: JSON.stringify({
                                    atomicInsights: [
                                        { content: 'Off-by-one in binary search', skillIds: ['binary_search_basic'], mergedFrom: [0], frequency: 1 },
                                        { content: 'DFS recursion depth issue', skillIds: ['dfs'], mergedFrom: [1], frequency: 1 }
                                    ],
                                    droppedIndices: []
                                })
                            }]
                        }
                    }]
                })
            });

            const result = await InsightCompressor.compressInsights(rawInsights);

            expect(result.atomicInsights.length).toBe(2);
        });

        it('should drop vague insights', async () => {
            const rawInsights = [
                { id: '1', content: 'Needs more practice', skillIds: [], frequency: 1 },
                { id: '2', content: 'Binary search boundary error', skillIds: ['binary_search_basic'], frequency: 2 }
            ];

            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    candidates: [{
                        content: {
                            parts: [{
                                text: JSON.stringify({
                                    atomicInsights: [
                                        { content: 'Binary search boundary error', skillIds: ['binary_search_basic'], mergedFrom: [1], frequency: 2 }
                                    ],
                                    droppedIndices: [0]
                                })
                            }]
                        }
                    }]
                })
            });

            const result = await InsightCompressor.compressInsights(rawInsights);

            expect(result.atomicInsights.length).toBe(1);
            expect(result.droppedIndices).toContain(0);
        });
    });

    describe('buildCompressionPrompt', () => {
        it('should include all raw insights in prompt', () => {
            const insights = [
                { content: 'Test 1', skillIds: ['a'], frequency: 1 },
                { content: 'Test 2', skillIds: ['b'], frequency: 2 }
            ];

            const prompt = InsightCompressor.buildCompressionPrompt(insights);

            expect(prompt).toContain('Test 1');
            expect(prompt).toContain('Test 2');
            expect(prompt).toContain('2x'); // frequency
        });

        it('should request atomic output format', () => {
            const insights = [{ content: 'Test', skillIds: ['a'], frequency: 1 }];
            const prompt = InsightCompressor.buildCompressionPrompt(insights);

            expect(prompt).toContain('atomicInsights');
            expect(prompt).toContain('mergedFrom');
        });
    });

    describe('applyCompression', () => {
        it('should update store with compressed insights', async () => {
            const store = new InsightsStore.InsightsStore();
            await store.init();

            // Add raw insights
            await store.add(InsightsStore.createInsight({
                content: 'Raw 1', skillIds: ['a']
            }));
            await store.add(InsightsStore.createInsight({
                content: 'Raw 2', skillIds: ['a']
            }));

            // Mock compression
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    candidates: [{
                        content: {
                            parts: [{
                                text: JSON.stringify({
                                    atomicInsights: [{
                                        content: 'Merged insight',
                                        skillIds: ['a'],
                                        mergedFrom: [0, 1],
                                        frequency: 2
                                    }],
                                    droppedIndices: []
                                })
                            }]
                        }
                    }]
                })
            });

            await InsightCompressor.applyCompression();

            const all = await store.getAll();
            // Original 2 replaced with 1 merged
            expect(all.some(i => i.content === 'Merged insight')).toBe(true);
        });
    });

    describe('local similarity scoring (fallback)', () => {
        it('should calculate text similarity', () => {
            const score = InsightCompressor.calculateSimilarity(
                'forgot empty array check',
                'forgot to check empty array'
            );
            expect(score).toBeGreaterThan(0.5);
        });

        it('should return low score for different texts', () => {
            const score = InsightCompressor.calculateSimilarity(
                'binary search error',
                'DFS recursion issue'
            );
            expect(score).toBeLessThan(0.3);
        });
    });
});
