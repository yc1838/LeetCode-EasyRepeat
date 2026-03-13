# Decision Log

This document records key product and engineering decisions made during development, including the context, options considered, and final choices.

---

## 001 — Failed Submission Rating Strategy

**Date**: 2026-03-13
**Status**: Accepted
**Affects**: `src/content/leetcode_api.js`, `src/content/content_ui.js`, `src/background.js`, `manifest.json`

### Context

The extension uses FSRS v4.5 to schedule reviews. When a user submits code on LeetCode, the system assigns a rating (1–4) that determines the next review interval:

| Rating | Label | New Card Interval |
|--------|-------|-------------------|
| 1 | Again | ~1 day |
| 2 | Hard  | ~1–2 days |
| 3 | Good  | ~3 days |
| 4 | Easy  | ~16 days |

**Problem**: Previously, every failed submission (Wrong Answer, Runtime Error, etc.) was immediately saved with a hardcoded `rating=1` (Again). This was too aggressive — a single careless typo on a new problem got the same treatment as "I have no idea how to solve this." The user never got a chance to self-assess.

Note: LeetCode has two actions — **Run** (test against sample cases) and **Submit** (judge against all cases). We only track Submit results; Run results are ignored.

### Options Considered

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A** | Don't record failures at all; only save on AC | Simple | Abandoned problems are never tracked |
| **B** | All failures → rating=2 (Hard) | Simple, less punishing | Doesn't distinguish careless vs. clueless |
| **C** | Dynamic rating based on fail count | Automatic, fair | Slightly more complex |
| **D** | Show rating modal on every failure | Maximum user control | Extremely annoying (5 fails = 5 popups) |
| **E** | On AC, cap max rating by fail count | Balanced | "Why is Easy grayed out?" confusion |
| **F** | Hybrid: cap on AC + auto-save on abandon | Best of C + E | Most complex |

### Decision

**Option F — Hybrid: fail-count-capped rating on AC, auto-save on abandon.**

Two triggers for saving a rating:

1. **User gets Accepted** → Show rating modal with upper bound based on prior fail count:
   - 0 prior fails → ratings 1–4 all available
   - 1–2 prior fails → max Good (3)
   - 3+ prior fails → max Hard (2)
2. **User abandons the problem** (tab closed, or 4-hour inactivity timeout) with unresolved failed submissions → auto-save as rating=1 (Again)

What does **not** trigger a save:
- Run/test results (pass or fail)
- Opening a problem page without ever submitting
- Switching tabs or windows to look things up

### Implementation

Session state is stored in `chrome.storage.local` (not in-memory, because MV3 service workers hibernate):

```json
{
  "activeSession": {
    "slug": "minimum-depth-of-binary-tree",
    "title": "111. Minimum Depth of Binary Tree",
    "difficulty": "Easy",
    "topics": ["Tree", "BFS", "DFS", "Binary Tree"],
    "failCount": 0,
    "accepted": false,
    "lastActivity": "2026-03-13T21:29:46.275Z"
  }
}
```

Abandon detection:
- `chrome.tabs.onRemoved` in the background service worker — checks if any remaining tabs still have the problem open before saving.
- `chrome.alarms` every 30 minutes — if `lastActivity` is >4 hours ago and there are unresolved fails, auto-save as Again and clear the session.

### Rationale

- 4-hour timeout: if someone hasn't solved it in 4 hours of inactivity, they almost certainly moved on. Again is appropriate.
- Capping the rating (rather than forcing a specific value) still gives the user agency while preventing over-optimistic self-assessment after multiple failures.
- Storing session state in `chrome.storage.local` instead of memory ensures correctness across MV3 service worker restarts.
