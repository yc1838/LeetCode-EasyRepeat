/**
 * Drill Store Tests (TDD)
 * 
 * Tests for the drill storage schema and CRUD operations.
 * Drills are personalized exercises targeting weak skills.
 */

// Setup fake IndexedDB
require('fake-indexeddb/auto');
const Dexie = require('dexie');
global.Dexie = Dexie;

describe('Drill Store', () => {
    let DrillStore;

    beforeAll(() => {
        DrillStore = require('../src/background/drill_store');
    });

    beforeEach(async () => {
        const store = new DrillStore.DrillStore();
        await store.init();
        await store.clear();
    });

    describe('Drill Entity', () => {
        it('should have required fields', () => {
            const drill = DrillStore.createDrill({
                type: 'fill-in-blank',
                skillId: 'binary_search_basic',
                content: 'Complete the binary search: while (left ___ right)',
                answer: '<=',
                difficulty: 'easy'
            });

            expect(drill).toHaveProperty('id');
            expect(drill).toHaveProperty('type', 'fill-in-blank');
            expect(drill).toHaveProperty('skillId', 'binary_search_basic');
            expect(drill).toHaveProperty('content');
            expect(drill).toHaveProperty('answer');
            expect(drill).toHaveProperty('difficulty', 'easy');
            expect(drill).toHaveProperty('createdAt');
            expect(drill).toHaveProperty('status', 'pending');
        });

        it('should generate unique IDs', () => {
            const d1 = DrillStore.createDrill({ type: 'fill-in-blank', skillId: 'a', content: '', answer: '' });
            const d2 = DrillStore.createDrill({ type: 'fill-in-blank', skillId: 'b', content: '', answer: '' });
            expect(d1.id).not.toBe(d2.id);
        });

        it('should validate drill types', () => {
            expect(DrillStore.isValidDrillType('fill-in-blank')).toBe(true);
            expect(DrillStore.isValidDrillType('spot-bug')).toBe(true);
            expect(DrillStore.isValidDrillType('critique')).toBe(true);
            expect(DrillStore.isValidDrillType('muscle-memory')).toBe(true);
            expect(DrillStore.isValidDrillType('invalid')).toBe(false);
        });
    });

    describe('CRUD Operations', () => {
        let store;

        beforeEach(async () => {
            store = new DrillStore.DrillStore();
            await store.init();
        });

        afterEach(async () => {
            await store.clear();
        });

        it('should add a drill', async () => {
            const drill = DrillStore.createDrill({
                type: 'spot-bug',
                skillId: 'off_by_one',
                content: 'Find the bug in this loop...',
                answer: 'line 3'
            });

            await store.add(drill);
            const all = await store.getAll();

            expect(all.length).toBe(1);
            expect(all[0].type).toBe('spot-bug');
        });

        it('should get drill by ID', async () => {
            const drill = DrillStore.createDrill({
                type: 'critique',
                skillId: 'dp_1d',
                content: 'Analyze this solution...',
                answer: null // Critique has no fixed answer
            });

            await store.add(drill);
            const retrieved = await store.getById(drill.id);

            expect(retrieved).toBeDefined();
            expect(retrieved.id).toBe(drill.id);
        });

        it('should update a drill', async () => {
            const drill = DrillStore.createDrill({
                type: 'fill-in-blank',
                skillId: 'bfs',
                content: 'Test',
                answer: 'queue'
            });

            await store.add(drill);

            drill.status = 'completed';
            drill.completedAt = new Date().toISOString();
            await store.update(drill);

            const updated = await store.getById(drill.id);
            expect(updated.status).toBe('completed');
        });

        it('should delete a drill', async () => {
            const drill = DrillStore.createDrill({
                type: 'muscle-memory',
                skillId: 'dfs',
                content: 'Write DFS from memory',
                answer: null
            });

            await store.add(drill);
            await store.delete(drill.id);

            const all = await store.getAll();
            expect(all.length).toBe(0);
        });
    });

    describe('Query Operations', () => {
        let store;

        beforeEach(async () => {
            store = new DrillStore.DrillStore();
            await store.init();

            // Add test drills
            await store.add(DrillStore.createDrill({
                type: 'fill-in-blank',
                skillId: 'binary_search_basic',
                content: 'Test 1',
                answer: 'a'
            }));
            await store.add(DrillStore.createDrill({
                type: 'spot-bug',
                skillId: 'binary_search_basic',
                content: 'Test 2',
                answer: 'b'
            }));
            await store.add(DrillStore.createDrill({
                type: 'fill-in-blank',
                skillId: 'dfs',
                content: 'Test 3',
                answer: 'c'
            }));
        });

        afterEach(async () => {
            await store.clear();
        });

        it('should get drills by skill ID', async () => {
            const results = await store.getBySkillId('binary_search_basic');

            expect(results.length).toBe(2);
        });

        it('should get drills by type', async () => {
            const results = await store.getByType('fill-in-blank');

            expect(results.length).toBe(2);
        });

        it('should get pending drills', async () => {
            const all = await store.getAll();
            all[0].status = 'completed';
            await store.update(all[0]);

            const pending = await store.getPending();

            expect(pending.length).toBe(2);
        });

        it('should get drills for today (queue)', async () => {
            const queue = await store.getTodayQueue(2);

            expect(queue.length).toBe(2);
        });
    });

    describe('Drill Statistics', () => {
        let store;

        beforeEach(async () => {
            store = new DrillStore.DrillStore();
            await store.init();
        });

        afterEach(async () => {
            await store.clear();
        });

        it('should calculate completion stats', async () => {
            // Add mix of completed and pending
            const d1 = DrillStore.createDrill({ type: 'fill-in-blank', skillId: 'a', content: '', answer: '' });
            d1.status = 'completed';
            d1.correct = true;
            await store.add(d1);

            const d2 = DrillStore.createDrill({ type: 'fill-in-blank', skillId: 'b', content: '', answer: '' });
            d2.status = 'completed';
            d2.correct = false;
            await store.add(d2);

            const d3 = DrillStore.createDrill({ type: 'spot-bug', skillId: 'c', content: '', answer: '' });
            await store.add(d3);

            const stats = await store.getStats();

            expect(stats.total).toBe(3);
            expect(stats.completed).toBe(2);
            expect(stats.pending).toBe(1);
            expect(stats.accuracy).toBe('50.0%');
        });
    });
});
