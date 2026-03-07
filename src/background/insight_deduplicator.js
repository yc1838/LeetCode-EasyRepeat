/**
 * Insight Deduplicator
 * 
 * Identifies and merges similar insights using text similarity.
 */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        // Node.js (for testing)
        module.exports = factory();
    } else {
        // Browser
        root.InsightDeduplicator = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    // Import dependencies
    let InsightsStore;

    if (typeof require !== 'undefined') {
        InsightsStore = require('./insights_store');
    }

    const DEFAULT_THRESHOLD = 0.6;

    /**
     * Calculate Jaccard similarity between two strings.
     * Returns a value between 0 (different) and 1 (identical).
     */
    function calculateSimilarity(text1, text2) {
        // Handle edge cases
        if (text1 === text2) return 1;
        if (!text1 && !text2) return 1;
        if (!text1 || !text2) return 0;

        // Normalize and tokenize
        const normalize = (s) => s.toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 2);

        const words1 = new Set(normalize(text1));
        const words2 = new Set(normalize(text2));

        if (words1.size === 0 && words2.size === 0) return 1;
        if (words1.size === 0 || words2.size === 0) return 0;

        // Jaccard similarity: intersection / union
        const intersection = new Set([...words1].filter(w => words2.has(w)));
        const union = new Set([...words1, ...words2]);

        return intersection.size / union.size;
    }

    /**
     * Find groups of duplicate insights above the similarity threshold.
     * Returns array of { ids: string[], representative: string }
     */
    function findDuplicates(insights, threshold = DEFAULT_THRESHOLD) {
        const duplicateGroups = [];
        const used = new Set();

        for (let i = 0; i < insights.length; i++) {
            if (used.has(insights[i].id)) continue;

            const group = [insights[i].id];

            for (let j = i + 1; j < insights.length; j++) {
                if (used.has(insights[j].id)) continue;

                const similarity = calculateSimilarity(
                    insights[i].content,
                    insights[j].content
                );

                if (similarity >= threshold) {
                    group.push(insights[j].id);
                    used.add(insights[j].id);
                }
            }

            // Only report if there are duplicates (group size > 1)
            if (group.length > 1) {
                used.add(insights[i].id);
                duplicateGroups.push({
                    ids: group,
                    representative: insights[i].content
                });
            }
        }

        return duplicateGroups;
    }

    /**
     * Merge multiple insights into a single representative insight.
     * Uses highest weight content, sums frequencies, unions skillIds.
     */
    function mergeInsights(insights) {
        if (!insights || insights.length === 0) return null;
        if (insights.length === 1) return insights[0];

        // Sort by weight descending
        const sorted = [...insights].sort((a, b) => (b.weight || 0) - (a.weight || 0));
        const representative = sorted[0];

        // Union all skillIds
        const allSkills = new Set();
        insights.forEach(i => (i.skillIds || []).forEach(s => allSkills.add(s)));

        // Sum frequencies
        const totalFrequency = insights.reduce((sum, i) => sum + (i.frequency || 1), 0);

        // Use max weight
        const maxWeight = Math.max(...insights.map(i => i.weight || 0));

        return {
            id: representative.id,
            content: representative.content,
            skillIds: Array.from(allSkills),
            frequency: totalFrequency,
            weight: maxWeight,
            createdAt: representative.createdAt,
            lastSeenAt: new Date().toISOString(),
            mergedCount: insights.length
        };
    }

    /**
     * Deduplicate insights in the store.
     */
    async function deduplicateStore(options = {}) {
        const threshold = options.threshold || DEFAULT_THRESHOLD;

        const store = new InsightsStore.InsightsStore();
        await store.init();

        const allInsights = await store.getAll();
        if (allInsights.length < 2) {
            console.log('[InsightDeduplicator] Not enough insights to deduplicate.');
            return { merged: 0, total: allInsights.length };
        }

        const duplicateGroups = findDuplicates(allInsights, threshold);
        let mergedCount = 0;

        for (const group of duplicateGroups) {
            // Get full insight objects
            const groupInsights = allInsights.filter(i => group.ids.includes(i.id));
            const merged = mergeInsights(groupInsights);

            if (merged) {
                // Delete all originals except first
                for (let i = 1; i < groupInsights.length; i++) {
                    await store.delete(groupInsights[i].id);
                }

                // Update the first one with merged values
                const first = await store.getById(groupInsights[0].id);
                if (first) {
                    first.frequency = merged.frequency;
                    first.weight = merged.weight;
                    first.skillIds = merged.skillIds;
                    first.lastSeenAt = merged.lastSeenAt;
                    await store.update(first);
                }

                mergedCount++;
            }
        }

        console.log(`[InsightDeduplicator] Merged ${mergedCount} duplicate groups.`);
        return {
            merged: mergedCount,
            total: (await store.getAll()).length
        };
    }

    return {
        calculateSimilarity,
        findDuplicates,
        mergeInsights,
        deduplicateStore,
        DEFAULT_THRESHOLD
    };
}));
