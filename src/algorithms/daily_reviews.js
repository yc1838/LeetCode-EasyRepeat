/**
 * LeetCode EasyRepeat - Daily reviews (每天推荐复习量)
 *
 * New problems are not counted or limited: do as many as you like.
 *
 * Reviews get a recommended number a day, from the load ahead:
 *   recommended = expected reviews over the next 14 days ÷ 14
 * "Expected reviews" counts every problem already due or due within 14 days,
 * plus the times it comes back inside the window after being reviewed (FSRS
 * gaps after Good/Easy; 1/3/7-day relearn steps after Hard/Again). Whether
 * each review comes out good is drawn from your own last 90 days: how often
 * the attempt after a good rating was good, and after a bad one. The result
 * is the average of many seeded runs, so it is the same every time for the
 * same data. Recomputed once a day; a fixed number in Settings overrides it.
 *
 * Today's list: problems due today (short-term reviews first, then the
 * longest overdue). When fewer are due than recommended, it is filled with
 * the problems due soonest (not short-term reviews, whose spacing matters,
 * and not ones already reviewed today) — this evens out the days. The fill
 * can be turned off in Settings.
 *
 * Also reported: your recent pace (average reviews per active day over the
 * last 14 active days), to compare with what is needed.
 *
 * A "review" = a rated attempt on a problem first done on an earlier day
 * (one per problem per day).
 *
 * Storage: dailyReviews = { date, algo, recommended, need, pace }
 *          dailyReviewSettings = { fixed: number | null, fill: boolean (default true) }
 */
(function (root, factory) {
    const exports = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = exports;
    }
    if (typeof root !== 'undefined' && root) {
        root.DailyReviews = exports;
    }
}(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : this), function () {

    const DAY_MS = 24 * 60 * 60 * 1000;
    const DEFAULT = 5;
    const MIN = 3;
    const MAX = 60;
    const HORIZON = 14;
    const RUNS = 64;
    const SEED = 20261101;
    // Marks a stored recommendation as made by this algorithm, so a number
    // stored today by an older version is recomputed instead of reused.
    const ALGO = 'load14';
    const PACE_DAYS = 14;

    function pad(n) {
        return String(n).padStart(2, '0');
    }

    function toKey(date) {
        const d = date instanceof Date ? date : new Date(date);
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    function startOfDay(date) {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    function clamp(n) {
        return Math.min(MAX, Math.max(MIN, Math.round(n)));
    }

    function rated(history) {
        return (Array.isArray(history) ? history : [])
            .filter(h => h && Number(h.rating) >= 1 && Number.isFinite(new Date(h.date).getTime()))
            .sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    /** Map day key -> number of problems reviewed that day. */
    function reviewsByDay(problems) {
        const byDay = new Map();
        for (const p of Object.values(problems || {})) {
            const r = rated(p && p.history);
            if (!r.length) continue;
            const firstKey = toKey(new Date(r[0].date));
            const seen = new Set();
            for (const h of r) {
                const key = toKey(new Date(h.date));
                if (key === firstKey || seen.has(key)) continue;
                seen.add(key);
                byDay.set(key, (byDay.get(key) || 0) + 1);
            }
        }
        return byDay;
    }

    function reviewsOn(problems, dayKey) {
        return reviewsByDay(problems).get(dayKey) || 0;
    }

    function reviewedOn(problem, dayKey) {
        return rated(problem && problem.history).some(h => toKey(new Date(h.date)) === dayKey);
    }

    /** Average reviews per active day over the last 14 active days before today. */
    function reviewPace(problems, today) {
        const todayKey = toKey(today);
        const days = Array.from(reviewsByDay(problems).entries())
            .filter(([k]) => k < todayKey)
            .sort((a, b) => (a[0] < b[0] ? 1 : -1))
            .slice(0, PACE_DAYS);
        if (!days.length) return { avg: null, activeDays: 0 };
        return { avg: days.reduce((s, [, n]) => s + n, 0) / days.length, activeDays: days.length };
    }

    /** P(good | previous good) and P(good | previous bad) over the last 90 days. */
    function transitionRates(problems, today, windowDays = 90) {
        const end = today.getTime();
        const since = end - windowDays * DAY_MS;
        let ng = 0, gg = 0, nb = 0, gb = 0;
        for (const p of Object.values(problems || {})) {
            const r = rated(p && p.history);
            for (let i = 1; i < r.length; i++) {
                const t = new Date(r[i].date).getTime();
                if (t < since || t > end) continue;
                const good = Number(r[i].rating) >= 3;
                if (Number(r[i - 1].rating) >= 3) { ng++; gg += good ? 1 : 0; } else { nb++; gb += good ? 1 : 0; }
            }
        }
        const c = (x) => Math.min(0.95, Math.max(0.1, x));
        return {
            afterGood: c(ng >= 10 ? gg / ng : 0.75),
            afterBad: c(nb >= 10 ? gb / nb : 0.4)
        };
    }

    /** Small seeded PRNG (mulberry32) so the projection is repeatable. */
    function rng(seed) {
        let a = seed >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function deps(options) {
        const g = typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : {});
        return {
            fsrs: (options && options.fsrs) || g.fsrs,
            Relearn: (options && options.Relearn) || g.Relearn
        };
    }

    /**
     * Expected number of reviews in the next `days` days (today included).
     * @returns {{ total:number, perDay:number, rates:{afterGood:number, afterBad:number} }}
     */
    function projectLoad(problems, today, options = {}) {
        const { fsrs, Relearn } = deps(options);
        const days = options.days || HORIZON;
        const runs = options.runs || RUNS;
        const start = startOfDay(today).getTime();
        const end = start + days * DAY_MS;
        const rates = transitionRates(problems, today);
        const random = rng(options.seed || SEED);
        const list = Object.values(problems || {}).filter(p => p && Number.isFinite(new Date(p.nextReviewDate).getTime()));
        let total = 0;

        for (let run = 0; run < runs; run++) {
            for (const p of list) {
                let due = Math.max(start, new Date(p.nextReviewDate).getTime());
                if (due >= end) continue;
                const r = rated(p.history);
                let lastGood = r.length ? Number(r[r.length - 1].rating) >= 3 : true;
                let last = new Date(p.fsrs_last_review || p.lastSolved || (r.length ? r[r.length - 1].date : due)).getTime();
                let card = {
                    state: p.fsrs_state || (p.fsrs_stability ? 'Review' : 'New'),
                    stability: Number(p.fsrs_stability) || 0,
                    difficulty: Number(p.fsrs_difficulty) || 0,
                    last_review: p.fsrs_last_review ? new Date(p.fsrs_last_review) : null
                };
                let state = { relearn: Relearn ? (Relearn.currentStep(p) === null ? null : { step: Relearn.currentStep(p) }) : null };
                let guard = 0;
                while (due < end && guard++ < 60) {
                    total++;
                    const good = random() < (lastGood ? rates.afterGood : rates.afterBad);
                    const rating = good ? 3 : 1;
                    let gapDays = good ? 7 : 1;
                    let next;
                    if (fsrs && fsrs.calculateFSRS) {
                        const res = fsrs.calculateFSRS(card, rating, Math.max(0, (due - last) / DAY_MS));
                        card = { state: res.nextState, stability: res.newStability, difficulty: res.newDifficulty, last_review: new Date(due) };
                        gapDays = res.nextInterval;
                    }
                    next = new Date(due + Math.max(1, gapDays) * DAY_MS).toISOString();
                    if (Relearn) {
                        const rl = Relearn.apply(state, rating, new Date(due), next);
                        state = { relearn: rl.relearn };
                        next = rl.nextReviewDate;
                    }
                    last = due;
                    lastGood = good;
                    due = Math.max(due + DAY_MS, startOfDay(new Date(next)).getTime());
                }
            }
        }
        const avg = total / runs;
        return { total: avg, perDay: avg / days, rates };
    }

    /** { recommended, need, pace } — need = projected reviews a day (unrounded). */
    function recommend(problems, today, options = {}) {
        const load = projectLoad(problems, today, options);
        const pace = reviewPace(problems, today);
        const recommended = load.total > 0 ? clamp(Math.ceil(load.perDay)) : MIN;
        return {
            recommended,
            need: Math.round(load.perDay * 10) / 10,
            pace: pace.avg === null ? null : Math.round(pace.avg * 10) / 10
        };
    }

    /**
     * Today's number: fixed setting, else the recommendation stored for today,
     * else a new one. Returns { recommended, need, pace, fixed, fill, state, changed }.
     */
    function today(problems, now, state, settings, options = {}) {
        const todayKey = toKey(now);
        const s = state && typeof state === 'object' ? state : {};
        const fill = !(settings && settings.fill === false);
        let day = s;
        let changed = false;
        if (!(s.date === todayKey && s.algo === ALGO && Number(s.recommended) > 0)) {
            day = { date: todayKey, algo: ALGO, ...recommend(problems, now, options) };
            changed = true;
        }
        const fixed = Number(settings && settings.fixed);
        const isFixed = Number.isInteger(fixed) && fixed > 0;
        return {
            recommended: isFixed ? fixed : Number(day.recommended),
            need: day.need,
            pace: day.pace,
            fixed: isFixed,
            fill,
            state: day,
            changed
        };
    }

    /**
     * Today's list.
     * @param {Object[]} due        problems due by the end of today
     * @param {Object[]} upcoming   problems due later (any order)
     * @param {number}   remaining  recommended minus reviews already done today
     * @param {Object}   opt        { stepOf(p) -> step|null, fill: boolean, todayKey }
     * @returns {{ today: Object[], later: Object[], early: Object[] }}
     *   today includes `early` (pulled-forward problems) at the end.
     */
    function split(due, upcoming, remaining, opt = {}) {
        const stepOf = opt.stepOf || (() => null);
        const rank = (p) => { const s = stepOf(p); return s === null || s === undefined ? 99 : s; };
        const byDate = (a, b) => new Date(a.nextReviewDate) - new Date(b.nextReviewDate);
        const ordered = [...(due || [])].sort((a, b) => rank(a) - rank(b) || byDate(a, b));
        const n = Math.max(0, remaining);
        const todayList = ordered.slice(0, n);
        const later = ordered.slice(n);
        let early = [];
        if (opt.fill !== false && todayList.length < n) {
            early = [...(upcoming || [])]
                .filter(p => stepOf(p) === null && !(opt.todayKey && reviewedOn(p, opt.todayKey)))
                .sort(byDate)
                .slice(0, n - todayList.length);
        }
        return { today: [...todayList, ...early], later, early };
    }

    return {
        DEFAULT, MIN, MAX, HORIZON,
        toKey, reviewsByDay, reviewsOn, reviewedOn, reviewPace, transitionRates,
        projectLoad, recommend, today, split
    };
}));
