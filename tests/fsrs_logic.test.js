
const fsrs = require('../src/algorithms/fsrs_logic');

describe('FSRS Logic', () => {

    test('calculateFSRS should export required functions', () => {
        expect(fsrs.calculateFSRS).toBeDefined();
        expect(fsrs.projectScheduleFSRS).toBeDefined();
    });

    test('New card initialization', () => {
        const card = { state: 'New', stability: 0, difficulty: 0, last_review: null };
        // Rating 3 = Good
        const res = fsrs.calculateFSRS(card, 3, 0);

        expect(res.nextState).toBe('Review');
        expect(res.newStability).toBeGreaterThan(0);
        expect(res.nextInterval).toBeGreaterThan(0);
        // Default w parameters usually give ~3 days for first 'Good'
    });

    test('projectScheduleFSRS should return dates starting from next review', () => {
        const today = new Date('2026-01-24');
        const card = {
            state: 'Review',
            stability: 5,
            difficulty: 5
        };

        // Project 5 steps
        const schedule = fsrs.projectScheduleFSRS(card, today);

        expect(Array.isArray(schedule)).toBe(true);
        expect(schedule.length).toBeGreaterThan(0);

        // Check date format YYYY-MM-DD
        expect(schedule[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);

        // Ensure dates are increasing
        const d1 = new Date(schedule[0]);
        const d2 = new Date(schedule[1]);
        expect(d2 > d1).toBe(true);
    });

    test('projectScheduleFSRS should respect stability growth', () => {
        // Higher stability should yield larger intervals
        const today = new Date('2026-01-24');
        const lastRev = new Date(today);
        lastRev.setDate(lastRev.getDate() - 100);

        const cardLowS = { state: 'Review', stability: 2, difficulty: 5, last_review: lastRev };
        const scheduleLow = fsrs.projectScheduleFSRS(cardLowS, today);

        const cardHighS = { state: 'Review', stability: 20, difficulty: 5, last_review: lastRev };
        const scheduleHigh = fsrs.projectScheduleFSRS(cardHighS, today);

        // Calculate days to first review
        const getDays = (dateStr) => (new Date(dateStr) - today) / (1000 * 60 * 60 * 24);

        expect(getDays(scheduleHigh[0])).toBeGreaterThan(getDays(scheduleLow[0]));
    });

    test('projectScheduleFSRS should start AFTER the simulation start date', () => {
        // If we simulate starting 2026-02-01, the first projected review should be > 2026-02-01
        const futureStart = new Date('2026-02-01');
        const card = { state: 'Review', stability: 5, difficulty: 5 };

        const schedule = fsrs.projectScheduleFSRS(card, futureStart);
        const firstProj = new Date(schedule[0]);

        expect(firstProj > futureStart).toBe(true);
    });
});
