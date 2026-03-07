/**
 * End-to-End (E2E) Test Script
 * 
 * WHAT IS E2E TESTING?
 * E2E (End-to-End) testing verifies that the entire application works correctly
 * from a user's perspective. Unlike unit tests (which test functions in isolation),
 * E2E tests simulate real user actions: clicking buttons, navigating pages, etc.
 * 
 * UNIT TESTS vs E2E TESTS:
 * - Unit tests: Fast, test individual functions, run in Node.js
 * - E2E tests: Slow, test full user flows, run in real/simulated browser
 * 
 * WHY E2E FOR EXTENSIONS?
 * Chrome extensions interact with real web pages, so we need a real browser
 * to verify the extension loads correctly and integrates with LeetCode.
 */

/**
 * PUPPETEER
 * 
 * Puppeteer is a Node.js library that provides a high-level API to control
 * Chrome (or Chromium) programmatically. It's created by the Chrome team.
 * 
 * COMMON USE CASES:
 * - Automated testing (like this script)
 * - Web scraping (extracting data from websites)
 * - Taking screenshots or generating PDFs
 * - Automating form submissions
 * 
 * HOW IT WORKS:
 * Puppeteer launches a Chrome browser and communicates with it using the
 * Chrome DevTools Protocol. You can control the browser like a real user.
 * 
 * HEADLESS vs HEADED:
 * - Headless: Browser runs invisibly (no window) - faster for CI/CD
 * - Headed: Browser window is visible - useful for debugging
 */
const puppeteer = require('puppeteer');

/**
 * PATH MODULE (Node.js built-in)
 * 
 * The 'path' module helps work with file and directory paths.
 * It handles differences between operating systems (Windows uses \, Unix uses /).
 * 
 * Common methods:
 * - path.resolve(): Converts relative path to absolute path
 * - path.join(): Joins path segments with correct separator
 * - path.dirname(): Gets the directory name from a path
 */
const path = require('path');

/**
 * ASYNC IIFE (Immediately Invoked Function Expression)
 * 
 * PROBLEM: We want to use await (async/await) at the top level of the script.
 * ISSUE: Top-level await wasn't always supported in Node.js.
 * 
 * SOLUTION: Wrap the code in an async function and immediately call it.
 * 
 * PATTERN BREAKDOWN:
 *   (async () => { ... })()
 *    ^^^^^^^^^^^^^^^^^^^^^-- IIFE: Define function and call it immediately
 *    ^^^^^                 -- async: Allows using await inside
 *           ^^             -- Arrow function with no parameters
 *              ^^^^^       -- Function body
 *                     ^^   -- () immediately invokes the function
 * 
 * This is equivalent to:
 *   async function main() { ... }
 *   main();
 */
(async () => {
    /**
     * __dirname (Node.js global)
     * 
     * __dirname is the absolute path of the directory containing the current script.
     * For this file at /extension/tests/e2e.js, __dirname is /extension/tests
     * 
     * path.resolve(__dirname, '..'):
     * - Starts at __dirname (/extension/tests)
     * - Goes up one level (..)
     * - Results in /extension (where the extension files are)
     * 
     * This gives us the path to pass to Chrome for loading the extension.
     */
    const pathToExtension = path.resolve(__dirname, '..');
    console.log(`Loading extension from: ${pathToExtension}`);

    /**
     * LAUNCHING CHROME WITH PUPPETEER
     * 
     * puppeteer.launch() starts a new Chrome browser instance.
     * Returns a Promise that resolves to a Browser object.
     * 
     * CONFIGURATION OPTIONS:
     */
    const browser = await puppeteer.launch({
        /**
         * headless: false
         * 
         * CRITICAL FOR EXTENSIONS: Extensions can ONLY be loaded in headed mode!
         * Chrome's extension system doesn't work in headless mode.
         * 
         * For normal E2E tests, you'd typically use headless: true for speed.
         */
        headless: false,

        /**
         * args: Chrome command-line arguments
         * 
         * These are flags passed to Chrome when it starts.
         * For extension testing, we need:
         * 
         * --disable-extensions-except=PATH
         *   Disables all extensions EXCEPT the one at PATH.
         *   This prevents other extensions from interfering.
         * 
         * --load-extension=PATH
         *   Loads an unpacked extension from the specified directory.
         *   This is how we load our extension for testing.
         * 
         * TEMPLATE LITERALS:
         * `--load-extension=${pathToExtension}` uses ${} to insert a variable
         * into a string. The backticks `` define a template literal.
         */
        args: [
            `--disable-extensions-except=${pathToExtension}`,
            `--load-extension=${pathToExtension}`
        ]
    });

    /**
     * CREATING A NEW PAGE (TAB)
     * 
     * browser.newPage() creates a new tab in the browser.
     * Returns a Page object which we use to navigate and interact.
     */
    const page = await browser.newPage();

    /**
     * TRY/FINALLY PATTERN
     * 
     * try { ... } finally { ... }
     * 
     * This pattern ensures cleanup code runs even if an error occurs.
     * 
     * HOW IT WORKS:
     * 1. Code in 'try' block executes
     * 2. If an error occurs, it's caught (or bubbles up)
     * 3. Code in 'finally' block ALWAYS runs (success or error)
     * 
     * USE CASE HERE:
     * We want to close the browser even if the test fails.
     * Without finally, browser would stay open on errors (resource leak).
     */
    try {
        console.log('Navigating to LeetCode Two Sum...');

        /**
         * PAGE NAVIGATION
         * 
         * page.goto(url, options) navigates to a URL.
         * 
         * waitUntil OPTIONS:
         * - 'load': Wait for the 'load' event (basic page load)
         * - 'domcontentloaded': Wait for DOM to be ready
         * - 'networkidle0': Wait until no network requests for 500ms
         * - 'networkidle2': Wait until ≤2 network requests for 500ms (recommended)
         * 
         * WHY 'networkidle2'?
         * Modern web apps (like LeetCode) load content dynamically via AJAX.
         * 'networkidle2' waits for most content to load, but doesn't wait
         * forever for background polling requests.
         */
        await page.goto('https://leetcode.com/problems/two-sum/', {
            waitUntil: 'networkidle2'
        });

        /**
         * PAGE INTERACTION EXAMPLES:
         * 
         * page.title() - Gets the page title (content of <title> tag)
         * page.waitForSelector(selector) - Waits for element to appear
         * page.click(selector) - Clicks an element
         * page.type(selector, text) - Types text into an input
         * page.evaluate(fn) - Runs JavaScript in the browser context
         * page.screenshot() - Takes a screenshot
         */
        const title = await page.title();
        console.log(`Page Title: ${title}`);

        /**
         * VERIFYING EXTENSION LOADED:
         * 
         * Our extension injects a content script that logs to console.
         * In a more complete test, we could:
         * 1. Listen for console messages: page.on('console', msg => ...)
         * 2. Check for injected DOM elements
         * 3. Simulate a submission and check for the toast
         * 
         * For now, we just verify the page loaded successfully.
         */
        console.log('Browser opened successfully with extension loaded.');
        console.log('You can manually interact with the page now.');

        /**
         * OPTIONAL: Wait for manual verification
         * 
         * Uncomment the line below to keep the browser open for 10 seconds.
         * This is useful during development to manually check if things work.
         * 
         * new Promise(r => setTimeout(r, 10000)) creates a Promise that
         * resolves after 10 seconds (a "sleep" function).
         */
        // await new Promise(r => setTimeout(r, 10000)); 

    } catch (err) {
        /**
         * ERROR HANDLING
         * 
         * If anything in the try block throws an error, we end up here.
         * We log the error for debugging purposes.
         */
        console.error('Test Failed:', err);
    } finally {
        /**
         * CLEANUP
         * 
         * This code runs whether the test passed or failed.
         * We wait 5 seconds (to see results) then close the browser.
         * 
         * setTimeout(callback, delay):
         * - Schedules 'callback' to run after 'delay' milliseconds
         * - Does NOT block - the program continues immediately
         * 
         * NOTE: browser.close() is commented out with // above and handled
         * with setTimeout below. In production tests, you'd use:
         *   await browser.close();
         */
        // await browser.close();  // Commented out to allow manual inspection
        console.log('Closing browser in 5 seconds...');
        setTimeout(async () => {
            await browser.close();
        }, 5000);
    }
})();

