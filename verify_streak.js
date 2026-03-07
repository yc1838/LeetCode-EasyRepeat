
// 1. Mock Data Setup
const today = new Date();
const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
const dayBefore = new Date(today); dayBefore.setDate(today.getDate() - 2);

// Helper to format as "YYYY-MM-DD" Local
function fmt(d) {
    return d.getFullYear() + '-' +
        (d.getMonth() + 1).toString().padStart(2, '0') + '-' +
        d.getDate().toString().padStart(2, '0');
}

// Helper to create mocked history entry
function entry(dateObj) {
    // We store ISO string usually
    return { date: dateObj.toISOString(), status: 'Reviewed' };
}

// 2. Logic Extraction (Copy-Paste of the implemented function for testing)
function getCurrentDate() {
    return new Date(); // Normal mode
}

function calculateStreak(problems) {
    const activeDates = new Set();

    problems.forEach(p => {
        if (!p.history) return;
        p.history.forEach(h => {
            const dateObj = new Date(h.date);
            const dateStr = dateObj.getFullYear() + '-' +
                (dateObj.getMonth() + 1).toString().padStart(2, '0') + '-' +
                dateObj.getDate().toString().padStart(2, '0');
            activeDates.add(dateStr);
        });
    });

    let streak = 0;
    let checkDate = getCurrentDate();

    for (let i = 0; i < 3650; i++) {
        const checkStr = checkDate.getFullYear() + '-' +
            (checkDate.getMonth() + 1).toString().padStart(2, '0') + '-' +
            checkDate.getDate().toString().padStart(2, '0');

        if (activeDates.has(checkStr)) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
        } else {
            if (i === 0) {
                checkDate.setDate(checkDate.getDate() - 1);
                continue;
            } else {
                break;
            }
        }
    }
    return streak;
}

// 3. Test Cases

// Case A: Done Yesterday (2 problems), None Today
// Expected: 1
const pA = [
    { history: [entry(yesterday), entry(yesterday)] }
];
console.log(`Case A (Yesterday only): Expected 1, Got ${calculateStreak(pA)}`);

// Case B: Done Yesterday, Done Today
// Expected: 2
const pB = [
    { history: [entry(yesterday)] },
    { history: [entry(today)] }
];
console.log(`Case B (Yesterday + Today): Expected 2, Got ${calculateStreak(pB)}`);

// Case C: Done Day Before, Skip Yesterday, Done Today
// Expected: 1 (Streak broken yesterday)
const pC = [
    { history: [entry(dayBefore), entry(today)] }
];
console.log(`Case C (DayBefore + Today, Missed Yest): Expected 1, Got ${calculateStreak(pC)}`);

// Case D: Done Day Before, Skip Yesterday, Skip Today
// Expected: 0
const pD = [
    { history: [entry(dayBefore)] }
];
console.log(`Case D (DayBefore only): Expected 0, Got ${calculateStreak(pD)}`);

// Case E: Done Yesterday, Today, DayBefore
// Expected: 3
const pE = [
    { history: [entry(today), entry(yesterday), entry(dayBefore)] }
];
console.log(`Case E (3 Days Straight): Expected 3, Got ${calculateStreak(pE)}`);
