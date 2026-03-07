/**
 * Insight Compressor
 * 
 * Compresses raw insights into atomic patterns using the active user-selected model.
 * Merges similar insights and increases frequency counts.
 */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        // Node.js (for testing)
        module.exports = factory();
    } else {
        // Browser
        root.InsightCompressor = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    // Import dependencies
    let LLMGateway, InsightsStore;

    if (typeof require !== 'undefined') {
        LLMGateway = require('./llm_gateway');
        InsightsStore = require('./insights_store');
    } else if (typeof self !== 'undefined') {
        LLMGateway = self.LLMGateway;
        InsightsStore = self.InsightsStore;
    }

    /**
     * Build the compression prompt for model-based compression.
     */
    function buildCompressionPrompt(insights) {
        if (!insights || insights.length === 0) {
            return `No insights to compress.`;
        }

        const insightList = insights.map((i, idx) =>
            `${idx}. "${i.content}" (skills: ${i.skillIds?.join(', ') || 'none'}, seen ${i.frequency || 1}x)`
        ).join('\n');

        return `You are a pattern recognition expert for coding skill analysis.

Given these raw insights from recent practice sessions:
---
${insightList}
---

Your task:
1. Identify ATOMIC patterns (short, reusable observations)
2. Merge similar insights (e.g., "forgot empty check" + "didn't handle empty array" → one pattern)
3. Preserve the most actionable version

Respond with JSON ONLY (no markdown):
{
  "atomicInsights": [
    {
      "content": "Short, actionable pattern (max 15 words)",
      "skillIds": ["skill_id_1", "skill_id_2"],
      "mergedFrom": [indices of raw insights merged],
      "frequency": sum of merged frequencies
    }
  ],
  "droppedIndices": [indices of insights that are noise/irrelevant]
}

Rules:
- Each atomic insight ≤ 15 words
- Merge if >70% semantic similarity
- Preserve skill associations from merged insights
- Drop vague insights like "needs more practice"
- mergedFrom uses 0-indexed positions from the list above`;
    }

    /**
     * Calculate simple text similarity (Jaccard-like).
     * Used as fallback when model-based compression is unavailable.
     */
    function calculateSimilarity(text1, text2) {
        if (!text1 || !text2) return 0;

        // Normalize
        const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
        const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 2));

        if (words1.size === 0 && words2.size === 0) return 1;
        if (words1.size === 0 || words2.size === 0) return 0;

        // Jaccard similarity
        const intersection = new Set([...words1].filter(w => words2.has(w)));
        const union = new Set([...words1, ...words2]);

        return intersection.size / union.size;
    }

    /**
     * Compress raw insights using the active model.
     */
    async function compressInsights(rawInsights) {
        if (!rawInsights || rawInsights.length === 0) {
            return { atomicInsights: [], droppedIndices: [] };
        }

        const prompt = buildCompressionPrompt(rawInsights);

        try {
            if (!LLMGateway || typeof LLMGateway.analyzeSubmissions !== 'function') {
                console.warn('[InsightCompressor] LLM gateway unavailable, using local fallback.');
                return localCompress(rawInsights);
            }

            const response = await LLMGateway.analyzeSubmissions(prompt, {
                temperature: 0.6,
                maxRetries: 3,
                responseMimeType: 'application/json'
            });

            if (response.error) {
                console.error('[InsightCompressor] Model error, using local fallback:', response.error);
                return localCompress(rawInsights);
            }

            // Parse response
            if (response.atomicInsights) {
                return {
                    atomicInsights: response.atomicInsights,
                    droppedIndices: response.droppedIndices || []
                };
            }

            // Fallback if unexpected response format
            return localCompress(rawInsights);
        } catch (e) {
            console.error('[InsightCompressor] Error:', e);
            return localCompress(rawInsights);
        }
    }

    /**
     * Local fallback compression (no model call).
     * Uses simple similarity scoring to merge insights.
     */
    function localCompress(insights) {
        const SIMILARITY_THRESHOLD = 0.5;
        const merged = [];
        const used = new Set();

        for (let i = 0; i < insights.length; i++) {
            if (used.has(i)) continue;

            const group = [i];
            let combinedSkills = new Set(insights[i].skillIds || []);
            let totalFrequency = insights[i].frequency || 1;

            for (let j = i + 1; j < insights.length; j++) {
                if (used.has(j)) continue;

                const similarity = calculateSimilarity(
                    insights[i].content,
                    insights[j].content
                );

                if (similarity >= SIMILARITY_THRESHOLD) {
                    group.push(j);
                    used.add(j);
                    totalFrequency += insights[j].frequency || 1;
                    (insights[j].skillIds || []).forEach(s => combinedSkills.add(s));
                }
            }

            used.add(i);
            merged.push({
                content: insights[i].content, // Use first as representative
                skillIds: Array.from(combinedSkills),
                mergedFrom: group,
                frequency: totalFrequency
            });
        }

        return { atomicInsights: merged, droppedIndices: [] };
    }

    /**
     * Apply compression to the insights store.
     * Reads all insights, compresses, and updates store.
     */
    async function applyCompression() {
        const store = new InsightsStore.InsightsStore();
        await store.init();

        const allInsights = await store.getAll();
        if (allInsights.length === 0) {
            console.log('[InsightCompressor] No insights to compress.');
            return { compressed: 0 };
        }

        console.log(`[InsightCompressor] Compressing ${allInsights.length} insights...`);

        const result = await compressInsights(allInsights);

        // Delete merged insights and add compressed ones
        for (const atomic of result.atomicInsights) {
            // If merged from multiple, delete originals and add new
            if (atomic.mergedFrom && atomic.mergedFrom.length > 1) {
                for (const idx of atomic.mergedFrom) {
                    if (allInsights[idx]) {
                        await store.delete(allInsights[idx].id);
                    }
                }
                // Add compressed insight
                await store.add(InsightsStore.createInsight({
                    content: atomic.content,
                    skillIds: atomic.skillIds,
                    source: 'compression'
                }));
            }
        }

        // Delete dropped insights
        for (const idx of result.droppedIndices || []) {
            if (allInsights[idx]) {
                await store.delete(allInsights[idx].id);
            }
        }

        console.log(`[InsightCompressor] Compression complete. ${result.atomicInsights.length} atomic patterns.`);
        return {
            compressed: result.atomicInsights.length,
            dropped: result.droppedIndices?.length || 0
        };
    }

    return {
        compressInsights,
        buildCompressionPrompt,
        calculateSimilarity,
        applyCompression,
        localCompress
    };
}));
