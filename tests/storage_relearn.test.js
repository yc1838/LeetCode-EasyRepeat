/** saveSubmission applies the 1/3/7 relearn steps on top of FSRS. */
let stored;
global.chrome = {
    runtime: { id: 'mock' },
    storage: { local: {
        get: jest.fn(async (defaults) => ({ ...defaults, ...stored })),
        set: jest.fn(async (obj) => { stored = { ...stored, ...obj }; })
    } }
};
global.showCompletionToast = jest.fn();
global.fsrs = require('../src/algorithms/fsrs_logic.js');
global.Relearn = require('../src/algorithms/relearn.js');
const { saveSubmission } = require('../src/shared/storage.js');

const daysAhead = (iso) => Math.round((new Date(iso) - Date.now()) / 864e5);

describe('saveSubmission + relearn', () => {
    beforeEach(() => {
        jest.useFakeTimers().setSystemTime(new Date('2026-11-04T10:00:00'));
        stored = { problems: {} };
    });
    afterEach(() => jest.useRealTimers());

    test('Again on a known problem → back in 1 day, relearn step 0', async () => {
        stored.problems['two-sum'] = {
            slug: 'two-sum', title: 'Two Sum', difficulty: 'Easy', interval: 20, repetition: 3, easeFactor: 2.5,
            fsrs_state: 'Review', fsrs_stability: 20, fsrs_difficulty: 5,
            fsrs_last_review: '2026-10-15T10:00:00.000Z', lastSolved: '2026-10-15T10:00:00.000Z',
            history: [{ date: '2026-10-15T10:00:00.000Z', rating: 3 }]
        };
        await saveSubmission('Two Sum', 'two-sum', 'Easy', 'manual_api_scan', 1);
        const p = stored.problems['two-sum'];
        expect(p.relearn).toEqual({ step: 0 });
        expect(daysAhead(p.nextReviewDate)).toBe(1);
    });

    test('Good on a new problem → plain FSRS', async () => {
        await saveSubmission('Two Sum', 'two-sum', 'Easy', 'manual_api_scan', 3);
        const p = stored.problems['two-sum'];
        expect(p.relearn).toBeNull();
        expect(daysAhead(p.nextReviewDate)).toBe(p.interval);
    });
});
