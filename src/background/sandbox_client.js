/**
 * SandboxClient.js
 * 
 * HTTP client for communicating with the MCP server's sandbox endpoints.
 * Used to verify generated code against test cases in an isolated E2B sandbox.
 */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.SandboxClient = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const DEFAULT_BASE_URL = 'http://localhost:8000';
    const TIMEOUT_MS = 30000; // 30 second timeout for sandbox execution
    const MODULE_NAME = '[SandboxClient]';

    /**
     * Get the base URL for the sandbox server.
     */
    async function getBaseUrl() {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            const result = await chrome.storage.local.get(['localEndpoint']);
            return result.localEndpoint || DEFAULT_BASE_URL;
        }
        return DEFAULT_BASE_URL;
    }

    /**
     * Check if debug logging is enabled.
     */
    async function isDebugEnabled() {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            const result = await chrome.storage.local.get(['agentDebugLogs']);
            return Boolean(result.agentDebugLogs);
        }
        return false;
    }

    /**
     * Log debug message if debug mode is enabled.
     */
    async function debugLog(step, message, data = null) {
        if (await isDebugEnabled()) {
            const timestamp = new Date().toISOString();
            console.log(`${MODULE_NAME} [${timestamp}] STEP: ${step}`);
            console.log(`${MODULE_NAME} ${message}`);
            if (data !== null) {
                console.log(`${MODULE_NAME} Data:`, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
            }
        }
    }

    /**
     * Log error immediately (always shown).
     */
    function errorLog(step, message, error = null) {
        console.error(`${MODULE_NAME} ERROR at ${step}: ${message}`);
        if (error) {
            console.error(`${MODULE_NAME} Error details:`, error);
        }
    }

    /**
     * Parse the result string from the server into structured format.
     */
    function parseResult(resultString) {
        try {
            // Server returns JSON string of array of test results
            const results = JSON.parse(resultString);
            if (Array.isArray(results)) {
                return {
                    parsed: true,
                    results,
                    allPassed: results.every(r => r.status === 'Passed'),
                    passedCount: results.filter(r => r.status === 'Passed').length,
                    failedCount: results.filter(r => r.status !== 'Passed').length
                };
            }
        } catch (e) {
            // Not JSON - likely a fatal error string
        }

        // Fallback: treat as error string
        return {
            parsed: false,
            results: [],
            allPassed: false,
            errorMessage: resultString
        };
    }

    /**
     * Verify code against a single test input.
     * 
     * @param {string} code - The Python code to verify
     * @param {string} testInput - The test input string
     * @returns {Promise<object>} { success, results, error }
     */
    async function verify(code, testInput) {
        const baseUrl = await getBaseUrl();

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

            const response = await fetch(`${baseUrl}/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, test_input: testInput }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                return {
                    success: false,
                    error: `Server error: ${response.status} ${response.statusText}`,
                    results: []
                };
            }

            const data = await response.json();
            const parsed = parseResult(data.result);

            return {
                success: parsed.allPassed,
                results: parsed.results,
                passedCount: parsed.passedCount || 0,
                failedCount: parsed.failedCount || 0,
                error: parsed.errorMessage || null
            };

        } catch (e) {
            if (e.name === 'AbortError') {
                return {
                    success: false,
                    error: 'Sandbox execution timed out',
                    results: []
                };
            }
            return {
                success: false,
                error: e.message,
                results: []
            };
        }
    }

    /**
     * Verify code against multiple test inputs.
     * 
     * @param {string} code - The Python code to verify
     * @param {string[]} testInputs - Array of test input strings
     * @returns {Promise<object>} { success, results, passedCount, failedCount }
     */
    async function verifyBatch(code, testInputs) {
        const baseUrl = await getBaseUrl();

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

            // Send all inputs as a JSON string in test_input field
            // The server will parse and run each
            const response = await fetch(`${baseUrl}/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code,
                    test_input: JSON.stringify(testInputs)
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                return {
                    success: false,
                    error: `Server error: ${response.status} ${response.statusText}`,
                    results: [],
                    passedCount: 0,
                    failedCount: testInputs.length
                };
            }

            const data = await response.json();
            const parsed = parseResult(data.result);

            return {
                success: parsed.allPassed,
                results: parsed.results,
                passedCount: parsed.passedCount || 0,
                failedCount: parsed.failedCount || 0,
                error: parsed.errorMessage || null
            };

        } catch (e) {
            if (e.name === 'AbortError') {
                return {
                    success: false,
                    error: 'Sandbox execution timed out',
                    results: [],
                    passedCount: 0,
                    failedCount: testInputs.length
                };
            }
            return {
                success: false,
                error: e.message,
                results: [],
                passedCount: 0,
                failedCount: testInputs.length
            };
        }
    }

    /**
     * Check if the sandbox server is running.
     * 
     * @returns {Promise<boolean>}
     */
    async function isServerRunning() {
        const baseUrl = await getBaseUrl();

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(`${baseUrl}/health`, {
                method: 'GET',
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                const data = await response.json();
                return data.status === 'ok';
            }
            return false;

        } catch (e) {
            return false;
        }
    }

    return {
        verify,
        verifyBatch,
        isServerRunning,
        getBaseUrl,
        DEFAULT_BASE_URL
    };
}));
