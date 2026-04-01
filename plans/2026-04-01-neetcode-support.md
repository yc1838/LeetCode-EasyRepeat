# NeetCode Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add NeetCode (neetcode.io) problem tracking alongside LeetCode, using DOM-based submission detection instead of API polling.

**Architecture:** A new content script `neetcode_content.js` runs on `neetcode.io/problems/*` and mirrors the LeetCode flow: it caches question details (title, difficulty, topics) from the DOM on page load, then watches for the `output-header` element to detect accepted submissions and trigger the rating modal + save. Topic tags are scraped from `details a[href*="problem-list"]` when present (NeetCode 150 problems have them); `"NeetCode"` is always appended as a source marker. Problems without tags store `["NeetCode"]` only. Storage keys are NeetCode slugs (camelCase e.g. `dynamicArray`) which don't collide with LeetCode slugs (kebab-case).

**Tech Stack:** Chrome Extension MV3, vanilla JS content script, `chrome.storage.local`, existing `saveSubmission` / `showRatingModal` / `showDuplicateSkipToast` globals from shared scripts.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/content/neetcode_content.js` | NeetCode content script: DOM scraping, caching, submission detection |
| Create | `tests/neetcode_content.test.js` | Unit tests for all pure functions in neetcode_content.js |
| Modify | `manifest.json` | Add neetcode.io to host_permissions + content_scripts |

---

## Task 1: Unit tests for pure functions (write failing tests first)

**Files:**
- Create: `tests/neetcode_content.test.js`

These functions will be extracted/exported from `neetcode_content.js` in Task 2. Write the tests first.

- [ ] **Step 1: Create the test file**

```js
// tests/neetcode_content.test.js
const {
  extractSlug,
  extractTitle,
  extractDifficulty,
  extractTopics,
  isAcceptedResult,
} = require('../src/content/neetcode_content');

describe('extractSlug', () => {
  test('returns slug from problem URL', () => {
    expect(extractSlug('/problems/dynamicArray/')).toBe('dynamicArray');
  });
  test('returns slug without trailing slash', () => {
    expect(extractSlug('/problems/twoSum')).toBe('twoSum');
  });
  test('returns slug from sub-page URL', () => {
    expect(extractSlug('/problems/dynamicArray/history')).toBe('dynamicArray');
  });
  test('returns null when not on a problem page', () => {
    expect(extractSlug('/practice')).toBeNull();
  });
  test('returns null for empty pathname', () => {
    expect(extractSlug('')).toBeNull();
  });
});

describe('extractTitle', () => {
  test('strips " - NeetCode" suffix', () => {
    expect(extractTitle('Design Dynamic Array (Resizable Array) - NeetCode')).toBe('Design Dynamic Array (Resizable Array)');
  });
  test('strips " | NeetCode" suffix', () => {
    expect(extractTitle('Two Sum | NeetCode')).toBe('Two Sum');
  });
  test('handles already-clean title', () => {
    expect(extractTitle('Two Sum')).toBe('Two Sum');
  });
  test('returns empty string for empty input', () => {
    expect(extractTitle('')).toBe('');
  });
});

describe('extractDifficulty', () => {
  function makeDoc(className, text) {
    return {
      querySelector: (selector) => {
        if (selector === '[class*="difficulty-pill"]') {
          return className ? { className, textContent: text } : null;
        }
        return null;
      }
    };
  }

  test('returns Easy from difficulty-pill element', () => {
    expect(extractDifficulty(makeDoc('difficulty-pill easy ng-star-inserted', 'Easy'))).toBe('Easy');
  });
  test('returns Medium from difficulty-pill element', () => {
    expect(extractDifficulty(makeDoc('difficulty-pill medium ng-star-inserted', 'Medium'))).toBe('Medium');
  });
  test('returns Hard from difficulty-pill element', () => {
    expect(extractDifficulty(makeDoc('difficulty-pill hard ng-star-inserted', 'Hard'))).toBe('Hard');
  });
  test('returns null when element not found', () => {
    expect(extractDifficulty(makeDoc(null, null))).toBeNull();
  });
  test('returns null when text is not a valid difficulty', () => {
    expect(extractDifficulty(makeDoc('difficulty-pill', 'Unknown'))).toBeNull();
  });
});

describe('extractTopics', () => {
  function makeDoc(links) {
    return {
      querySelectorAll: (selector) => {
        if (selector === 'details a[href*="problem-list"]') {
          return links.map(text => ({ textContent: text }));
        }
        return [];
      }
    };
  }

  test('returns topic tags plus NeetCode for NeetCode 150 problem', () => {
    expect(extractTopics(makeDoc(['Array', 'Hash Table']))).toEqual(['Array', 'Hash Table', 'NeetCode']);
  });
  test('returns ["NeetCode"] only when no topic links found', () => {
    expect(extractTopics(makeDoc([]))).toEqual(['NeetCode']);
  });
  test('filters out empty strings from topic links', () => {
    expect(extractTopics(makeDoc(['Array', '  ', 'Hash Table']))).toEqual(['Array', 'Hash Table', 'NeetCode']);
  });
});

describe('isAcceptedResult', () => {
  test('returns true for Accepted text', () => {
    expect(isAcceptedResult('AcceptedPassed test cases:  12 / 12')).toBe(true);
  });
  test('returns false for Wrong Answer', () => {
    expect(isAcceptedResult('Wrong AnswerFailed test cases: 1 / 12')).toBe(false);
  });
  test('returns false for Time Limit Exceeded', () => {
    expect(isAcceptedResult('Time Limit Exceeded')).toBe(false);
  });
  test('returns false for empty string', () => {
    expect(isAcceptedResult('')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/yujingchen/code/LeetCode-Spaced-Repetition-Chrome-Extension-main
npx jest tests/neetcode_content.test.js --no-coverage 2>&1 | tail -20
```

Expected: `Cannot find module '../src/content/neetcode_content'`

---

## Task 2: Implement neetcode_content.js

**Files:**
- Create: `src/content/neetcode_content.js`

- [ ] **Step 1: Create the file with pure functions + UMD export**

```js
// src/content/neetcode_content.js
/**
 * NeetCode EasyRepeat - Content Script
 *
 * Detects accepted submissions on neetcode.io via DOM mutation observer.
 * Question details (title, difficulty) are scraped from the DOM and cached
 * to chrome.storage.local on page load.
 *
 * Topics are hardcoded as ["NeetCode"] — NeetCode problems have no topic tags,
 * and this marker doubles as a source identifier in storage.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exported = factory();
    for (const key in exported) root[key] = exported[key];
  }
}(typeof self !== 'undefined' ? self : this, function () {

  // ── Pure functions (exported for testing) ──────────────────────────────

  function extractSlug(pathname) {
    const match = (pathname || '').match(/\/problems\/([^\/]+)/);
    return match ? match[1] : null;
  }

  function extractTitle(rawTitle) {
    return (rawTitle || '').replace(/\s*[-|]\s*NeetCode\s*$/i, '').trim();
  }

  function extractDifficulty(doc) {
    const el = doc.querySelector('[class*="difficulty-pill"]');
    if (!el) return null;
    const text = el.textContent.trim();
    return ['Easy', 'Medium', 'Hard'].includes(text) ? text : null;
  }

  function extractTopics(doc) {
    const tags = Array.from(doc.querySelectorAll('details a[href*="problem-list"]'))
      .map(a => a.textContent.trim())
      .filter(Boolean);
    return tags.length > 0 ? [...tags, 'NeetCode'] : ['NeetCode'];
  }

  function isAcceptedResult(text) {
    return (text || '').includes('Accepted');
  }

  // ── Browser-only logic (not exported, not run in Node) ─────────────────

  const _isBrowser = typeof window !== 'undefined' && typeof chrome !== 'undefined';

  const CACHE_KEY_PREFIX = 'neetcode_q_';

  function _getDep(name) {
    if (typeof window !== 'undefined' && window[name]) return window[name];
    return undefined;
  }

  function _getCurrentSlug() {
    return extractSlug(window.location.pathname);
  }

  async function _cacheQuestionInfo() {
    const slug = _getCurrentSlug();
    if (!slug) return;

    const title = extractTitle(document.title);
    const difficulty = extractDifficulty(document);
    const topics = extractTopics(document);
    if (!title) return;

    try {
      await chrome.storage.local.set({
        [CACHE_KEY_PREFIX + slug]: { slug, title, difficulty, topics, cachedAt: Date.now() }
      });
      console.log(`[NeetCode EasyRepeat] Cached question info: ${title} (${difficulty})`);
    } catch (e) {
      console.warn('[NeetCode EasyRepeat] Failed to cache question info:', e);
    }
  }

  async function _getQuestionInfo(slug) {
    try {
      const result = await chrome.storage.local.get({ [CACHE_KEY_PREFIX + slug]: null });
      const cached = result[CACHE_KEY_PREFIX + slug];
      if (cached && cached.title) return cached;
    } catch (e) { /* fall through */ }

    // Fallback: read live from DOM (works on question page)
    return {
      slug,
      title: extractTitle(document.title),
      difficulty: extractDifficulty(document),
      topics: extractTopics(document),
    };
  }

  async function _isAlreadySavedToday(slug, difficulty) {
    try {
      if (!chrome.runtime?.id) return false;
      const result = await chrome.storage.local.get({ problems: {} });
      const problem = result.problems[slug];
      if (!problem || !problem.lastSolved) return false;
      const now = new Date();
      const last = new Date(problem.lastSolved);
      return now.getFullYear() === last.getFullYear() &&
        now.getMonth() === last.getMonth() &&
        now.getDate() === last.getDate() &&
        problem.difficulty === difficulty;
    } catch (e) {
      return false;
    }
  }

  async function _handleAccepted(slug) {
    const showRatingModal = _getDep('showRatingModal');
    const saveSubmission = _getDep('saveSubmission');
    if (!showRatingModal || !saveSubmission) {
      console.error('[NeetCode EasyRepeat] Missing dependencies: showRatingModal or saveSubmission');
      return;
    }

    const info = await _getQuestionInfo(slug);
    const title = info.title || slug;
    const difficulty = info.difficulty || 'Medium';

    if (await _isAlreadySavedToday(slug, difficulty)) {
      console.log(`[NeetCode EasyRepeat] Already saved today for ${slug}. Skipping.`);
      const showDuplicateSkipToast = _getDep('showDuplicateSkipToast');
      if (showDuplicateSkipToast) showDuplicateSkipToast(title, { slug });
      return;
    }

    const topics = info.topics || ['NeetCode'];
    const rating = await showRatingModal(title, { slug, maxRating: 4 });
    await saveSubmission(title, slug, difficulty, 'neetcode_dom', rating, topics);
    console.log(`[NeetCode EasyRepeat] Saved: ${title} (${difficulty})`);
  }

  function _startObserver(slug) {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;

          const check = (el) => {
            const cls = el.className || '';
            if (!cls.includes('output-header')) return;
            if (!isAcceptedResult(el.textContent)) return;
            observer.disconnect();
            console.log('[NeetCode EasyRepeat] Accepted submission detected via DOM.');
            _handleAccepted(slug).catch(e =>
              console.error('[NeetCode EasyRepeat] handleAccepted failed:', e)
            );
          };

          check(node);
          node.querySelectorAll?.('[class*="output-header"]').forEach(check);
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    console.log(`[NeetCode EasyRepeat] Observer started for slug="${slug}"`);
    return observer;
  }

  function _init() {
    if (!_isBrowser) return;
    if (typeof chrome === 'undefined' || !chrome.runtime?.id) return;

    const slug = _getCurrentSlug();
    if (!slug) return;

    // Cache question details immediately (works if on Question tab)
    _cacheQuestionInfo();

    // Re-cache after 2s in case Angular hasn't rendered difficulty-pill yet
    setTimeout(_cacheQuestionInfo, 2000);

    // Start watching for submission result
    _startObserver(slug);
  }

  const isTestEnv = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';
  if (!isTestEnv) {
    _init();
  }

  return { extractSlug, extractTitle, extractDifficulty, extractTopics, isAcceptedResult };
}));
```

- [ ] **Step 2: Run the tests — they should pass now**

```bash
npx jest tests/neetcode_content.test.js --no-coverage 2>&1 | tail -20
```

Expected:
```
PASS tests/neetcode_content.test.js
  extractSlug: 5 passed
  extractTitle: 4 passed
  extractDifficulty: 5 passed
  isAcceptedResult: 4 passed
```

- [ ] **Step 3: Commit**

```bash
git add src/content/neetcode_content.js tests/neetcode_content.test.js
git commit -m "feat: add NeetCode content script with DOM-based submission detection"
```

---

## Task 3: Wire up manifest.json

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: Add neetcode.io host permission**

In `manifest.json`, add `"https://neetcode.io/*"` to `host_permissions`:

```json
"host_permissions": [
    "https://leetcode.com/*",
    "https://leetcode.cn/*",
    "https://neetcode.io/*",
    "http://localhost/*",
    "http://127.0.0.1/*"
],
```

- [ ] **Step 2: Add NeetCode content script block**

Add a new entry to the `content_scripts` array (after the existing LeetCode entry):

```json
{
    "matches": [
        "https://neetcode.io/problems/*"
    ],
    "js": [
        "src/algorithms/srs_logic.js",
        "src/shared/config.js",
        "src/shared/ui_i18n.js",
        "src/algorithms/fsrs_logic.js",
        "src/content/content_ui.js",
        "src/shared/storage.js",
        "src/content/neetcode_content.js"
    ],
    "css": [
        "src/content/content.css"
    ]
}
```

Note: `leetcode_api.js`, `llm_sidecar.js`, and `llm_sidecar.css` are intentionally omitted — NeetCode doesn't need API polling or AI analysis (yet).

- [ ] **Step 3: Verify manifest is valid JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('valid')"
```

Expected: `valid`

- [ ] **Step 4: Commit**

```bash
git add manifest.json
git commit -m "feat: add neetcode.io to manifest host_permissions and content_scripts"
```

---

## Task 4: Manual end-to-end verification

No automated test can cover the full browser flow. Load the unpacked extension and verify manually.

- [ ] **Step 1: Build / reload the extension**

In Chrome → `chrome://extensions` → find "LeetCode EasyRepeat" → click the reload icon (↺).

- [ ] **Step 2: Navigate to a NeetCode problem**

Go to `https://neetcode.io/problems/dynamicArray/`.

Open DevTools Console. Confirm you see:
```
[NeetCode EasyRepeat] Cached question info: Design Dynamic Array (Resizable Array) (Easy)
[NeetCode EasyRepeat] Observer started for slug="dynamicArray"
```

- [ ] **Step 3: Submit an accepted solution**

Submit a correct solution. Confirm:
1. Console shows `[NeetCode EasyRepeat] Accepted submission detected via DOM.`
2. Rating modal appears with the correct title
3. After rating, problem appears in the extension popup

- [ ] **Step 4: Verify storage shape**

For `dynamicArray` (no topic tags):
```js
chrome.storage.local.get({ problems: {} }, r => console.log(r.problems['dynamicArray']));
// Expected: { title: "Design Dynamic Array (Resizable Array)", difficulty: "Easy", topics: ["NeetCode"], lastSolved: "...", nextReview: "...", ... }
```

For `two-integer-sum` (NeetCode 150, has topic tags):
```js
chrome.storage.local.get({ problems: {} }, r => console.log(r.problems['two-integer-sum']));
// Expected: { title: "Two Sum", difficulty: "Easy", topics: ["Array", "Hash Table", "NeetCode"], lastSolved: "...", nextReview: "...", ... }
```

- [ ] **Step 5: Verify duplicate skip**

Submit the same problem again on the same day. Confirm the rating modal does NOT appear (duplicate skip toast shows instead).

- [ ] **Step 6: Verify LeetCode still works**

Go to any LeetCode problem and submit. Confirm LeetCode flow is unaffected.

---

## Self-Review Checklist

- [x] Slug collision risk: NeetCode uses camelCase slugs (`dynamicArray`), LeetCode uses kebab-case (`dynamic-array`) — no collision
- [x] Difficulty fallback: if difficulty-pill not in DOM, falls back to `'Medium'` in `_handleAccepted` (same as LeetCode fallback)
- [x] SPA re-navigation: observer is per-slug; if user navigates to new problem, the old observer keeps running but `slug` is captured in closure at init time — acceptable since each page load re-runs `_init()`
- [x] Topics: scraped from `details a[href*="problem-list"]` + `"NeetCode"` appended always; falls back to `["NeetCode"]` when no tags in DOM (non-NeetCode-150 problems)
- [x] LLM analysis: intentionally excluded from NeetCode content scripts (no submission API to get failing test input)
- [x] `isAlreadySavedToday` duplication: copied logic from `leetcode_api.js` — acceptable for now, can extract to `shared/storage.js` in a future cleanup
