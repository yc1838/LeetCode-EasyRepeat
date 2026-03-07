/**
 * Retention Policy
 * 
 * Manages the lifecycle of insights:
 * - Decay weights over time
 * - Prune low-weight insights
 * - Archive old insights
 */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        // Node.js (for testing)
        module.exports = factory();
    } else {
        // Browser
        root.RetentionPolicy = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    // Import dependencies
    let InsightsStore;

    if (typeof require !== 'undefined') {
        InsightsStore = require('./insights_store');
    }

    // Default configuration
    const DEFAULT_DECAY_RATE = 0.95;        // 5% decay per day
    const DEFAULT_MIN_WEIGHT = 0.1;         // Prune below this
    const DEFAULT_MAX_AGE_DAYS = 30;        // Archive after this
    const DECAY_THRESHOLD_DAYS = 1;         // Start decay after 1 day

    /**
     * Apply weight decay to old insights.
     * Uses exponential decay: weight = weight * decay_rate^days
     */
    async function applyDecay(options = {}) {
        const decayRate = options.decayRate || DEFAULT_DECAY_RATE;

        const store = new InsightsStore.InsightsStore();
        await store.init();

        const now = new Date();
        const allInsights = await store.getAll();
        let decayedCount = 0;

        for (const insight of allInsights) {
            const lastSeen = new Date(insight.lastSeenAt);
            const daysSince = Math.floor((now - lastSeen) / (1000 * 60 * 60 * 24));

            if (daysSince >= DECAY_THRESHOLD_DAYS) {
                const oldWeight = insight.weight;
                insight.weight = insight.weight * Math.pow(decayRate, daysSince);
                await store.update(insight);
                decayedCount++;
            }
        }

        console.log(`[RetentionPolicy] Decayed ${decayedCount} insights.`);
        return { decayed: decayedCount };
    }

    /**
     * Prune insights with weight below threshold.
     */
    async function pruneStaleInsights(options = {}) {
        const minWeight = options.minWeight || DEFAULT_MIN_WEIGHT;

        const store = new InsightsStore.InsightsStore();
        await store.init();

        const allInsights = await store.getAll();
        let prunedCount = 0;

        for (const insight of allInsights) {
            if (insight.weight < minWeight) {
                await store.delete(insight.id);
                prunedCount++;
            }
        }

        console.log(`[RetentionPolicy] Pruned ${prunedCount} stale insights.`);
        return { pruned: prunedCount };
    }

    /**
     * Archive insights older than max age.
     * For now, this just deletes them. Future: move to archive table.
     */
    async function archiveOldInsights(options = {}) {
        const maxAgeDays = options.maxAgeDays || DEFAULT_MAX_AGE_DAYS;

        const store = new InsightsStore.InsightsStore();
        await store.init();

        const now = new Date();
        const cutoff = now.getTime() - (maxAgeDays * 24 * 60 * 60 * 1000);

        const allInsights = await store.getAll();
        let archivedCount = 0;

        for (const insight of allInsights) {
            const lastSeen = new Date(insight.lastSeenAt).getTime();
            if (lastSeen < cutoff) {
                // Future: move to archive table instead of delete
                await store.delete(insight.id);
                archivedCount++;
            }
        }

        console.log(`[RetentionPolicy] Archived ${archivedCount} old insights.`);
        return { archived: archivedCount };
    }

    /**
     * Run the complete maintenance cycle.
     * Should be called periodically (e.g., weekly or during compression).
     */
    async function runMaintenanceCycle(options = {}) {
        console.log('[RetentionPolicy] Starting maintenance cycle...');

        // 1. Apply decay to all insights
        const decayResult = await applyDecay({
            decayRate: options.decayRate || DEFAULT_DECAY_RATE
        });

        // 2. Prune very low weight insights
        const pruneResult = await pruneStaleInsights({
            minWeight: options.minWeight || DEFAULT_MIN_WEIGHT
        });

        // 3. Archive very old insights
        const archiveResult = await archiveOldInsights({
            maxAgeDays: options.maxAgeDays || DEFAULT_MAX_AGE_DAYS
        });

        const result = {
            decayed: decayResult.decayed,
            pruned: pruneResult.pruned,
            archived: archiveResult.archived,
            timestamp: new Date().toISOString()
        };

        console.log('[RetentionPolicy] Maintenance complete:', result);
        return result;
    }

    return {
        applyDecay,
        pruneStaleInsights,
        archiveOldInsights,
        runMaintenanceCycle,
        DEFAULT_DECAY_RATE,
        DEFAULT_MIN_WEIGHT,
        DEFAULT_MAX_AGE_DAYS
    };
}));
