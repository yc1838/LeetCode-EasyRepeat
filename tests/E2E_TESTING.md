# End-to-End Browser Testing

This directory contains automated browser tests for the Chrome extension using Puppeteer.

## Setup

The tests are already configured. Puppeteer is installed as a dev dependency.

## Running Tests

### Run unit tests only (fast):
```bash
npm test
```

### Run E2E browser tests only:
```bash
npm run test:e2e
```

### Run all tests (unit + E2E):
```bash
npm run test:all
```

## What Gets Tested

The E2E tests verify:

1. **Extension Loading**
   - Service worker loads correctly
   - Background script initializes

2. **Module Loading**
   - SkillMatrix module is available on `self`
   - LLMGateway module is available
   - DrillGenerator module is available
   - GeminiClient and OpenAIClient modules are available

3. **Backfill from History**
   - SkillMatrix initializes correctly
   - Backfill request processes successfully
   - Test data is handled properly

4. **Drill Generation**
   - API key detection works
   - DrillGenerator is available and functional

5. **UI Pages**
   - Options page loads
   - Backfill button exists
   - Drill generation button exists
   - Popup loads correctly

## Test Structure

```
tests/
├── browser_e2e.test.js    # Main E2E test file
└── E2E_TESTING.md         # This file
```

## Important Notes

1. **Build First**: Always run `npm run build` before running E2E tests
2. **Headless Mode**: Tests run in non-headless mode (you'll see Chrome open)
3. **Timeout**: Tests have a 60-second timeout for extension loading
4. **Isolation**: E2E tests run in `--runInBand` mode to avoid conflicts

## Debugging

If tests fail:

1. Check that the extension builds successfully: `npm run build`
2. Look at the Chrome window that opens during tests
3. Check the console output for error messages
4. Verify the extension loads in `chrome://extensions`

## Adding New Tests

To add new E2E tests:

1. Open `tests/browser_e2e.test.js`
2. Add a new `describe` or `test` block
3. Use `worker.evaluate()` to run code in the extension context
4. Use `page.goto()` and `page.evaluate()` for UI testing

Example:
```javascript
test('should do something', async () => {
    const worker = await serviceWorkerTarget.worker();

    const result = await worker.evaluate(async () => {
        // Code runs in extension context
        return { success: true };
    });

    expect(result.success).toBe(true);
});
```

## CI/CD Integration

To run these tests in CI/CD:

1. Install Chrome/Chromium in your CI environment
2. Run `npm run build` before tests
3. Run `npm run test:e2e`
4. Consider using `xvfb` for headless environments

Example GitHub Actions:
```yaml
- name: Install dependencies
  run: npm ci

- name: Build extension
  run: npm run build

- name: Run E2E tests
  run: npm run test:e2e
```
