global.fsrs = require('../src/algorithms/fsrs_logic');
global.window = global.window || {};
const { formatRetention } = require('../src/popup/popup_ui');

const now = new Date('2026-11-04T10:00:00').getTime();
const daysAgo = (n) => new Date(now - n * 864e5).toISOString();

describe('retention (FSRS retrievability)', () => {
    test('100% right after review, 90% on the due date, lower when overdue', () => {
        const p = (d) => ({ fsrs_stability: 10, fsrs_last_review: daysAgo(d), easeFactor: 2.5 });
        expect(formatRetention(p(0), now)).toBe('100%');
        expect(formatRetention(p(10), now)).toBe('90%');
        expect(formatRetention(p(30), now)).toBe('77%');
    });

    test('no FSRS data: interval stands in for stability; nothing usable → dash', () => {
        expect(formatRetention({ interval: 10, lastSolved: daysAgo(10), easeFactor: 2.5 }, now)).toBe('90%');
        expect(formatRetention({ easeFactor: 2.5 }, now)).toBe('—');
    });
});
