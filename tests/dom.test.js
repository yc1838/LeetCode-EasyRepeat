/**
 * @jest-environment jsdom
 */

/**
 * DOM Extraction Logic Tests
 * 
 * WHAT IS DOM TESTING?
 * DOM stands for "Document Object Model" - it's how browsers represent HTML as JavaScript objects.
 * DOM testing verifies that our code correctly reads from and writes to the webpage.
 * 
 * THE CHALLENGE:
 * Jest runs in Node.js, which is a server-side environment WITHOUT a browser.
 * This means there's no `document`, no `window`, no `querySelector`, etc.
 * 
 * THE SOLUTION: jsdom
 * jsdom is a JavaScript implementation of the browser's DOM.
 * It simulates a browser environment in Node.js so we can test DOM-related code.
 * 
 * JEST ENVIRONMENT DIRECTIVE:
 * The @jest-environment comment above tells Jest which environment to use for this file.
 * 
 * Options:
 * - 'node' (default): Standard Node.js environment, no DOM APIs
 * - 'jsdom': Simulated browser with document, window, etc.
 * 
 * IMPORTANT: This comment MUST be at the very top of the file.
 */

/**
 * MOCKING BROWSER APIs
 * 
 * Chrome Extension code uses APIs like:
 * - chrome.runtime.onMessage (listening for messages)
 * - chrome.storage.local (storing data)
 * 
 * These don't exist in jsdom, so we must CREATE FAKE ("mock") versions.
 * 
 * WHAT IS MOCKING?
 * Mocking means creating fake versions of dependencies so we can:
 * 1. Test code in isolation (without real browser/storage)
 * 2. Control what the dependencies return
 * 3. Verify our code calls them correctly
 * 
 * GLOBAL OBJECT:
 * In Node.js, `global` is like `window` in browsers.
 * By assigning to `global.chrome`, we make it available everywhere.
 */
global.chrome = {
    runtime: {
        // Fake extension ID - just needs to be truthy for validity checks
        id: 'mock-id',
        onMessage: {
            /**
             * jest.fn() - MOCK FUNCTION
             * 
             * jest.fn() creates a special function that:
             * 1. Does nothing by default (returns undefined)
             * 2. Records every time it was called
             * 3. Records what arguments it was called with
             * 
             * We can later assert: expect(mockFn).toHaveBeenCalled()
             * Or: expect(mockFn).toHaveBeenCalledWith('some-arg')
             * 
             * We're mocking addListener because content.js calls it on load,
             * and we don't need the real listener behavior for these tests.
             */
            addListener: jest.fn()
        }
    },
    storage: {
        local: {
            get: jest.fn(),
            set: jest.fn()
        }
    }
};

/**
 * MOCKING BROWSER CLASSES
 * 
 * MutationObserver is a browser API that watches for DOM changes.
 * content.js uses it to detect when LeetCode updates the page.
 * 
 * We create a minimal mock class that:
 * - Has the same constructor signature
 * - Has the same methods (observe, disconnect)
 * - Does nothing (we don't need actual observation in tests)
 * 
 * ES6 CLASS SYNTAX:
 * class ClassName {
 *   constructor(args) { ... }  // Called when you do: new ClassName()
 *   methodName() { ... }       // Instance method
 * }
 */
global.MutationObserver = class {
    constructor(callback) {
        // In real code, this would store the callback and call it on DOM changes
        // In tests, we don't need this behavior
    }
    observe(element, options) {
        // In real code, this starts observing an element for changes
    }
    disconnect() {
        // In real code, this stops observing
    }
};

/**
 * DESCRIBE BLOCK:
 * Groups all tests related to DOM extraction functionality.
 */
describe('DOM Extraction Logic', () => {
    /**
     * VARIABLE DECLARED OUTSIDE TESTS:
     * 
     * By declaring extractProblemDetails outside the tests,
     * we can assign it in beforeEach and use it in every test.
     * 
     * This is a common pattern when the setup is complex.
     */
    let extractProblemDetails;

    /**
     * BEFOREEACH HOOK:
     * 
     * beforeEach runs BEFORE each test in this describe block.
     * Use it to set up a clean state so tests don't affect each other.
     * 
     * Other hooks:
     * - afterEach: runs AFTER each test (cleanup)
     * - beforeAll: runs ONCE before all tests
     * - afterAll: runs ONCE after all tests
     * 
     * WHY RESET BEFORE EACH TEST?
     * Tests should be INDEPENDENT - one test shouldn't affect another.
     * If test A adds an element to the DOM, test B shouldn't see it.
     */
    beforeEach(() => {
        // Reset DOM - clear everything from previous tests
        // innerHTML = '' removes all child elements
        document.body.innerHTML = '';

        /**
         * Object.defineProperty - OVERRIDING READ-ONLY PROPERTIES
         * 
         * Some browser properties like window.location are READ-ONLY.
         * Normally you can't do: window.location.pathname = '/something';
         * 
         * Object.defineProperty lets us redefine the property:
         * - value: the new value for the property
         * - writable: true allows changing it later
         * 
         * This is a common testing trick to simulate different URLs.
         */
        Object.defineProperty(window, 'location', {
            value: {
                pathname: '/problems/two-sum/'
            },
            writable: true  // Allow tests to change this
        });

        /**
         * jest.resetModules() - CLEARING MODULE CACHE
         * 
         * Node.js caches modules after the first require().
         * This means if content.js sets a variable (like cachedDifficulty),
         * that value persists across tests!
         * 
         * jest.resetModules() clears this cache, so the next require()
         * loads a fresh copy of the module with reset variables.
         * 
         * WHEN TO USE:
         * When the module has state (variables) that need to be reset between tests.
         */
        jest.resetModules();

        /**
         * REQUIRE AFTER RESET:
         * We require the module AFTER resetModules() to get a fresh copy.
         * This ensures cachedDifficulty is null at the start of each test.
         */
        const leetcodeDom = require('../src/content/leetcode_dom.js');
        extractProblemDetails = leetcodeDom.extractProblemDetails;
    });

    /**
     * TEST: URL PARSING
     * Verifies that the function correctly extracts the problem "slug" from the URL.
     * The slug is the unique identifier in the URL (e.g., "two-sum" from "/problems/two-sum/")
     */
    test('should extract problem slug from URL', () => {
        const details = extractProblemDetails();
        // Note: we set the URL in beforeEach to '/problems/two-sum/'
        expect(details.slug).toBe('two-sum');
    });

    /**
     * TEST: DOM ELEMENT EXTRACTION
     * 
     * This test creates a DOM element, adds it to the document,
     * then verifies our function finds and reads it correctly.
     */
    test('should extract title from page element', () => {
        /**
         * DOM MANIPULATION:
         * 
         * document.createElement('span') - Creates a new <span> element
         * element.className = '...' - Sets the class attribute
         * element.innerText = '...' - Sets the text content
         * document.body.appendChild(el) - Adds element to the page
         * 
         * This simulates what exists on the real LeetCode page.
         */
        const titleEl = document.createElement('span');
        titleEl.className = 'text-lg font-medium text-label-1';
        titleEl.innerText = '1. Two Sum';
        document.body.appendChild(titleEl);

        const details = extractProblemDetails();
        expect(details.title).toBe('1. Two Sum');
    });

    /**
     * TEST: FALLBACK BEHAVIOR
     * When the title element doesn't exist, the function should fall back
     * to generating a title from the URL slug.
     */
    test('should fallback title from slug if element missing', () => {
        // We DON'T add any title element to the DOM
        const details = extractProblemDetails();
        // "two-sum" becomes "two sum" (dashes replaced with spaces)
        expect(details.title).toBe('two sum');
    });

    /**
     * TEST: DIFFICULTY EXTRACTION
     * The function should find and read the difficulty badge element.
     */
    test('should extract difficulty', () => {
        const diffEl = document.createElement('div');
        // Using a class that matches the pattern: class*="text-difficulty-"
        diffEl.className = 'text-difficulty-easy';
        diffEl.innerText = 'Easy';
        document.body.appendChild(diffEl);

        const details = extractProblemDetails();
        expect(details.difficulty).toBe('Easy');
    });

    /**
     * EDGE CASE: WHITESPACE
     * 
     * Real DOM text often has extra whitespace from HTML formatting.
     * Our function should handle this with .trim()
     */
    test('should extract difficulty with leading/trailing whitespace', () => {
        const diffEl = document.createElement('div');
        diffEl.className = 'text-difficulty-easy';
        diffEl.innerText = '  Easy  '; // Extra spaces
        document.body.appendChild(diffEl);

        const details = extractProblemDetails();
        expect(details.difficulty).toBe('Easy'); // Should be trimmed
    });

    /**
     * EDGE CASE: NEWLINES
     * Similar to whitespace, HTML might have newlines in text content.
     */
    test('should extract difficulty with newlines', () => {
        const diffEl = document.createElement('div');
        diffEl.className = 'text-difficulty-medium';
        diffEl.innerText = '\nMedium\n'; // Newlines
        document.body.appendChild(diffEl);

        const details = extractProblemDetails();
        expect(details.difficulty).toBe('Medium');
    });

    test('should extract Hard difficulty', () => {
        const diffEl = document.createElement('div');
        diffEl.className = 'text-difficulty-hard';
        diffEl.innerText = 'Hard';
        document.body.appendChild(diffEl);

        const details = extractProblemDetails();
        expect(details.difficulty).toBe('Hard');
    });

    /**
     * TEST: DEFAULT VALUES
     * When the difficulty element doesn't exist, we should get a sensible default.
     */
    test('extractProblemDetails should define default difficulty for unknown problem', () => {
        // Setup global dep
        const { TOAST_THEMES } = require('../src/shared/config.js');
        global.TOAST_THEMES = TOAST_THEMES;
        // No difficulty element added
        const details = extractProblemDetails();
        expect(details.difficulty).toBe('Medium'); // Default fallback
    });

    /**
     * TEST: INVALID INPUT HANDLING
     * If the element exists but has unexpected text, we should still default.
     */
    test('should default difficulty to Medium if element has unexpected text', () => {
        const diffEl = document.createElement('div');
        diffEl.className = 'text-difficulty-unknown';
        diffEl.innerText = 'Unknown'; // Not Easy/Medium/Hard
        document.body.appendChild(diffEl);

        const details = extractProblemDetails();
        expect(details.difficulty).toBe('Medium'); // Falls back to default
    });
});

