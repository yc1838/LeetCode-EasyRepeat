const RL = require('../src/algorithms/relearn.js');

const now = new Date('2026-11-04T10:00:00');
const fsrsNext = '2026-11-20T10:00:00.000Z';
const daysFrom = (iso) => Math.round((new Date(iso) - now) / 864e5);

describe('relearn: Hard/Again → 1, 3, 7 days', () => {
    test('good rating outside relearn keeps the FSRS date', () => {
        expect(RL.apply({}, 3, now, fsrsNext)).toEqual({ relearn: null, nextReviewDate: fsrsNext });
        expect(RL.apply({}, 4, now, fsrsNext).relearn).toBeNull();
    });

    test('Hard or Again starts at 1 day', () => {
        for (const r of [1, 2]) {
            const res = RL.apply({}, r, now, fsrsNext);
            expect(res.relearn).toEqual({ step: 0 });
            expect(daysFrom(res.nextReviewDate)).toBe(1);
        }
    });

    test('good ratings walk 1 → 3 → 7 → back to FSRS', () => {
        let p = { relearn: { step: 0 } };
        let res = RL.apply(p, 3, now, fsrsNext);
        expect(res.relearn).toEqual({ step: 1 });
        expect(daysFrom(res.nextReviewDate)).toBe(3);
        res = RL.apply({ relearn: res.relearn }, 4, now, fsrsNext);
        expect(res.relearn).toEqual({ step: 2 });
        expect(daysFrom(res.nextReviewDate)).toBe(7);
        res = RL.apply({ relearn: res.relearn }, 3, now, fsrsNext);
        expect(res).toEqual({ relearn: null, nextReviewDate: fsrsNext });
    });

    test('a bad rating during the steps goes back one step', () => {
        let res = RL.apply({ relearn: { step: 2 } }, 1, now, fsrsNext);
        expect(res.relearn).toEqual({ step: 1 });
        expect(daysFrom(res.nextReviewDate)).toBe(3);
        res = RL.apply({ relearn: { step: 0 } }, 2, now, fsrsNext);
        expect(res.relearn).toEqual({ step: 0 });
        expect(daysFrom(res.nextReviewDate)).toBe(1);
    });

    test('older fork data (reinforce) is read as relearn', () => {
        expect(RL.currentStep({ reinforce: { mode: 'relearn', step: 1 } })).toBe(1);
        expect(RL.currentStep({ reinforce: { mode: 'intensive' } })).toBe(0);
        expect(RL.currentStep({ reinforce: { mode: 'queued' } })).toBeNull();
        expect(RL.currentStep({ reinforce: { mode: 'consolidate', step: 2 } })).toBeNull();
        const f = RL.fields({ reinforce: { mode: 'relearn', step: 2 } }, 3, now, fsrsNext);
        expect(f).toEqual({ relearn: null, reinforce: undefined, nextReviewDate: fsrsNext });
    });
});
