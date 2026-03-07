# LeetCode EasyRepeat - AI Mistake Analysis Architecture

## Overview

This document outlines the **Hybrid Architecture** for enhancing LeetCode EasyRepeat:

### Current Phase (Extension-Only)
1. **Question Topics** - Auto-fetched from LeetCode API
2. **Wrong Submission Capture** - Deduplicated, AI-summarized mistakes
3. **AI Mistake Classification** - Fixed taxonomy with 1-sentence summaries
4. **Weakness Visualization** - Topic-based and mistake-type graphs
5. **User-Provided AI Keys** - Gemini/OpenAI API keys stored locally

### Future Phase (Backend + Web Dashboard)
6. **Cloud Sync** - Cross-device synchronization
7. **Web Dashboard** - Rich analytics and visualizations
8. **Managed AI** - Backend handles AI calls (LangChain)
9. **Paid Tier** - Subscription for cloud features

**Key Principle**: Design data models and abstractions NOW that make backend integration seamless LATER.

---

## 1. Mistake Taxonomy (Fixed Categories)

### 1.1 Error Type Categories

```
MISTAKE_CAPTURE_MODE = "manual" // Default to manual/opt-in. User can enable "auto-analyze" in settings.
MISTAKE_TAXONOMY = {
  // Algorithm & Data Structure Mistakes
  "wrong-algorithm": "Used incorrect algorithm for the problem type",
  "suboptimal-complexity": "Solution works but exceeds time/space limits",
  "wrong-data-structure": "Used inappropriate data structure",
  
  // Logic Errors
  "off-by-one": "Index or boundary off by one",
  "wrong-condition": "Incorrect if/while condition logic",
  "wrong-operator": "Used wrong comparison or arithmetic operator",
  "infinite-loop": "Loop never terminates",
  "early-return": "Returned too early, missing cases",
  
  // Edge Cases
  "empty-input": "Failed to handle empty array/string/null",
  "single-element": "Failed to handle single element case",
  "duplicate-values": "Failed to handle duplicate elements",
  "negative-numbers": "Failed to handle negative values",
  "overflow": "Integer overflow not handled",
  "large-input": "Failed on large input size",
  
  // Syntax & Language
  "syntax-error": "Language syntax mistake",
  "type-error": "Wrong type usage or conversion",
  "null-reference": "Null/undefined reference access",
  
  // Problem Understanding
  "misread-problem": "Misunderstood problem requirements",
  "wrong-output-format": "Correct logic but wrong output format"
}
```

### 1.2 Topic Categories (from LeetCode)

Topics will be fetched automatically. Common ones include:
- Array, String, Hash Table, Two Pointers, Sliding Window
- Linked List, Stack, Queue, Tree, Graph
- Dynamic Programming, Greedy, Backtracking
- Binary Search, Sorting, Heap
- Math, Bit Manipulation, Design

---

## 2. Data Model Changes

### 2.1 Enhanced Problem Schema

```javascript
{
  problems: {
    "two-sum": {
      // Existing fields
      title: "1. Two Sum",
      slug: "two-sum",
      difficulty: "Easy",
      interval: 6,
      repetition: 2,
      easeFactor: 2.5,
      nextReviewDate: "2026-01-25T...",
      lastSolved: "2026-01-20T...",
      notes: "User notes...",
      history: [...],
      
      // NEW: Topics (auto-fetched)
      topics: ["Array", "Hash Table"],
      
      // NEW: Mistake Analysis
      mistakes: [
        {
          id: "m1",
          date: "2026-01-20T10:30:00Z",
          type: "off-by-one",           // From taxonomy
          summary: "Loop ended at i < n-1 instead of i < n, missing last element",
          submissionId: "123456789",    // LeetCode submission ID (optional)
          errorType: "Wrong Answer",    // LeetCode error type
          testCase: "Input: [1,2,3], Expected: 6, Got: 3"  // Optional
        },
        {
          id: "m2", 
          date: "2026-01-20T10:35:00Z",
          type: "empty-input",
          summary: "Did not check for empty array before accessing index 0",
          errorType: "Runtime Error"
        }
      ],
      
      // NEW: Aggregated Stats (computed)
      mistakeStats: {
        totalAttempts: 5,
        uniqueMistakeTypes: ["off-by-one", "empty-input"],
        lastAnalyzed: "2026-01-20T..."
      }
    }
  },
  
  // NEW: Global Settings
  settings: {
    aiProvider: "gemini",           // "gemini" | "openai" | "local" | "backend"
    aiApiKey: "encrypted_key...",   // User's API key (encrypted)
    aiModel: "gemini-1.5-flash",    // Model selection
    autoAnalyze: true,              // Auto-analyze on wrong submission
    theme: "sakura"
  },
  
  // NEW: Global Analytics (computed periodically)
  analytics: {
    weakTopics: [
      { topic: "Dynamic Programming", errorRate: 0.45, totalProblems: 20 },
      { topic: "Graph", errorRate: 0.38, totalProblems: 15 }
    ],
    commonMistakes: [
      { type: "off-by-one", count: 23, percentage: 0.18 },
      { type: "edge-case-empty", count: 19, percentage: 0.15 }
    ],
    lastUpdated: "2026-01-20T..."
  }
}
```

### 2.2 Deduplication Logic

When a new wrong submission comes in:

```javascript
async function shouldRecordMistake(problemSlug, newMistake) {
  const existing = problems[problemSlug].mistakes || [];
  
  // Check if same mistake type already recorded for this problem
  const duplicate = existing.find(m => 
    m.type === newMistake.type && 
    similarSummary(m.summary, newMistake.summary)
  );
  
  if (duplicate) {
    // Just increment attempt count, dont store again
    return false;
  }
  
  return true;
}

function similarSummary(a, b) {
  // Simple similarity check - could use embeddings later
  // For now: if >70% word overlap, consider similar
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = [...wordsA].filter(w => wordsB.has(w));
  return intersection.length / Math.max(wordsA.size, wordsB.size) > 0.7;
}
```

---

## 3. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CHROME EXTENSION                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                     CONTENT SCRIPTS (leetcode.com)                    │   │
│  │                                                                       │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │ leetcode_   │  │ leetcode_   │  │ submission_ │  │ content_    │  │   │
│  │  │ dom.js      │  │ api.js      │  │ capture.js  │  │ ui.js       │  │   │
│  │  │             │  │             │  │   [NEW]     │  │             │  │   │
│  │  │ - Extract   │  │ - Poll API  │  │ - Capture   │  │ - Toasts    │  │   │
│  │  │   title     │  │ - Check     │  │   ALL subs  │  │ - Modals    │  │   │
│  │  │ - Extract   │  │   status    │  │ - Get code  │  │ - Notes     │  │   │
│  │  │   topics    │  │ - Fetch     │  │ - Get error │  │             │  │   │
│  │  │   [NEW]     │  │   topics    │  │   details   │  │             │  │   │
│  │  └─────────────┘  └─────────────┘  └──────┬──────┘  └─────────────┘  │   │
│  │                                           │                           │   │
│  └───────────────────────────────────────────┼───────────────────────────┘   │
│                                              │                               │
│                                              ▼                               │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         AI ANALYSIS LAYER [NEW]                       │   │
│  │                                                                       │   │
│  │  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐   │   │
│  │  │ ai_service.js   │    │ ai_prompts.js   │    │ ai_providers/   │   │   │
│  │  │                 │    │                 │    │                 │   │   │
│  │  │ - Analyze       │    │ - Mistake       │    │ - gemini.js     │   │   │
│  │  │   submission    │    │   classification│    │ - openai.js     │   │   │
│  │  │ - Deduplicate   │    │   prompt        │    │ - local.js      │   │   │
│  │  │ - Summarize     │    │ - Summary       │    │ - backend.js    │   │   │
│  │  │                 │    │   prompt        │    │   [future]      │   │   │
│  │  └────────┬────────┘    └─────────────────┘    └────────┬────────┘   │   │
│  │           │                                             │            │   │
│  └───────────┼─────────────────────────────────────────────┼────────────┘   │
│              │                                             │                 │
│              ▼                                             ▼                 │
│  ┌──────────────────────┐                    ┌──────────────────────────┐   │
│  │   STORAGE LAYER      │                    │   EXTERNAL AI APIS       │   │
│  │                      │                    │                          │   │
│  │  ┌────────────────┐  │                    │  ┌────────────────────┐  │   │
│  │  │ storage.js     │  │                    │  │ Gemini API         │  │   │
│  │  │ - problems     │  │                    │  │ (user API key)     │  │   │
│  │  │ - mistakes     │  │                    │  └────────────────────┘  │   │
│  │  │ - analytics    │  │                    │  ┌────────────────────┐  │   │
│  │  │ - settings     │  │                    │  │ OpenAI API         │  │   │
│  │  └────────────────┘  │                    │  │ (user API key)     │  │   │
│  │         │            │                    │  └────────────────────┘  │   │
│  │         ▼            │                    │  ┌────────────────────┐  │   │
│  │  ┌────────────────┐  │                    │  │ Local LLM          │  │   │
│  │  │ Chrome Storage │  │                    │  │ (Ollama endpoint)  │  │   │
│  │  │ Local          │  │                    │  └────────────────────┘  │   │
│  │  └────────────────┘  │                    │                          │   │
│  └──────────────────────┘                    └──────────────────────────┘   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         POPUP UI                                      │   │
│  │                                                                       │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │ Dashboard   │  │ Analytics   │  │ Settings    │  │ Mistakes    │  │   │
│  │  │ (existing)  │  │ View [NEW]  │  │ [NEW]       │  │ View [NEW]  │  │   │
│  │  │             │  │             │  │             │  │             │  │   │
│  │  │ - Due cards │  │ - Weak      │  │ - API key   │  │ - Per-prob  │  │   │
│  │  │ - SRS       │  │   topics    │  │ - Provider  │  │   mistakes  │  │   │
│  │  │   ratings   │  │   chart     │  │ - Auto-     │  │ - Global    │  │   │
│  │  │             │  │ - Common    │  │   analyze   │  │   patterns  │  │   │
│  │  │             │  │   mistakes  │  │   toggle    │  │             │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│  │                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

                                    │
                                    │ FUTURE: Cloud Sync
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FUTURE: BACKEND SERVICE                              │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │ Auth Service    │  │ Sync Service    │  │ AI Service      │              │
│  │ (OAuth/Email)   │  │ (Cross-device)  │  │ (Managed API)   │              │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘              │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────┐            │
│  │                    Database (PostgreSQL/MongoDB)             │            │
│  │  - User accounts                                             │            │
│  │  - Synced problems & mistakes                                │            │
│  │  - Subscription status                                       │            │
│  └─────────────────────────────────────────────────────────────┘            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. New File Structure

```
leetcode-srs-extension/
├── manifest.json                    # Updated with new permissions
├── src/
│   ├── algorithms/
│   │   ├── srs_logic.js
│   │   └── fsrs_logic.js
│   │
│   ├── content/
│   │   ├── content.js
│   │   ├── content_ui.js
│   │   ├── leetcode_api.js          # Enhanced: fetch topics
│   │   ├── leetcode_dom.js
│   │   └── submission_capture.js    # [NEW] Capture all submissions
│   │
│   ├── ai/                          # [NEW] AI Analysis Module
│   │   ├── ai_service.js            # Main orchestrator
│   │   ├── ai_prompts.js            # Prompt templates
│   │   ├── mistake_taxonomy.js      # Fixed categories
│   │   └── providers/
│   │       ├── gemini.js
│   │       ├── openai.js
│   │       └── local.js             # Ollama integration
│   │
│   ├── popup/
│   │   ├── popup.html               # Updated with new tabs
│   │   ├── popup.js
│   │   ├── popup_ui.js
│   │   ├── analytics_view.js        # [NEW] Charts & graphs
│   │   ├── mistakes_view.js         # [NEW] Mistake browser
│   │   └── settings_view.js         # [NEW] API key config
│   │
│   └── shared/
│       ├── config.js
│       ├── storage.js               # Enhanced schema
│       └── analytics.js             # [NEW] Compute weak topics
│
└── tests/
    ├── ai_service.test.js           # [NEW]
    ├── submission_capture.test.js   # [NEW]
    └── ...existing tests...
```

---

## 5. AI Prompt Design

### 5.1 Mistake Classification Prompt

```javascript
const CLASSIFY_MISTAKE_PROMPT = `
You are analyzing a failed LeetCode submission. Classify the mistake and provide a 1-sentence summary.

PROBLEM: {problemTitle}
TOPICS: {topics}
ERROR TYPE: {errorType} (e.g., Wrong Answer, Time Limit Exceeded, Runtime Error)
TEST CASE: {testCase}
USER CODE:
\`\`\`{language}
{code}
\`\`\`

MISTAKE CATEGORIES (choose exactly one):
- wrong-algorithm: Used incorrect algorithm for the problem type
- suboptimal-complexity: Solution works but exceeds time/space limits
- wrong-data-structure: Used inappropriate data structure
- off-by-one: Index or boundary off by one
- wrong-condition: Incorrect if/while condition logic
- wrong-operator: Used wrong comparison or arithmetic operator
- infinite-loop: Loop never terminates
- early-return: Returned too early, missing cases
- empty-input: Failed to handle empty array/string/null
- single-element: Failed to handle single element case
- duplicate-values: Failed to handle duplicate elements
- negative-numbers: Failed to handle negative values
- overflow: Integer overflow not handled
- large-input: Failed on large input size
- syntax-error: Language syntax mistake
- type-error: Wrong type usage or conversion
- null-reference: Null/undefined reference access
- misread-problem: Misunderstood problem requirements
- wrong-output-format: Correct logic but wrong output format

Respond in JSON format:
{
  "mistakeType": "category-slug",
  "summary": "One sentence explaining the specific mistake",
  "confidence": 0.0-1.0
}
`;
```

### 5.2 Deduplication Check Prompt

```javascript
const CHECK_DUPLICATE_PROMPT = `
Are these two mistakes essentially the same issue?

MISTAKE 1:
Type: {type1}
Summary: {summary1}

MISTAKE 2:
Type: {type2}
Summary: {summary2}

Respond with just "YES" or "NO".
`;
```

---

## 6. Submission Capture Flow

```mermaid
sequenceDiagram
    participant User
    participant LeetCode
    participant ContentScript
    participant AIService
    participant Storage

    User->>LeetCode: Click Submit
    LeetCode->>ContentScript: Submission detected
    ContentScript->>LeetCode: Poll /submissions/detail/ID/check/
    LeetCode-->>ContentScript: Result: Wrong Answer
    
    ContentScript->>ContentScript: Extract code & error details
    ContentScript->>AIService: Analyze mistake
    AIService->>AIService: Call AI provider
    AIService-->>ContentScript: mistakeType + summary
    
    ContentScript->>Storage: Check for duplicate
    alt New unique mistake
        Storage-->>ContentScript: Not duplicate
        ContentScript->>Storage: Save mistake
        ContentScript->>User: Show toast with mistake type
    else Duplicate mistake
        Storage-->>ContentScript: Already recorded
        ContentScript->>Storage: Increment attempt count
        ContentScript->>User: Show brief toast
    end
```

---

## 7. Analytics Computation

### 7.1 Weak Topics Algorithm

```javascript
function computeWeakTopics(problems) {
  const topicStats = {};
  
  for (const problem of Object.values(problems)) {
    for (const topic of problem.topics || []) {
      if (!topicStats[topic]) {
        topicStats[topic] = { total: 0, withMistakes: 0, mistakeCount: 0 };
      }
      
      topicStats[topic].total++;
      
      if (problem.mistakes && problem.mistakes.length > 0) {
        topicStats[topic].withMistakes++;
        topicStats[topic].mistakeCount += problem.mistakes.length;
      }
    }
  }
  
  // Calculate error rate and sort
  return Object.entries(topicStats)
    .map(([topic, stats]) => ({
      topic,
      errorRate: stats.withMistakes / stats.total,
      avgMistakes: stats.mistakeCount / stats.total,
      totalProblems: stats.total
    }))
    .filter(t => t.totalProblems >= 3)  // Minimum sample size
    .sort((a, b) => b.errorRate - a.errorRate);
}
```

### 7.2 Common Mistakes Algorithm

```javascript
function computeCommonMistakes(problems) {
  const mistakeCounts = {};
  let totalMistakes = 0;
  
  for (const problem of Object.values(problems)) {
    for (const mistake of problem.mistakes || []) {
      mistakeCounts[mistake.type] = (mistakeCounts[mistake.type] || 0) + 1;
      totalMistakes++;
    }
  }
  
  return Object.entries(mistakeCounts)
    .map(([type, count]) => ({
      type,
      count,
      percentage: count / totalMistakes
    }))
    .sort((a, b) => b.count - a.count);
}
```

---

## 8. Settings UI Mockup

```
┌─────────────────────────────────────────────────────────┐
│  ⚙️ SETTINGS                                            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  AI PROVIDER                                            │
│  ┌─────────────────────────────────────────────────┐   │
│  │ ○ Gemini (Recommended)                          │   │
│  │ ○ OpenAI                                        │   │
│  │ ○ Local LLM (Ollama)                            │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  API KEY                                                │
│  ┌─────────────────────────────────────────────────┐   │
│  │ ••••••••••••••••••••••••••••••••                │   │
│  └─────────────────────────────────────────────────┘   │
│  [Test Connection]                                      │
│                                                         │
│  ☑ Auto-analyze wrong submissions                      │
│  ☐ Show detailed error toasts                          │
│                                                         │
│  [Save Settings]                                        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 9. Implementation Phases

### Phase 1: Foundation (Current Sprint)
- [ ] Add topics fetching to leetcode_api.js
- [ ] Create submission_capture.js for wrong submissions
- [ ] Create mistake_taxonomy.js with fixed categories
- [ ] Update storage schema
- [ ] Basic settings UI for API key

### Phase 2: AI Integration
- [ ] Create ai_service.js orchestrator
- [ ] Implement Gemini provider
- [ ] Implement OpenAI provider
- [ ] Add deduplication logic
- [ ] Mistake classification prompts

### Phase 3: Analytics & Visualization
- [ ] Compute weak topics
- [ ] Compute common mistakes
- [ ] Analytics view in popup
- [ ] Mistakes browser view
- [ ] Charts/graphs (simple bar charts)

### Phase 4: Polish & Local LLM
- [ ] Local LLM (Ollama) support
- [ ] Export/import data
- [ ] Improved visualizations
- [ ] Performance optimization

### Phase 5: Future - Backend & Sync
- [ ] Backend service design
- [ ] User authentication
- [ ] Cross-device sync
- [ ] Mobile app / web dashboard

---

## 10. Sync-Ready Design Patterns

These patterns ensure the extension can seamlessly integrate with a backend later.

### 10.1 Data Model with Sync Metadata

Every record includes fields for future sync:

```javascript
{
  problems: {
    "two-sum": {
      // ... existing fields ...
      
      // SYNC METADATA (added now, used later)
      _id: "uuid-v4-generated",      // Unique ID for sync
      _createdAt: "2026-01-20T...",   // When first created
      _updatedAt: "2026-01-20T...",   // Last modification
      _syncedAt: null,                // Last synced to backend (null = never)
      _deleted: false,                // Soft delete for sync
      _version: 1                     // Optimistic locking
    }
  }
}
```

### 10.2 Storage Abstraction Layer

Create a storage interface that can swap between local and cloud:

```javascript
// src/shared/data_layer.js

class DataLayer {
  constructor(backend = 'local') {
    this.backend = backend;
  }
  
  async getProblems() {
    if (this.backend === 'local') {
      return chrome.storage.local.get({ problems: {} });
    } else {
      // Future: fetch from API
      return this.api.get('/problems');
    }
  }
  
  async saveProblem(problem) {
    // Add sync metadata
    problem._updatedAt = new Date().toISOString();
    problem._version = (problem._version || 0) + 1;
    
    if (this.backend === 'local') {
      // Save locally
      const { problems } = await chrome.storage.local.get({ problems: {} });
      problems[problem.slug] = problem;
      await chrome.storage.local.set({ problems });
      
      // Queue for future sync
      await this.queueForSync(problem);
    } else {
      // Future: save to API
      await this.api.put(`/problems/${problem.slug}`, problem);
    }
  }
  
  async queueForSync(record) {
    // Store in a sync queue for when backend is available
    const { syncQueue } = await chrome.storage.local.get({ syncQueue: [] });
    syncQueue.push({
      type: 'problem',
      action: 'upsert',
      data: record,
      queuedAt: new Date().toISOString()
    });
    await chrome.storage.local.set({ syncQueue });
  }
}
```

### 10.3 AI Service Abstraction

Design AI service to easily switch between local API calls and backend:

```javascript
// src/ai/ai_service.js

class AIService {
  constructor(config) {
    this.mode = config.mode; // 'local-api' | 'backend'
    this.provider = config.provider; // 'gemini' | 'openai' | 'local'
  }
  
  async analyzeMistake(submission) {
    if (this.mode === 'backend') {
      // Future: send to our backend, which uses LangChain
      return this.backendAnalyze(submission);
    } else {
      // Current: call AI API directly from extension
      return this.localAnalyze(submission);
    }
  }
  
  async localAnalyze(submission) {
    const provider = this.getProvider();
    const prompt = buildMistakePrompt(submission);
    return provider.complete(prompt);
  }
  
  async backendAnalyze(submission) {
    // Future implementation
    const response = await fetch('https://api.yourservice.com/analyze', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.authToken}` },
      body: JSON.stringify(submission)
    });
    return response.json();
  }
}
```

---

## 11. Future Backend Architecture

When ready to add backend, here's the recommended stack:

### 11.1 Tech Stack

```
┌─────────────────────────────────────────────────────────────┐
│                    RECOMMENDED STACK                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  FRAMEWORK:     Next.js 14+ (App Router)                    │
│                 - API routes for backend                     │
│                 - React for web dashboard                    │
│                 - Same repo, easy deployment                 │
│                                                              │
│  DATABASE:      Supabase (PostgreSQL)                       │
│                 - Built-in auth                              │
│                 - Real-time subscriptions                    │
│                 - Row-level security                         │
│                 - Free tier generous                         │
│                                                              │
│  AI:            LangChain.js on server                      │
│                 - Provider abstraction                       │
│                 - Prompt templates                           │
│                 - Future: RAG for personalized tips          │
│                                                              │
│  AUTH:          Supabase Auth OR Clerk                      │
│                 - OAuth (Google, GitHub)                     │
│                 - Magic links                                │
│                                                              │
│  HOSTING:       Vercel                                      │
│                 - Free tier for hobby                        │
│                 - Auto-scaling                               │
│                 - Edge functions                             │
│                                                              │
│  PAYMENTS:      Stripe                                      │
│                 - Subscriptions                              │
│                 - Usage-based billing option                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 11.2 Database Schema (Future)

```sql
-- Users table (managed by Supabase Auth)
-- Supabase creates auth.users automatically

-- User profiles
CREATE TABLE profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  email TEXT,
  subscription_tier TEXT DEFAULT 'free', -- 'free' | 'pro' | 'team'
  subscription_expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Problems (synced from extension)
CREATE TABLE problems (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  slug TEXT NOT NULL,
  title TEXT,
  difficulty TEXT,
  topics TEXT[],
  interval INTEGER,
  repetition INTEGER,
  ease_factor DECIMAL,
  next_review_date TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, slug)
);

-- Mistakes
CREATE TABLE mistakes (
  id UUID PRIMARY KEY,
  problem_id UUID REFERENCES problems(id),
  user_id UUID REFERENCES profiles(id),
  type TEXT NOT NULL,
  summary TEXT,
  error_type TEXT,
  test_case TEXT,
  code_snippet TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Analytics (computed periodically)
CREATE TABLE user_analytics (
  user_id UUID REFERENCES profiles(id) PRIMARY KEY,
  weak_topics JSONB,
  common_mistakes JSONB,
  computed_at TIMESTAMP DEFAULT NOW()
);
```

### 11.3 API Endpoints (Future)

```
POST   /api/auth/login          - OAuth login
POST   /api/auth/logout         - Logout

GET    /api/problems            - List user's problems
POST   /api/problems/sync       - Bulk sync from extension
GET    /api/problems/:slug      - Get single problem
PUT    /api/problems/:slug      - Update problem

## 3. **The "Safe Observer" Layer (New - SOTA)**
To prevent AI hallucinations (like the "Operand Swap" error), we will implement a **Runtime Verification Layer**.

### Technology Stack
*   **Protocol:** [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
    *   Standardizes how the AI Agent communicates with the execution environment.
*   **Sandbox:** [E2B](https://e2b.dev/) (Code Interpreter SDK)
    *   **Why:** Uses Firecracker microVMs for millisecond-startup, hardware-level isolation. Safer than local Docker for running untrusted AI-generated code.
    *   **Alternative (Local):** `docker` or `gvisor` if cloud connectivity is restricted.

### Workflow
1.  **Capture:** Extension captures User Code + Failing Test Case.
2.  **Delegate:** AI Agent calls the `verify_solution` tool on the MCP Server.
3.  **Execute:**
    *   MCP Server spins up an E2B Sandbox.
    *   Injects a "Probe Script" (wraps user code with print statements/logging).
    *   Runs the code against the specific test input.
4.  **Observe:**
    *   Sandbox returns `stdout`, `stderr`, and return values.
    *   **Example Log:** `Step 1: stack=['4'], token='13'. Step 2: Op '/' -> 13/5 = 2`.
5.  **Critique:** AI compares *actual logs* vs. *expected logic*.

## 4. UI/UX Flow
1.  **User fails a problem.**
2.  **"Analyze Mistake" button appears.**
3.  **Status Indicator:** "Verifying execution path..." (shows progress bar).
4.  **Result:**
    *   **Mistake Type:** "Runtime Error" / "Logic Error".
    *   **Evidence:** "Your code calculated `2`, but expected `4`."
    *   **Fix:** Suggested code change.

## 5. Implementation Roadmap
1.  **Phase 1 (Frontend):** Build the "Mistake Analysis" UI in the Sidecar (React).
2.  **Phase 2 (MCP Server):** Build a simple Python MCP server with `fastmcp`.
3.  **Phase 3 (Integration):** Connect the Extension's Sidecar to the MCP Server.

GET    /api/analytics           - Get computed analytics
POST   /api/analytics/refresh   - Recompute analytics

GET    /api/subscription        - Get subscription status
POST   /api/subscription/create - Create Stripe checkout
POST   /api/webhooks/stripe     - Stripe webhook handler
```

---

## 12. Action Era Migration Plan (Agentic Orchestration)

This plan upgrades the project from "analysis on demand" to an **autonomous, multi-step orchestrator** that plans, executes, verifies, and adapts over time. It stays compatible with a Chrome Extension first, and leaves a clean path to a backend agent later.

### 12.1 Action Era Goals (Mapping to Hackathon Guidance)

- **Not just a prompt wrapper**: multi-step flows with tool usage, persistence, and verification loops.
- **Long-running tasks**: the agent maintains a plan across days using stored state.
- **Evidence and verification**: the agent produces artifacts (tests, metrics, logs) and updates decisions based on results.
- **Multimodal readiness**: can ingest code, error logs, and (optionally) screenshots or UI states.

### 12.2 Constraints (Chrome Extension Reality Check)

- MV3 service worker is ephemeral; long-running work must be **scheduled** and **stateful**.
- Content scripts run only on matching pages; they cannot arbitrarily operate in the background.
- Chrome Web Store forbids remote executable code; all logic must ship in the extension.
- Heavy compute should be offloaded to a **local model server** or **remote API** (user-provided key).

### 12.3 Core Agent Architecture (Extension-First)

Add these modules (names are illustrative):

```
src/agent/
├── action_orchestrator.js    # Core planner/executor
├── action_queue.js           # Persistent queue (chrome.storage)
├── action_policy.js          # Safety + gating rules
├── action_tools.js           # Tool adapters (LLM, DOM, API, storage)
├── action_memory.js          # Long-term memory + summaries
└── action_metrics.js         # Evidence + evaluation
```

**Key runtime loops:**
- **Planner**: builds a plan from recent mistakes, weak topics, and recency.
- **Executor**: runs tools to generate drills, tests, and summaries.
- **Verifier**: re-checks results against expected outcomes and updates confidence.
- **Scheduler**: uses `chrome.alarms` to trigger daily/weekly tasks.

### 12.4 Thought Signatures + Thinking Levels (Action Era Alignment)

Do NOT expose chain-of-thought. Instead, store **structured artifacts**:

```
thought_signature = {
  taskId,
  thinkingLevel: "quick" | "deep" | "verify",
  evidence: [ "test-case-1", "error-log-1", "pass-rate-0.67" ],
  decision: "classify: off-by-one",
  confidence: 0.82
}
```

- **quick** = heuristic or small local model
- **deep** = large model or multi-step reasoning
- **verify** = test results or rule-based validation

### 12.5 Action Flows (Concrete, Multi-Step)

#### Flow A: Wrong Submission -> Self-Improving Diagnosis
1. Capture submission metadata and minimal code snippet.
2. Check dedupe fingerprint (skip if known).
3. Run **local heuristic classifier** first.
4. If low confidence, call LLM for classification.
5. Generate **test case** that exposes the bug.
6. Store a **mistake profile** (global, deduped).
7. Add to weekly plan with higher priority if repeated.

#### Flow B: Weekly Weakness Autopilot
1. Read all mistake profiles + topic stats.
2. Rank top 3 weaknesses by weight.
3. Generate a drill plan: 2-3 mini tasks per weakness.
4. Schedule reminders + create UI prompts.
5. After user solves new problems, recompute and adjust.

#### Flow C: Strength Graph + Reinforcement
1. Compute strength by topic (SRS interval + accuracy).
2. Highlight top strengths and suggested next topics.
3. Use strengths to reduce redundant drills.

### 12.6 Tooling and Data Contracts

**Tools the agent can call (extension):**
- `leetcode_api.fetchQuestionDetails(slug)`
- `storage.saveSubmission(...)`
- `storage.saveNotes(...)`
- `analysis.classifyMistake(...)`
- `analysis.buildDrillPlan(...)`
- `analytics.computeWeakTopics(...)`
- `analytics.computeStrengthTopics(...)`

**Artifacts (persisted in storage):**
- `mistakeProfiles` (deduped, weighted)
- `mistakeEvents` (raw, optional)
- `agentPlans` (current and historical)
- `actionLogs` (for transparency)

### 12.7 Verification Loop (No Hand-Waving)

Add a strict loop so the agent "proves" value:

```
diagnose -> propose fix -> generate test -> store -> observe future success rate
```

Tracking:
- Before/after error rate per mistake type.
- Time-to-fix per mistake type.
- Drill completion ratio.

### 12.8 UX Surfaces (Action Era Presentation)

- **Action Feed**: recent agent actions with evidence (tests created, drills scheduled).
- **Plan View**: weekly plan with progress and auto-adjustments.
- **Strength/Weakness Graphs**: topic radar + mistake priority list.
- **Settings**: provider selection, local model endpoint, cost budgets.

### 12.9 Token/Cost Control Strategy

- Fingerprint dedupe first (zero-cost repeats).
- Heuristic classifier before LLM.
- Local model for classification + summarization.
- Large model only for low-confidence or complex cases.
- Strict response formats with word limits.

### 12.10 Phased Delivery (Detailed)

**Phase A: Instrumentation + Data Foundations**
- Add `mistakeProfiles` + `mistakeEvents` schema.
- Add `actionLogs` + `agentPlans` schema.
- Add dedupe fingerprints and weighting rules.

**Phase B: Agent Core (Extension-Only)**
- Implement `action_orchestrator.js` with queue + alarms.
- Implement `action_policy.js` for user consent and safety.
- Add analytics for strength/weakness ranking.

**Phase C: Verification + Evidence**
- Generate small test cases for each diagnosis.
- Track success rate by mistake type.
- Add action feed UI.

**Phase D: Local Model Option**
- Add "local-http" provider (Ollama/LM Studio).
- Settings UI for endpoint + test connection.
- Fallback to cloud provider.

**Phase E: Optional Backend Agent**
- Sync plans and mistake profiles.
- Server-side orchestration for longer tasks.
- Advanced analytics and evaluation dashboards.

### 12.11 Chrome Web Store Feasibility (Can It Run?)

**Yes, but with constraints:**
- All code must be packaged (no remote JS).
- Host permissions must be declared for any API endpoints.
- Background work is limited; use `chrome.alarms` + storage-based queues.
- Large local models cannot be bundled; use a local HTTP server or cloud APIs.
- Be transparent about data collection and user consent in the UI and privacy policy.

If you keep it **extension-first**, avoid remote code, and follow Chrome policies, it can be published. The "Action Era" goals do not conflict with Chrome Store rules; they just require careful engineering and user transparency.

### 12.12 Onboarding + Local Model Setup UX

Make local model usage self-serve and low-friction for SDE users:

- Add an **Options / Setup** page with a short 3-step guide.
- Provide a **Local HTTP** section with endpoint + server type + model name.
- Include a **Test connection** button that reports model list and latency.
- Link to a more detailed setup page from the popup (opens in a new tab).
- Show clear troubleshooting hints for CORS or server not running.

### 11.4 Extension-Backend Sync Flow

```mermaid
sequenceDiagram
    participant Ext as Chrome Extension
    participant API as Backend API
    participant DB as Database
    participant AI as LangChain AI
    
    Note over Ext: User logs in via OAuth
    Ext->>API: POST /auth/login
    API-->>Ext: JWT token
    
    Note over Ext: Periodic sync
    Ext->>Ext: Get local changes since last sync
    Ext->>API: POST /problems/sync
    API->>DB: Upsert problems
    API-->>Ext: Sync result + server changes
    Ext->>Ext: Merge server changes locally
    
    Note over Ext: Wrong submission detected
    Ext->>API: POST /analyze
    API->>AI: LangChain analysis
    AI-->>API: Mistake classification
    API->>DB: Store mistake
    API-->>Ext: Analysis result
```

---

## 12. Open Questions

1. **Code Capture**: Should we capture the user's submitted code for AI analysis? This is powerful but increases storage. Could store just the relevant snippet.

2. **Rate Limiting**: How to handle API rate limits? Queue submissions and batch analyze?

3. **Offline Mode**: What happens if AI is unavailable? Store raw submission, analyze later?

4. **Privacy**: Should we offer a "privacy mode" that never sends code to external APIs?

---

## 13. Next Steps

1. Review this architecture document
2. Discuss any changes or concerns
3. Create detailed todo list for Phase 1
4. Begin implementation in Code mode
