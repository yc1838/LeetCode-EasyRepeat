# NeetCode Source Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store which platform a problem came from so the popup "Go" button navigates to the correct site, and NeetCode problems display a "NeetCode" badge.

**Architecture:** Add a `source` field (`"leetcode"` | `"neetcode"`) to the problem storage object via a new parameter on `saveSubmission`. The popup reads `problem.source` to build the correct URL and render a badge. Missing `source` defaults to `"leetcode"` — no migration needed.

**Tech Stack:** Chrome Extension MV3, vanilla JS, `chrome.storage.local`, Jest (jsdom).

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/shared/storage.js` | Add `source` param to `saveSubmission`, persist it |
| Modify | `src/content/neetcode_content.js` | Pass `"neetcode"` as source to `saveSubmission` |
| Modify | `src/popup/popup_ui.js` | Go-button URL branching + NeetCode badge |
| Modify | `src/popup/popup.css` | `.source-neetcode` badge style |
| Modify | `tests/storage.test.js` | Test source field persistence and default |
| Modify | `tests/popup_go_button.test.js` | Test NeetCode go-button URL + badge |

---

## Task 1: Storage — add `source` parameter to `saveSubmission`

**Files:**
- Modify: `tests/storage.test.js`
- Modify: `src/shared/storage.js`

- [ ] **Step 1: Write failing tests**

Add these two tests at the end of the `describe('Storage Logic', ...)` block in `tests/storage.test.js`:

```js
test('should persist source field when provided', async () => {
    global.chrome.storage.local.get.mockResolvedValue({ problems: {} });
    global.chrome.storage.local.set.mockResolvedValue();

    await saveSubmission('Two Sum', 'two-sum', 'Easy', 'api', 3, ['Array'], 'neetcode');

    const setCall = global.chrome.storage.local.set.mock.calls[0][0];
    expect(setCall.problems['two-sum'].source).toBe('neetcode');
});

test('should default source to "leetcode" when not provided', async () => {
    global.chrome.storage.local.get.mockResolvedValue({ problems: {} });
    global.chrome.storage.local.set.mockResolvedValue();

    await saveSubmission('Two Sum', 'two-sum', 'Easy', 'api', 3, ['Array']);

    const setCall = global.chrome.storage.local.set.mock.calls[0][0];
    expect(setCall.problems['two-sum'].source).toBe('leetcode');
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest tests/storage.test.js --no-coverage 2>&1 | tail -15
```

Expected: 2 failures — `source` is `undefined` because `saveSubmission` doesn't store it yet.

- [ ] **Step 3: Add `source` parameter to `saveSubmission`**

In `src/shared/storage.js`, change the function signature at line 36 from:

```js
async function saveSubmission(problemTitle, problemSlug, difficulty, difficultySource = 'unknown', rating = null, topics = []) {
```

to:

```js
async function saveSubmission(problemTitle, problemSlug, difficulty, difficultySource = 'unknown', rating = null, topics = [], source = 'leetcode') {
```

Then in the same function, add `source` to both the default object (line 100-109) and the final write (line 161-175).

In the default object (~line 100), add `source`:

```js
const currentProblem = problems[problemKey] || {
    title: problemTitle,
    slug: problemSlug,
    difficulty: difficulty,
    source: source,
    interval: 0,
    repetition: 0,
    easeFactor: 2.5,
    topics: topics || [],
    history: []
};
```

In the final write (~line 161), add `source` to the spread:

```js
problems[problemKey] = {
    ...currentProblem,
    difficulty: difficulty,
    source: source || currentProblem.source || 'leetcode',
    lastSolved: nowISO,
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/storage.test.js --no-coverage 2>&1 | tail -15
```

Expected: All tests pass, including the 2 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/shared/storage.js tests/storage.test.js
git commit -m "feat: add source field to saveSubmission for platform tracking"
```

---

## Task 2: NeetCode content script — pass `"neetcode"` source

**Files:**
- Modify: `src/content/neetcode_content.js`

- [ ] **Step 1: Update `_handleAccepted` to pass source**

In `src/content/neetcode_content.js`, in the `_handleAccepted` function (~line 142), change:

```js
await saveSubmission(title, slug, difficulty, 'neetcode_dom', rating, topics);
```

to:

```js
await saveSubmission(title, slug, difficulty, 'neetcode_dom', rating, topics, 'neetcode');
```

- [ ] **Step 2: Run existing tests to verify nothing broke**

```bash
npx jest tests/neetcode_content.test.js --no-coverage 2>&1 | tail -10
```

Expected: All 21 tests pass (pure function tests are unaffected).

- [ ] **Step 3: Commit**

```bash
git add src/content/neetcode_content.js
git commit -m "feat: pass neetcode source to saveSubmission"
```

---

## Task 3: Popup — platform-aware "Go" button and NeetCode badge

**Files:**
- Modify: `tests/popup_go_button.test.js`
- Modify: `src/popup/popup_ui.js`
- Modify: `src/popup/popup.css`

- [ ] **Step 1: Write failing tests**

Add these two tests at the end of the `describe('Popup GO Button', ...)` block in `tests/popup_go_button.test.js`:

```js
test('should open neetcode.io for problems with source "neetcode"', () => {
    const problems = [
        {
            slug: 'is-anagram',
            title: 'Valid Anagram',
            difficulty: 'Easy',
            source: 'neetcode',
            interval: 1,
            nextReviewDate: new Date().toISOString()
        }
    ];

    popup.renderVectors(problems, 'vector-list', true);

    const goBtn = document.querySelector('.go-btn');
    goBtn.click();

    expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: 'https://neetcode.io/problems/is-anagram/'
    });
});

test('should render NeetCode badge for neetcode source problems', () => {
    const problems = [
        {
            slug: 'is-anagram',
            title: 'Valid Anagram',
            difficulty: 'Easy',
            source: 'neetcode',
            interval: 1,
            nextReviewDate: new Date().toISOString()
        }
    ];

    popup.renderVectors(problems, 'vector-list', true);

    const badge = document.querySelector('.source-neetcode');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('NeetCode');
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest tests/popup_go_button.test.js --no-coverage 2>&1 | tail -15
```

Expected: 2 failures — go button opens leetcode.com, no badge element exists.

- [ ] **Step 3: Update the go-button click handler**

In `src/popup/popup_ui.js`, replace the go-button onclick handler (~line 148-155):

```js
const goBtn = card.querySelector('.go-btn');
if (goBtn) {
    goBtn.onclick = (e) => {
        e.stopPropagation();
        if (typeof chrome !== 'undefined' && chrome.tabs) {
            chrome.tabs.create({ url: `${problemUrlBaseSafe}/problems/${problem.slug}/` });
        }
    };
}
```

with:

```js
const goBtn = card.querySelector('.go-btn');
if (goBtn) {
    goBtn.onclick = (e) => {
        e.stopPropagation();
        if (typeof chrome !== 'undefined' && chrome.tabs) {
            const url = problem.source === 'neetcode'
                ? `https://neetcode.io/problems/${problem.slug}/`
                : `${problemUrlBaseSafe}/problems/${problem.slug}/`;
            chrome.tabs.create({ url });
        }
    };
}
```

- [ ] **Step 4: Add the NeetCode badge to the card template**

In `src/popup/popup_ui.js`, in the `card.innerHTML` template (~line 97), add the badge inside the `vector-meta` div. Change:

```js
<div class="vector-meta">
    <span>#${problem.slug}</span>
    <span>${t('popup_retention', {}, language)}: ${Math.min(100, Math.round(problem.easeFactor * 40))}%</span>
</div>
```

to:

```js
<div class="vector-meta">
    <span>#${problem.slug}</span>
    ${problem.source === 'neetcode' ? '<span class="stat-tag source-neetcode">NeetCode</span>' : ''}
    <span>${t('popup_retention', {}, language)}: ${Math.min(100, Math.round(problem.easeFactor * 40))}%</span>
</div>
```

- [ ] **Step 5: Add badge CSS**

In `src/popup/popup.css`, add after the `.topic-tag` rule (after ~line 690):

```css
.source-neetcode {
    background: #f97316;
    color: #fff;
    border-color: #f97316;
    font-size: 0.5rem;
    padding: 1px 6px;
    border-radius: 3px;
    text-transform: none;
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx jest tests/popup_go_button.test.js --no-coverage 2>&1 | tail -15
```

Expected: All tests pass, including the 2 new ones.

- [ ] **Step 7: Run full test suite**

```bash
npx jest --no-coverage 2>&1 | tail -20
```

Expected: All test suites pass.

- [ ] **Step 8: Commit**

```bash
git add src/popup/popup_ui.js src/popup/popup.css tests/popup_go_button.test.js
git commit -m "feat: platform-aware Go button and NeetCode badge in popup"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** `source` param added to `saveSubmission` (spec: Data Layer), NeetCode content script passes `"neetcode"` (spec: NeetCode Content Script), go-button branches on source (spec: Popup "Go" Button), badge rendered (spec: NeetCode Badge), CSS added (spec: NeetCode Badge), all test files updated (spec: Files Changed)
- [x] **Placeholder scan:** No TBD/TODO. All code blocks are complete.
- [x] **Type consistency:** `source` param name used consistently across storage.js, neetcode_content.js, popup_ui.js, and all tests. `problem.source === 'neetcode'` check is identical in popup_ui.js go-button and badge template.
