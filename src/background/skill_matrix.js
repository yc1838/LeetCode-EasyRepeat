/**
 * Skill Matrix
 *
 * Manages the Skill DNA - a persistent profile of the user's coding abilities.
 * Includes confidence scoring, decay over time, and trend calculation.
 */

console.log('[SkillMatrix] Module file executing...');

// ============================================================================
// ⚠️ CRITICAL: DO NOT MODIFY THIS UMD WRAPPER PATTERN ⚠️
// ============================================================================
// This UMD wrapper has been fixed multiple times to work with Vite's ES module
// bundling. The pattern MUST:
// 1. ALWAYS attach to `self` in browser contexts (not just when module.exports is undefined)
// 2. Support both ES modules (Vite bundling) AND CommonJS (Jest tests)
// 3. Execute factory() once and reuse the exports
//
// WHY: When Vite bundles as ES modules, the traditional UMD pattern fails because
// it checks for module.exports first, which may exist in the bundle context but
// doesn't properly attach to the global scope.
//
// BREAKING THIS WILL CAUSE:
// - "SkillMatrix not loaded" errors in backfill
// - Drill generation failures
// - Extension service worker crashes
//
// This has been fixed 3+ times. DO NOT CHANGE unless you fully understand the
// implications and test thoroughly with `npm run build` + manual extension testing.
// ============================================================================
(function (root, factory) {
    console.log('[SkillMatrix] UMD wrapper executing, root type:', typeof root, 'is self?', root === self);
    console.log('[SkillMatrix] module check:', typeof module, 'module.exports?', typeof module !== 'undefined' && module.exports);

    const exports = factory();

    // Always attach to self in browser contexts (including ES modules)
    if (typeof self !== 'undefined') {
        self.SkillMatrix = exports;
        console.log('[SkillMatrix] Attached to self.SkillMatrix');
    }

    // Also support CommonJS for tests
    if (typeof module === 'object' && module.exports) {
        console.log('[SkillMatrix] Also exporting via module.exports for Node.js');
        module.exports = exports;
    }

    console.log('[SkillMatrix] Module loaded. Verification:', {
        hasSelfSkillMatrix: typeof self !== 'undefined' && !!self.SkillMatrix,
        hasSkillMatrixClass: typeof self !== 'undefined' && !!(self.SkillMatrix && self.SkillMatrix.SkillMatrix),
        keys: typeof self !== 'undefined' && self.SkillMatrix ? Object.keys(self.SkillMatrix) : []
    });
}(typeof self !== 'undefined' ? self : this, function () {

    // --- Constants ---
    const MAX_SCORE = 100;
    const MIN_SCORE = 0;
    const BASE_SCORE = 50; // Neutral starting point
    const DECAY_FACTOR = 0.98; // Daily decay rate
    const CORRECT_POINTS = 8;
    const MISTAKE_POINTS = 12; // Mistakes hurt more than correct helps
    const DRILL_BONUS = 5;
    const TREND_THRESHOLD = 5; // Points difference to count as trend
    const HISTORY_LENGTH = 7; // Days to keep for trend calculation

    // Load taxonomy
    let taxonomy = null;
    try {
        if (typeof require !== 'undefined') {
            taxonomy = require('../data/skill_taxonomy.json');
        }
    } catch (e) {
        // Browser will load via fetch
    }

    async function ensureTaxonomyLoaded() {
        if (taxonomy) return taxonomy;
        try {
            if (typeof fetch !== 'undefined' && typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
                const url = chrome.runtime.getURL('data/skill_taxonomy.json');
                const res = await fetch(url);
                if (res.ok) {
                    taxonomy = await res.json();
                } else {
                    console.warn('[SkillMatrix] Failed to load taxonomy:', res.status);
                }
            }
        } catch (e) {
            console.warn('[SkillMatrix] Taxonomy fetch failed:', e);
        }
        return taxonomy;
    }

    /**
     * Calculate confidence score based on performance data.
     * Formula: base + (correct * 8) - (mistakes * 12) + (drills * 5)
     * Capped between 0-100.
     */
    function calculateConfidence({ correct = 0, mistakes = 0, drillsCompleted = 0 }) {
        const score = BASE_SCORE
            + (correct * CORRECT_POINTS)
            - (mistakes * MISTAKE_POINTS)
            + (drillsCompleted * DRILL_BONUS);

        return Math.max(MIN_SCORE, Math.min(MAX_SCORE, score));
    }

    /**
     * Apply time-based decay to a score.
     * Scores decay toward BASE_SCORE (50) over time, not toward 0.
     * This means forgotten skills return to "unknown" state, not "bad".
     */
    function applyDecay(score, daysSinceLastSeen) {
        if (daysSinceLastSeen <= 0) return score;

        // Calculate how much the score differs from base
        const deviation = score - BASE_SCORE;

        // Apply exponential decay to the deviation
        const decayedDeviation = deviation * Math.pow(DECAY_FACTOR, daysSinceLastSeen);

        // Return score that's closer to base
        const result = BASE_SCORE + decayedDeviation;
        return Math.max(MIN_SCORE, Math.min(MAX_SCORE, Math.round(result)));
    }

    /**
     * Calculate trend from score history.
     * Returns 'improving', 'declining', or 'stable'.
     */
    function getTrend(history) {
        if (!history || history.length < 2) return 'unknown';

        const recent = history.slice(-3);
        const older = history.slice(0, 3);

        if (recent.length === 0 || older.length === 0) return 'unknown';

        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

        const diff = recentAvg - olderAvg;

        if (diff > TREND_THRESHOLD) return 'improving';
        if (diff < -TREND_THRESHOLD) return 'declining';
        return 'stable';
    }

    /**
     * Create a new Skill DNA from the taxonomy.
     */
    function createSkillDNA() {
        const skills = {};

        const taxData = taxonomy || { families: [] };

        for (const family of taxData.families) {
            for (const skill of family.skills) {
                skills[skill.id] = {
                    id: skill.id,
                    name: skill.name,
                    family: family.id,
                    weight: skill.weight,
                    score: BASE_SCORE,
                    correct: 0,
                    mistakes: 0,
                    drillsCompleted: 0,
                    lastSeen: null,
                    history: [],
                    trend: 'unknown'
                };
            }
        }

        return {
            version: '1.0.0',
            skills,
            lastUpdated: new Date().toISOString(),
            totalSubmissions: 0,
            dailySnapshots: []
        };
    }

    /**
     * Check if digest has already run today (prevents double-runs on Chrome restart).
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
     * SkillMatrix Class - Main interface for skill tracking.
     */
    class SkillMatrix {
        constructor() {
            this.dna = null;
            this.initialized = false;
        }

        /**
         * Initialize from storage or create new.
         */
        async init() {
            if (this.initialized) return;

            try {
                if (typeof chrome !== 'undefined' && chrome.storage) {
                    await ensureTaxonomyLoaded();
                    const result = await chrome.storage.local.get('skillDNA');
                    if (result.skillDNA) {
                        this.dna = result.skillDNA;
                        const hasSkills = this.dna.skills && Object.keys(this.dna.skills).length > 0;
                        if (!hasSkills) {
                            this.dna = createSkillDNA();
                            await this.save();
                            console.warn('[SkillMatrix] Existing Skill DNA was empty. Rebuilt from taxonomy.');
                        } else {
                            console.log('[SkillMatrix] Loaded existing Skill DNA.');
                        }
                    } else {
                        this.dna = createSkillDNA();
                        await this.save();
                        console.log('[SkillMatrix] Created new Skill DNA.');
                    }
                } else {
                    await ensureTaxonomyLoaded();
                    // Testing environment
                    this.dna = createSkillDNA();
                }
                this.initialized = true;
            } catch (e) {
                console.error('[SkillMatrix] Init failed:', e);
                await ensureTaxonomyLoaded();
                this.dna = createSkillDNA();
                this.initialized = true;
            }
        }

        /**
         * Save DNA to storage.
         */
        async save() {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                this.dna.lastUpdated = new Date().toISOString();
                await chrome.storage.local.set({ skillDNA: this.dna });
            }
        }

        /**
         * Record a mistake for a skill.
         */
        async recordMistake(skillId) {
            if (!this.dna.skills[skillId]) {
                console.warn(`[SkillMatrix] Unknown skill: ${skillId}`);
                return;
            }

            const skill = this.dna.skills[skillId];
            skill.mistakes++;
            skill.lastSeen = new Date().toISOString();
            skill.score = calculateConfidence({
                correct: skill.correct,
                mistakes: skill.mistakes,
                drillsCompleted: skill.drillsCompleted
            });

            this.dna.totalSubmissions++;
            await this.save();
        }

        /**
         * Record a correct usage of a skill.
         */
        async recordCorrect(skillId) {
            if (!this.dna.skills[skillId]) {
                console.warn(`[SkillMatrix] Unknown skill: ${skillId}`);
                return;
            }

            const skill = this.dna.skills[skillId];
            skill.correct++;
            skill.lastSeen = new Date().toISOString();
            skill.score = calculateConfidence({
                correct: skill.correct,
                mistakes: skill.mistakes,
                drillsCompleted: skill.drillsCompleted
            });

            this.dna.totalSubmissions++;
            await this.save();
        }

        /**
         * Record a completed drill.
         */
        async recordDrillComplete(skillId) {
            if (!this.dna.skills[skillId]) return;

            const skill = this.dna.skills[skillId];
            skill.drillsCompleted++;
            skill.score = calculateConfidence({
                correct: skill.correct,
                mistakes: skill.mistakes,
                drillsCompleted: skill.drillsCompleted
            });

            await this.save();
        }

        /**
         * Get the N weakest skills (for drill targeting).
         */
        getWeakestSkills(n = 5) {
            const skills = Object.values(this.dna.skills);
            return skills
                .filter(s => s.mistakes > 0 || s.correct > 0) // Only seen skills
                .sort((a, b) => a.score - b.score)
                .slice(0, n);
        }

        /**
         * Get skills by family.
         */
        getSkillsByFamily(familyId) {
            return Object.values(this.dna.skills).filter(s => s.family === familyId);
        }

        /**
         * Apply daily decay to all skills.
         */
        async applyDailyDecay() {
            const today = new Date();

            for (const skill of Object.values(this.dna.skills)) {
                if (skill.lastSeen) {
                    const lastSeen = new Date(skill.lastSeen);
                    const daysSince = Math.floor((today - lastSeen) / (1000 * 60 * 60 * 24));
                    skill.score = applyDecay(skill.score, daysSince);
                }

                // Update history for trend
                skill.history.push(skill.score);
                if (skill.history.length > HISTORY_LENGTH) {
                    skill.history.shift();
                }
                skill.trend = getTrend(skill.history);
            }

            await this.save();
        }

        /**
         * Take a daily snapshot for trend visualization.
         */
        async takeSnapshot() {
            const snapshot = {
                date: new Date().toISOString().split('T')[0],
                averageScore: this.getAverageScore(),
                weakestSkills: this.getWeakestSkills(3).map(s => s.id)
            };

            this.dna.dailySnapshots.push(snapshot);

            // Keep only last 30 days
            if (this.dna.dailySnapshots.length > 30) {
                this.dna.dailySnapshots.shift();
            }

            await this.save();
        }

        /**
         * Get average score across all active skills.
         */
        getAverageScore() {
            const activeSkills = Object.values(this.dna.skills).filter(s => s.lastSeen);
            if (activeSkills.length === 0) return BASE_SCORE;

            const sum = activeSkills.reduce((acc, s) => acc + s.score, 0);
            return Math.round(sum / activeSkills.length);
        }

        /**
         * Get summary for UI display.
         */
        getSummary() {
            const skills = Object.values(this.dna.skills);
            const active = skills.filter(s => s.lastSeen);
            const declining = skills.filter(s => s.trend === 'declining');

            return {
                totalSkills: skills.length,
                activeSkills: active.length,
                averageScore: this.getAverageScore(),
                decliningCount: declining.length,
                weakestSkills: this.getWeakestSkills(5),
                lastUpdated: this.dna.lastUpdated
            };
        }

        // --- Layer 2: Error Pattern Methods ---

        /**
         * Record a mistake for an error pattern (Layer 2).
         */
        async recordPatternMistake(patternId) {
            // Ensure patterns object exists
            if (!this.dna.patterns) {
                this.dna.patterns = {};
            }

            const skillId = 'pattern:' + patternId;

            // Create pattern skill if first time
            if (!this.dna.patterns[skillId]) {
                this.dna.patterns[skillId] = {
                    id: skillId,
                    patternId: patternId,
                    score: BASE_SCORE,
                    mistakes: 0,
                    correct: 0,
                    drillsCompleted: 0,
                    lastSeen: null,
                    active: false
                };
            }

            const pattern = this.dna.patterns[skillId];
            pattern.mistakes++;
            pattern.lastSeen = new Date().toISOString();
            pattern.score = calculateConfidence({
                correct: pattern.correct,
                mistakes: pattern.mistakes,
                drillsCompleted: pattern.drillsCompleted
            });

            // Check activation threshold
            if (pattern.mistakes >= 3) {
                pattern.active = true;
            }

            // Also record in ErrorPatternDetector for cross-module tracking
            if (typeof ErrorPatternDetector !== 'undefined') {
                await ErrorPatternDetector.recordPattern(patternId);
            }

            await this.save();
        }

        /**
         * Get the N weakest error patterns.
         */
        getWeakestPatterns(n = 5) {
            if (!this.dna.patterns) return [];

            return Object.values(this.dna.patterns)
                .filter(p => p.mistakes > 0)
                .sort((a, b) => a.score - b.score)
                .slice(0, n);
        }

        /**
         * Get summary of error patterns (Layer 2).
         */
        getPatternSummary() {
            if (!this.dna.patterns) {
                return { patterns: {}, activeCount: 0, totalMistakes: 0 };
            }

            const patterns = this.dna.patterns;
            const activeCount = Object.values(patterns).filter(p => p.active).length;
            const totalMistakes = Object.values(patterns).reduce((sum, p) => sum + p.mistakes, 0);

            return {
                patterns,
                activeCount,
                totalMistakes
            };
        }

        /**
         * Get combined summary of Layer 1 (LeetCode tags) and Layer 2 (error patterns).
         */
        getCombinedSummary() {
            return {
                layer1: this.getSummary(),
                layer2: this.getPatternSummary()
            };
        }
    }

    const exports = {
        SkillMatrix,
        calculateConfidence,
        applyDecay,
        getTrend,
        createSkillDNA,
        hasRunToday,
        markAsRunToday,
        DECAY_FACTOR,
        MAX_SCORE,
        MIN_SCORE,
        BASE_SCORE
    };

    return exports;
}));
