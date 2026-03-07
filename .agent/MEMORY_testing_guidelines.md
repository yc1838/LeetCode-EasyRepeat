# Senior SDE Testing Guidelines

> **"If it can break, test it. If you think it can't break, you're wrong — test it anyway."**

## Core Principles

1. **Test the contract, not the implementation** — What did we promise it would do?
2. **Test how it's actually called** — Not how the test thinks it should be called
3### 2.2 Storage Pitfalls
- **Async Chain Breaking**: `chrome.storage.local.get` is async. If you chain operations (get -> modify -> set) without proper awaiting, you might race.
- **Session Overwrites**: In navigation logic (like `drill_init.js`), ensure you check for *existing* session data before creating defaults. Overwriting storage on every load (if ID is missing) causes state resets.
- **QuotaExceededError**: Large objects (like >5MB logs) will fail silently or throw errors. Always compress or truncate large lists.
- **Serialization**: Functions and Circular references cannot be stored. `JSON.stringify` logic applies.ts

---

## Edge Case Checklist

### 1. Input Boundaries

| Category | Test Cases |
|----------|------------|
| **No arguments** | `fn()` with no args when optional |
| **Undefined/Null** | `fn(undefined)`, `fn(null)` |
| **Empty values** | `""`, `[]`, `{}`, `0` |
| **Boundary values** | min, max, min-1, max+1 |
| **Off-by-one** | Array index `0`, `length-1`, `length` |
| **Negative numbers** | `-1`, `-0`, `Number.MIN_SAFE_INTEGER` |
| **Large values** | `Number.MAX_SAFE_INTEGER`, very long strings |
| **Special characters** | `\n`, `\t`, `\0`, emojis, unicode |
| **Type mismatches** | String "123" vs Number 123 |

### 2. Arrays

```javascript
describe('arrayFunction', () => {
    it('handles empty array', () => fn([]));
    it('handles single element', () => fn([1]));
    it('handles duplicates', () => fn([1, 1, 1]));
    it('handles null elements', () => fn([1, null, 3]));
    it('handles undefined elements', () => fn([1, undefined, 3]));
    it('handles sparse arrays', () => fn([1, , 3]));  // hole at index 1
    it('handles very large arrays', () => fn(new Array(10000).fill(1)));
    it('handles out-of-bounds access', () => fn(arr)[arr.length]);
});
```

### 3. Strings

```javascript
describe('stringFunction', () => {
    it('handles empty string', () => fn(''));
    it('handles single character', () => fn('a'));
    it('handles whitespace only', () => fn('   \t\n'));
    it('handles leading/trailing whitespace', () => fn('  hello  '));
    it('handles special characters', () => fn('hello\nworld'));
    it('handles unicode', () => fn('你好世界'));
    it('handles emojis', () => fn('Hello 👋 World 🌍'));
    it('handles very long strings', () => fn('a'.repeat(100000)));
    it('handles SQL injection attempt', () => fn("'; DROP TABLE users;--"));
    it('handles HTML/script injection', () => fn('<script>alert("xss")</script>'));
});
```

### 4. Objects

```javascript
describe('objectFunction', () => {
    it('handles empty object', () => fn({}));
    it('handles null', () => fn(null));
    it('handles missing optional properties', () => fn({ a: 1 }));  // missing b
    it('handles extra properties', () => fn({ a: 1, unknown: 'x' }));
    it('handles nested nulls', () => fn({ a: { b: null } }));
    it('handles prototype pollution', () => fn({ __proto__: { admin: true } }));
    it('handles circular references', () => {
        const obj = { a: 1 };
        obj.self = obj;
        fn(obj);
    });
});
```

### 5. Numbers

```javascript
describe('numberFunction', () => {
    it('handles zero', () => fn(0));
    it('handles negative zero', () => fn(-0));
    it('handles negative numbers', () => fn(-42));
    it('handles decimals', () => fn(3.14159));
    it('handles very small decimals', () => fn(0.0000001));
    it('handles Infinity', () => fn(Infinity));
    it('handles -Infinity', () => fn(-Infinity));
    it('handles NaN', () => fn(NaN));
    it('handles MAX_SAFE_INTEGER', () => fn(Number.MAX_SAFE_INTEGER));
    it('handles MIN_SAFE_INTEGER', () => fn(Number.MIN_SAFE_INTEGER));
    it('handles float precision issues', () => fn(0.1 + 0.2));  // != 0.3
});
```

---

## Async Testing Checklist

### 6. Promises & Async/Await

```javascript
describe('asyncFunction', () => {
    // Success cases
    it('resolves with expected value', async () => {
        await expect(fn()).resolves.toBe(expected);
    });

    // Error cases
    it('rejects with error', async () => {
        await expect(fn()).rejects.toThrow('expected error');
    });

    // Timeout cases
    it('handles timeout', async () => {
        jest.useFakeTimers();
        const promise = fn();
        jest.advanceTimersByTime(5000);
        await expect(promise).rejects.toThrow('timeout');
    });

    // Missing await (common bug!)
    it('caller awaits the result', async () => {
        const result = await fn();  // NOT: const result = fn()
        expect(result).not.toBeInstanceOf(Promise);
    });
});
```

### 7. Concurrency & Race Conditions

```javascript
describe('concurrent operations', () => {
    it('handles multiple simultaneous calls', async () => {
        const results = await Promise.all([
            fn('a'),
            fn('b'),
            fn('c')
        ]);
        expect(results).toEqual(['a-result', 'b-result', 'c-result']);
    });

    it('handles rapid sequential calls', async () => {
        await fn('first');
        await fn('second');
        await fn('third');
        // Verify no state corruption
    });

    it('handles call during pending operation', async () => {
        const first = fn();
        const second = fn();  // Called while first is pending
        await Promise.all([first, second]);
    });
});
```

---

## Chrome Extension Specific

### 8. Storage API

```javascript
describe('storage operations', () => {
    it('handles empty storage', async () => {
        chrome.storage.local.get.mockResolvedValue({});
        await fn();
    });

    it('handles storage with default values', async () => {
        chrome.storage.local.get.mockResolvedValue({ key: 'default' });
    });

    it('handles storage quota exceeded', async () => {
        chrome.storage.local.set.mockRejectedValue(
            new Error('QUOTA_BYTES quota exceeded')
        );
    });

    it('handles corrupted storage data', async () => {
        chrome.storage.local.get.mockResolvedValue({
            key: 'not-valid-json{{'  // Corrupted
        });
    });
});
```

### 9. Message Passing

```javascript
describe('message passing', () => {
    it('handles message with no response', async () => {
        chrome.runtime.sendMessage.mockResolvedValue(undefined);
    });

    it('handles message port closed', async () => {
        chrome.runtime.sendMessage.mockRejectedValue(
            new Error('The message port closed before a response was received')
        );
    });

    it('handles extension context invalidated', async () => {
        chrome.runtime.sendMessage.mockRejectedValue(
            new Error('Extension context invalidated')
        );
    });

    it('returns true for async response', () => {
        const listener = getMessageListener();
        const result = listener(request, sender, sendResponse);
        expect(result).toBe(true);  // Required for async!
    });
});
```

---

## Error Handling

### 10. Error Scenarios

```javascript
describe('error handling', () => {
    it('handles network failure', async () => {
        fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    });

    it('handles HTTP 4xx errors', async () => {
        fetch.mockResolvedValue({ ok: false, status: 400 });
    });

    it('handles HTTP 5xx errors', async () => {
        fetch.mockResolvedValue({ ok: false, status: 500 });
    });

    it('handles rate limiting (429)', async () => {
        fetch.mockResolvedValue({ ok: false, status: 429 });
    });

    it('handles malformed JSON response', async () => {
        fetch.mockResolvedValue({
            ok: true,
            json: () => Promise.reject(new SyntaxError('Unexpected token'))
        });
    });

    it('handles timeout', async () => {
        fetch.mockImplementation(() => new Promise(() => {}));  // Never resolves
    });
});
```

---

## Test Quality Checklist

Before submitting, verify:

- [ ] **All happy paths tested** — Normal expected behavior
- [ ] **All error paths tested** — What happens when things go wrong
- [ ] **Edge cases covered** — Empty, null, undefined, boundaries
- [ ] **Async behavior verified** — Resolves, rejects, timeouts
- [ ] **No shared mutable state** — Tests don't affect each other
- [ ] **Descriptive test names** — Name tells you exactly what's tested
- [ ] **Single assertion focus** — Each test verifies one behavior
- [ ] **Mocks cleaned up** — `beforeEach`/`afterEach` reset state
- [ ] **Tests match actual usage** — Verify how code is REALLY called

---

## Lessons Learned

### 2026-01-30: `generateFromWeakSkills` Bug

**What happened:** Function expected `weakSkills` array, but was called with NO ARGUMENTS in production.

**Root cause:** Tests always passed valid arrays, never tested the "no argument" case.

**Fix:** Added auto-fetch from storage when called without arguments.

**Takeaway:** Always test how the function is ACTUALLY called in the codebase, not just how you EXPECT it to be called.

---

## Golden Rule

> **Test the interface, not the implementation.**
> **Test the actual call sites, not hypothetical ones.**
> **When in doubt, add another edge case test.**
