/**
 * Drill Tracker Tests (TDD)
 * 
 * Tests for tracking drill attempts, results, and skill updates.
 */

// Setup fake IndexedDB
require('fake-indexeddb/auto');
const Dexie = require('dexie');
global.Dexie = Dexie;

describe('Drill Tracker', () => {
    let DrillTracker;
    let DrillStore;

    beforeAll(() => {
        DrillStore = require('../src/background/drill_store');
        DrillTracker = require('../src/background/drill_tracker');
    });

    beforeEach(async () => {
        const store = new DrillStore.DrillStore();
        await store.init();
        await store.clear();
    });

    describe('recordAttempt', () => {
        let store;

        beforeEach(async () => {
            store = new DrillStore.DrillStore();
            await store.init();
        });

        afterEach(async () => {
            await store.clear();
        });

        it('should record a correct attempt', async () => {
            const drill = DrillStore.createDrill({
                type: 'fill-in-blank',
                skillId: 'bfs',
                content: 'Q',
                answer: 'queue'
            });
            await store.add(drill);

            await DrillTracker.recordAttempt(drill.id, {
                correct: true,
                userAnswer: 'queue',
                timeTaken: 5000
            });

            const updated = await store.getById(drill.id);
            expect(updated.status).toBe('completed');
            expect(updated.correct).toBe(true);
            expect(updated.attempts).toBe(1);
        });

        it('should record an incorrect attempt', async () => {
            const drill = DrillStore.createDrill({
                type: 'fill-in-blank',
                skillId: 'dfs',
                content: 'Q',
                answer: 'stack'
            });
            await store.add(drill);

            await DrillTracker.recordAttempt(drill.id, {
                correct: false,
                userAnswer: 'queue',
                timeTaken: 3000
            });

            const updated = await store.getById(drill.id);
            expect(updated.correct).toBe(false);
        });

        it('should increment attempts on retry', async () => {
            const drill = DrillStore.createDrill({
                type: 'spot-bug',
                skillId: 'off_by_one',
                content: 'Q',
                answer: 'line 3'
            });
            await store.add(drill);

            await DrillTracker.recordAttempt(drill.id, { correct: false });
            await DrillTracker.recordAttempt(drill.id, { correct: true });

            const updated = await store.getById(drill.id);
            expect(updated.attempts).toBe(2);
        });
    });

    describe('calculateSkillImpact', () => {
        it('should calculate positive impact for correct drill', () => {
            const impact = DrillTracker.calculateSkillImpact({
                correct: true,
                difficulty: 'hard',
                attempts: 1
            });

            expect(impact.confidenceChange).toBeGreaterThan(0);
        });

        it('should calculate negative impact for wrong drill', () => {
            const impact = DrillTracker.calculateSkillImpact({
                correct: false,
                difficulty: 'easy',
                attempts: 3
            });

            expect(impact.confidenceChange).toBeLessThan(0);
        });

        it('should weight harder drills more', () => {
            const easyImpact = DrillTracker.calculateSkillImpact({
                correct: true,
                difficulty: 'easy',
                attempts: 1
            });

            const hardImpact = DrillTracker.calculateSkillImpact({
                correct: true,
                difficulty: 'hard',
                attempts: 1
            });

            expect(hardImpact.confidenceChange).toBeGreaterThan(easyImpact.confidenceChange);
        });
    });

    describe('getDrillHistory', () => {
        let store;

        beforeEach(async () => {
            store = new DrillStore.DrillStore();
            await store.init();

            // Add completed drills
            const d1 = DrillStore.createDrill({ type: 'fill-in-blank', skillId: 'a', content: '', answer: '' });
            d1.status = 'completed';
            d1.correct = true;
            d1.completedAt = new Date().toISOString();
            await store.add(d1);

            const d2 = DrillStore.createDrill({ type: 'spot-bug', skillId: 'b', content: '', answer: '' });
            d2.status = 'completed';
            d2.correct = false;
            d2.completedAt = new Date().toISOString();
            await store.add(d2);
        });

        afterEach(async () => {
            await store.clear();
        });

        it('should get recent drill history', async () => {
            const history = await DrillTracker.getDrillHistory(7);

            expect(history.length).toBe(2);
        });

        it('should calculate accuracy from history', async () => {
            const stats = await DrillTracker.getHistoryStats(7);

            expect(stats.totalAttempts).toBe(2);
            expect(stats.correctCount).toBe(1);
            expect(stats.accuracy).toBe('50.0%');
        });
    });

    describe('getSkillDrillStats', () => {
        it('should return drill stats per skill', async () => {
            const store = new DrillStore.DrillStore();
            await store.init();

            const d1 = DrillStore.createDrill({ type: 'fill-in-blank', skillId: 'bfs', content: '', answer: '' });
            d1.status = 'completed';
            d1.correct = true;
            await store.add(d1);

            const d2 = DrillStore.createDrill({ type: 'spot-bug', skillId: 'bfs', content: '', answer: '' });
            d2.status = 'completed';
            d2.correct = true;
            await store.add(d2);

            const stats = await DrillTracker.getSkillDrillStats('bfs');

            expect(stats.total).toBe(2);
            expect(stats.correct).toBe(2);
        });
    });
});
