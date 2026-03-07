/**
 * Retention Policy Tests (TDD)
 * 
 * Tests for the 7-day retention policy that manages insight lifecycle.
 */

// Setup fake IndexedDB
require('fake-indexeddb/auto');
const Dexie = require('dexie');
global.Dexie = Dexie;

describe('Retention Policy', () => {
    let RetentionPolicy;
    let InsightsStore;

    beforeAll(() => {
        InsightsStore = require('../src/background/insights_store');
        RetentionPolicy = require('../src/background/retention_policy');
    });

    beforeEach(async () => {
        const store = new InsightsStore.InsightsStore();
        await store.init();
        await store.clear();
    });

    describe('applyDecay', () => {
        let store;

        beforeEach(async () => {
            store = new InsightsStore.InsightsStore();
            await store.init();
        });

        afterEach(async () => {
            await store.clear();
        });

        it('should not decay recent insights', async () => {
            // Add fresh insight
            const insight = InsightsStore.createInsight({
                content: 'Recent insight',
                skillIds: ['test']
            });
            insight.weight = 2.0;
            await store.add(insight);

            await RetentionPolicy.applyDecay();

            const updated = await store.getById(insight.id);
            expect(updated.weight).toBe(2.0); // Unchanged
        });

        it('should decay insights older than 1 day', async () => {
            const insight = InsightsStore.createInsight({
                content: 'Old insight',
                skillIds: ['test']
            });
            insight.weight = 2.0;
            // Make it 3 days old
            insight.lastSeenAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
            await store.add(insight);

            await RetentionPolicy.applyDecay();

            const updated = await store.getById(insight.id);
            expect(updated.weight).toBeLessThan(2.0);
        });

        it('should use configurable decay rate', async () => {
            const insight = InsightsStore.createInsight({
                content: 'Test',
                skillIds: []
            });
            insight.weight = 1.0;
            insight.lastSeenAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            await store.add(insight);

            // Apply 50% daily decay (aggressive)
            await RetentionPolicy.applyDecay({ decayRate: 0.5 });

            const updated = await store.getById(insight.id);
            // 1.0 * 0.5^7 = very small
            expect(updated.weight).toBeLessThan(0.1);
        });
    });

    describe('pruneStaleInsights', () => {
        let store;

        beforeEach(async () => {
            store = new InsightsStore.InsightsStore();
            await store.init();
        });

        afterEach(async () => {
            await store.clear();
        });

        it('should remove insights below weight threshold', async () => {
            // Add low weight insight
            const stale = InsightsStore.createInsight({
                content: 'Low weight',
                skillIds: []
            });
            stale.weight = 0.05;
            await store.add(stale);

            // Add normal insight
            const normal = InsightsStore.createInsight({
                content: 'Normal weight',
                skillIds: []
            });
            normal.weight = 1.0;
            await store.add(normal);

            const result = await RetentionPolicy.pruneStaleInsights();

            const all = await store.getAll();
            expect(all.length).toBe(1);
            expect(all[0].content).toBe('Normal weight');
            expect(result.pruned).toBe(1);
        });

        it('should use configurable weight threshold', async () => {
            const insight = InsightsStore.createInsight({
                content: 'Test',
                skillIds: []
            });
            insight.weight = 0.3;
            await store.add(insight);

            // Prune anything below 0.5
            await RetentionPolicy.pruneStaleInsights({ minWeight: 0.5 });

            const all = await store.getAll();
            expect(all.length).toBe(0);
        });
    });

    describe('archiveOldInsights', () => {
        let store;

        beforeEach(async () => {
            store = new InsightsStore.InsightsStore();
            await store.init();
        });

        afterEach(async () => {
            await store.clear();
        });

        it('should archive insights older than retention period', async () => {
            // Add old insight
            const old = InsightsStore.createInsight({
                content: 'Very old',
                skillIds: ['ancient']
            });
            old.createdAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            old.lastSeenAt = old.createdAt;
            await store.add(old);

            const result = await RetentionPolicy.archiveOldInsights({ maxAgeDays: 14 });

            expect(result.archived).toBe(1);
        });

        it('should keep insights within retention period', async () => {
            const recent = InsightsStore.createInsight({
                content: 'Recent',
                skillIds: []
            });
            await store.add(recent);

            const result = await RetentionPolicy.archiveOldInsights({ maxAgeDays: 14 });

            expect(result.archived).toBe(0);
            const all = await store.getAll();
            expect(all.length).toBe(1);
        });
    });

    describe('runMaintenanceCycle', () => {
        it('should run all maintenance tasks', async () => {
            const store = new InsightsStore.InsightsStore();
            await store.init();

            // Add mix of insights
            const stale = InsightsStore.createInsight({ content: 'Stale', skillIds: [] });
            stale.weight = 0.01;
            await store.add(stale);

            const old = InsightsStore.createInsight({ content: 'Old', skillIds: [] });
            old.lastSeenAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
            old.weight = 1.0;
            await store.add(old);

            const fresh = InsightsStore.createInsight({ content: 'Fresh', skillIds: [] });
            fresh.weight = 1.0;
            await store.add(fresh);

            const result = await RetentionPolicy.runMaintenanceCycle();

            expect(result.decayed).toBeDefined();
            expect(result.pruned).toBeDefined();
        });
    });
});
