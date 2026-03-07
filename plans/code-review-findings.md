# Code Review Findings: Duplicates, Contradictions, and Logic Errors

## Executive Summary

After a thorough review of the LeetCode EasyRepeat extension codebase, I've identified several issues ranging from duplicate code to potential logic errors. This document categorizes and details each finding.

**Last Updated:** 2026-01-24

---

## Status Legend
- ✅ **FIXED** - Issue has been resolved
- ⚠️ **VALID** - Issue confirmed and still present
- ❌ **INVALID** - Issue was a false positive / hallucination
- 🔍 **NEEDS REVIEW** - Requires further investigation

---

## 1. Duplicate Code Issues

### 1.1 ✅ FIXED - Duplicate "LeetCode" in Extension Name

**Location:** `manifest.json`, lines 3 and 14

**Original:**
```json
{
    "name": "LeetCode LeetCode EasyRepeat",
    "default_title": "LeetCode LeetCode EasyRepeat"
}
```

**Current (Fixed):**
```json
{
    "name": "LeetCode EasyRepeat",
    "default_title": "LeetCode EasyRepeat"
}
```

---

### 1.2 ⚠️ VALID - Duplicate Property Assignment in [`storage.js`](src/shared/storage.js:91-92)

**Location:** `src/shared/storage.js`, lines 91-92

```javascript
const currentProblem = problems[problemKey] || {
    // ...
    easeFactor: 2.5,
    easeFactor: 2.5,  // DUPLICATE - Still present!
    // ...
};
```

**Impact:** Low - JavaScript will use the last value, but this is clearly a copy-paste error.

---

### 1.3 ⚠️ VALID - Duplicate Property Assignment in [`storage.js`](src/shared/storage.js:157-160)

**Location:** `src/shared/storage.js`, lines 157-160

```javascript
problems[problemKey] = {
    // ...
    fsrs_state: nextStep.fsrs_state !== undefined ? nextStep.fsrs_state : currentProblem.fsrs_state,
    fsrs_last_review: nextStep.fsrs_last_review !== undefined ? nextStep.fsrs_last_review : currentProblem.fsrs_last_review,
    fsrs_state: nextStep.fsrs_state !== undefined ? nextStep.fsrs_state : currentProblem.fsrs_state,        // DUPLICATE!
    fsrs_last_review: nextStep.fsrs_last_review !== undefined ? nextStep.fsrs_last_review : currentProblem.fsrs_last_review,  // DUPLICATE!
    // ...
};
```

**Impact:** Low - Same as above, but indicates sloppy code maintenance.

---

### 1.4 ⚠️ VALID - Duplicate Comment Block in [`content.js`](src/content/content.js:177-180)

**Location:** `src/content/content.js`, lines 177-180

```javascript
/* --- Notes Feature Injection --- */
// Run periodically to handle navigation (mounting/unmounting of React components)
/* --- Notes Feature Injection --- */
// Run periodically to handle navigation (mounting/unmounting of React components)
```

**Impact:** None - Just messy code.

---

## 2. Self-Contradictions

### 2.1 ⚠️ VALID - FSRS Weight Index Confusion in [`fsrs_logic.js`](src/algorithms/fsrs_logic.js:52-77)

**Location:** `src/algorithms/fsrs_logic.js`, lines 52-77

The comments in [`nextDifficulty()`](src/algorithms/fsrs_logic.js:52) show confusion about weight indices:

```javascript
function nextDifficulty(d, rating) {
    // D_new = D - w6 * (rating - 3)
    let next_d = d - w[5] * (rating - 3);  // Uses w[5], but comment says w6

    // Mean Reversion: D_new = w7 * D0(3) + (1-w7)*D_new
    // w[4] is D0(3) = 7.19... NO, w[4] IS NOT D0(3).  // <-- Self-contradiction in comment!
    // Actually, typically D0(3) is calculated or is w[4] directly.
```

**Impact:** Medium - The actual code appears correct (uses w[5] for difficulty delta), but the confusing comments make maintenance risky. The comments reference w6/w7 but the code uses w[5], which is correct for 0-indexed arrays.

**Verdict:** The CODE is correct, but the COMMENTS are confusing and should be cleaned up.

---

### 2.2 ⚠️ VALID - Inconsistent Rating System Between UI and Algorithm

**Location:** Multiple files

The popup UI in [`popup_ui.js`](src/popup/popup_ui.js:47-52) uses an "ease factor" based system:

```javascript
const ratingHtml = isInteractive ? `
    <div class="rating-row">
        <div class="rating-btn" data-ease="1.3">HARD</div>
        <div class="rating-btn" data-ease="2.5">MED</div>
        <div class="rating-btn" data-ease="3.5">EASY</div>
    </div>
` : '';
```

Meanwhile, [`content_ui.js`](src/content/content_ui.js:160-165) uses proper FSRS ratings:

```javascript
const ratings = [
    { label: "Again", value: 1, desc: "Forgot it" },
    { label: "Hard", value: 2, desc: "Struggled" },
    { label: "Good", value: 3, desc: "Recalled" },
    { label: "Easy", value: 4, desc: "Trivial" }
];
```

**Impact:** High - The popup UI is missing the "Again" (rating=1) option entirely! Users can only rate Hard/Med/Easy from the popup, but Again/Hard/Good/Easy from the content script modal. This is inconsistent UX and means the popup cannot trigger the "Relearning" state.

---

### 2.3 ✅ FIXED - Incorrect Parameter in [`analyzeProblemTimeline()`](src/algorithms/srs_logic.js:232)

**Location:** `src/algorithms/srs_logic.js`, line 232

**Original (Bug):**
```javascript
const next = calculateNextReview(replayInterval, replayRepetition, replayEase, entry.rating);
```

**Current (Fixed):**
```javascript
const next = calculateNextReview(replayInterval, replayRepetition, replayEase, entry.date);
```

The 4th parameter is now correctly `entry.date` instead of `entry.rating`.

---

## 3. Logic Errors

### 3.1 ✅ FIXED - Incorrect Parameter Passing in [`analyzeProblemTimeline()`](src/algorithms/srs_logic.js:232)

See section 2.3 above - this has been fixed.

---

### 3.2 ⚠️ VALID - Typo in Debug Script Variable Name

**Location:** [`debug_schedule.js`](src/debug_schedule.js:113)

```javascript
let lastReviewDate = p.audio_last_review ? new Date(p.audio_last_review) : ...
```

Should be `fsrs_last_review`, not `audio_last_review`.

**Impact:** Medium - Debug script won't work correctly for FSRS data. However, line 117-118 has a fallback that checks `p.fsrs_last_review`, so the impact is reduced.

---

### 3.3 ⚠️ VALID - Wrong Export Name in Module

**Location:** [`popup.js`](src/popup/popup.js:621)

```javascript
module.exports = {
    updateDashboard,
    calculateStreak,  // This function doesn't exist! It's called calculateStreakFn
    setupSidebar
};
```

**Impact:** Low - Only affects testing. Tests would fail if they try to import `calculateStreak`.

---

---

### 3.6 ⚠️ VALID - `createNotesWidget` Defined Outside UMD Wrapper

**Location:** [`content_ui.js`](src/content/content_ui.js:431)

The [`createNotesWidget`](src/content/content_ui.js:431) function is defined at line 431, which is OUTSIDE the UMD wrapper (which ends at line 426). The module tries to export it at line 423:

```javascript
return {
    showCompletionToast,
    showRatingModal,
    showAnalysisModal,
    createNotesWidget,  // This references a function defined OUTSIDE the IIFE!
    insertNotesButton
};
```

**Impact:** 
- In browser: Works by accident because `createNotesWidget` becomes a global function due to hoisting
- In Node.js: The export will be `undefined` because the function is defined after the return statement

**Verdict:** This is a real structural issue that would cause test failures in Node.js.

---

## 4. Summary Table

| # | Issue | Severity | Status | File | Line(s) |
|---|-------|----------|--------|------|---------|
| 1 | Duplicate "LeetCode" in name | High | ✅ FIXED | manifest.json | 3, 14 |
| 2 | Duplicate easeFactor | Low | ⚠️ VALID | storage.js | 91-92 |
| 3 | Duplicate fsrs_state/fsrs_last_review | Low | ⚠️ VALID | storage.js | 157-160 |
| 4 | Duplicate comments | Low | ⚠️ VALID | content.js | 177-180 |
| 5 | Confusing FSRS comments | Medium | ⚠️ VALID | fsrs_logic.js | 52-77 |
| 6 | Missing "Again" rating in popup | High | ⚠️ VALID | popup_ui.js | 47-52 |
| 7 | Wrong param in analyzeProblemTimeline | Critical | ✅ FIXED | srs_logic.js | 232 |
| 8 | Typo audio_last_review | Medium | ⚠️ VALID | debug_schedule.js | 113 |
| 9 | Wrong export name | Low | ⚠️ VALID | popup.js | 621 |
| 10 | createNotesWidget outside IIFE | Medium | ⚠️ VALID | content_ui.js | 431 |


---

## 6. Verification Notes

### Issues Confirmed as Real Bugs:
- Duplicate property assignments in `storage.js` - Verified by reading current code
- Missing "Again" rating - Verified by comparing popup_ui.js vs content_ui.js
- `createNotesWidget` outside IIFE - Verified by checking line numbers (function at 431, IIFE ends at 426)
- Wrong export name - Verified `calculateStreakFn` exists but `calculateStreak` is exported
- Typo in debug script - Verified `audio_last_review` is clearly wrong

