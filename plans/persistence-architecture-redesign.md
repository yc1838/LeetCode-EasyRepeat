# Persistence Architecture Redesign

**Status:** Draft  
**Date:** 2026-03-07  
**Author:** Codex  
**Scope:** Storage and persistence redesign only. No implementation changes in this document.

---

## 1. Problem Statement

The current persistence model has grown organically and now mixes multiple storage mechanisms with overlapping responsibilities:

- `chrome.storage.local` is used as the primary store for problem review state, notes, settings, caches, and several agent-related records.
- `chrome.storage.session` is used for transient orchestration flags.
- `localStorage` is used for UI state.
- IndexedDB/Dexie is also used for some agent subsystems (`NeuralRetentionDB`, `DrillsDB`, `InsightsDB`).

This creates four architectural problems:

1. There is no single persistence boundary or canonical ownership model.
2. The `problems` blob combines multiple domains: problem metadata, review scheduling, notes, and history.
3. Some workflows need queryable event history, but the current core model is optimized for whole-object rewrites rather than indexed retrieval.
4. Documentation no longer matches runtime reality, which makes further development risky.

The redesign goal is to establish a clear, maintainable, and query-friendly persistence architecture that supports the existing extension workflows without requiring a risky big-bang rewrite.

---

## 2. Functional Requirements

### FR-1. Submission Capture

The system shall persist both successful and failed submissions, including:

- problem identity (`slug`, title, difficulty)
- timestamp
- result status
- topics/tags if available
- attempt context when available
- error/test details when available
- submitted code or code excerpts when explicitly required by the feature

### FR-2. Review State Tracking

The system shall persist spaced-repetition review state per problem, including:

- current scheduling state
- next review time
- last review time
- FSRS/legacy scheduling parameters required for backward compatibility

### FR-3. Problem Notes

The system shall persist user-authored and AI-generated notes independently from submission history and review scheduling.

### FR-4. Historical Analysis

The system shall support agent workflows that need historical submission events, including:

- daily digest
- skill updates
- drill generation
- insight extraction
- future backfill and analytics jobs

### FR-5. Settings and Preferences

The system shall persist extension-wide settings and preferences, including:

- AI provider/model settings
- API keys and local endpoint
- theme and language preferences
- feature flags
- small UI preferences that must be shared across extension contexts

### FR-6. Caching

The system shall support local caches for derived or external data, such as:

- localized problem titles
- translated metadata
- lightweight compatibility state needed during migration

### FR-7. Session/Runtime Flags

The system shall support transient flags that only need to live for the current browser session or service-worker lifecycle.

### FR-8. Drill and Insight Persistence

The system shall persist generated drills, drill outcomes, and extracted insights as first-class entities, not as incidental fields attached to unrelated records.

### FR-9. Migration Compatibility

The system shall load existing user data from the current storage layout and migrate it forward without requiring manual user intervention.

### FR-10. Administrative Utilities

The system shall support maintenance operations such as:

- streak repair
- rebuild/backfill
- retention cleanup
- debug inspection/export

---

## 3. Non-Functional Requirements

### NFR-1. Single Source of Truth

Each domain object shall have exactly one canonical persistence owner.

Examples:

- review state must not be duplicated across multiple unrelated stores
- notes must not be stored both inside a blob and as standalone records

### NFR-2. Queryability

The persistence model shall support indexed queries for event-oriented data without requiring full-dataset scans or whole-blob rewrites for routine reads.

### NFR-3. Cross-Context Availability

The storage system shall work reliably across Chrome extension contexts:

- content scripts
- popup
- options page
- background/service worker

### NFR-4. Incremental Writes

Routine writes should update only the affected entity or small record set. The design should avoid repeated full rewrites of a large `problems` object.

### NFR-5. Reliability and Idempotency

Submission capture and review updates shall be tolerant of retries, duplicate event detection, and service-worker restarts.

### NFR-6. Migration Safety

The architecture shall support phased migration with:

- backward compatibility during rollout
- dual-read or compatibility adapters where needed
- clear cutover points

### NFR-7. Performance

Normal user actions such as page submit, popup open, note save, and drill launch shall remain responsive and should not be blocked by heavyweight serialization.

### NFR-8. Storage Scalability

The model shall remain viable as a user's dataset grows to:

- hundreds or thousands of problems
- thousands of submission events
- long-lived note, drill, and insight histories

### NFR-9. Debuggability

The persistence architecture shall make it easy to inspect:

- what data exists
- where it lives
- which subsystem owns it
- how to repair or migrate it

### NFR-10. Privacy and Local-First Operation

All persistence shall remain local by default. The redesign does not introduce remote sync.

### NFR-11. Testability

Storage access shall be hidden behind repository/service interfaces so business logic can be tested without directly mocking raw Chrome APIs everywhere.

---

## 4. Design Principles

1. Separate business data from settings.
2. Separate mutable state from append-only event history.
3. Store query-heavy entities in IndexedDB.
4. Keep `chrome.storage.local` for small shared configuration and compatibility state.
5. Restrict `localStorage` to purely local view state.
6. Do not allow feature modules to write arbitrary storage keys directly.
7. All persistence access should pass through explicit repositories.

---

## 5. Proposed Storage Architecture

### 5.1 Storage Role Split

### A. IndexedDB as the primary business datastore

IndexedDB becomes the canonical store for user-domain data that is:

- relational or entity-based
- query-heavy
- potentially large
- updated incrementally

This includes:

- `problems`
- `review_states`
- `submission_events`
- `notes`
- `drills`
- `insights`
- optional `skill_snapshots`

### B. `chrome.storage.local` for shared configuration and small caches

`chrome.storage.local` remains the canonical store for:

- settings
- feature flags
- UI preferences that must be shared across contexts
- lightweight caches
- compatibility/migration markers

This includes:

- `settings`
- `uiPreferences`
- `localizedProblemTitles`
- small progress markers such as migration version

### C. `chrome.storage.session` for ephemeral runtime coordination

`chrome.storage.session` is reserved for:

- one-session orchestration flags
- dedupe markers for background jobs
- service-worker/session-local runtime state

Examples:

- `digestRanToday`

### D. `localStorage` for non-critical per-view UI state only

`localStorage` may be used only for optional view-local state that:

- does not affect business logic
- does not require cross-context synchronization
- is safe to lose

Examples:

- floating panel position

---

## 6. Canonical Domain Model

### 6.1 Problem

Represents the canonical identity and metadata of a LeetCode problem.

```ts
interface Problem {
  slug: string;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Unknown';
  topics: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}
```

### 6.2 ReviewState

Represents the current SRS state for a problem.

```ts
interface ReviewState {
  problemSlug: string;
  schedulerVersion: 'fsrs' | 'sm2_legacy';
  repetition: number;
  interval: number;
  easeFactor: number | null;
  fsrsStability?: number | null;
  fsrsDifficulty?: number | null;
  fsrsState?: string | null;
  lastReviewedAt: string | null;
  nextReviewAt: string | null;
  lastResult: 'Accepted' | 'Wrong Answer' | null;
  updatedAt: string;
}
```

### 6.3 SubmissionEvent

Append-only event record for every captured submission outcome.

```ts
interface SubmissionEvent {
  id: string;
  problemSlug: string;
  occurredAt: string;
  result: string;
  rating: number | null;
  source: string;
  submissionId?: string | null;
  attemptNumber?: number | null;
  language?: string | null;
  code?: string | null;
  errorDetails?: unknown;
  testInput?: string | null;
  topicsSnapshot?: string[];
}
```

### 6.4 ProblemNote

Stores note content separately from scheduling and event history.

```ts
interface ProblemNote {
  problemSlug: string;
  content: string;
  updatedAt: string;
  updatedBy: 'user' | 'ai' | 'system';
}
```

### 6.5 SkillProfile

Represents the latest materialized skill state used by the agent.

```ts
interface SkillProfile {
  version: string;
  skills: Record<string, unknown>;
  lastUpdated: string;
  totalSubmissions: number;
}
```

### 6.6 Drill

```ts
interface Drill {
  id: string;
  skillId: string;
  type: string;
  status: 'pending' | 'completed' | 'skipped';
  createdAt: string;
  completedAt: string | null;
  correct: boolean | null;
  attempts: number;
  sourceSubmissionEventId?: string | null;
}
```

### 6.7 Insight

```ts
interface Insight {
  id: string;
  content: string;
  skillIds: string[];
  source: string;
  frequency: number;
  weight: number;
  createdAt: string;
  lastSeenAt: string;
}
```

### 6.8 Settings

```ts
interface Settings {
  aiProvider: string;
  selectedModelId: string;
  keys: {
    google: string;
    openai: string;
    anthropic: string;
  };
  localEndpoint: string;
  aiAnalysisEnabled: boolean;
  notificationsEnabled: boolean;
  agentEnabled: boolean;
  features: Record<string, boolean>;
}
```

### 6.9 UiPreferences

```ts
interface UiPreferences {
  theme: string;
  uiLanguage: string;
  seenDragTooltip: boolean;
  alwaysAnalyze: boolean;
}
```

---

## 7. Repository Boundary

No feature module should call raw persistence APIs directly except inside repository implementations.

The target repository boundary is:

- `ProblemRepository`
- `ReviewStateRepository`
- `SubmissionEventRepository`
- `NoteRepository`
- `DrillRepository`
- `InsightRepository`
- `SettingsRepository`
- `UiPreferencesRepository`
- `CacheRepository`
- `RuntimeFlagRepository`

Application services consume repositories, not raw `chrome.storage.*`, `localStorage`, or Dexie handles.

---

## 8. Target Data Ownership

| Domain | Canonical Store | Notes |
|---|---|---|
| Problem metadata | IndexedDB | Separate from review state |
| Review state | IndexedDB | One row per problem |
| Submission history | IndexedDB | Append-only event log |
| Notes | IndexedDB | Separate from review/event data |
| Drills | IndexedDB | Existing Dexie-backed concept remains, but under canonical repo boundary |
| Insights | IndexedDB | Existing Dexie-backed concept remains, but under canonical repo boundary |
| Skill profile current state | IndexedDB or `chrome.storage.local` during transition | Prefer IndexedDB long term if snapshots/history matter |
| Settings | `chrome.storage.local` | Small, shared, config-like |
| UI preferences | `chrome.storage.local` | Shared across contexts |
| Lightweight caches | `chrome.storage.local` | Example: localized titles |
| Runtime/session flags | `chrome.storage.session` | Ephemeral only |
| View-local UI state | `localStorage` | Optional, non-critical only |

---

## 9. Architectural Decisions

### AD-1. Do not keep `problems` as the long-term primary store.

Reason:

- it mixes unrelated domains
- it encourages whole-blob rewrites
- it is difficult to query for event history
- it makes migration and debugging harder

### AD-2. Use append-only events for submission history.

Reason:

- digest and analytics are naturally event-driven
- failed and successful attempts should both be visible
- replay and rebuild become possible

### AD-3. Keep settings outside IndexedDB unless query/index needs emerge.

Reason:

- settings are small
- they benefit from simple cross-context reads via `chrome.storage.local`

### AD-4. Introduce materialized state plus event history.

Reason:

- event history serves analytics and rebuild
- materialized `ReviewState` serves fast UI reads

### AD-5. Treat caches as disposable.

Reason:

- caches should be rebuildable
- they must not become hidden sources of truth

---

## 10. Migration Strategy

### Phase 0. Documentation and Contract Freeze

- document current storage reality
- define target domain model
- freeze new ad hoc storage keys unless explicitly approved

### Phase 1. Repository Layer Introduction

- create repository interfaces
- wrap existing raw storage calls behind adapters
- do not change data layout yet

### Phase 2. IndexedDB Schema Introduction

- define canonical IndexedDB schema for:
  - problems
  - review states
  - submission events
  - notes
  - drills
  - insights

### Phase 3. One-Time Historical Migration

- migrate `chrome.storage.local.problems` into:
  - `Problem`
  - `ReviewState`
  - `SubmissionEvent`
  - `ProblemNote`
- migrate vector and agent legacy stores only where necessary
- record migration version in `chrome.storage.local`

### Phase 4. Read Cutover

- switch application reads to repositories backed by the new stores
- keep compatibility fallback for a limited transition window

### Phase 5. Write Cutover

- stop writing legacy keys except compatibility markers
- ensure new writes only go through canonical repositories

### Phase 6. Legacy Cleanup

- remove dead compatibility code
- update schema docs and debug tools
- optionally delete obsolete legacy keys after a safe release window

---

## 11. Out of Scope

The following are explicitly out of scope for this document:

- changing FSRS scoring rules
- redesigning the UI
- adding cloud sync
- changing AI provider behavior
- rewriting the entire extension in a new framework

---

## 12. Immediate Next Steps

1. Approve this architecture direction.
2. Write a canonical schema document for the target domain entities.
3. Define repository contracts and storage adapters.
4. Produce a migration checklist before touching implementation.

---

## 13. Open Questions

1. Should `SkillProfile` remain in `chrome.storage.local` during transition for simpler popup/background access, or move directly to IndexedDB?
2. Do we want to persist full submitted code for every `SubmissionEvent`, or only for failed attempts / agent workflows?
3. Should drill and insight databases be merged into a single application database, or kept as separate logical databases behind one repository boundary?
4. How long should backward-compatible legacy reads remain after migration ships?
