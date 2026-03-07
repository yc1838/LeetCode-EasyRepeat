/**
 * Day Log Harvester
 * 
 * Reads today's submissions from IndexedDB and formats them
 * for Gemini analysis during the nightly digest.
 */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        // Node.js (for testing)
        module.exports = factory();
    } else {
        // Browser
        root.DayLogHarvester = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    /**
     * Get today's session ID (matches shadow_logger format).
     */
    function getTodaySessionId() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `day-${year}-${month}-${day}`;
    }

    /**
     * Harvest all submissions from today.
     * Reads directly from IndexedDB via ShadowLogger.
     */
    async function harvestToday() {
        try {
            // Import ShadowLogger for database access
            let ShadowLogger;
            if (typeof window !== 'undefined' && window.ShadowLogger) {
                ShadowLogger = window.ShadowLogger;
            } else if (typeof require !== 'undefined') {
                const mod = require('../content/shadow_logger');
                ShadowLogger = mod.ShadowLogger;
            }

            if (!ShadowLogger) {
                console.warn('[DayLogHarvester] ShadowLogger not available');
                return [];
            }

            const logger = new ShadowLogger();
            await logger.init();

            const submissions = await logger.getToday();
            return submissions || [];
        } catch (e) {
            console.error('[DayLogHarvester] Failed to harvest:', e);
            return [];
        }
    }

    /**
     * Format submissions into a structured prompt for Gemini.
     */
    function formatForGemini(submissions) {
        if (!submissions || submissions.length === 0) {
            return `Today's Practice Summary:
No submissions recorded. The user did not practice today.

Recommendation: Encourage the user to maintain their streak.`;
        }

        // Group submissions by problem
        const byProblem = {};
        for (const sub of submissions) {
            const slug = sub.problemSlug || 'unknown';
            if (!byProblem[slug]) {
                byProblem[slug] = {
                    title: sub.problemTitle || slug,
                    difficulty: sub.difficulty || 'Unknown',
                    topics: sub.topics || [],
                    attempts: []
                };
            }
            byProblem[slug].attempts.push({
                result: sub.result,
                code: sub.code,
                errorDetails: sub.errorDetails,
                timestamp: sub.timestamp
            });
        }

        // Build prompt
        let prompt = `Today's Practice Summary (${submissions.length} submission${submissions.length > 1 ? 's' : ''}):

`;

        for (const [slug, data] of Object.entries(byProblem)) {
            const attemptCount = data.attempts.length;
            const finalResult = data.attempts[data.attempts.length - 1].result;
            const failed = data.attempts.filter(a => a.result !== 'Accepted');

            prompt += `## ${data.title} (${data.difficulty})
Topics: ${data.topics.length > 0 ? data.topics.join(', ') : 'Unknown'}
Attempts: ${attemptCount} attempt${attemptCount > 1 ? 's' : ''} → Final: ${finalResult}
`;

            // Show failures for analysis
            if (failed.length > 0) {
                prompt += `\n### Failed Attempts:\n`;
                for (let i = 0; i < failed.length; i++) {
                    const f = failed[i];
                    prompt += `Attempt ${i + 1}: ${f.result}
`;
                    if (f.errorDetails) {
                        if (f.errorDetails.type) prompt += `  Error Type: ${f.errorDetails.type}\n`;
                        if (f.errorDetails.testInput) prompt += `  Input: ${f.errorDetails.testInput}\n`;
                        if (f.errorDetails.expected) prompt += `  Expected: ${f.errorDetails.expected}\n`;
                        if (f.errorDetails.actual) prompt += `  Actual: ${f.errorDetails.actual}\n`;
                        if (f.errorDetails.runtimeError) prompt += `  Runtime Error: ${f.errorDetails.runtimeError}\n`;
                    }
                    if (f.code) {
                        // Truncate code for prompt size
                        const codePreview = f.code.substring(0, 500);
                        prompt += `  Code:\n\`\`\`\n${codePreview}${f.code.length > 500 ? '\n...(truncated)' : ''}\n\`\`\`\n`;
                    }
                }
            }

            prompt += '\n---\n\n';
        }

        prompt += `
Based on the above, analyze:
1. What skill gaps or patterns of mistakes do you see?
2. Which skills from the taxonomy should be updated (scored down for mistakes, up for successes)?
3. What specific concepts should the user drill on?

Return your analysis as JSON with this schema:
{
  "skillUpdates": [{ "skillId": "string", "delta": number, "reason": "string" }],
  "insights": ["string"],
  "recommendedDrills": [{ "skillId": "string", "type": "fill-in-blank|spot-bug|critique" }]
}`;

        return prompt;
    }

    /**
     * Extract skill signals from submissions for quick processing.
     * This is a local analysis before sending to Gemini.
     */
    function extractSkillSignals(submissions) {
        const failures = [];
        const successes = [];

        for (const sub of submissions) {
            const signal = {
                problemSlug: sub.problemSlug,
                topics: sub.topics || [],
                result: sub.result,
                errorType: sub.errorDetails?.type
            };

            if (sub.result === 'Accepted') {
                successes.push(signal);
            } else {
                failures.push(signal);
            }
        }

        return { failures, successes };
    }

    /**
     * Get summary statistics for today's practice.
     */
    function getSummaryStats(submissions) {
        const uniqueProblems = new Set(submissions.map(s => s.problemSlug));
        const accepted = submissions.filter(s => s.result === 'Accepted').length;
        const failed = submissions.length - accepted;

        return {
            totalSubmissions: submissions.length,
            uniqueProblems: uniqueProblems.size,
            accepted,
            failed,
            successRate: submissions.length > 0
                ? ((accepted / submissions.length) * 100).toFixed(1) + '%'
                : '0%'
        };
    }

    return {
        harvestToday,
        formatForGemini,
        extractSkillSignals,
        getSummaryStats,
        getTodaySessionId
    };
}));
