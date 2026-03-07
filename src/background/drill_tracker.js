/**
 * Drill Tracker
 * 
 * Tracks drill attempts, calculates skill impact, and maintains history.
 */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.DrillTracker = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    let DrillStore;

    if (typeof require !== 'undefined') {
        DrillStore = require('./drill_store');
    } else if (typeof window !== 'undefined' && window.DrillStore) {
        DrillStore = window.DrillStore;
    }

    // Difficulty weights
    const DIFFICULTY_WEIGHTS = {
        easy: 1,
        medium: 2,
        hard: 3
    };

    /**
     * Record a drill attempt.
     */
    async function recordAttempt(drillId, result) {
        const store = new DrillStore.DrillStore();
        await store.init();

        const drill = await store.getById(drillId);
        if (!drill) {
            console.error('[DrillTracker] Drill not found:', drillId);
            return null;
        }

        drill.attempts = (drill.attempts || 0) + 1;
        drill.correct = result.correct;
        drill.status = 'completed';
        drill.completedAt = new Date().toISOString();
        drill.userAnswer = result.userAnswer;
        drill.timeTaken = result.timeTaken;

        await store.update(drill);

        console.log(`[DrillTracker] Recorded attempt for ${drillId}: ${result.correct ? 'correct' : 'wrong'}`);
        return drill;
    }

    /**
     * Calculate skill impact based on drill result.
     */
    function calculateSkillImpact(result) {
        const difficultyWeight = DIFFICULTY_WEIGHTS[result.difficulty] || 2;
        const attemptPenalty = Math.max(0, 1 - (result.attempts - 1) * 0.2);

        let confidenceChange;

        if (result.correct) {
            // Correct: boost confidence based on difficulty
            confidenceChange = 0.05 * difficultyWeight * attemptPenalty;
        } else {
            // Incorrect: reduce confidence
            confidenceChange = -0.03 * difficultyWeight;
        }

        return {
            confidenceChange,
            difficultyWeight,
            attemptPenalty
        };
    }

    /**
     * Get drill history for past N days.
     */
    async function getDrillHistory(days = 7) {
        const store = new DrillStore.DrillStore();
        await store.init();

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);

        const all = await store.getAll();
        return all.filter(d =>
            d.status === 'completed' &&
            d.completedAt &&
            new Date(d.completedAt) >= cutoff
        );
    }

    /**
     * Get stats from drill history.
     */
    async function getHistoryStats(days = 7) {
        const history = await getDrillHistory(days);

        const correctCount = history.filter(d => d.correct === true).length;

        return {
            totalAttempts: history.length,
            correctCount,
            accuracy: history.length > 0
                ? ((correctCount / history.length) * 100).toFixed(1) + '%'
                : '0%'
        };
    }

    /**
     * Get drill stats for a specific skill.
     */
    async function getSkillDrillStats(skillId) {
        const store = new DrillStore.DrillStore();
        await store.init();

        const drills = await store.getBySkillId(skillId);
        const completed = drills.filter(d => d.status === 'completed');
        const correct = completed.filter(d => d.correct === true);

        return {
            total: completed.length,
            correct: correct.length,
            accuracy: completed.length > 0
                ? ((correct.length / completed.length) * 100).toFixed(1) + '%'
                : '0%'
        };
    }

    return {
        recordAttempt,
        calculateSkillImpact,
        getDrillHistory,
        getHistoryStats,
        getSkillDrillStats,
        DIFFICULTY_WEIGHTS
    };
}));
