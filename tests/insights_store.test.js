/**
 * Insights Store Tests (TDD)
 * 
 * Tests for the insights storage schema and CRUD operations.
 * Insights are atomic observations about user mistakes that persist across sessions.
 */

// Setup fake IndexedDB
require('fake-indexeddb/auto');
const Dexie = require('dexie');
global.Dexie = Dexie;

describe('Insights Store', () => {
    let InsightsStore;

    beforeAll(() => {
        InsightsStore = require('../src/background/insights_store');
    });

    beforeEach(async () => {
        const store = new InsightsStore.InsightsStore();
        await store.init();
        await store.clear();
    });

    describe('Insight Entity', () => {
        it('should have required fields', () => {
            const insight = InsightsStore.createInsight({
                content: 'Off-by-one errors in binary search',
                skillIds: ['binary_search_basic', 'off_by_one'],
                source: 'gemini_analysis'
            });

            expect(insight).toHaveProperty('id');
            expect(insight).toHaveProperty('content');
            expect(insight).toHaveProperty('skillIds');
            expect(insight).toHaveProperty('frequency', 1);
            expect(insight).toHaveProperty('weight', 1.0);
            expect(insight).toHaveProperty('createdAt');
            expect(insight).toHaveProperty('lastSeenAt');
        });

        it('should generate unique IDs', () => {
            const i1 = InsightsStore.createInsight({ content: 'Test 1', skillIds: [] });
            const i2 = InsightsStore.createInsight({ content: 'Test 2', skillIds: [] });
            expect(i1.id).not.toBe(i2.id);
        });
    });

    describe('CRUD Operations', () => {
        let store;

        beforeEach(async () => {
            store = new InsightsStore.InsightsStore();
            await store.init();
        });

        afterEach(async () => {
            await store.clear();
        });

        it('should add an insight', async () => {
            const insight = InsightsStore.createInsight({
                content: 'Forgot to check empty array',
                skillIds: ['edge_empty']
            });

            await store.add(insight);
            const all = await store.getAll();

            expect(all.length).toBe(1);
            expect(all[0].content).toBe('Forgot to check empty array');
        });

        it('should get insight by ID', async () => {
            const insight = InsightsStore.createInsight({
                content: 'Test insight',
                skillIds: ['bfs']
            });

            await store.add(insight);
            const retrieved = await store.getById(insight.id);

            expect(retrieved).toBeDefined();
            expect(retrieved.id).toBe(insight.id);
        });

        it('should update an insight', async () => {
            const insight = InsightsStore.createInsight({
                content: 'Original content',
                skillIds: ['dfs']
            });

            await store.add(insight);

            insight.frequency = 2;
            insight.weight = 1.5;
            await store.update(insight);

            const updated = await store.getById(insight.id);
            expect(updated.frequency).toBe(2);
            expect(updated.weight).toBe(1.5);
        });

        it('should delete an insight', async () => {
            const insight = InsightsStore.createInsight({
                content: 'To be deleted',
                skillIds: []
            });

            await store.add(insight);
            await store.delete(insight.id);

            const all = await store.getAll();
            expect(all.length).toBe(0);
        });
    });

    describe('Query Operations', () => {
        let store;

        beforeEach(async () => {
            store = new InsightsStore.InsightsStore();
            await store.init();

            // Add test insights
            await store.add(InsightsStore.createInsight({
                content: 'Binary search boundary',
                skillIds: ['binary_search_basic', 'off_by_one']
            }));
            await store.add(InsightsStore.createInsight({
                content: 'DFS recursion depth',
                skillIds: ['dfs', 'base_case']
            }));
            await store.add(InsightsStore.createInsight({
                content: 'Hash collision handling',
                skillIds: ['hashmap_lookup']
            }));
        });

        afterEach(async () => {
            await store.clear();
        });

        it('should get insights by skill ID', async () => {
            const results = await store.getBySkillId('binary_search_basic');

            expect(results.length).toBe(1);
            expect(results[0].content).toContain('Binary search');
        });

        it('should get insights by multiple skill IDs', async () => {
            const results = await store.getBySkillIds(['binary_search_basic', 'dfs']);

            expect(results.length).toBe(2);
        });

        it('should get recent insights', async () => {
            const results = await store.getRecent(2);

            expect(results.length).toBe(2);
        });

        it('should get insights sorted by weight', async () => {
            // Update one insight to have higher weight
            const all = await store.getAll();
            all[1].weight = 5.0;
            await store.update(all[1]);

            const results = await store.getTopByWeight(2);

            expect(results[0].weight).toBe(5.0);
        });
    });

    describe('Frequency and Weight', () => {
        let store;

        beforeEach(async () => {
            store = new InsightsStore.InsightsStore();
            await store.init();
        });

        afterEach(async () => {
            await store.clear();
        });

        it('should increment frequency when seeing same insight', async () => {
            const insight = InsightsStore.createInsight({
                content: 'Repeated mistake',
                skillIds: ['off_by_one']
            });

            await store.add(insight);
            await store.incrementFrequency(insight.id);
            await store.incrementFrequency(insight.id);

            const updated = await store.getById(insight.id);
            expect(updated.frequency).toBe(3);
        });

        it('should update lastSeenAt on frequency increment', async () => {
            const insight = InsightsStore.createInsight({
                content: 'Test',
                skillIds: []
            });

            await store.add(insight);
            const original = await store.getById(insight.id);

            // Wait a bit
            await new Promise(r => setTimeout(r, 10));

            await store.incrementFrequency(insight.id);
            const updated = await store.getById(insight.id);

            expect(new Date(updated.lastSeenAt).getTime()).toBeGreaterThan(
                new Date(original.lastSeenAt).getTime()
            );
        });

        it('should decay weight for old insights', async () => {
            const insight = InsightsStore.createInsight({
                content: 'Old insight',
                skillIds: []
            });
            insight.weight = 2.0;
            // Simulate old insight
            insight.lastSeenAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

            await store.add(insight);
            await store.applyDecay(0.9); // 10% decay per day

            const decayed = await store.getById(insight.id);
            expect(decayed.weight).toBeLessThan(2.0);
        });
    });
});
