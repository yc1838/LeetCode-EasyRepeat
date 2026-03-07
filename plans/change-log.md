# Change Log

## 2026-02-09
- Timestamp: 2026-02-09T16:26:11-0500
- Change: Restored popup streak display in the heatmap header, reconnected streak calculation rendering, and updated header layout so long welcome text wraps on the left while streak stays visible on the right.
- Reason: User-facing regression where streak value disappeared after popup header text refactors and custom welcome copy changes.
- Impact: Popup now consistently shows streak days again and supports long welcome messages without hiding streak information.
- Scope Decision: in-scope

---

## 2026-02-07
- Timestamp: 2026-02-07T16:32:16-0500
- Change: Moved the streak-fix tool from popup sidebar into the options/setup page as a dedicated tool card at the end, and removed popup streak-repair wiring.
- Reason: Keep popup focused on daily review/scan flow while keeping manual maintenance actions in setup.
- Impact: Popup is less cluttered, and streak repair is now available in options with explicit date input, validation, and status feedback.
- Scope Decision: in-scope

---

- Timestamp: 2026-02-07T15:59:33-0500
- Change: Refactored manual drill generation into a queue-refill flow (targeted pending count, cooldown, queue cleanup/rotation, dedupe, and per-skill/per-type caps), and updated options UI/status copy to match the new behavior.
- Reason: Prevent queue bloat and duplicate drills while making refill results predictable and visible to users.
- Impact: Refill now tops up to queue target instead of blind bulk generation, stale/duplicate pending drills are cleaned, and settings UI shows realtime queue state plus explicit fallback reasons.
- Scope Decision: in-scope

---

## 2026-02-06
- Timestamp: 2026-02-06T16:55:21-0500
- Change: Updated privacy policy metadata and contact section with concrete support channels.
- Reason: Remove publishing placeholders and satisfy Chrome Web Store compliance requirements.
- Impact: Policy now includes actionable support email and issue tracker URL.
- Scope Decision: in-scope

---

## 2026-02-06
- Timestamp: 2026-02-06
- Change: Filled sprint goal, sprint window, must-finish items, and today's top priorities in planning docs.
- Reason: Create ADHD-friendly scope control and daily accountability baseline.
- Impact: Clear release focus, explicit anti-scope-creep guardrails, and actionable daily execution plan.
- Scope Decision: in-scope

---

## Entry Template
- Timestamp:
- Change:
- Reason:
- Impact:
- Scope Decision: in-scope | swap-required | defer

---
