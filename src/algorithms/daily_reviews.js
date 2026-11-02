/**
 * LeetCode EasyRepeat - Daily reviews (每天推荐复习量)
 *
 * New problems are not counted or limited: do as many as you like.
 * Reviews get a recommended number a day:
 * - Start: your average reviews per active day over the last 14 active days
 *   (needs 5 active days of history; otherwise 5).
 * - Each new day it floats with the last 7 days: if you did at least 95% of
 *   what was recommended and actually due, it goes up 10%; under 70%, down
 *   10%. Days you never opened the popup and leave days are not counted.
 *   Range 3..60. A fixed number in the settings overrides all of this.
 * - Due problems beyond today's number stay due (nothing is moved); the
 *   popup shows today's share first, short-term reviews (1/3/7) before the
 *   rest, then the longest overdue.
 *
 * A "review" = a rated attempt on a problem that was first done on an
 * earlier day (one per problem per day).
 *
 * Storage: dailyReviews = { date, recommended, dayLog: { 'YYYY-MM-DD': { rec, available } } }
 *          dailyReviewSettings = { fixed: number | null }
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

    const DEFAULT = 5;
    const MIN = 3;
    const MAX = 60;
    const PACE_DAYS = 14;
    const PACE_MIN_DAYS = 5;
    const FLOAT_DAYS = 7;
    const LOG_KEEP = 30;

    function pad(n) {
        return String(n).padStart(2, '0');
    }

    function toKey(date) {
        const d = date instanceof Date ? date : new Date(date);
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    function addDaysKey(date, days) {
        const d = new Date(date);
        d.setDate(d.getDate() + days);
        return toKey(d);
    }

    function clamp(n) {
        return Math.min(MAX, Math.max(MIN, Math.round(n)));
    }

    /** Map day key -> number of problems reviewed that day. */
    function reviewsByDay(problems) {
        const byDay = new Map();
        for (const p of Object.values(problems || {})) {
            const dates = (Array.isArray(p && p.history) ? p.history : [])
                .filter(h => h && Number(h.rating) >= 1 && Number.isFinite(new Date(h.date).getTime()))
                .map(h => new Date(h.date))
                .sort((a, b) => a - b);
            if (!dates.length) continue;
            const firstKey = toKey(dates[0]);
            const seen = new Set();
            for (const d of dates) {
                const key = toKey(d);
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

    /**
     * Today's recommended number.
     * @param {Object} problems
     * @param {Date} today
     * @param {number} previous   yesterday's (last) recommendation, 0 if none
     * @param {Object} dayLog     { key: { rec, available } }
     * @param {string[]} leaveDays
     */
    function recommend(problems, today, previous, dayLog = {}, leaveDays = []) {
        let rec = Number(previous);
        if (!(rec > 0)) {
            const pace = reviewPace(problems, today);
            rec = pace.activeDays >= PACE_MIN_DAYS ? pace.avg : DEFAULT;
            return clamp(rec);
        }
        const todayKey = toKey(today);
        const fromKey = addDaysKey(today, -FLOAT_DAYS);
        const leave = new Set(leaveDays || []);
        const done = reviewsByDay(problems);
        let expected = 0;
        let did = 0;
        for (const [key, v] of Object.entries(dayLog || {})) {
            if (key >= todayKey || key < fromKey || leave.has(key) || !v) continue;
            const possible = Math.min(Number(v.rec) || 0, Number(v.available) || 0);
            expected += possible;
            did += Math.min(done.get(key) || 0, possible);
        }
        if (expected >= 3) {
            const ratio = did / expected;
            if (ratio >= 0.95) rec = Math.ceil(rec * 1.1);
            else if (ratio < 0.7) rec = Math.floor(rec * 0.9);
        }
        return clamp(rec);
    }

    /**
     * Today's number: fixed setting, or the stored recommendation for today,
     * or a new one. Returns { recommended, state, changed }.
     */
    function today(problems, now, state, settings, leaveDays) {
        const todayKey = toKey(now);
        const s = state && typeof state === 'object' ? state : {};
        const fixed = Number(settings && settings.fixed);
        if (Number.isInteger(fixed) && fixed > 0) {
            return { recommended: fixed, fixed: true, state: s, changed: false };
        }
        if (s.date === todayKey && Number(s.recommended) > 0) {
            return { recommended: Number(s.recommended), fixed: false, state: s, changed: false };
        }
        const recommended = recommend(problems, now, s.recommended, s.dayLog, leaveDays);
        return { recommended, fixed: false, state: { ...s, date: todayKey, recommended }, changed: true };
    }

    /** Record what was recommended and how many reviews were possible today. */
    function logDay(state, now, rec, available) {
        const s = state && typeof state === 'object' ? state : {};
        const key = toKey(now);
        const log = { ...(s.dayLog || {}) };
        const prev = log[key] || {};
        const entry = { rec, available: Math.max(Number(prev.available) || 0, available) };
        if (prev.rec === entry.rec && prev.available === entry.available) return { state: s, changed: false };
        log[key] = entry;
        const keep = Object.keys(log).sort().slice(-LOG_KEEP);
        return { state: { ...s, dayLog: Object.fromEntries(keep.map(k => [k, log[k]])) }, changed: true };
    }

    /**
     * Split due problems into today's share and the rest.
     * Order: short-term reviews (smallest step first), then longest overdue.
     * @param {Object[]} due
     * @param {number} remaining   recommended minus reviews already done today
     * @param {(p:Object)=>number|null} stepOf
     */
    function split(due, remaining, stepOf = () => null) {
        const rank = (p) => { const s = stepOf(p); return s === null || s === undefined ? 99 : s; };
        const ordered = [...(due || [])].sort((a, b) =>
            rank(a) - rank(b) || new Date(a.nextReviewDate) - new Date(b.nextReviewDate));
        const n = Math.max(0, remaining);
        return { today: ordered.slice(0, n), later: ordered.slice(n) };
    }

    return { DEFAULT, MIN, MAX, toKey, reviewsByDay, reviewsOn, reviewPace, recommend, today, logDay, split };
}));
