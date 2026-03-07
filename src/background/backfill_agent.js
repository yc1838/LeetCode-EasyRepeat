/**
 * Backfill Agent
 * 
 * Fetches missing LeetCode tags for problems in storage.
 * Uses rate limiting to avoid API bans.
 */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.BackfillAgent = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    // --- Constants ---
    const RATE_LIMIT_MS = 2000; // 2 seconds between requests
    const LEETCODE_GRAPHQL_URL = 'https://leetcode.com/graphql';

    // --- State ---
    let queue = [];
    let paused = false;
    let lastRequestTime = 0;
    let completedCount = 0;

    /**
     * Add a problem to the backfill queue.
     */
    async function addToQueue(problem) {
        // Skip if already in queue
        if (queue.some(p => p.slug === problem.slug)) {
            return;
        }

        queue.push({
            slug: problem.slug,
            title: problem.title || problem.slug,
            addedAt: new Date().toISOString()
        });

        await saveQueue();
    }

    /**
     * Get the current queue.
     */
    async function getQueue() {
        return [...queue];
    }

    /**
     * Scan storage for problems missing tags.
     */
    async function scanForMissingTags() {
        const missing = [];

        if (typeof chrome !== 'undefined' && chrome.storage) {
            const result = await chrome.storage.local.get({ problems: {} });
            const problems = Object.values(result.problems);

            for (const p of problems) {
                if (!p.tags || p.tags.length === 0) {
                    missing.push({ slug: p.slug, title: p.title || p.slug });
                }
            }
        }

        return missing;
    }

    /**
     * Fetch tags from LeetCode GraphQL API.
     */
    async function fetchTags(slug) {
        // Rate limiting
        const now = Date.now();
        const timeSinceLast = now - lastRequestTime;
        if (timeSinceLast < RATE_LIMIT_MS) {
            await sleep(RATE_LIMIT_MS - timeSinceLast);
        }
        lastRequestTime = Date.now();

        try {
            const response = await fetch(LEETCODE_GRAPHQL_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query: `
                        query questionTags($titleSlug: String!) {
                            question(titleSlug: $titleSlug) {
                                topicTags {
                                    slug
                                    name
                                }
                            }
                        }
                    `,
                    variables: { titleSlug: slug }
                })
            });

            if (!response.ok) {
                console.warn(`[BackfillAgent] Rate limited or error: ${response.status}`);
                return null;
            }

            const data = await response.json();
            const tags = data?.data?.question?.topicTags || [];
            return tags.map(t => t.slug);
        } catch (e) {
            console.error('[BackfillAgent] Fetch error:', e);
            return null;
        }
    }

    /**
     * Process the next item in the queue.
     */
    async function processNext() {
        if (queue.length === 0 || paused) {
            return { success: false, reason: 'empty or paused' };
        }

        const item = queue.shift();
        const tags = await fetchTags(item.slug);

        if (tags) {
            // Update storage with tags
            if (typeof chrome !== 'undefined' && chrome.storage) {
                const result = await chrome.storage.local.get({ problems: {} });
                if (result.problems[item.slug]) {
                    result.problems[item.slug].tags = tags;
                    await chrome.storage.local.set({ problems: result.problems });
                }
            }

            completedCount++;
            await saveQueue();

            return { success: true, slug: item.slug, tags };
        }

        // Put back in queue on failure
        queue.unshift(item);
        return { success: false, reason: 'fetch failed' };
    }

    /**
     * Get progress of backfill.
     */
    function getProgress() {
        return {
            total: queue.length + completedCount,
            completed: completedCount,
            remaining: queue.length
        };
    }

    /**
     * Pause backfill.
     */
    function pause() {
        paused = true;
    }

    /**
     * Resume backfill.
     */
    function resume() {
        paused = false;
    }

    /**
     * Check if backfill is paused.
     */
    function isPaused() {
        return paused;
    }

    /**
     * Save queue to storage.
     */
    async function saveQueue() {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            await chrome.storage.local.set({
                backfillQueue: queue,
                backfillProgress: getProgress()
            });
        }
    }

    /**
     * Load queue from storage.
     */
    async function loadQueue() {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            const result = await chrome.storage.local.get({
                backfillQueue: [],
                backfillProgress: { completed: 0 }
            });
            queue = result.backfillQueue || [];
            completedCount = result.backfillProgress?.completed || 0;
        }
    }

    /**
     * Sleep helper.
     */
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Reset queue (for testing).
     */
    function _resetQueue() {
        queue = [];
        paused = false;
        lastRequestTime = 0;
        completedCount = 0;
    }

    return {
        addToQueue,
        getQueue,
        scanForMissingTags,
        fetchTags,
        processNext,
        getProgress,
        pause,
        resume,
        isPaused,
        loadQueue,
        saveQueue,
        _resetQueue
    };
}));
