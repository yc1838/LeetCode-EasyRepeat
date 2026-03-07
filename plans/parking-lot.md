# Parking Lot

Use this list for ideas that are not in current sprint scope.

- Idea: Add focused automated tests for manual refill queue logic (`normalizePendingQueue`, cooldown gating, and save cap enforcement).
  - Why it can wait: Runtime guardrails are now in place; release packaging/compliance remains higher priority this sprint.
  - Revisit date: 2026-02-10

- Idea: Make refill queue controls configurable in settings (target pending size, cooldown interval, rotation amount).
  - Why it can wait: Current fixed defaults (12 pending, 60s cooldown) are sufficient for stability validation and reduce config complexity.
  - Revisit date: 2026-02-11

- Idea: Re-evaluate whether `critique` drill type should be included in manual refill allowed types.
  - Why it can wait: Current refill quality work intentionally limits to three high-signal types while queue behavior is stabilized.
  - Revisit date: 2026-02-11
