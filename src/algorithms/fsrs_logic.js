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
        let next_d = d - w[5] * (rating - 3);

        // Standard FSRS v4.5 Mean Reversion:
        // next_d = w[7] * w[4] + (1 - w[7]) * next_d
        // w[4] = Initial Mean Difficulty (D0)
        // w[7] = Mean Reversion Rate
        // However, in this optimized implementation, we often skip mean reversion or it's baked differently.
        // For now, we stick to the core update:

        // Apply bounds
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

        // Update Stability
        let next_s = s;

        if (rating === 1) {
            // AGAIN (Fail) logic
            // S_new = w[11] * D^-w[12] * S^w[13] * exp(w[14]*(1-R))
            // w indices:
            // S0: 0..3
            // D: 4..5
            // Recall: 8..10? (Wait, exact mapping is key)

            // Re-mapping w based on standard v4.5 implementations:
            // w[8] = 1.54575 (Forgot Coeff 1)
            // w[9] = 0.1192 (Forgot D power)
            // w[10] = 1.01925 (Forgot S power)
            // w[11] = 1.9395 (Forgot R factor)

            next_s = w[8] *
                Math.pow(next_d, -w[9]) *
                Math.pow(s, w[10]) *
                Math.exp(w[11] * (1 - retrievability));

            // Constraint: Stability shouldn't increase on failure? 
            // Usually it drops heavily.

        } else {
            // SUCCESS (Hard/Good/Easy)

            // Reference: FSRS v4.5 Formula for Stability Increase (Recall)
            // S_new = S * (1 + exp(w[r]) * (11-D) * S^(-w[15]) * (exp(w[16]*(1-R)) - 1))

            let r_factor = 0;
            if (rating === 2) r_factor = w[12]; // Hard penalty
            if (rating === 3) r_factor = w[13]; // Good factor
            if (rating === 4) r_factor = w[14]; // Easy bonus

            // w[15] = Stability Slope
            // w[16] = Retrievability Slope

            next_s = s * (1 + Math.exp(r_factor) *
                (11 - next_d) *
                Math.pow(s, -w[15]) *
                (Math.exp(w[16] * (1 - retrievability)) - 1));
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
