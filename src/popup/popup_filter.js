/**
 * Popup Filter — in-memory filtering for problem lists.
 *
 * Filters by difficulty, topic, and time range.
 * All filtering is done client-side on the already-loaded problems array.
 */

(function (root, factory) {
    const exports = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = exports;
    }
    if (typeof window !== 'undefined') {
        window.PopupFilter = exports;
    }
}(typeof self !== 'undefined' ? self : this, function () {

    /**
     * Filter a problem list by difficulty, topic, and/or time range.
     *
     * @param {Array} problems - Array of problem objects
     * @param {Object} filters
     * @param {string} [filters.difficulty] - 'all' | 'Easy' | 'Medium' | 'Hard'
     * @param {string} [filters.topic]      - 'all' | topic string
     * @param {string} [filters.timeRange]  - 'all' | '7' | '30' | '90' (days)
     * @param {Date}   [now]                - Current date (for testability)
     * @returns {Array} Filtered problem list
     */
    function filterProblems(problems, filters = {}, now = new Date()) {
        if (!Array.isArray(problems)) return [];

        const { difficulty, topic, timeRange } = filters;

        let result = problems;

        // Difficulty filter
        if (difficulty && difficulty.toLowerCase() !== 'all') {
            const target = difficulty.toLowerCase();
            result = result.filter(p =>
                p.difficulty && p.difficulty.toLowerCase() === target
            );
        }

        // Topic filter
        if (topic && topic.toLowerCase() !== 'all') {
            result = result.filter(p =>
                Array.isArray(p.topics) && p.topics.includes(topic)
            );
        }

        // Time range filter (based on lastSolved)
        if (timeRange && timeRange !== 'all') {
            const days = parseInt(timeRange, 10);
            if (!isNaN(days) && days > 0) {
                const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
                result = result.filter(p => {
                    if (!p.lastSolved) return false;
                    return new Date(p.lastSolved) >= cutoff;
                });
            }
        }

        return result;
    }

    /**
     * Extract all unique topics from a problem list, sorted alphabetically.
     *
     * @param {Array} problems - Array of problem objects
     * @returns {string[]} Sorted unique topics
     */
    function extractAllTopics(problems) {
        if (!Array.isArray(problems)) return [];

        const topicSet = new Set();
        for (const p of problems) {
            if (Array.isArray(p.topics)) {
                for (const t of p.topics) {
                    topicSet.add(t);
                }
            }
        }
        return Array.from(topicSet).sort();
    }

    return {
        filterProblems,
        extractAllTopics
    };
}));
