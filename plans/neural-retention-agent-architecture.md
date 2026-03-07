# Neural Retention Agent - Comprehensive Implementation Plan

## Executive Summary

The **Neural Retention Agent** is an autonomous, background-running AI system that transforms the LeetCode EasyRepeat extension from a passive SRS tracker into an **active, self-improving mentor**. Every night, it collects all coding attempts from the day, performs deep pattern analysis, maintains a living "Skill DNA" of the user's abilities, and generates personalized micro-drills targeting the user's most persistent mistakes.

**Hackathon Alignment:** This feature directly targets the **"Marathon Agent"** strategic track by implementing:
- **Continuity:** State maintained across 24-hour cycles
- **Self-Correction:** Agent adjusts its teaching strategy based on performance
- **Autonomous Execution:** Runs without user intervention
- **Complex Multi-Step Tasks:** Shadow Logging → Pattern Extraction → Skill DNA Update → Drill Generation → Verification

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Component Deep-Dive](#2-component-deep-dive)
3. [Technology Selection & Justification](#3-technology-selection--justification)
4. [Data Models](#4-data-models)
5. [Implementation Phases](#5-implementation-phases)
6. [Pitfalls & Prevention Strategies](#6-pitfalls--prevention-strategies)
7. [Testing Strategy](#7-testing-strategy)
8. [Hackathon Differentiators](#8-hackathon-differentiators)

---

## 1. System Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                          NEURAL RETENTION AGENT                                   │
│                          (Marathon Agent Architecture)                            │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│   ┌─────────────────────────────────────────────────────────────────────────┐    │
│   │                        DAYTIME: SHADOW LOGGER                            │    │
│   │                        (Passive Data Collection)                         │    │
│   │                                                                          │    │
│   │   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                 │    │
│   │   │ Submit      │───▶│ Submission  │───▶│ Day Log     │                 │    │
│   │   │ Interceptor │    │ Parser      │    │ Storage     │                 │    │
│   │   │             │    │             │    │             │                 │    │
│   │   │ - Hijack    │    │ - Extract   │    │ - Raw Code  │                 │    │
│   │   │   submit    │    │   code      │    │ - Timestamp │                 │    │
│   │   │   click     │    │ - Error     │    │ - Result    │                 │    │
│   │   │ - Capture   │    │   details   │    │ - Problem   │                 │    │
│   │   │   all       │    │ - Test case │    │   metadata  │                 │    │
│   │   └─────────────┘    └─────────────┘    └──────┬──────┘                 │    │
│   │                                                 │                        │    │
│   └─────────────────────────────────────────────────┼────────────────────────┘    │
│                                                     │                             │
│                                          [Stores to IndexedDB]                    │
│                                                     │                             │
│   ┌─────────────────────────────────────────────────┼────────────────────────┐    │
│   │                        NIGHTTIME: DIGEST ENGINE                          │    │
│   │                        (Triggered by chrome.alarms)                      │    │
│   │                                                 ▼                        │    │
│   │   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                 │    │
│   │   │ Day Log     │───▶│ Pattern     │───▶│ Skill DNA   │                 │    │
│   │   │ Harvester   │    │ Extractor   │    │ Updater     │                 │    │
│   │   │             │    │             │    │             │                 │    │
│   │   │ - Read all  │    │ - Gemini 3  │    │ - Update    │                 │    │
│   │   │   attempts  │    │   1M token  │    │   scores    │                 │    │
│   │   │ - Group by  │    │   context   │    │ - Trend     │                 │    │
│   │   │   problem   │    │ - Compare   │    │   analysis  │                 │    │
│   │   │             │    │   attempts  │    │             │                 │    │
│   │   └─────────────┘    └──────┬──────┘    └──────┬──────┘                 │    │
│   │                             │                  │                        │    │
│   │                             ▼                  ▼                        │    │
│   │                      ┌─────────────┐    ┌─────────────┐                 │    │
│   │                      │ Insight     │    │ Drill       │                 │    │
│   │                      │ Compressor  │    │ Generator   │                 │    │
│   │                      │             │    │             │                 │    │
│   │                      │ - Recursive │    │ - Micro     │                 │    │
│   │                      │   summary   │    │   drills    │                 │    │
│   │                      │ - Atomic    │    │ - Validated │                 │    │
│   │                      │   insights  │    │   by MCP    │                 │    │
│   │                      └──────┬──────┘    └──────┬──────┘                 │    │
│   │                             │                  │                        │    │
│   └─────────────────────────────┼──────────────────┼────────────────────────┘    │
│                                 │                  │                             │
│                                 ▼                  ▼                             │
│   ┌─────────────────────────────────────────────────────────────────────────┐    │
│   │                        MORNING: PROACTIVE INJECTION                      │    │
│   │                        (User-Facing UI)                                  │    │
│   │                                                                          │    │
│   │   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                 │    │
│   │   │ Morning     │    │ Skill DNA   │    │ Drill       │                 │    │
│   │   │ Greeting    │    │ Node Map    │    │ Challenges  │                 │    │
│   │   │             │    │             │    │             │                 │    │
│   │   │ "Yesterday  │    │ Visual      │    │ "Fill in    │                 │    │
│   │   │  you did X, │    │ node-graph  │    │  the blank" │                 │    │
│   │   │  today..."  │    │ of skills   │    │  micro-quiz │                 │    │
│   │   └─────────────┘    └─────────────┘    └─────────────┘                 │    │
│   │                                                                          │    │
│   └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Component Deep-Dive

### 2.1. Shadow Logger (Daytime Data Collection)

**Purpose:** Silently capture every submission (pass or fail) without interrupting the user's workflow or consuming API tokens.

**Location:** `src/content/shadow_logger.js` (NEW)

**Mechanism:**
1. **MutationObserver:** Watches for DOM changes indicating a submission result panel.
2. **Network Interception:** Uses `chrome.webRequest` or response body parsing from the existing `leetcode_api.js` polling.
3. **Code Extraction:** Reads the Monaco Editor instance (`view.getModel().getValue()`).

**Data Captured Per Submission:**
```javascript
{
  id: "uuid-v4",
  timestamp: "2026-01-30T14:35:00Z",
  problemSlug: "two-sum",
  problemTitle: "1. Two Sum",
  difficulty: "Easy",
  topics: ["Array", "Hash Table"],
  language: "python3",
  code: "def twoSum(self, nums, target): ...",
  result: "Wrong Answer",       // or "Accepted", "TLE", "RE"
  errorDetails: {
    type: "Wrong Answer",
    testInput: "[2,7,11,15], 9",
    expected: "[0,1]",
    actual: "[1,0]"
  },
  attempt: 3,                   // Which attempt this was for this problem
  sessionId: "day-2026-01-30"   // Groups all attempts from today
}
```

**Storage:** IndexedDB (via Dexie.js wrapper) in a `submissionLog` table.

**Why IndexedDB over chrome.storage.local:**
- Chrome.storage.local has a 10MB quota limit (5MB default).
- IndexedDB can store much larger datasets (typically ~50-100MB+).
- Better for structured queries (e.g., "all attempts from today").

---

### 2.2. Digest Engine (Nightly Processing)

**Purpose:** Transform raw submission logs into actionable insights and update the Skill DNA.

**Trigger:** `chrome.alarms` API scheduled daily at 10:00 PM local time (or on idle after 4 hours).

**Location:** `src/background/digest_engine.js` (NEW)

**Processing Pipeline:**

#### Step 1: Harvest Day Log
```javascript
async function harvestDayLog() {
  const today = new Date().toISOString().split('T')[0];
  const submissions = await db.submissionLog
    .where('sessionId')
    .equals(`day-${today}`)
    .toArray();
  
  // Group by problem
  return groupBy(submissions, 'problemSlug');
}
```

#### Step 2: Pattern Extraction (Gemini 3 Call)
- **Why Gemini 3 Pro with 1M context:** We can send ALL submissions from the day in a single call. No chunking, no loss of context.
- **Comparative Reasoning:** The agent sees `Attempt 1` → `Attempt 5` → `Ground Truth Fix (from MCP)` and can identify **exactly where** the user's mental model broke down.

**Prompt Structure:**
```
You are a coding skills analyst. Below is a student's full day of LeetCode work.

For each problem, you will see:
- All attempts (code + error)
- The final Verified Ground Truth (from our sandbox)

Your task:
1. Identify RECURRING PATTERNS across problems (not just within one).
2. Rate each of the 50 Micro-Skills on a 0-100 scale based on today's evidence.
3. Generate 3 "Atomic Insights" (single-sentence distillations).
4. Suggest 2 "Micro-Drills" to target the weakest skills.

--- DAY LOG ---
{JSON of all grouped submissions}
--- END ---

Output JSON:
{
  "skillUpdates": [
    { "skill": "list_slicing", "delta": -5, "reason": "..." },
    ...
  ],
  "atomicInsights": [
    "The user consistently forgets to return early when the input is empty.",
    ...
  ],
  "suggestedDrills": [
    {
      "type": "fill_in_blank",
      "prompt": "Write the guard clause for empty list input:",
      "template": "if not ___: return ___",
      "answer": "nums, []",
      "targetSkill": "edge_case_empty"
    },
    ...
  ]
}
```

#### Step 3: Skill DNA Update
- The Skill DNA is a JSON object mapping ~50 skills to confidence scores.
- After each nightly digest, we apply the `delta` values suggested by Gemini.
- We also track a **7-day rolling trend** (improving / declining / stable).

#### Step 4: Insight Compression (Recursive Summarization)
- **Problem:** Over months, the user accumulates thousands of mistakes.
- **Solution:** We don't store raw code long-term. After 7 days, we "compress" mistake records into **Atomic Insights**.
- **Example:**
  - Raw (Day 1): `Code: def twoSum... Error: IndexError at line 5`
  - Compressed (Day 8): `"User struggles with boundary checks on list access (5 occurrences)."`
- This keeps the context window manageable for future analyses.

---

### 2.3. Skill DNA (Persistent Profile)

**Purpose:** A living document of the user's coding abilities, updated nightly.

**Location:** `chrome.storage.local` under key `skillDNA`

**Schema:**
```javascript
{
  version: 2,
  lastUpdated: "2026-01-30T22:00:00Z",
  
  // 50+ Micro-Skills with scores
  skills: {
    // --- Python-Specific ---
    "py_list_slicing": { score: 72, trend: "improving", instances: 15 },
    "py_dict_access": { score: 88, trend: "stable", instances: 8 },
    "py_scope_unbound": { score: 45, trend: "declining", instances: 3 },
    
    // --- Iteration & Pointers ---
    "loop_off_by_one": { score: 30, trend: "stable", instances: 42 },
    "two_pointer_collision": { score: 65, trend: "improving", instances: 12 },
    
    // --- Graph & Trees ---
    "visited_tracking": { score: 55, trend: "stable", instances: 9 },
    "null_node_check": { score: 80, trend: "stable", instances: 6 },
    
    // --- Recursion & DP ---
    "base_case_definition": { score: 40, trend: "declining", instances: 18 },
    "memoization_application": { score: 60, trend: "improving", instances: 7 },
    
    // --- Edge Cases ---
    "edge_case_empty": { score: 25, trend: "declining", instances: 55 },
    "edge_case_single": { score: 50, trend: "stable", instances: 20 },
    
    // ... (40+ more skills)
  },
  
  // Rolling 7-day history for trend calculation
  history: [
    { date: "2026-01-29", snapshotHash: "abc123" },
    { date: "2026-01-28", snapshotHash: "def456" },
    // ...
  ],
  
  // Compressed insights (long-term memory)
  atomicInsights: [
    {
      id: "insight-001",
      created: "2026-01-25",
      text: "User consistently forgets to check for empty input before accessing index 0.",
      relatedSkills: ["edge_case_empty", "py_list_slicing"],
      occurrences: 12
    },
    // ...
  ],
  
  // Pending drills generated by the agent
  pendingDrills: [
    {
      id: "drill-001",
      generatedAt: "2026-01-30T22:00:00Z",
      type: "fill_in_blank",
      prompt: "Write the safety check for accessing `nums[i+1]`:",
      template: "if i + 1 ___ len(nums): ...",
      answer: "<",
      targetSkill: "loop_off_by_one",
      verified: true,           // MCP sandbox validated the answer
      completed: false
    },
    // ...
  ]
}
```

---

### 2.4. Drill Generator & Validator

**Purpose:** Create personalized practice challenges and verify them via the local Python sandbox.

**Types of Drills:**

| Drill Type | Description | Example |
|------------|-------------|---------|
| **Fill-in-Blank** | Complete missing syntax | `if not ___: return ___` |
| **Spot-the-Bug** | Find error in student's own code | "You wrote this at 2PM. Find the bug." |
| **Architecture Critique** | Compare O(n²) vs O(n) | "What data structure would improve this?" |
| **Muscle Memory** | Repeat stdlib syntax | "Write `collections.defaultdict(list)`" |

**Verification Flow:**
1. Agent generates a drill with a proposed `answer`.
2. Drill is sent to MCP Server (`http://localhost:8000/verify_drill`).
3. MCP runs the answer in the Python sandbox.
4. If it passes, `verified: true`. If not, agent regenerates.

---

### 2.5. Morning Injection (User-Facing)

**Purpose:** When the user opens LeetCode the next day, greet them with a personalized briefing.

**UI Components:**

1. **Morning Greeting Banner** (Content Script)
   - "Good morning! Yesterday you solved 3 problems but struggled with **edge cases**."
   - "Today's focus: **Empty Input Checks**"

2. **Skill DNA Node Map** (Popup Extension)
   - Visual graph of skills (nodes).
   - Green = Mastered (80+), Yellow = Developing (50-79), Red = Weak (<50).
   - Pulsing animation on skills that declined yesterday.

3. **Daily Drill Queue** (Popup or Sidecar)
   - Shows pending drills (e.g., 2 drills due).
   - User completes inline; answer validated in real-time.

---

## 3. Technology Selection & Justification

### 3.1. Scheduling: `chrome.alarms` API

| Alternative | Why Not Chosen |
|-------------|----------------|
| `setInterval` | Doesn't survive Service Worker termination. Chrome kills idle service workers after ~30s. |
| External Cron (Vercel) | Requires backend, adds latency, costs money. |
| Push Notifications | Requires user interaction; not truly autonomous. |

**Why `chrome.alarms`:**
- Survives Service Worker restarts.
- Can specify exact times (`when`) or periodic intervals (`periodInMinutes`).
- Free, local, no network dependency.

```javascript
// background.js
chrome.alarms.create('NIGHTLY_DIGEST', {
  when: getNextDigestTime(), // Tonight at 10 PM
  periodInMinutes: 24 * 60   // Repeat every 24 hours
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'NIGHTLY_DIGEST') {
    runDigestEngine();
  }
});
```

---

### 3.2. Storage: IndexedDB (via Dexie.js)

| Alternative | Why Not Chosen |
|-------------|----------------|
| `chrome.storage.local` | 10MB limit, no indexing, slow for bulk queries. |
| localStorage | 5MB limit, synchronous (blocks UI), no structured queries. |
| SQLite (via WebAssembly) | Overkill, bundle size, no native browser support. |

**Why IndexedDB + Dexie:**
- Native browser API, no bundle size.
- Handles 50MB+ easily.
- Dexie provides a clean Promise-based API over raw IDB.
- Supports indexing for fast queries (e.g., `where('sessionId').equals(...)`).

```javascript
import Dexie from 'dexie';

const db = new Dexie('NeuralRetentionDB');
db.version(1).stores({
  submissionLog: '++id, sessionId, problemSlug, timestamp, result',
  skillSnapshots: '++id, date, [snapshotJson]'
});
```

---

### 3.3. AI Reasoning: Gemini 3 Pro (1M Token Context)

| Alternative | Why Not Chosen |
|-------------|----------------|
| GPT-4o | 128K context, not enough for full day analysis. |
| Claude 3.5 | 200K context, still limiting for 50+ submissions. |
| Local LLM | No model has 1M context locally; would require chunking. |

**Why Gemini 3 Pro:**
- **1M Verified Context Window:** Send entire day's work in one call.
- **Comparative Reasoning:** Can see Attempt 1 vs Attempt 5 vs Ground Truth simultaneously.
- **Free Tier:** Generous 15 RPM (requests per minute) - enough for 1 nightly digest + occasional queries.
- **Hackathon Requirement:** Required use of Gemini API.

**Context Window Usage Estimate:**
- Average submission: ~500 tokens (code + error + metadata).
- 30 submissions/day: ~15,000 tokens.
- Prompt overhead: ~2,000 tokens.
- Total: ~17,000 tokens per digest (well under 1M).

---

### 3.4. Drill Verification: Local MCP Server

| Alternative | Why Not Chosen |
|-------------|----------------|
| E2B (Cloud Sandbox) | Adds latency (network), costs money at scale. |
| No Verification | AI hallucinates; drills might have wrong answers. |
| eval() in Browser | Security nightmare, Python not supported. |

**Why Local MCP Server:**
- Already implemented in this repo (`mcp-server/`).
- Zero cost, zero latency.
- Aligns with "Vibe Engineering" track (Autonomous Testing Loop).
- Drills are pre-verified before user sees them.

---

### 3.5. UI Visualization: Vanilla JS + CSS Custom Properties

| Alternative | Why Not Chosen |
|-------------|----------------|
| React | Adds 40KB+ to bundle; overkill for extension. |
| D3.js | Learning curve, bundle size, complex for node-graph. |
| Canvas API | No accessibility, harder to style. |

**Why Vanilla JS + CSS:**
- Zero bundle size.
- CSS Custom Properties for theming (matches existing dark/light themes).
- SVG for node-graph (accessible, styleable, animatable).
- Consistent with existing `llm_sidecar.js` implementation.

---

## 4. Data Models

### 4.1. Submission Log Entry

```typescript
interface SubmissionLogEntry {
  id: string;                    // UUID v4
  sessionId: string;             // "day-YYYY-MM-DD"
  timestamp: string;             // ISO 8601
  
  // Problem Info
  problemSlug: string;
  problemTitle: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  topics: string[];
  
  // Code
  language: string;              // "python3", "javascript", etc.
  code: string;                  // Full submission
  
  // Result
  result: 'Accepted' | 'Wrong Answer' | 'Time Limit Exceeded' | 'Runtime Error' | 'Memory Limit Exceeded';
  errorDetails?: {
    type: string;
    testInput: string;
    expected: string;
    actual: string;
    runtimeError?: string;       // e.g., "IndexError: list index out of range"
  };
  
  // Verification (from MCP)
  verifiedFix?: {
    code: string;
    attempts: number;
    testCount: number;
  };
  
  // Metadata
  attemptNumber: number;         // Which attempt for this problem this session
}
```

### 4.2. Skill DNA Schema
(See Section 2.3 above)

### 4.3. Drill Schema

```typescript
interface Drill {
  id: string;
  generatedAt: string;
  
  type: 'fill_in_blank' | 'spot_the_bug' | 'architecture_critique' | 'muscle_memory';
  
  // Content
  prompt: string;                // User-facing question
  template?: string;             // For fill-in-blank
  codeSnippet?: string;          // For spot-the-bug (user's own code)
  
  // Answer
  answer: string;
  answerExplanation: string;
  
  // Targeting
  targetSkill: string;           // Matches a key in skillDNA.skills
  difficulty: 1 | 2 | 3;         // 1 = easy, 3 = hard
  
  // Status
  verified: boolean;             // MCP validated the answer
  completed: boolean;
  completedAt?: string;
  userAnswer?: string;
  correct?: boolean;
}
```

---

## 5. Implementation Phases

### Phase 1: Shadow Logger (Week 1)
**Goal:** Silently capture all submissions without changing user experience.

| Task | Effort | Dependencies |
|------|--------|--------------|
| Set up Dexie.js + IndexedDB schema | 2h | None |
| Implement submit button interceptor | 3h | `leetcode_api.js` |
| Capture code from Monaco Editor | 2h | None |
| Parse submission result from API response | 3h | Existing polling logic |
| Write tests for logging accuracy | 4h | Jest + mock data |

**Pitfalls:**
- LeetCode's DOM changes frequently → Use stable selectors (data attributes).
- Monaco Editor API may change → Abstract into `code_extractor.js`.

---

### Phase 2: Digest Engine + Skill DNA (Week 2)
**Goal:** Nightly processing pipeline that updates the Skill DNA.

| Task | Effort | Dependencies |
|------|--------|--------------|
| Implement `chrome.alarms` scheduler | 2h | None |
| Create Skill DNA schema + migration | 3h | IndexedDB |
| Write Gemini 3 Pattern Extraction prompt | 4h | API Key setup |
| Implement Skill score update algorithm | 3h | None |
| Add trend calculation (7-day rolling) | 2h | None |
| Write tests for digest pipeline | 4h | Mock Gemini responses |

**Pitfalls:**
- Service Worker killed before digest completes → Use `chrome.offscreen` for long tasks.
- Gemini API rate limits → Add exponential backoff.

---

### Phase 3: Insight Compression (Week 2-3)
**Goal:** Long-term memory management via recursive summarization.

| Task | Effort | Dependencies |
|------|--------|--------------|
| Design compression prompt | 2h | None |
| Implement 7-day retention policy | 2h | IndexedDB |
| Create `atomicInsights` storage | 2h | Skill DNA schema |
| Write deduplication for similar insights | 3h | Embedding similarity |
| Write tests for compression accuracy | 3h | Mock data |

**Pitfalls:**
- Compression loses critical detail → Keep original IDs for drill-back.
- Duplicate insights accumulate → Use vector similarity threshold (0.9).

---

### Phase 4: Drill Generator (Week 3)
**Goal:** Generate and verify personalized micro-drills.

| Task | Effort | Dependencies |
|------|--------|--------------|
| Design drill generation prompt | 3h | Skill DNA |
| Implement 4 drill types (fill-in, spot-bug, etc.) | 6h | None |
| Add MCP verification endpoint | 3h | `mcp-server/` |
| Create drill rendering UI (Sidecar) | 4h | `llm_sidecar.js` |
| Implement drill completion tracking | 2h | IndexedDB |
| Write tests for drill correctness | 4h | MCP mock |

**Pitfalls:**
- AI generates unsolvable drills → MCP verification catches these.
- User cheats by viewing answer → No "show answer" button; must attempt.

---

### Phase 5: Morning Injection UI (Week 4)
**Goal:** Proactive user-facing components.

| Task | Effort | Dependencies |
|------|--------|--------------|
| Design morning greeting banner | 3h | CSS |
| Implement Skill DNA node-graph (SVG) | 6h | Vanilla JS |
| Add drill queue to popup | 3h | `popup.js` |
| Animate declining skills (pulse effect) | 2h | CSS animations |
| Write E2E tests for UI injection | 4h | Puppeteer |

**Pitfalls:**
- LeetCode redesigns → Inject into our own Sidecar, not LeetCode DOM.
- Node-graph too complex → Start with simple bar chart, iterate.

---

## 6. Pitfalls & Prevention Strategies

### 6.1. Service Worker Lifecycle Issues

**Problem:** Chrome terminates idle service workers after ~30 seconds. Long-running tasks (like Gemini API calls) may be killed mid-execution.

**Prevention:**
1. Use `chrome.offscreen` API to create a hidden document for long tasks.
2. Chunk large operations with `chrome.alarms` to resume after interruption.
3. Persist state to IndexedDB after each step (checkpoint pattern).

```javascript
// Example: Checkpoint Pattern
async function runDigestWithCheckpoints() {
  const checkpoint = await db.checkpoints.get('digest');
  
  if (!checkpoint || checkpoint.step < 1) {
    await step1_harvestLogs();
    await db.checkpoints.put({ id: 'digest', step: 1 });
  }
  
  if (checkpoint.step < 2) {
    await step2_callGemini();
    await db.checkpoints.put({ id: 'digest', step: 2 });
  }
  
  // ... continue steps
}
```

---

### 6.2. Gemini API Rate Limits

**Problem:** Free tier has 15 RPM (requests per minute) and 1M TPM (tokens per minute) limits.

**Prevention:**
1. Batch all day's data into ONE request (we're under 20K tokens typically).
2. Add exponential backoff with jitter.
3. Cache Gemini responses in IndexedDB to avoid redundant calls.

```javascript
async function callGeminiWithRetry(prompt, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await callGemini(prompt);
    } catch (e) {
      if (e.status === 429) {
        const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw e;
      }
    }
  }
}
```

---

### 6.3. AI Hallucination in Drills

**Problem:** Gemini might generate drills with incorrect answers (e.g., syntax errors, wrong logic).

**Prevention:**
1. **MCP Verification:** Every drill's `answer` is run through the Python sandbox.
2. **Template Validation:** Fill-in-blank templates are tested by substituting the answer.
3. **Regeneration Loop:** If verification fails, request a new drill (up to 3 attempts).

```javascript
async function generateVerifiedDrill(targetSkill) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const drill = await generateDrillFromGemini(targetSkill);
    const verified = await verifyDrillWithMCP(drill);
    
    if (verified) {
      return { ...drill, verified: true };
    }
  }
  
  // Fallback: Use a pre-written drill from our static bank
  return getStaticDrill(targetSkill);
}
```

---

### 6.4. IndexedDB Quota Exhaustion

**Problem:** User accumulates months of data; IndexedDB fills up.

**Prevention:**
1. **Compression Policy:** After 7 days, raw submissions are compressed into insights.
2. **Archival:** After 30 days, only skill scores are kept; raw data deleted.
3. **Quota Monitoring:** Check `navigator.storage.estimate()` and warn user at 80%.

```javascript
async function checkStorageQuota() {
  const estimate = await navigator.storage.estimate();
  const usagePercent = (estimate.usage / estimate.quota) * 100;
  
  if (usagePercent > 80) {
    console.warn('[Neural Agent] Storage at 80%. Running cleanup...');
    await cleanupOldData();
  }
}
```

---

### 6.5. LeetCode DOM Changes

**Problem:** LeetCode updates their UI; our selectors break.

**Prevention:**
1. **Inject into our own UI:** The Morning Greeting and Skill Map live in the Sidecar, not LeetCode's DOM.
2. **Fallback Selectors:** Use multiple selector strategies (class, data-attribute, XPath).
3. **Headless Tests:** Weekly automated checks against live LeetCode.

---

### 6.6. Timezone Handling

**Problem:** User travels; "10 PM" might fire at wrong time.

**Prevention:**
1. Store alarms in local time using `Intl.DateTimeFormat().resolvedOptions().timeZone`.
2. Recalculate alarm time on each browser launch.

```javascript
function getNextDigestTime() {
  const now = new Date();
  const target = new Date(now);
  target.setHours(22, 0, 0, 0); // 10 PM local
  
  if (target <= now) {
    target.setDate(target.getDate() + 1); // Tomorrow
  }
  
  return target.getTime();
}
```

---

## 7. Testing Strategy

### 7.1. Unit Tests

| Component | Test Focus |
|-----------|------------|
| `shadow_logger.js` | Correct extraction of code, error, metadata |
| `skill_dna.js` | Score updates, trend calculation, bounds (0-100) |
| `drill_generator.js` | Template validity, answer substitution |
| `insight_compressor.js` | Similarity detection, deduplication |

### 7.2. Integration Tests

| Flow | Test Focus |
|------|------------|
| Submit → Log | End-to-end capture of real submission |
| Alarm → Digest | Full pipeline with mock Gemini response |
| Drill → MCP | Verification round-trip |

### 7.3. E2E Tests (Puppeteer/Playwright)

| Scenario | Test Focus |
|----------|------------|
| User submits 5 times | All 5 logged in IndexedDB |
| Morning greeting renders | Banner appears with correct text |
| Skill map displays | Graph shows expected nodes |
| Drill completion | User answer validated correctly |

### 7.4. Chaos Tests

| Scenario | Expected Behavior |
|----------|-------------------|
| Gemini API down | Digest skips AI step; retries next night |
| MCP server offline | Drills marked `verified: false`; not shown |
| IndexedDB full | Cleanup triggered; user warned |
| Service Worker killed mid-digest | Resumes from checkpoint |

---

## 8. Hackathon Differentiators

### 8.1. Marathon Agent (✓ Direct Hit)

> "Build autonomous systems for tasks spanning hours or days."

- **Continuity:** Skill DNA persists across weeks.
- **Self-Correction:** If user improves on a skill, agent shifts focus to next weakness.
- **Long-Running:** Nightly digest is a 24-hour cycle task.

### 8.2. Vibe Engineering (✓ Direct Hit)

> "Agents that verify through autonomous testing loops."

- **MCP Verification:** Every drill answer is sandbox-tested before user sees it.
- **Ground Truth Integration:** Nightly analysis uses verified fixes as the "correct" baseline.

### 8.3. Not a Prompt Wrapper

| Disqualifying Pattern | Our Solution |
|-----------------------|--------------|
| "Single prompt solves it" | Multi-step pipeline with state |
| "Basic RAG retrieval" | Skill DNA + Trend + Compression |
| "Generic chatbot" | Personalized drills from your own code |

### 8.4. Multimodal Potential (Future)

- **Voice Drills:** Use Gemini Live API to ask drill questions aloud.
- **Code Screenshot Analysis:** User shares code image; agent analyzes without text.

---

## 9. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Skill DNA Accuracy | >80% alignment with user perception | Survey after 1 week |
| Drill Completion Rate | >60% of generated drills attempted | Analytics event tracking |
| Recurring Mistake Reduction | >30% fewer same-type errors after 2 weeks | Compare pre/post error distribution |
| User Retention | >40% return after 7 days | DAU/WAU ratio |

---

## 10. Summary

The **Neural Retention Agent** transforms this extension from a simple SRS tracker into a **truly autonomous AI mentor**. By implementing:

1. **Shadow Logging** for passive data collection
2. **Nightly Digest** for pattern extraction
3. **Skill DNA** for long-term memory
4. **Verified Drills** for targeted practice

...we directly address the Gemini 3 Hackathon's "Marathon Agent" and "Vibe Engineering" tracks while avoiding all disqualifying patterns.

**Estimated Total Effort:** ~80-100 hours across 4 weeks.

**Recommended First Step:** Implement the Shadow Logger (Phase 1) to start collecting data immediately.

---

*Document Version: 1.0*  
*Created: 2026-01-30*  
*Author: Neural Retention Agent Design Team*
