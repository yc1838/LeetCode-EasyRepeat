# NeetCode Source Field & Platform-Aware Navigation

**Goal:** Store which platform a problem came from (`"leetcode"` or `"neetcode"`) so the popup "Go" button navigates to the correct site, and NeetCode problems display a "NeetCode" badge.

**Context:** NeetCode slugs differ from LeetCode slugs for the same problem (e.g. `is-anagram` vs `valid-anagram`), so the correct URL cannot be reconstructed from the slug alone. A `source` field on each problem record solves this.

---

## Data Layer

### `saveSubmission` signature change

In `src/shared/storage.js`, add a `source` parameter (8th positional, or use an options object):

```
saveSubmission(problemTitle, problemSlug, difficulty, difficultySource, rating, topics, source)
```

- `source`: `"leetcode"` (default) or `"neetcode"`
- Persisted as `problem.source` in the stored object
- Backwards compatible: existing problems without `source` are treated as `"leetcode"` everywhere

### Storage shape

Existing problem object gains one field:

```js
{
  title: "Valid Anagram",
  slug: "is-anagram",
  difficulty: "Easy",
  source: "neetcode",   // NEW — "leetcode" | "neetcode"
  topics: ["NeetCode"],
  // ... rest unchanged
}
```

No migration needed. Missing `source` field implies `"leetcode"`.

---

## NeetCode Content Script

In `src/content/neetcode_content.js`, the `_handleAccepted` function passes `"neetcode"` as the source argument to `saveSubmission`:

```js
await saveSubmission(title, slug, difficulty, 'neetcode_dom', rating, topics, 'neetcode');
```

No changes needed to the LeetCode content script — it continues to omit the parameter, defaulting to `"leetcode"`.

---

## Popup "Go" Button

In `src/popup/popup_ui.js`, the go-button click handler branches on `problem.source`:

```js
goBtn.onclick = (e) => {
  e.stopPropagation();
  const url = problem.source === 'neetcode'
    ? `https://neetcode.io/problems/${problem.slug}/`
    : `${problemUrlBaseSafe}/problems/${problem.slug}/`;
  chrome.tabs.create({ url });
};
```

### NeetCode Badge

NeetCode problems display a "NeetCode" badge in the card's meta line (next to the `#slug` span). Styled as a small tag similar to the existing difficulty tags, with a distinct color to differentiate platform origin.

HTML addition in the card template:

```js
const sourceBadge = problem.source === 'neetcode'
  ? '<span class="stat-tag source-neetcode">NeetCode</span>'
  : '';
```

Inserted in the `vector-meta` div alongside the slug.

CSS for the badge (in popup CSS):

```css
.source-neetcode {
  background: #f97316;
  color: #fff;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
}
```

The exact orange color (`#f97316`) references NeetCode's brand. Can be adjusted.

---

## Files Changed

| File | Change |
|------|--------|
| `src/shared/storage.js` | Add `source` param to `saveSubmission`, persist to problem object |
| `src/content/neetcode_content.js` | Pass `"neetcode"` as source arg |
| `src/popup/popup_ui.js` | Go-button URL branching + NeetCode badge rendering |
| `src/popup/popup.css` | `.source-neetcode` badge style |
| `tests/storage.test.js` | Test that `source` is persisted and defaults to `"leetcode"` |
| `tests/popup_go_button.test.js` | Test NeetCode URL construction |

---

## Non-Goals

- No migration script for existing data (missing `source` = `"leetcode"`)
- No cross-platform problem linking (NeetCode `is-anagram` and LeetCode `valid-anagram` remain separate entries)
- No changes to the background script's abandoned-session logic (it only applies to LeetCode tabs)
