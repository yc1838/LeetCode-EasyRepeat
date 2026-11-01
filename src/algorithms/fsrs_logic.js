(function (root, factory) {
    var exported = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = exported;
    } else {
        root.fsrs = exported;
    }
    // Also set on window for bundled contexts
    if (typeof window !== 'undefined') {
        window.fsrs = exported;
    }
}(typeof self !== 'undefined' ? self : this, function () {

    // Standard FSRS v4.5 Weights (optimized on large datasets)
    const w = [
        0.40255, 1.18385, 3.173, 15.69105, // S0 (1-4) (Initial Stability)
        7.19605, 0.5345, // Difficulty constants
        1.4604, 0.0046, 1.54575, 0.1192, 1.01925, // Sinc/Log logic args
        1.9395, 0.11, 0.29605, 1.27355, 0.25655, 2.9436
    ];

    const DECAY = -0.5;
    // Factor for 90% retention (0.9 ^ (1/DECAY) - 1)
    const FACTOR = Math.pow(0.9, 1 / DECAY) - 1;

    /**
     * Calculate Retrievability at time t (days) for stability S
     */
    function forgettingCurve(elapsed_days, stability) {
        return Math.pow(1 + FACTOR * elapsed_days / stability, DECAY);
    }

    /**
     * Calculate Interval required to reach retrievability R=0.9
     */
    function nextInterval(stability, request_retention = 0.9) {
        // I = S / FACTOR * ( R ^ (1/DECAY) - 1 )
        const newInterval = stability / FACTOR * (Math.pow(request_retention, 1 / DECAY) - 1);

        // Interval is fundamentally rounded to days
        let interval = Math.round(newInterval);
        return interval < 1 ? 1 : interval;
    }

    /**
     * Constrain Difficulty between 1 and 10
     */
    function constrainDifficulty(d) {
        if (d < 1) return 1;
        if (d > 10) return 10;
        return d;
    }

    /**
     * Mean Reversion for Difficulty
     */
    function nextDifficulty(d, rating) {
        // D_new = D - w6 * (rating - 3)
        // Note: w[5] corresponds to w6 in standard notation (0-indexed vs 1-indexed confusion in papers)
        // FSRS v4.5: D' = D - w6·(G-3), then mean reversion towards D0(Good) = w4.
        let next_d = d - w[6] * (rating - 3);
        next_d = w[7] * w[4] + (1 - w[7]) * next_d;
        return constrainDifficulty(next_d);
    }

    /**
     * Main Function
     */
    function calculateFSRS(card, rating, elapsed_days) {
        let s = card.stability || 0;
        let d = card.difficulty || 0;

        // 1. New Card logic
        if (card.state === 'New' || !card.last_review) {
            d = w[4] - (rating - 3) * w[5];
            d = constrainDifficulty(d);

            // s = w[rating-1]  (w[0]..w[3])
            s = w[rating - 1];

            return {
                nextState: 'Review',
                newStability: s,
                newDifficulty: d,
                nextInterval: nextInterval(s)
            };
        }

        // 2. Existing Card logic
        const retrievability = forgettingCurve(elapsed_days, s);

        // Update Difficulty
        let next_d = nextDifficulty(d, rating);

        // Update Stability (FSRS v4.5 formulas, using the difficulty before this review).
        // Weight layout: w0-3 initial S · w4-5 initial D · w6 D update · w7 mean reversion
        //                w8-10 recall · w11-14 forget · w15 hard penalty · w16 easy bonus
        let next_s = s;

        if (rating === 1) {
            // Forgot: S' = w11 · D^-w12 · ((S+1)^w13 - 1) · e^(w14·(1-R)), never above S.
            next_s = w[11] *
                Math.pow(d, -w[12]) *
                (Math.pow(s + 1, w[13]) - 1) *
                Math.exp(w[14] * (1 - retrievability));
            next_s = Math.min(next_s, s);
        } else {
            // Recalled: S' = S · (1 + e^w8 · (11-D) · S^-w9 · (e^(w10·(1-R)) - 1) · penalty/bonus)
            const hardPenalty = rating === 2 ? w[15] : 1;
            const easyBonus = rating === 4 ? w[16] : 1;
            next_s = s * (1 + Math.exp(w[8]) *
                (11 - d) *
                Math.pow(s, -w[9]) *
                (Math.exp(w[10] * (1 - retrievability)) - 1) *
                hardPenalty *
                easyBonus);
        }

        // Stability lower bound
        if (next_s < 0.1) next_s = 0.1;

        return {
            nextState: rating === 1 ? 'Relearning' : 'Review',
            newStability: next_s,
            newDifficulty: next_d,
            nextInterval: nextInterval(next_s)
        };
    }

    /**
     * Project/simulate future review dates for visual timeline display using FSRS.
     * 
     * @param {Object} card - The card object {stability, difficulty, state, last_review}
     * @param {string|Date} currentDate - Start date for simulation (usually today)
     * @returns {string[]} Array of date strings in "YYYY-MM-DD" format
     */
    function projectScheduleFSRS(card, currentDate) {
        const schedule = [];
        let simDate = currentDate ? new Date(currentDate) : new Date();

        // Clone card to avoid mutating original
        let simCard = {
            stability: card.stability || 0,
            difficulty: card.difficulty || 0,
            state: card.state || 'New',
            last_review: card.last_review
        };

        // Correct limit date based on initial currentDate
        const absoluteLimit = new Date(simDate);
        absoluteLimit.setDate(absoluteLimit.getDate() + 90);

        // Limit loop count to prevent infinite loops
        let safety = 0;

        while (simDate < absoluteLimit && safety < 50) {
            safety++;

            // Assume 'Good' (3) rating for future reviews
            // We assume we review roughly on schedule, so elapsed ~ ideal interval
            const idealInterval = nextInterval(simCard.stability || 0);

            // If it's a new card or 0 stability, treat as first review
            const elapsed = (simCard.stability > 0) ? idealInterval : 0;

            const res = calculateFSRS(simCard, 3, elapsed);

            simCard.stability = res.newStability;
            simCard.difficulty = res.newDifficulty;
            simCard.state = res.nextState;

            let nextDate = new Date(simDate);
            nextDate.setDate(nextDate.getDate() + res.nextInterval);

            if (nextDate > absoluteLimit) break;

            const dateStr = nextDate.getFullYear() + '-' + String(nextDate.getMonth() + 1).padStart(2, '0') + '-' + String(nextDate.getDate()).padStart(2, '0');
            schedule.push(dateStr);
            simDate = nextDate;
        }

        return schedule;
    }

    return {
        calculateFSRS,
        nextInterval,
        forgettingCurve,
        projectScheduleFSRS
    };
}));
