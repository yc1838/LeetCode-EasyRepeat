# Data Schema — LeetCode EasyRepeat

**Schema Version: 1**
**Last Updated: 2026-03-07**

All data lives in `chrome.storage.local`. This document is the canonical reference for every key, its shape, and its purpose. Any migration must bump the schema version and document the diff.

---

## Core Data

### `problems`

The central store. Maps problem slugs to their SRS state, metadata, and history.

**Type:** `Object<string, ProblemEntry>`
**Default:** `{}`

```ts
interface ProblemEntry {
  // === Identity ===
  title: string;              // "1. Two Sum" (with questionId prefix)
  slug: string;               // "two-sum" (URL identifier, also the map key)
  difficulty: string;         // "Easy" | "Medium" | "Hard"
  topics: string[];           // ["Array", "Hash Table"] — from LeetCode GraphQL API

  // === SM-2 Legacy Fields ===
  interval: number;           // Days until next review
  repetition: number;         // Times reviewed (cumulative)
  easeFactor: number;         // SM-2 ease factor (default 2.5)

  // === FSRS v4.5 Fields ===
  fsrs_stability?: number;    // Memory stability (higher = more durable)
  fsrs_difficulty?: number;   // Item difficulty 1-10 (higher = harder to remember)
  fsrs_state?: string;        // "New" | "Learning" | "Review" | "Relearning"
  fsrs_last_review?: string;  // ISO 8601 datetime of last review

  // === Scheduling ===
  lastSolved: string;         // ISO 8601 datetime of most recent submission
  nextReviewDate: string;     // ISO 8601 datetime when next review is due

  // === User Content ===
  notes?: string;             // Free-text notes (user + AI analysis)

  // === History ===
  history: HistoryEntry[];
}

interface HistoryEntry {
  date: string;               // ISO 8601 datetime
  status: string;             // "Accepted" | "Wrong Answer"
  rating: number | null;      // FSRS rating 1-4 (Again/Hard/Good/Easy), null for SM-2 legacy
}
```

**Example:**
```json
{
  "two-sum": {
    "title": "1. Two Sum",
    "slug": "two-sum",
    "difficulty": "Easy",
    "topics": ["Array", "Hash Table"],
    "interval": 7,
    "repetition": 3,
    "easeFactor": 2.5,
    "fsrs_stability": 12.4,
    "fsrs_difficulty": 4.2,
    "fsrs_state": "Review",
    "fsrs_last_review": "2026-03-07T10:30:00.000Z",
    "lastSolved": "2026-03-07T10:30:00.000Z",
    "nextReviewDate": "2026-03-14T10:30:00.000Z",
    "notes": "Use hash map for O(n) lookup.",
    "history": [
      { "date": "2026-03-01T08:00:00.000Z", "status": "Wrong Answer", "rating": 1 },
      { "date": "2026-03-03T09:00:00.000Z", "status": "Accepted", "rating": 3 },
      { "date": "2026-03-07T10:30:00.000Z", "status": "Accepted", "rating": 4 }
    ]
  }
}
```

---

### `activityLog`

Daily activity log for streak tracking. Each entry is a local-date string.

**Type:** `string[]`
**Default:** `[]`

```json
["2026-03-05", "2026-03-06", "2026-03-07"]
```

Entries are always in `YYYY-MM-DD` format (local time), sorted ascending. Deduplicated — each date appears at most once.

---

## AI Configuration

### `aiProvider`

Selected AI provider mode.

**Type:** `string`
**Default:** `'local'`
**Values:** `'local'` | `'google'` | `'openai'` | `'anthropic'` | `'cloud'`

### `selectedModelId`

Specific model identifier within the chosen provider.

**Type:** `string`
**Default:** `''`
**Examples:** `'gemma3:latest'`, `'gpt-4o'`, `'claude-3-5-sonnet-20240620'`

### `keys`

API keys for cloud providers.

**Type:** `Object`
**Default:** `{ google: '', openai: '', anthropic: '' }`

### `geminiApiKey`

Legacy Gemini API key. Superseded by `keys.google` but kept for backward compatibility.

**Type:** `string`
**Default:** `''`

### `localEndpoint`

URL for local LLM server (Ollama, LM Studio, etc.).

**Type:** `string`
**Default:** `'http://127.0.0.1:11434'`

### `aiAnalysisEnabled`

Feature flag for AI mistake analysis on wrong submissions.

**Type:** `boolean`
**Default:** `false`

---

## UI Preferences

### `theme`

Active UI theme.

**Type:** `string`
**Default:** `'sakura'`
**Values:** `'sakura'` | `'matrix'` | `'neural'` | `'typography'`

### `uiLanguage`

Display language for the extension UI.

**Type:** `string`
**Default:** `'en'`
**Values:** `'en'` | `'zh'` | `'hi-IN'` | `'ja-JP'` | `'pt-BR'` | `'de-DE'` | `'ko-KR'` | `'fr-FR'` | `'pl-PL'` | `'es-ES'` | `'tr-TR'`

### `popupFilters`

User's last selected filters in the Popup Queue view.

**Type:** `Object | null`
**Default:** `null`

```ts
interface PopupFilters {
  difficulty: "all" | "Easy" | "Medium" | "Hard";
  topic: string;              // "all" or specific topic string
  timeRange: string;          // "all" | "7" | "30" | "90"
}
```

### `seenDragTooltip`

Whether the user has dismissed the drag-to-reposition tooltip.

**Type:** `boolean`
**Default:** `false`

### `alwaysAnalyze`

User preference for always running AI analysis on wrong submissions (skip the prompt).

**Type:** `boolean`
**Default:** `false`

---

## Neural Agent System

### `agentEnabled`

Master toggle for the Neural Agent system (drills, greeting, digest, skill graph).

**Type:** `boolean`
**Default:** `false`

### `features`

Per-feature flags within the Neural Agent.

**Type:** `Object`
**Default:** `{ drillGenerator: true, morningGreeting: true, nightlyDigest: true, skillGraph: true, insightCompression: true }`

### `agentDebugLogs`

Enable verbose debug logging for agent subsystems.

**Type:** `boolean`
**Default:** `false`

### `skillDNA`

Skill matrix data with confidence scores and mistake history per topic.

**Type:** `Object`
**Default:** `{}`

### `custom_skills`

User-defined custom skill categories for drill generation.

**Type:** `string[]`
**Default:** `[]`

### `currentDrillSession`

Active drill session state.

**Type:** `Object | null`

```ts
interface DrillSession {
  drills: Drill[];
  currentDrill: Drill;
  startTime: number;          // Unix timestamp ms
}
```

### `lastDigestResult`

Output of the most recent nightly digest analysis.

**Type:** `Object | null`

```ts
interface DigestResult {
  submissionsProcessed: number;
  skillsUpdated: number;
  insights: string[];
  recommendedDrills: string[];
}
```

### `patternCounts`

Occurrence counts for detected error patterns.

**Type:** `Object<string, number>`
**Default:** `{}`

### `notificationsEnabled`

Toggle for drill completion browser notifications.

**Type:** `boolean`
**Default:** `true`

---

## Caching / Derived Data

### `localizedProblemTitles`

Cache of translated problem titles (primarily Chinese).

**Type:** `Object<string, LocalizedTitle>`
**Default:** `{}`

```ts
interface LocalizedTitle {
  zh: string;                 // Chinese title
  zhRaw: string;              // Raw Chinese title (without questionId prefix)
  questionId: string;         // "1", "2", etc.
  source: string;             // Where the title came from
  fetchedAt: string;          // ISO 8601 datetime
}
```

### `greetingLastShown`

Date string of when the morning greeting banner was last displayed.

**Type:** `string`
**Default:** `''`

---

## Backup Metadata

### `backupMeta`

Metadata for manual backup/export and restore actions shown in the options page.
This is **not** the backup itself. The actual recovery artifact is the downloaded JSON backup file stored outside Chrome.

**Type:** `Object`
**Default:** see below

```ts
interface BackupMeta {
  lastBackupAt: string;             // ISO 8601 datetime of latest manual export
  lastBackupFileName: string;       // Suggested filename used for export
  lastBackupProblemCount: number;   // Problem entries present in exported snapshot
  lastBackupKeyCount: number;       // Total chrome.storage.local keys in exported snapshot
  lastRestoreAt: string;            // ISO 8601 datetime of latest restore
  lastRestoreFileName: string;      // Filename selected for restore
  lastRestoreProblemCount: number;  // Problem entries restored
  lastRestoreKeyCount: number;      // Total keys restored
  lastRestoredExportedAt: string;   // Export timestamp embedded in the imported backup file
}
```

**Default value:**

```json
{
  "lastBackupAt": "",
  "lastBackupFileName": "",
  "lastBackupProblemCount": 0,
  "lastBackupKeyCount": 0,
  "lastRestoreAt": "",
  "lastRestoreFileName": "",
  "lastRestoreProblemCount": 0,
  "lastRestoreKeyCount": 0,
  "lastRestoredExportedAt": ""
}
```

---

## Storage Budget

| Category | Estimated Size | Notes |
|----------|---------------|-------|
| `problems` (500 entries) | ~200 KB | Grows ~400 bytes per problem |
| `activityLog` (1 year) | ~4 KB | 365 × 11 bytes |
| AI config | < 1 KB | API keys + model IDs |
| UI prefs | < 1 KB | Theme, language, flags |
| `localizedProblemTitles` | ~100 KB | If populated |
| `skillDNA` | ~10 KB | Depends on topic count |
| **Total (typical user)** | **~300 KB** | Well under 10 MB limit |

`chrome.storage.local` default quota: **10 MB**. Request `unlimitedStorage` permission if needed in the future.

---

## Migration Notes

- **v0 → v1 (2026-03-07):** No structural changes. This document formalizes the existing implicit schema. The `status` field in `HistoryEntry` was previously always `'Accepted'`; it can now also be `'Wrong Answer'`.
- When adding new fields, always use optional fields with sensible defaults so old data loads without migration.
- When removing fields, leave them in stored data (don't rewrite) — just stop reading them.
