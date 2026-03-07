
/**
 * DEBUG SCRIPT FOR LEETCODE SRS EXTENSION
 * 
 * Instructions:
 * 1. Open Chrome.
 * 2. Right-click the extension icon and select "Inspect Popup" (or just open the Extension Popup and right-click -> Inspect).
 * 3. Go to the "Console" tab.
 * 4. Copy and paste ALL the code below into the console and press Enter.
 * 
 * What this does:
 * - Fetches all your problem data from Chrome Storage.
 * - Uses the official FSRS v4.5 algorithm (embedded below) to simulate future reviews.
 * - Displays a table of the next 5 review dates for each problem.
 * - Assumes you will rate "Good" (3) for all future reviews.
 */

(function runDebugSimulation() {
    console.log("🚀 Starting Schedule Simulation...");

    // --- EMBEDDED FSRS LOGIC (from fsrs_logic.js) ---
    const w = [
        0.40255, 1.18385, 3.173, 15.69105, // S0 (1-4)
        7.19605, 0.5345, // Difficulty constants
        1.4604, 0.0046, 1.54575, 0.1192, 1.01925, // Sinc/Log logic args
        1.9395, 0.11, 0.29605, 1.27355, 0.25655, 2.9436
    ];
    const DECAY = -0.5;
    const FACTOR = Math.pow(0.9, 1 / DECAY) - 1;

    function nextInterval(stability, request_retention = 0.9) {
        const newInterval = stability / FACTOR * (Math.pow(request_retention, 1 / DECAY) - 1);
        let interval = Math.round(newInterval);
        return interval < 1 ? 1 : interval;
    }

    function constrainDifficulty(d) {
        if (d < 1) return 1;
        if (d > 10) return 10;
        return d;
    }

    function nextDifficulty(d, rating) {
        let next_d = d - w[5] * (rating - 3);
        return constrainDifficulty(next_d);
    }

    function calculateFSRS(card, rating, elapsed_days) {
        let s = card.stability || 0;
        let d = card.difficulty || 0;

        // 1. New Card logic
        if (card.state === 'New' || !card.last_review || s === 0) {
            d = w[4] - (rating - 3) * w[5];
            d = constrainDifficulty(d);
            s = w[rating - 1]; // w[0]..w[3]
            return {
                nextState: 'Review',
                newStability: s,
                newDifficulty: d,
                nextInterval: nextInterval(s)
            };
        }

        // 2. Existing Card logic
        const retrievability = Math.pow(1 + FACTOR * elapsed_days / s, DECAY);
        let next_d = nextDifficulty(d, rating);
        let next_s = s;

        if (rating === 1) {
            // Again
            next_s = w[8] * Math.pow(next_d, -w[9]) * Math.pow(s, w[10]) * Math.exp(w[11] * (1 - retrievability));
        } else {
            // Hard/Good/Easy
            let r_factor = 0;
            if (rating === 2) r_factor = w[12];
            if (rating === 3) r_factor = w[13];
            if (rating === 4) r_factor = w[14];
            next_s = s * (1 + Math.exp(r_factor) * (11 - next_d) * Math.pow(s, -w[15]) * (Math.exp(w[16] * (1 - retrievability)) - 1));
        }

        if (next_s < 0.1) next_s = 0.1;

        return {
            nextState: rating === 1 ? 'Relearning' : 'Review',
            newStability: next_s,
            newDifficulty: next_d,
            nextInterval: nextInterval(next_s)
        };
    }
    // --- END FSRS LOGIC ---


    // --- SIMULATION RUNNER ---
    chrome.storage.local.get(null, (data) => {
        if (!data || !data.problems) {
            console.error("No data found in storage.");
            return;
        }

        const problems = Object.values(data.problems);
        const report = [];

        problems.forEach(p => {
            // Only simulate if it has a slug
            if (!p.slug) return;

            // Determine Start State from Storage
            // Prefer FSRS fields, fallback to minimal defaults
            let s = p.fsrs_stability || 0;
            let d = p.fsrs_difficulty || 0;
            let state = p.fsrs_state || (p.repetition > 0 ? 'Review' : 'New');
            let lastReviewDate = p.fsrs_last_review ? new Date(p.fsrs_last_review) : (p.lastSolved ? new Date(p.lastSolved) : new Date());

            // If strictly using FSRS fields, we might need to rely on what saveSubmission stored.
            // saveSubmission stores `fsrs_last_review`.
            if (p.fsrs_last_review) {
                lastReviewDate = new Date(p.fsrs_last_review);
            }

            // Determine Next Review Date
            // We use the STORED nextReviewDate as the starting point for the first future review
            let nextReview = p.nextReviewDate ? new Date(p.nextReviewDate) : new Date();

            // If nextReview is in the past, assume we review strictly TODAY
            const today = new Date();
            if (nextReview < today) {
                nextReview = today;
            }

            const simRow = {
                Problem: p.title || p.slug,
                'Current S': s ? s.toFixed(2) : '0 (New)',
                'Current D': d ? d.toFixed(2) : '0 (New)',
                'Next Due': nextReview.toLocaleDateString(),
                'Schedule (Days)': []
            };

            // SIMULATE 5 REVIEWS (Assuming 'Good' rating)
            // 1. Sim review happens on `nextReview` date.
            // 2. We calculate interval -> new date.
            // 3. Repeat.

            let simS = s;
            let simD = d;
            let simLastReview = lastReviewDate;
            let simNextReview = nextReview; // This is the date we perform the review

            let scheduleStr = [];

            for (let i = 0; i < 5; i++) {
                // Calculate elapsed days since LAST review until THIS simulated review
                // Ensure non-negative
                let elapsed = Math.max(0, (simNextReview - simLastReview) / (1000 * 60 * 60 * 24));

                // Perform Calculation
                const card = { stability: simS, difficulty: simD, state: state, last_review: simLastReview };
                const res = calculateFSRS(card, 3, elapsed); // Rating 3 = Good

                // Update Sim State
                simS = res.newStability;
                simD = res.newDifficulty;
                state = res.nextState;
                simLastReview = simNextReview; // We reviewed it on this date

                // Calculate Next Date
                let nextDate = new Date(simNextReview);
                nextDate.setDate(nextDate.getDate() + res.nextInterval);
                simNextReview = nextDate;

                // Record the interval
                scheduleStr.push(`+${res.nextInterval}d`);
            }

            simRow['Schedule (Days)'] = scheduleStr.join(' -> ');
            report.push(simRow);
        });

        console.table(report);
        console.log("✅ Simulation Complete. Shown intervals assume 'Good' (3) rating.");
        console.log("columns: Current S = Stability, Current D = Difficulty.");
    });

})();
