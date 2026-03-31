# Tech Debt Audit: LeetCode Spaced Repetition Chrome Extension

**Date**: March 23, 2026
**Codebase**: ~40K LOC JS (60 source files, 59 test files), plus Python MCP server
**Scoring**: Priority = (Impact + Risk) x (6 - Effort), where each factor is 1–5

---

## Prioritized Debt Register

### 1. UMD Wrapper & Import Order Fragility — Priority: 40

| Factor | Score | Rationale |
|--------|-------|-----------|
| Impact | 5 | Broken wrappers crash the entire extension |
| Risk | 5 | Has already been accidentally reverted **3 times** |
| Effort | 2 | Requires build tooling change or automated guard |

**Category**: Architecture debt
**Affected files**: `worker.js`, `skill_matrix.js`, `llm_gateway.js`, `gemini_client.js`, `openai_client.js`, `drill_generator.js`, `drill_store.js`

**Problem**: All 22 background modules use a hand-rolled UMD wrapper that attaches to `self`. The import order in `worker.js` is strict and undocumented except in `CRITICAL_FIXES.md`. Any contributor who reorders imports or modifies a wrapper breaks the entire service worker — and this has happened repeatedly.

**Remediation**:
- **Phase 1 (guard)**: Add a CI test that loads `dist/background.js` in a headless service worker context and asserts all expected globals exist. Estimated: 1 day.
- **Phase 2 (eliminate root cause)**: Migrate background modules to standard ES module `import`/`export`. Vite already supports this for the service worker entry point. This removes the UMD pattern entirely. Estimated: 3–5 days.

---

### 2. No TypeScript — Priority: 36

| Factor | Score | Rationale |
|--------|-------|-----------|
| Impact | 4 | Slows development, hides bugs at module boundaries |
| Risk | 5 | Complexity is growing (22 background modules, 4 AI providers) |
| Effort | 3 | Incremental migration possible, but touches every file |

**Category**: Code debt

**Problem**: 40K lines of pure JavaScript with minimal JSDoc. The codebase already has type-sensitive patterns (UMD wrappers checking `typeof module`, runtime `typeof` guards, Chrome API optional chaining). TypeScript would catch import/export mismatches, API contract violations, and the UMD wrapper issues at compile time.

**Remediation**:
- **Phase 1**: Add `tsconfig.json` with `allowJs: true, checkJs: true`. Get free type checking on existing JS. Estimated: 1 day.
- **Phase 2**: Convert `src/shared/` and `src/algorithms/` to `.ts` (smallest, most stable modules). Estimated: 2 days.
- **Phase 3**: Convert background modules incrementally, starting with `llm_gateway.js` and client files. Estimated: 1 week.

---

### 3. Oversized Files (options.js 2555 LOC, content_ui.js 1513 LOC, llm_sidecar.js 1297 LOC) — Priority: 32

| Factor | Score | Rationale |
|--------|-------|-----------|
| Impact | 4 | Hard to navigate, test, and review changes |
| Risk | 4 | Bug surface area grows with file size |
| Effort | 3 | Needs careful extraction to avoid regressions |

**Category**: Code debt

**Problem**: Four files exceed 1000 LOC. `options.js` at 2555 LOC is the worst offender — it handles LLM provider settings, theme configuration, backup/restore, and general preferences all in one file.

**Remediation**:
- Split `options.js` into `options_llm.js`, `options_theme.js`, `options_backup.js`, `options_general.js`. Estimated: 2 days.
- Split `content_ui.js` into toast/modal/overlay components. Estimated: 1 day.
- Split `llm_sidecar.js` into sidecar UI and sidecar logic. Estimated: 1 day.
- Split `drill_generator.js` into prompt construction, response parsing, and orchestration. Estimated: 1 day.

---

### 4. Global Scope Pollution — Priority: 30

| Factor | Score | Rationale |
|--------|-------|-----------|
| Impact | 3 | Makes testing verbose, hides dependencies |
| Risk | 4 | Namespace collisions possible with other extensions |
| Effort | 3 | Requires module system migration (overlaps with #1) |

**Category**: Architecture debt
**Affected**: 20+ modules attaching to `self` or `window`

**Problem**: Modules like `self.SkillMatrix`, `self.DrillGenerator`, `window.THEMES`, `window.EasyRepeatI18n` pollute the global scope. This makes dependency tracing difficult, test setup verbose (extensive `global.chrome` mocking), and creates collision risk.

**Remediation**: Addressed naturally by fixing item #1 (ES module migration). Once modules use `import`/`export`, globals are eliminated. The content scripts loaded via manifest require a separate bundling strategy — consider using Vite's content script support or a manifest plugin like `@crxjs/vite-plugin`.

---

### 5. No Linting or Formatting Enforcement — Priority: 28

| Factor | Score | Rationale |
|--------|-------|-----------|
| Impact | 3 | Inconsistent style, easy to introduce subtle bugs |
| Risk | 4 | No automated guard against common JS pitfalls |
| Effort | 2 | Drop-in ESLint + Prettier setup |

**Category**: Infrastructure debt

**Problem**: No `.eslintrc`, `.prettierrc`, or any static analysis. Mixed async patterns (`.then()` vs `await`), inconsistent error handling, and magic numbers go uncaught.

**Remediation**:
- Add ESLint with `eslint:recommended` + `plugin:jest/recommended`. Estimated: 2 hours.
- Add Prettier with default config. Estimated: 30 minutes.
- Add `lint` script to package.json and a pre-commit hook. Estimated: 1 hour.
- Fix initial lint errors (likely 100–200). Estimated: 1 day.

---

### 6. Magic Numbers & Missing Constants — Priority: 24

| Factor | Score | Rationale |
|--------|-------|-----------|
| Impact | 3 | Hard to tune parameters, easy to introduce inconsistency |
| Risk | 3 | Changing one instance but missing another causes subtle bugs |
| Effort | 2 | Straightforward extraction |

**Category**: Code debt

**Examples**:
- `DEFAULT_DRILL_TEMPERATURE = 0.6` (in drill_generator.js)
- `CACHE_TTL_MS = 5 * 60 * 1000` (in leetcode_api.js)
- `DECAY_FACTOR = 0.98` (in skill_matrix.js)
- `4 * 60 * 60 * 1000` (4-hour abandonment timeout, in background.js)
- FSRS weights array (in fsrs_logic.js)

**Remediation**: Create `src/shared/constants.js` and extract all numeric/string literals. Group by domain (SRS parameters, API config, UI thresholds, timeouts). Estimated: 1 day.

---

### 7. Duplicated Logic — Priority: 24

| Factor | Score | Rationale |
|--------|-------|-----------|
| Impact | 3 | Bug fixes need to be applied in multiple places |
| Risk | 3 | Divergence between copies causes inconsistent behavior |
| Effort | 2 | Extract into shared utilities |

**Category**: Code debt

**Duplicated patterns**:
- **Problem slug extraction** (`getCurrentProblemSlug()`) — appears in content.js, leetcode_api.js, and llm_sidecar.js
- **LeetCode host validation** (`['leetcode.com', 'leetcode.cn']` set) — repeated in content.js, config.js, and background.js
- **Difficulty normalization** — done in both leetcode_api.js and storage.js
- **Chrome runtime validity check** (`!chrome.runtime?.id`) — copy-pasted across 8+ files

**Remediation**: Extract shared utilities into `src/shared/utils.js`. Create `isLeetCodeHost()`, `getProblemSlug()`, `isRuntimeValid()`, and `normalizeDifficulty()`. Estimated: 1 day.

---

### 8. Test Gaps — Priority: 20

| Factor | Score | Rationale |
|--------|-------|-----------|
| Impact | 2 | Most critical paths are covered |
| Risk | 4 | Missing integration tests mean module interactions untested |
| Effort | 2 | Add targeted tests for gaps |

**Category**: Test debt

**Gaps identified**:
- No code coverage metrics (no `--coverage` flag in test scripts)
- `drill_types.js`, `drill_verifier.js`, `retention_policy.js` lack test files
- Integration tests between background modules are minimal (unit tests mock everything)
- No visual regression testing for UI (popup, options, drills pages)
- No automated test for UMD wrapper correctness (the #1 issue)

**Remediation**:
- Add `--coverage` to Jest config and set a baseline threshold (e.g., 70%). Estimated: 1 hour.
- Write integration tests for the critical path: `llm_gateway → gemini_client → drill_generator → drill_store`. Estimated: 2 days.
- Add a smoke test that loads `dist/background.js` and verifies all module globals. Estimated: 1 day.

---

### 9. Incomplete Documentation — Priority: 16

| Factor | Score | Rationale |
|--------|-------|-----------|
| Impact | 2 | CRITICAL_FIXES.md is excellent; other docs lag behind |
| Risk | 3 | Tribal knowledge risk as codebase grows |
| Effort | 3 | Requires understanding all modules to document them |

**Category**: Documentation debt

**Problem**: `CRITICAL_FIXES.md` is well-maintained and invaluable, but `DECISIONS.md` has only 1 entry despite many architectural choices. No module dependency diagram exists. Complex algorithms (FSRS weights, skill matrix decay, insight compression) lack detailed inline comments.

**Remediation**:
- Backfill `DECISIONS.md` with 5–10 key past decisions (AI provider abstraction, Dexie choice, UMD pattern, content script ordering). Estimated: half day.
- Generate a module dependency diagram (can be automated from import statements after ES module migration). Estimated: 1 hour post-migration.
- Add JSDoc headers to the 10 most complex functions. Estimated: 1 day.

---

### 10. Stale Build Artifacts — Priority: 12

| Factor | Score | Rationale |
|--------|-------|-----------|
| Impact | 1 | Doesn't affect functionality |
| Risk | 2 | Confusion for new contributors |
| Effort | 1 | Quick cleanup |

**Category**: Infrastructure debt

**Problem**: `dexie.min.js` is copied to `dist/src/assets/libs/` but is never used (Dexie is imported from npm). `debug_storage.js` and `verify_streak.js` sit in the project root as ad-hoc debugging scripts. `.DS_Store` is tracked. `.pytest_cache/` is present.

**Remediation**: Remove unused files, add them to `.gitignore`. Estimated: 30 minutes.

---

## Phased Remediation Plan

### Sprint 1: Guards & Quick Wins (1 week)

| Item | Effort | Debt Addressed |
|------|--------|----------------|
| Add ESLint + Prettier (#5) | 1.5 days | Infrastructure |
| Add Jest `--coverage` + baseline (#8) | 1 hour | Test |
| Extract constants file (#6) | 1 day | Code |
| Extract shared utilities (#7) | 1 day | Code |
| Clean stale artifacts (#10) | 30 min | Infrastructure |
| Add UMD smoke test (#8) | 1 day | Test + Architecture |

### Sprint 2: Architecture Foundation (2 weeks)

| Item | Effort | Debt Addressed |
|------|--------|----------------|
| Migrate background modules to ES modules (#1) | 5 days | Architecture |
| Split options.js + content_ui.js (#3) | 3 days | Code |
| Add `tsconfig.json` with `checkJs` (#2, Phase 1) | 1 day | Code |
| Backfill DECISIONS.md (#9) | 0.5 day | Documentation |

### Sprint 3: Type Safety & Integration Testing (2 weeks)

| Item | Effort | Debt Addressed |
|------|--------|----------------|
| Convert shared/ + algorithms/ to TypeScript (#2, Phase 2) | 2 days | Code |
| Convert LLM clients to TypeScript (#2, Phase 3) | 5 days | Code |
| Write integration tests for critical path (#8) | 2 days | Test |
| Add JSDoc to top 10 complex functions (#9) | 1 day | Documentation |

### Ongoing (alongside feature work)

- Convert remaining modules to TypeScript as they're touched
- Split any file that exceeds 500 LOC during feature work
- Document new architectural decisions in DECISIONS.md
- Maintain coverage threshold (ratchet upward over time)

---

## Summary

The codebase is impressively feature-rich for its size, with good test coverage and some excellent documentation (especially `CRITICAL_FIXES.md`). The most urgent debt is the **UMD wrapper fragility** — it has caused production failures three times and will continue to do so until the root cause (manual module wiring) is eliminated through ES module migration. The second highest priority is **TypeScript adoption**, which would provide compile-time safety for the increasingly complex module graph. Most other items are standard housekeeping that can be addressed incrementally alongside feature work.
