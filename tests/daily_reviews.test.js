const DR = require('../src/algorithms/daily_reviews.js');
const fsrs = require('../src/algorithms/fsrs_logic.js');
const Relearn = require('../src/algorithms/relearn.js');
const deps = { fsrs, Relearn };

const today = new Date('2026-11-04T09:00:00');
const at = (offset, hour = 10) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
};
const key = (offset) => DR.toKey(new Date(at(offset)));
// First done 30 days ago, then reviewed on the given days (rating 3 unless given as [offset, rating]).
const reviewed = (offsets, extra = {}) => ({
    history: [{ date: at(-30), rating: 3 }, ...offsets.map(o => (Array.isArray(o) ? { date: at(o[0]), rating: o[1] } : { date: at(o), rating: 3 }))],
    ...extra
});
const perDay = (n, days) => {
    const map = {};
    for (let d = 1; d <= days; d++) for (let k = 0; k < n; k++) map[`p${d}-${k}`] = reviewed([-d], { nextReviewDate: at(400) });
    return map;
};
// A known problem (stable, good last time) due on `dueOffset`.
const known = (dueOffset, stability = 30) => reviewed([-10], {
    nextReviewDate: at(dueOffset), fsrs_state: 'Review', fsrs_stability: stability, fsrs_difficulty: 5, fsrs_last_review: at(-10)
});

describe('counting reviews', () => {
    test('first attempts and same-day repeats are not reviews', () => {
        const problems = {
            a: reviewed([-1]),
            b: { history: [{ date: at(-1), rating: 2 }, { date: at(-1, 15), rating: 3 }] },
            c: { history: [{ date: at(-5), rating: 1 }, { date: at(-1), rating: 1 }, { date: at(-1, 15), rating: 3 }] }
        };
        expect(DR.reviewsOn(problems, key(-1))).toBe(2);
    });

    test('pace = average over the last 14 active days before today', () => {
        const problems = perDay(6, 20);
        problems.t = reviewed([0]);
        expect(DR.reviewPace(problems, today)).toEqual({ avg: 6, activeDays: 14 });
    });
});

describe('transition rates', () => {
    test('defaults with little history; measured from consecutive ratings otherwise', () => {
        expect(DR.transitionRates({}, today)).toEqual({ afterGood: 0.75, afterBad: 0.4 });
        const problems = {};
        for (let i = 0; i < 10; i++) problems[`gb${i}`] = reviewed([[-5, 1]]);           // good → bad
        for (let i = 0; i < 10; i++) problems[`bg${i}`] = reviewed([[-6, 1], [-3, 3]]); // good → bad → good
        const r = DR.transitionRates(problems, today);
        expect(r.afterGood).toBeCloseTo(0.1, 6); // 0 of 20 good-after-good, clamped to 0.1
        expect(r.afterBad).toBeCloseTo(0.95, 6); // 10 of 10, clamped
    });
});

describe('projected load', () => {
    test('nothing due within 14 days → 0', () => {
        expect(DR.projectLoad({ a: known(30) }, today, deps).total).toBe(0);
    });

    test('a known problem due today counts at least once, plus the chance it is forgotten and relearned', () => {
        const r = DR.projectLoad({ a: known(0, 60) }, today, deps);
        expect(r.total).toBeGreaterThanOrEqual(1);
        expect(r.total).toBeLessThan(3); // default 75% good → 25% × (1/3/7 steps)
    });

    test('overdue problems count from today', () => {
        expect(DR.projectLoad({ a: known(-20, 60) }, today, deps).total).toBeGreaterThanOrEqual(1);
    });

    test('a weak problem comes back several times within 14 days', () => {
        const weak = reviewed([[-1, 1]], { nextReviewDate: at(0), relearn: { step: 0 }, fsrs_state: 'Review', fsrs_stability: 1, fsrs_difficulty: 8, fsrs_last_review: at(-1) });
        expect(DR.projectLoad({ w: weak }, today, deps).total).toBeGreaterThan(DR.projectLoad({ a: known(0, 60) }, today, deps).total);
    });

    test('repeatable for the same data', () => {
        const problems = { a: known(0, 3), b: known(2, 5), c: known(5, 2) };
        expect(DR.projectLoad(problems, today, deps).total).toBe(DR.projectLoad(problems, today, deps).total);
    });
});

describe('recommendation', () => {
    test('expected reviews ÷ 14, rounded up, at least 3', () => {
        const problems = {};
        for (let i = 0; i < 70; i++) problems[`k${i}`] = known(i % 14, 60);
        const r = DR.recommend(problems, today, deps);
        expect(r.need).toBeGreaterThanOrEqual(5);
        expect(r.recommended).toBe(Math.max(3, Math.ceil(DR.projectLoad(problems, today, deps).perDay)));
        expect(DR.recommend({}, today, deps).recommended).toBe(3);
    });

    test('reports the recent pace alongside', () => {
        expect(DR.recommend(perDay(8, 3), today, deps).pace).toBe(8);
        expect(DR.recommend({}, today, deps).pace).toBeNull();
    });
});

describe('today', () => {
    test('computed once a day, then reused', () => {
        const problems = { a: known(0, 60) };
        const first = DR.today(problems, today, { date: key(-1), recommended: 30 }, null, deps);
        expect(first.changed).toBe(true);
        expect(first.state.date).toBe(key(0));
        const again = DR.today(problems, today, first.state, null, deps);
        expect(again).toMatchObject({ recommended: first.recommended, changed: false, fill: true });
    });

    test('a number stored today by an older version is recomputed', () => {
        const r = DR.today({}, today, { date: key(0), recommended: 14, dayLog: {} }, null, deps);
        expect(r).toMatchObject({ recommended: 3, changed: true });
        expect(r.state.algo).toBe('load14');
    });

    test('a fixed number wins; fill can be turned off', () => {
        const r = DR.today({}, today, { date: key(0), algo: 'load14', recommended: 9, need: 9 }, { fixed: 4, fill: false }, deps);
        expect(r).toMatchObject({ recommended: 4, fixed: true, fill: false, need: 9 });
    });
});

describe('split', () => {
    const step = (p) => (p.relearn ? p.relearn.step : null);
    const due = [
        { slug: 'old', nextReviewDate: at(-10) },
        { slug: 'r1', nextReviewDate: at(0), relearn: { step: 1 } },
        { slug: 'mid', nextReviewDate: at(-3) },
        { slug: 'r0', nextReviewDate: at(-1), relearn: { step: 0 } }
    ];

    test('short-term reviews first, then longest overdue; the rest is later', () => {
        const s = DR.split(due, [], 3, { stepOf: step });
        expect(s.today.map(p => p.slug)).toEqual(['r0', 'r1', 'old']);
        expect(s.later.map(p => p.slug)).toEqual(['mid']);
        expect(s.early).toEqual([]);
        expect(DR.split(due, [], -2, { stepOf: step }).today).toEqual([]);
    });

    test('fewer due than recommended → filled with the soonest due, never relearn or reviewed today', () => {
        const upcoming = [
            { slug: 'in3', nextReviewDate: at(3) },
            { slug: 'in1', nextReviewDate: at(1) },
            { slug: 'relearnSoon', nextReviewDate: at(1), relearn: { step: 1 } },
            { slug: 'doneToday', nextReviewDate: at(1), history: [{ date: at(0, 8), rating: 1 }] },
            { slug: 'in2', nextReviewDate: at(2) }
        ];
        const s = DR.split(due, upcoming, 6, { stepOf: step, todayKey: key(0) });
        expect(s.today.map(p => p.slug)).toEqual(['r0', 'r1', 'old', 'mid', 'in1', 'in2']);
        expect(s.early.map(p => p.slug)).toEqual(['in1', 'in2']);
        expect(DR.split(due, upcoming, 6, { stepOf: step, fill: false }).today).toHaveLength(4);
    });
});
