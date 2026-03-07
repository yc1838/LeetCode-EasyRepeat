---
description: TDD workflow for writing tests before implementation
---

# TDD Workflow

Before writing ANY tests, always read the testing guidelines first:

// turbo
1. Read the testing guidelines document:
   ```bash
   cat .agent/MEMORY_testing_guidelines.md
   ```

2. Identify the module/feature to test and create `tests/<module_name>.test.js`

3. Write failing tests FIRST covering:
   - Happy path (normal usage)
   - Edge cases (empty input, null, undefined, large data)
   - Error conditions (invalid args, API failures)
   - Async behavior (if applicable)

4. Run tests to confirm they FAIL:
   ```bash
   npx jest tests/<module_name>.test.js
   ```

5. Implement the minimum code to make tests pass

6. Run tests again to confirm PASS:
   ```bash
   npx jest tests/<module_name>.test.js
   ```

7. Refactor if needed, keeping tests green

## Key Reminders (from MEMORY_testing_guidelines.md)

- **Test the contract, not implementation**
- **Test how it's actually called** at call sites
- **Chrome extension specifics**: Mock `chrome.storage`, `chrome.runtime`
- **Async traps**: Always await storage operations
- **Session overwrites**: Check existing data before creating defaults
