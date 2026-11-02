const L = require('../src/shared/leave_logic.js');

const settings = { weeklyLimit: 1, monthlyLimit: 2, initialized: true, lastEditedOn: '2026-10-01' };
const d = (key) => L.parseKey(key);

describe('LeaveLogic dates', () => {
    test('week starts on Sunday', () => {
        expect(L.weekStartKey('2026-10-29')).toBe('2026-10-25'); // Thu -> Sun
        expect(L.weekStartKey('2026-10-25')).toBe('2026-10-25'); // Sun
        expect(L.weekStartKey('2026-10-31')).toBe('2026-10-25'); // Sat
        expect(L.weekStartKey('2026-11-01')).toBe('2026-11-01'); // next Sun
    });

    test('rejects impossible dates', () => {
        expect(L.isValidKey('2026-02-30')).toBe(false);
        expect(L.isValidKey('2026-02-28')).toBe(true);
    });
});

describe('LeaveLogic limits editing', () => {
    test('first-time setup is allowed any day', () => {
        expect(L.canEditLimits(undefined, d('2026-10-29')).allowed).toBe(true);
        const r = L.updateLimits(undefined, { weeklyLimit: 1, monthlyLimit: 3 }, d('2026-10-29'));
        expect(r.ok).toBe(true);
        expect(r.settings).toEqual({ weeklyLimit: 1, monthlyLimit: 3, initialized: true, lastEditedOn: '2026-10-29' });
    });

    test('after setup, only the 1st of the month', () => {
        const c = L.canEditLimits(settings, d('2026-10-29'));
        expect(c.allowed).toBe(false);
        expect(c.nextEditableOn).toBe('2026-11-01');
        expect(L.updateLimits(settings, { weeklyLimit: 3, monthlyLimit: 9 }, d('2026-10-29')).ok).toBe(false);
        expect(L.canEditLimits(settings, d('2026-11-01')).reason).toBe('first_of_month');
        expect(L.updateLimits(settings, { weeklyLimit: 2, monthlyLimit: 4 }, d('2026-11-01')).ok).toBe(true);
    });

    test('December rolls into January', () => {
        expect(L.canEditLimits(settings, d('2026-12-15')).nextEditableOn).toBe('2027-01-01');
    });

    test('validates numbers', () => {
        expect(L.updateLimits(undefined, { weeklyLimit: -1, monthlyLimit: 2 }, d('2026-10-29')).reason).toBe('invalid_limit');
        expect(L.updateLimits(undefined, { weeklyLimit: 8, monthlyLimit: 2 }, d('2026-10-29')).reason).toBe('weekly_over_7');
        expect(L.updateLimits(undefined, { weeklyLimit: '', monthlyLimit: 2 }, d('2026-10-29')).reason).toBe('invalid_limit');
    });
});

describe('LeaveLogic requests', () => {
    const today = d('2026-10-29');

    test('requires configured limits', () => {
        expect(L.validateRequest('2026-10-29', { leaveDays: [], settings: undefined, today }).reason).toBe('not_configured');
    });

    test('back-dating (补请), today and future all ok within quota', () => {
        expect(L.validateRequest('2026-10-20', { leaveDays: [], settings, today }).ok).toBe(true);
        expect(L.validateRequest('2026-10-27', { leaveDays: ['2026-10-29'], settings, today }).reason).toBe('weekly_limit');
        expect(L.validateRequest('2026-10-29', { leaveDays: [], settings, today }).ok).toBe(true);
        expect(L.validateRequest('2026-11-03', { leaveDays: [], settings, today }).ok).toBe(true);
    });

    test('weekly limit counts Sun..Sat of the leave date', () => {
        const ctx = { leaveDays: ['2026-10-29'], settings, today };
        expect(L.validateRequest('2026-10-31', ctx).reason).toBe('weekly_limit');   // same week
        expect(L.validateRequest('2026-11-01', ctx).ok).toBe(true);                 // next week (Sunday)
        expect(L.validateRequest('2026-10-29', ctx).reason).toBe('already');
    });

    test('monthly limit', () => {
        const ctx = { leaveDays: ['2026-11-02', '2026-11-09'], settings, today };
        expect(L.validateRequest('2026-11-16', ctx).reason).toBe('monthly_limit');
        expect(L.validateRequest('2026-12-01', ctx).ok).toBe(true);
    });

    test('zero limit blocks leave', () => {
        const zero = { ...settings, weeklyLimit: 0 };
        expect(L.validateRequest('2026-10-30', { leaveDays: [], settings: zero, today }).reason).toBe('weekly_limit');
    });

    test('remaining quota', () => {
        const r = L.remaining(settings, ['2026-10-29'], '2026-10-29');
        expect(r.week).toMatchObject({ used: 1, limit: 1, left: 0 });
        expect(r.month).toMatchObject({ used: 1, limit: 2, left: 1 });
    });

    test('only future leave can be cancelled', () => {
        const days = ['2026-10-29', '2026-11-03'];
        expect(L.cancelLeave('2026-10-29', { leaveDays: days, today }).ok).toBe(false);
        expect(L.cancelLeave('2026-11-03', { leaveDays: days, today })).toEqual({ ok: true, leaveDays: ['2026-10-29'] });
    });
});

describe('LeaveLogic schedule shift', () => {
    const iso = (key, h = 23) => { const x = d(key); x.setHours(h, 59, 59, 999); return x.toISOString(); };
    const problems = {
        a: { slug: 'a', nextReviewDate: iso('2026-10-29'), history: [{ date: iso('2026-10-20', 10) }] },
        b: { slug: 'b', nextReviewDate: iso('2026-11-05'), history: [{ date: iso('2026-10-22', 10) }] },
        c: { slug: 'c', nextReviewDate: iso('2026-11-02'), history: [{ date: iso('2026-10-29', 9) }] }, // reviewed on leave day
        hollow: { slug: 'hollow', history: [] }
    };

    test('shifts every unreviewed problem by one day, once', () => {
        const r = L.applyArrivedLeaves(problems, ['2026-10-29'], [], d('2026-10-29'));
        expect(r.changed).toBe(true);
        expect(L.toKey(new Date(r.problems.a.nextReviewDate))).toBe('2026-10-30');
        expect(L.toKey(new Date(r.problems.b.nextReviewDate))).toBe('2026-11-06');
        expect(r.problems.c.nextReviewDate).toBe(problems.c.nextReviewDate);
        expect(r.problems.hollow).toBe(problems.hollow);
        expect(r.leaveApplied).toEqual(['2026-10-29']);
        expect(problems.a.nextReviewDate).toBe(iso('2026-10-29')); // input untouched

        const again = L.applyArrivedLeaves(r.problems, ['2026-10-29'], r.leaveApplied, d('2026-10-29'));
        expect(again.changed).toBe(false);
    });

    test('back-dated leave shifts problems not reviewed since that day', () => {
        const r = L.applyArrivedLeaves(problems, ['2026-10-25'], [], d('2026-10-29'));
        expect(L.toKey(new Date(r.problems.a.nextReviewDate))).toBe('2026-10-30');
        expect(r.problems.c.nextReviewDate).toBe(problems.c.nextReviewDate); // reviewed 10-29, after leave day
        expect(L.toKey(new Date(r.problems.b.nextReviewDate))).toBe('2026-11-06'); // reviewed 10-22 < 10-25 -> shifted
    });

    test('future leave is not applied yet; consecutive days stack', () => {
        expect(L.applyArrivedLeaves(problems, ['2026-10-30'], [], d('2026-10-29')).changed).toBe(false);
        const r = L.applyArrivedLeaves(problems, ['2026-10-29', '2026-10-30'], [], d('2026-10-30'));
        expect(L.toKey(new Date(r.problems.a.nextReviewDate))).toBe('2026-10-31');
    });
});

describe('LeaveLogic streak', () => {
    test('leave days bridge but do not count', () => {
        const log = ['2026-10-26', '2026-10-27', '2026-10-29'];
        expect(L.calculateStreak(log, [], d('2026-10-29'))).toBe(1);
        expect(L.calculateStreak(log, ['2026-10-28'], d('2026-10-29'))).toBe(3);
    });

    test('today without activity does not break; leave today bridges too', () => {
        const log = ['2026-10-27', '2026-10-28'];
        expect(L.calculateStreak(log, [], d('2026-10-29'))).toBe(2);
        expect(L.calculateStreak(log, ['2026-10-29'], d('2026-10-29'))).toBe(2);
    });
});
