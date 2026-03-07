# Sprint Plan

## Sprint Goal
- Ship a stable, review-ready LeetCode EasyRepeat build and complete Chrome Web Store submission prerequisites without introducing new feature scope.

## Sprint Window
- Start: 2026-02-06
- End: 2026-02-09

## Must-Finish Items
- [ ] Finalize release stability checks for background modules (UMD wrappers, Dexie import, module load order), then run `npm run build` and `npm test`.
- [ ] Complete publishing blockers: extension icons, manifest cleanup, and a production-ready package checklist.
- [ ] Finalize compliance artifacts: update privacy-policy contact info and prepare a hosted privacy policy URL for store submission.

## Current Progress (2026-02-07)
- Completed: Stabilized manual drill-refill pipeline across background/generator/store (queue target, queue cleanup, dedupe, per-skill caps, cooldown, and full-queue rotation).
- Completed: Updated options-page drill controls and status rendering to reflect queue refill behavior with realtime queue snapshots and explicit fallback reasons.
- Completed: Improved drill session end-state navigation and local model fallback robustness; refreshed skill graph rendering for clearer weakest-first visibility.
- Remaining: Build/test verification plus store-publishing packaging/compliance items remain must-finish before sprint close.

## Nice-to-Have (Only if must-finish is done)
- [ ] Improve Chrome Web Store listing copy and screenshots after must-finish items are complete.

## Scope Rules
- One-in, one-out for new work.
- New ideas go to parking lot unless explicitly approved as a swap.
