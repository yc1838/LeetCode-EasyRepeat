# ⚠️ CRITICAL FIXES - DO NOT REVERT ⚠️

This document records critical fixes that have been applied multiple times and MUST NOT be reverted.

## 🔴 Issue #1: UMD Wrapper Pattern for Vite ES Module Bundling

### Problem
When Vite bundles modules as ES modules (manifest.json has `"type": "module"`), the traditional UMD pattern fails to attach exports to the global `self` object, causing "Module not loaded" errors.

### Solution
All background modules MUST use this specific UMD wrapper pattern:

```javascript
(function (root, factory) {
    const exports = factory();

    // CRITICAL: Always attach to self in browser contexts
    if (typeof self !== 'undefined') {
        self.ModuleName = exports;
    }

    // Also support CommonJS for tests
    if (typeof module === 'object' && module.exports) {
        module.exports = exports;
    }
}(typeof self !== 'undefined' ? self : this, function () {
    // Module code here
    return { /* exports */ };
}));
```

### Why This Pattern?
1. **Always attaches to `self`** - Not conditional on `module.exports` being undefined
2. **Executes factory() once** - Reuses the same exports object
3. **Supports both ES modules and CommonJS** - Works with Vite bundling AND Jest tests

### Affected Files (DO NOT MODIFY THESE WRAPPERS)
- ✅ `src/background/skill_matrix.js` - Has detailed warning comment
- ✅ `src/background/llm_gateway.js` - Has warning comment
- ✅ `src/background/gemini_client.js`
- ✅ `src/background/openai_client.js`
- ✅ `src/background/drill_generator.js`
- ✅ `src/background/drill_store.js`

### Symptoms if Broken
- "SkillMatrix not loaded" error in backfill
- "LLMGateway not found" - drill generation fails
- API key detection fails
- Extension service worker crashes

### Fixed
- 2026-02-06 (3rd time)
- Previous fixes: 2026-02-01, 2026-01-28

---

## 🔴 Issue #2: Dexie Import in worker.js

### Problem
Importing `dexie.min.js` as a file doesn't work with Vite's ES module bundling because it's a UMD module.

### Solution
**MUST** import Dexie from the npm package:

```javascript
// ✅ CORRECT
import Dexie from 'dexie';

// Make Dexie available globally
if (typeof self !== 'undefined') {
    self.Dexie = Dexie;
}
```

**NEVER** do this:
```javascript
// ❌ WRONG - DO NOT USE
import '../assets/libs/dexie.min.js';
```

### Why?
- The npm package has proper ES module support
- The minified file is UMD and doesn't bundle correctly
- Vite can tree-shake and optimize the npm package

### Affected Files
- ✅ `src/background/worker.js` - Has detailed warning comment

### Symptoms if Broken
- "Dexie not found" error
- IndexedDB operations fail
- Shadow logger breaks
- Submission tracking fails

### Fixed
- 2026-02-06 (2nd time)
- Previous fix: 2026-02-03

---

## 🔴 Issue #3: Module Loading Order

### Problem
Modules must be loaded in the correct order in `worker.js` to ensure dependencies are available.

### Solution
The import order in `worker.js` MUST be:

```javascript
1. Dexie (from npm)
2. shadow_logger.js
3. skill_matrix.js
4. error_pattern_detector.js
5. gemini_client.js
6. openai_client.js
7. llm_gateway.js (depends on gemini/openai clients)
8. drill_generator.js (depends on llm_gateway)
9. Other modules
10. background.js (MUST be last)
```

### Why?
- LLMGateway needs GeminiClient and OpenAIClient to be loaded first
- DrillGenerator needs LLMGateway to be loaded first
- background.js needs all modules to be loaded first

---

## 📋 Testing Checklist

Before committing changes to background modules, ALWAYS:

1. ✅ Run `npm run build` - Must succeed without errors
2. ✅ Check `dist/background.js` exists and is ~155KB
3. ✅ Reload extension in Chrome
4. ✅ Open service worker console - Check for module loading logs
5. ✅ Test "Backfill from all history" - Must not show "SkillMatrix not loaded"
6. ✅ Test "Generate drills" - Must detect API key, not use demo drills
7. ✅ Run `npm test` - Unit tests must pass
8. ✅ Run `npm run test:e2e` - E2E tests should pass (if Chrome available)

---

## 🚨 If You See These Errors

### "SkillMatrix not loaded"
→ Check UMD wrapper in `skill_matrix.js`
→ Verify it follows the pattern above
→ Check service worker console for loading logs

### "Dexie not found"
→ Check `worker.js` imports Dexie from npm package
→ NOT from `../assets/libs/dexie.min.js`

### "API key present: false" (but you have an API key)
→ Check UMD wrappers in `llm_gateway.js`, `gemini_client.js`, `openai_client.js`
→ Check they're attached to `self`

### "DrillGenerator not found"
→ Check UMD wrapper in `drill_generator.js`
→ Check import order in `worker.js`

---

## 📝 Notes

- These fixes have been applied **multiple times** due to accidental reverts
- The warning comments in the code files are there for a reason - READ THEM
- When in doubt, check this document before modifying background modules
- The E2E tests in `tests/browser_e2e.test.js` verify these fixes work

---

## 🔗 Related Files

- `tests/E2E_TESTING.md` - How to run automated browser tests
- `src/background/skill_matrix.js` - Has the most detailed warning comment
- `src/background/worker.js` - Module loading order
- `manifest.json` - Specifies `"type": "module"` for service worker

---

**Last Updated:** 2026-02-06
**Maintainer:** If you're reading this because something broke, please update this document with what you learned!
