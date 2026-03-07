/**
 * Digest Orchestrator
 * 
 * Coordinates the nightly digest pipeline:
 * 1. Check if already run today
 * 2. Harvest today's submissions
 * 3. Send to active user-selected model for analysis
 * 4. Apply skill updates to Skill DNA
 * 5. Mark as completed
 */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        // Node.js (for testing)
        module.exports = factory();
    } else {
        // Browser
        root.DigestOrchestrator = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    // Import dependencies (handle both browser and Node.js)
    let DayLogHarvester, LLMGateway, SkillMatrix;

    if (typeof require !== 'undefined') {
        DayLogHarvester = require('./day_log_harvester');
        LLMGateway = require('./llm_gateway');
        SkillMatrix = require('./skill_matrix').SkillMatrix;
    } else {
        const browserRoot = typeof self !== 'undefined'
            ? self
            : (typeof window !== 'undefined' ? window : globalThis);

        DayLogHarvester = browserRoot.DayLogHarvester;
        LLMGateway = browserRoot.LLMGateway;
        SkillMatrix = browserRoot.SkillMatrix?.SkillMatrix;
    }

    function buildAnalysisPrompt(formattedSubmissions) {
        return `You are a coding skill analyst for a LeetCode practice extension.

${formattedSubmissions}

Skill Taxonomy Reference (use these skill IDs):
- binary_search_basic, binary_search_bounds, search_rotated
- two_pointer_opposite, two_pointer_same, fast_slow
- sliding_fixed, sliding_variable
- bfs, dfs, dijkstra, topological_sort, union_find
- dp_1d, dp_2d, dp_knapsack, dp_memoization
- off_by_one, edge_empty, edge_boundary, null_check
- (and more from the full taxonomy)

Respond ONLY with valid JSON matching this schema:
{
  "skillUpdates": [
    { "skillId": "string (from taxonomy)", "delta": number (-15 to +10), "reason": "brief explanation" }
  ],
  "insights": ["array of 1-3 key observations about the user's mistakes"],
  "recommendedDrills": [
    { "skillId": "string", "type": "fill-in-blank|spot-bug|critique" }
  ]
}

Rules:
- delta should be negative for mistakes (-5 to -15), positive for successes (+3 to +10)
- Focus on the ROOT CAUSE of mistakes, not just symptoms
- Recommend 1-3 drills max, targeting the weakest identified skills`;
    }

    /**
     * Check if digest has already run today.
     */
    async function hasRunToday() {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session) {
            const result = await chrome.storage.session.get('digestRanToday');
            const today = new Date().toISOString().split('T')[0];
            return result.digestRanToday === today;
        }
        return false;
    }

    /**
     * Mark digest as having run today.
     */
    async function markAsRunToday() {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session) {
            const today = new Date().toISOString().split('T')[0];
            await chrome.storage.session.set({ digestRanToday: today });
        }
    }

    /**
     * Apply skill updates from Gemini analysis to Skill DNA.
     */
    async function applySkillUpdates(updates) {
        const matrix = new SkillMatrix();
        await matrix.init();

        let applied = 0;
        let skipped = 0;

        for (const update of updates) {
            const skill = matrix.dna.skills[update.skillId];
            if (!skill) {
                console.warn(`[DigestOrchestrator] Unknown skill: ${update.skillId}`);
                skipped++;
                continue;
            }

            // Apply delta
            if (update.delta > 0) {
                // Positive delta = success
                for (let i = 0; i < Math.abs(update.delta) / 3; i++) {
                    await matrix.recordCorrect(update.skillId);
                }
            } else {
                // Negative delta = mistake
                for (let i = 0; i < Math.abs(update.delta) / 4; i++) {
                    await matrix.recordMistake(update.skillId);
                }
            }
            applied++;
        }

        // Take daily snapshot
        await matrix.takeSnapshot();

        return { applied, skipped };
    }

    /**
     * Generate a human-readable summary of the digest.
     */
    function generateDailySummary(result) {
        if (!result.success) {
            return `Digest failed: ${result.error}`;
        }

        let summary = `📊 Daily Digest Complete\n`;
        summary += `• Processed ${result.submissionsProcessed} submissions\n`;
        summary += `• Updated ${result.skillsUpdated} skills\n`;

        if (result.insights && result.insights.length > 0) {
            summary += `\n💡 Insights:\n`;
            for (const insight of result.insights) {
                summary += `  - ${insight}\n`;
            }
        }

        if (result.recommendedDrills && result.recommendedDrills.length > 0) {
            summary += `\n🎯 Recommended Drills:\n`;
            for (const drill of result.recommendedDrills) {
                summary += `  - ${drill.skillId} (${drill.type})\n`;
            }
        }

        return summary;
    }

    /**
     * Run the complete nightly digest pipeline.
     */
    async function runNightlyDigest() {
        console.log('[DigestOrchestrator] Starting nightly digest...');

        // Step 1: Check if already run
        if (await hasRunToday()) {
            console.log('[DigestOrchestrator] Digest already ran today, skipping.');
            return { skipped: true, reason: 'Digest already ran today' };
        }

        // Step 2: Harvest today's submissions
        const submissions = await DayLogHarvester.harvestToday();

        if (!submissions || submissions.length === 0) {
            console.log('[DigestOrchestrator] No submissions today, skipping.');
            await markAsRunToday(); // Still mark as run to avoid repeated checks
            return { skipped: true, reason: 'No submissions today' };
        }

        console.log(`[DigestOrchestrator] Harvested ${submissions.length} submissions.`);

        if (!LLMGateway || typeof LLMGateway.analyzeSubmissions !== 'function') {
            return { success: false, error: 'LLM gateway unavailable in digest orchestrator' };
        }

        // Step 3: Format for model analysis
        const prompt = DayLogHarvester.formatForGemini(submissions);

        // Step 4: Analyze with active provider/model
        const analysis = await LLMGateway.analyzeSubmissions(buildAnalysisPrompt(prompt), {
            temperature: 0.6,
            maxRetries: 3,
            maxOutputTokens: 3072,
            responseMimeType: 'application/json'
        });

        if (analysis.error) {
            console.error('[DigestOrchestrator] Model analysis failed:', analysis.error);
            return { success: false, error: analysis.error };
        }

        console.log('[DigestOrchestrator] Received analysis from active model.');

        // Step 5: Apply skill updates
        const updateResult = await applySkillUpdates(analysis.skillUpdates || []);

        // Step 6: Mark as completed
        await markAsRunToday();

        const result = {
            success: true,
            submissionsProcessed: submissions.length,
            skillsUpdated: updateResult.applied,
            insights: analysis.insights || [],
            recommendedDrills: analysis.recommendedDrills || [],
            timestamp: new Date().toISOString()
        };

        // Persist the result for user verification
        await chrome.storage.local.set({ lastDigestResult: result });

        console.log('[DigestOrchestrator] Digest complete:', result);
        return result;
    }

    return {
        runDigest: runNightlyDigest,
        runNightlyDigest,
        applySkillUpdates,
        generateDailySummary,
        hasRunToday,
        markAsRunToday
    };
}));
