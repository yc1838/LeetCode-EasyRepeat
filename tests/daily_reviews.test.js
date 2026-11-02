const DR = require('../src/algorithms/daily_reviews.js');

const today = new Date('2026-11-04T09:00:00');
const at = (offset, hour = 10) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
};
const key = (offset) => DR.toKey(new Date(at(offset)));
// A problem first done 30 days ago and reviewed on the given days.
const reviewed = (offsets) => ({ history: [{ date: at(-30), rating: 3 }, ...offsets.map(o => ({ date: at(o), rating: 3 }))] });
const perDay = (n, days) => {
    const map = {};
    for (let d = 1; d <= days; d++) for (let k = 0; k < n; k++) map[`p${d}-${k}`] = reviewed([-d]);
    return map;
};

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
        Object.assign(problems, { t: reviewed([0]) });
        expect(DR.reviewPace(problems, today)).toEqual({ avg: 6, activeDays: 14 });
    });
});

describe('recommendation', () => {
    test('starts at 5 with little history, else at the pace', () => {
        expect(DR.recommend({}, today, 0)).toBe(5);
        expect(DR.recommend(perDay(12, 4), today, 0)).toBe(5);
        expect(DR.recommend(perDay(12, 8), today, 0)).toBe(12);
    });

    test('+10% when ≥95% of what was recommended and due got done', () => {
        const problems = perDay(10, 2);
        const log = { [key(-1)]: { rec: 10, available: 15 }, [key(-2)]: { rec: 10, available: 10 } };
        expect(DR.recommend(problems, today, 10, log)).toBe(11);
    });

    test('done counts only up to what was possible', () => {
        const problems = perDay(10, 1);
        expect(DR.recommend(problems, today, 10, { [key(-1)]: { rec: 10, available: 4 } })).toBe(11);
    });

    test('−10% under 70%, unchanged in between', () => {
        expect(DR.recommend(perDay(5, 1), today, 10, { [key(-1)]: { rec: 10, available: 10 } })).toBe(9);
        expect(DR.recommend(perDay(8, 1), today, 10, { [key(-1)]: { rec: 10, available: 10 } })).toBe(10);
    });

    test('ignores today, days older than a week, leave days, tiny samples; clamps 3..60', () => {
        expect(DR.recommend({}, today, 10, { [key(0)]: { rec: 10, available: 10 }, [key(-9)]: { rec: 10, available: 10 } })).toBe(10);
        expect(DR.recommend({}, today, 10, { [key(-1)]: { rec: 10, available: 10 } }, [key(-1)])).toBe(10);
        expect(DR.recommend({}, today, 10, { [key(-1)]: { rec: 10, available: 2 } })).toBe(10);
        expect(DR.recommend({}, today, 3, { [key(-1)]: { rec: 3, available: 3 } })).toBe(3);
        expect(DR.recommend(perDay(60, 1), today, 60, { [key(-1)]: { rec: 60, available: 60 } })).toBe(60);
    });
});

describe('today', () => {
    test('a fixed number wins', () => {
        expect(DR.today({}, today, { date: key(0), recommended: 9 }, { fixed: 4 })).toMatchObject({ recommended: 4, fixed: true, changed: false });
    });

    test('computed once a day, then reused', () => {
        const first = DR.today({}, today, { date: key(-1), recommended: 10, dayLog: { [key(-1)]: { rec: 10, available: 10 } } }, null);
        expect(first).toMatchObject({ recommended: 9, changed: true });
        expect(first.state).toMatchObject({ date: key(0), recommended: 9 });
        expect(DR.today({}, today, first.state, null)).toMatchObject({ recommended: 9, changed: false });
    });

    test('day log keeps the largest number that was due', () => {
        let s = DR.logDay({}, today, 10, 8).state;
        s = DR.logDay(s, today, 10, 6).state;
        expect(s.dayLog[key(0)]).toEqual({ rec: 10, available: 8 });
        expect(DR.logDay(s, today, 10, 8).changed).toBe(false);
    });
});

describe('split', () => {
    test('short-term reviews first, then longest overdue; the rest is later', () => {
        const due = [
            { slug: 'old', nextReviewDate: at(-10) },
            { slug: 'r1', nextReviewDate: at(0), relearn: { step: 1 } },
            { slug: 'mid', nextReviewDate: at(-3) },
            { slug: 'r0', nextReviewDate: at(-1), relearn: { step: 0 } }
        ];
        const step = (p) => (p.relearn ? p.relearn.step : null);
        const s = DR.split(due, 3, step);
        expect(s.today.map(p => p.slug)).toEqual(['r0', 'r1', 'old']);
        expect(s.later.map(p => p.slug)).toEqual(['mid']);
        expect(DR.split(due, -2, step).today).toEqual([]);
    });
});
