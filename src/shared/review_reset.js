/**
 * LeetCode EasyRepeat - Review Reset markers
 *
 * When the popup opens problems for review, it records a short-lived marker per
 * slug in chrome.storage.local ("pendingReviewResets"). The content script on
 * that problem page consumes the marker and resets the editor to the default
 * template. Problems opened any other way keep the user's draft.
 *
 * Pure helpers operate on the plain marker map { slug: timestampMs }.
 */
(function (root, factory) {
    const exports = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = exports;
    }
    if (typeof root !== 'undefined' && root) {
        root.ReviewReset = exports;
    }
}(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : this), function () {
    const STORAGE_KEY = 'pendingReviewResets';
    const TTL_MS = 10 * 60 * 1000; // marker valid for 10 minutes
    const BATCH_KEY = 'reviewBatchSize';
    const MAX_BATCH = 20;

    function prune(markers, nowMs) {
        const out = {};
        for (const [slug, ts] of Object.entries(markers || {})) {
            if (typeof ts === 'number' && nowMs - ts >= 0 && nowMs - ts < TTL_MS) out[slug] = ts;
        }
        return out;
    }

    function mark(markers, slugs, nowMs) {
        const out = prune(markers, nowMs);
        for (const slug of slugs || []) {
            if (slug) out[slug] = nowMs;
        }
        return out;
    }

    /** @returns {{matched: boolean, markers: Object}} */
    function consume(markers, slug, nowMs) {
        const live = prune(markers, nowMs);
        const matched = Object.prototype.hasOwnProperty.call(live, slug);
        if (matched) delete live[slug];
        return { matched, markers: live };
    }

    function clampBatch(n, available) {
        const v = Math.floor(Number(n));
        const base = Number.isFinite(v) && v >= 1 ? Math.min(v, MAX_BATCH) : 1;
        return typeof available === 'number' ? Math.max(0, Math.min(base, available)) : base;
    }

    function problemUrl(base, slug) {
        return `${String(base || 'https://leetcode.com').replace(/\/$/, '')}/problems/${slug}/`;
    }

    /** Extract the problem slug from a LeetCode URL path. */
    function slugFromPath(pathname) {
        const m = /^\/problems\/([^/]+)/.exec(pathname || '');
        return m ? m[1] : null;
    }

    return { STORAGE_KEY, TTL_MS, BATCH_KEY, MAX_BATCH, prune, mark, consume, clampBatch, problemUrl, slugFromPath };
}));
