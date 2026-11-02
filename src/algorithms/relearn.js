/**
 * LeetCode EasyRepeat - Relearn (答差就隔 1、3、7 天各复习一次)
 *
 * A bad rating (Hard or Again) starts short-term review: the problem comes
 * back after 1 day, then 3, then 7. A good rating (Good or Easy) moves it to
 * the next step; a bad rating during the steps goes back one step. After the
 * 7-day step is passed with a good rating, the normal FSRS schedule takes over
 * again. FSRS keeps learning from every rating in the background, so the
 * schedule it hands back to is up to date.
 *
 * Stored on the problem as `relearn: { step }` (step = index into STEPS of
 * the gap just scheduled). Problems carrying the older `reinforce` field
 * (v1.1–1.3 of this fork) in relearn / multi-practice / rethink are read as
 * relearn at the matching step.
 */
(function (root, factory) {
    const exports = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = exports;
    }
    if (typeof root !== 'undefined' && root) {
        root.Relearn = exports;
    }
}(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : this), function () {

    const STEPS = [1, 3, 7];

    function isBad(rating) {
        const r = Number(rating);
        return r === 1 || r === 2;
    }

    /** Current step (0..2) if the problem is in short-term review, else null. */
    function currentStep(problem) {
        if (!problem) return null;
        if (problem.relearn && Number.isInteger(problem.relearn.step)) {
            return Math.min(STEPS.length - 1, Math.max(0, problem.relearn.step));
        }
        const old = problem.reinforce;
        if (old && ['relearn', 'intensive', 'rethink'].includes(old.mode)) {
            const step = old.mode === 'relearn' ? Number(old.step) || 0 : 0;
            return Math.min(STEPS.length - 1, Math.max(0, step));
        }
        return null;
    }

    function addDays(now, days) {
        const d = new Date(now);
        d.setDate(d.getDate() + days);
        return d.toISOString();
    }

    /**
     * @param {Object} problem   the problem before this rating
     * @param {number} rating    1 Again · 2 Hard · 3 Good · 4 Easy
     * @param {Date}   now
     * @param {string} fsrsNext  next review date FSRS computed for this rating
     * @returns {{ relearn: {step:number}|null, nextReviewDate: string }}
     */
    function apply(problem, rating, now, fsrsNext) {
        const step = currentStep(problem);
        if (!Number(rating)) return { relearn: problem && problem.relearn ? problem.relearn : null, nextReviewDate: fsrsNext };

        if (step === null) {
            if (!isBad(rating)) return { relearn: null, nextReviewDate: fsrsNext };
            return { relearn: { step: 0 }, nextReviewDate: addDays(now, STEPS[0]) };
        }
        if (isBad(rating)) {
            const back = Math.max(0, step - 1);
            return { relearn: { step: back }, nextReviewDate: addDays(now, STEPS[back]) };
        }
        const next = step + 1;
        if (next >= STEPS.length) return { relearn: null, nextReviewDate: fsrsNext };
        return { relearn: { step: next }, nextReviewDate: addDays(now, STEPS[next]) };
    }

    /** Fields to merge into the stored problem (drops the old `reinforce`). */
    function fields(problem, rating, now, fsrsNext) {
        const r = apply(problem, rating, now, fsrsNext);
        return { relearn: r.relearn, reinforce: undefined, nextReviewDate: r.nextReviewDate };
    }

    return { STEPS, isBad, currentStep, apply, fields };
}));
