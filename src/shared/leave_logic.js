/**
 * LeetCode EasyRepeat - Leave (请假) Logic
 *
 * Pure functions for the "leave day" feature. No chrome.* calls here so it can
 * be unit-tested and shared by popup + options.
 *
 * Rules:
 * - A leave day pauses the review clock for that day: once the day arrives,
 *   every tracked problem's nextReviewDate is pushed back by one day
 *   (problems already reviewed on/after the leave day are left alone).
 * - A leave day does not break the streak (it does not add to it either).
 * - Leave can be requested for any day (past = back-dated "补请", today, or
 *   future) as long as it fits the quota. Only future leave days can be
 *   cancelled, because today's / past leave has already shifted the schedule.
 * - Quotas: a weekly limit (week = Sunday..Saturday) and a monthly limit.
 *   A request must fit both. Quotas are counted by the leave date.
 * - Limits can be set once at any time (first setup); after that they can
 *   only be changed on the 1st day of a month (local time).
 *
 * Storage keys (chrome.storage.local):
 *   leaveDays:     ['YYYY-MM-DD', ...]
 *   leaveApplied:  ['YYYY-MM-DD', ...]   leave days whose shift has been applied
 *   leaveSettings: { weeklyLimit, monthlyLimit, initialized, lastEditedOn }
 */
(function (root, factory) {
    const exports = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = exports;
    }
    if (typeof root !== 'undefined' && root) {
        root.LeaveLogic = exports;
    }
}(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : this), function () {

    const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

    function pad(n) {
        return String(n).padStart(2, '0');
    }

    /** Local-date key YYYY-MM-DD for a Date (or a key, returned as-is). */
    function toKey(date) {
        if (typeof date === 'string' && KEY_RE.test(date)) return date;
        const d = date instanceof Date ? date : new Date(date);
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    /** Local midnight Date for a YYYY-MM-DD key. */
    function parseKey(key) {
        const [y, m, d] = key.split('-').map(Number);
        return new Date(y, m - 1, d);
    }

    function addDays(key, n) {
        const d = parseKey(key);
        d.setDate(d.getDate() + n);
        return toKey(d);
    }

    function isValidKey(key) {
        if (typeof key !== 'string' || !KEY_RE.test(key)) return false;
        return toKey(parseKey(key)) === key;
    }

    /** Sunday that starts the week containing `key`. */
    function weekStartKey(key) {
        const d = parseKey(key);
        d.setDate(d.getDate() - d.getDay());
        return toKey(d);
    }

    function monthKey(key) {
        return key.slice(0, 7);
    }

    function normalizeLimit(value) {
        if (value === null || value === undefined || value === '') return null;
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0) return null;
        return Math.floor(n);
    }

    function normalizeSettings(raw) {
        const s = raw && typeof raw === 'object' ? raw : {};
        const weeklyLimit = normalizeLimit(s.weeklyLimit);
        const monthlyLimit = normalizeLimit(s.monthlyLimit);
        return {
            weeklyLimit,
            monthlyLimit,
            initialized: Boolean(s.initialized) && weeklyLimit !== null && monthlyLimit !== null,
            lastEditedOn: isValidKey(s.lastEditedOn) ? s.lastEditedOn : null
        };
    }

    function uniqueSorted(days) {
        if (!Array.isArray(days)) return [];
        return Array.from(new Set(days.filter(isValidKey))).sort();
    }

    /**
     * Whether the quota limits may be edited today.
     * @returns {{allowed: boolean, reason: 'first_time'|'first_of_month'|'locked', nextEditableOn: string|null}}
     */
    function canEditLimits(rawSettings, today) {
        const settings = normalizeSettings(rawSettings);
        const todayKey = toKey(today);
        if (!settings.initialized) {
            return { allowed: true, reason: 'first_time', nextEditableOn: null };
        }
        if (todayKey.endsWith('-01')) {
            return { allowed: true, reason: 'first_of_month', nextEditableOn: null };
        }
        const d = parseKey(todayKey);
        const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        return { allowed: false, reason: 'locked', nextEditableOn: toKey(next) };
    }

    /**
     * Produce new settings after an edit, or an error if not allowed.
     * @returns {{ok: true, settings: object} | {ok: false, reason: string}}
     */
    function updateLimits(rawSettings, { weeklyLimit, monthlyLimit }, today) {
        const permission = canEditLimits(rawSettings, today);
        if (!permission.allowed) return { ok: false, reason: 'locked', nextEditableOn: permission.nextEditableOn };
        const w = normalizeLimit(weeklyLimit);
        const m = normalizeLimit(monthlyLimit);
        if (w === null || m === null) return { ok: false, reason: 'invalid_limit' };
        if (w > 7) return { ok: false, reason: 'weekly_over_7' };
        if (m > 31) return { ok: false, reason: 'monthly_over_31' };
        return {
            ok: true,
            settings: { weeklyLimit: w, monthlyLimit: m, initialized: true, lastEditedOn: toKey(today) }
        };
    }

    function usage(leaveDays, key) {
        const days = uniqueSorted(leaveDays);
        const ws = weekStartKey(key);
        const we = addDays(ws, 6);
        const mk = monthKey(key);
        return {
            week: days.filter(d => d >= ws && d <= we).length,
            month: days.filter(d => monthKey(d) === mk).length,
            weekStart: ws,
            weekEnd: we,
            month_key: mk
        };
    }

    /**
     * Remaining quota for the week/month containing `key`.
     */
    function remaining(rawSettings, leaveDays, key) {
        const settings = normalizeSettings(rawSettings);
        const k = toKey(key);
        const u = usage(leaveDays, k);
        const left = (limit, used) => (limit === null ? null : Math.max(0, limit - used));
        return {
            configured: settings.initialized,
            week: { used: u.week, limit: settings.weeklyLimit, left: left(settings.weeklyLimit, u.week), start: u.weekStart, end: u.weekEnd },
            month: { used: u.month, limit: settings.monthlyLimit, left: left(settings.monthlyLimit, u.month), key: u.month_key }
        };
    }

    /**
     * Validate a leave request.
     * @returns {{ok: boolean, reason?: 'invalid_date'|'not_configured'|'already'|'weekly_limit'|'monthly_limit'}}
     */
    function validateRequest(dateKey, { leaveDays, settings, today }) {
        if (!isValidKey(dateKey)) return { ok: false, reason: 'invalid_date' };
        const s = normalizeSettings(settings);
        if (!s.initialized) return { ok: false, reason: 'not_configured' };
        const days = uniqueSorted(leaveDays);
        if (days.includes(dateKey)) return { ok: false, reason: 'already' };
        const u = usage(days, dateKey);
        if (u.week >= s.weeklyLimit) return { ok: false, reason: 'weekly_limit' };
        if (u.month >= s.monthlyLimit) return { ok: false, reason: 'monthly_limit' };
        return { ok: true };
    }

    function addLeave(dateKey, ctx) {
        const check = validateRequest(dateKey, ctx);
        if (!check.ok) return check;
        return { ok: true, leaveDays: uniqueSorted([...(ctx.leaveDays || []), dateKey]) };
    }

    /** Only future leave days (strictly after today) can be cancelled. */
    function cancelLeave(dateKey, { leaveDays, today }) {
        const days = uniqueSorted(leaveDays);
        if (!days.includes(dateKey)) return { ok: false, reason: 'not_found' };
        if (dateKey <= toKey(today)) return { ok: false, reason: 'not_cancellable' };
        return { ok: true, leaveDays: days.filter(d => d !== dateKey) };
    }

    function lastReviewTime(problem) {
        let latest = -Infinity;
        const history = Array.isArray(problem && problem.history) ? problem.history : [];
        for (const entry of history) {
            const t = new Date(entry && entry.date).getTime();
            if (Number.isFinite(t) && t > latest) latest = t;
        }
        return latest;
    }

    /**
     * Apply the one-day shift for every leave day that has arrived (<= today)
     * and has not been applied yet. Idempotent via `leaveApplied`.
     *
     * @param {Object} problems - map slug -> problem (not mutated)
     * @returns {{problems: Object, leaveApplied: string[], changed: boolean, appliedNow: string[]}}
     */
    function applyArrivedLeaves(problems, leaveDays, leaveApplied, today) {
        const todayKey = toKey(today);
        const applied = new Set(uniqueSorted(leaveApplied));
        const pending = uniqueSorted(leaveDays).filter(d => d <= todayKey && !applied.has(d));
        if (pending.length === 0) {
            return { problems, leaveApplied: Array.from(applied).sort(), changed: false, appliedNow: [] };
        }

        const next = {};
        for (const [slug, problem] of Object.entries(problems || {})) {
            next[slug] = problem;
        }

        for (const day of pending) {
            const dayStart = parseKey(day).getTime();
            for (const [slug, problem] of Object.entries(next)) {
                if (!problem || !problem.nextReviewDate) continue;
                const due = new Date(problem.nextReviewDate);
                if (Number.isNaN(due.getTime())) continue;
                // Reviews done on/after the leave day were scheduled from reality; leave them.
                if (lastReviewTime(problem) >= dayStart) continue;
                due.setDate(due.getDate() + 1);
                next[slug] = { ...problem, nextReviewDate: due.toISOString() };
            }
            applied.add(day);
        }

        return { problems: next, leaveApplied: Array.from(applied).sort(), changed: true, appliedNow: pending };
    }

    /**
     * Streak counting with leave days as bridges (they neither break nor add).
     * Mirrors the popup's original rule: today without activity doesn't break the streak.
     */
    function calculateStreak(activityLog, leaveDays, today) {
        const active = new Set(Array.isArray(activityLog) ? activityLog : []);
        const leave = new Set(uniqueSorted(leaveDays));
        let streak = 0;
        let key = toKey(today);
        for (let i = 0; i < 3650; i++) {
            if (active.has(key)) {
                streak++;
            } else if (leave.has(key)) {
                // bridge
            } else if (i !== 0) {
                break;
            }
            key = addDays(key, -1);
        }
        return streak;
    }

    return {
        toKey,
        parseKey,
        addDays,
        isValidKey,
        weekStartKey,
        monthKey,
        normalizeSettings,
        canEditLimits,
        updateLimits,
        remaining,
        validateRequest,
        addLeave,
        cancelLeave,
        applyArrivedLeaves,
        calculateStreak
    };
}));
