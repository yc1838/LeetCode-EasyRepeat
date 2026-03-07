/**
 * LeetCode EasyRepeat - DOM Interaction Layer
 * 
 * Handles reading from the LeetCode DOM to extract problem details.
 * Manages caching of difficulty which might disappear during dynamic navigation.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        // Node.js
        module.exports = factory();
    } else {
        // Browser
        const exported = factory();
        for (const key in exported) {
            root[key] = exported[key];
        }
    }
}(typeof self !== 'undefined' ? self : this, function () {

    // MODULE-LEVEL VARIABLES (encapsulated state)
    let lastProblemSlug = null;     // Track current problem to detect navigation

    /**
     * Extract the problem "slug" from the current URL.
     */
    function getCurrentProblemSlug() {
        if (typeof window === 'undefined' || !window.location) return null;
        const match = window.location.pathname.match(/\/problems\/([^\/]+)/);
        return match ? match[1] : null;
    }

    /**
     * Helper function to read the webpage and find the problem details (Title, Difficulty, ID)
     */
    function extractProblemDetails() {
        // Split the URL to find the problem ID (slug)
        const pathParts = window.location.pathname.split('/');
        let problemSlug = "unknown-problem";

        // Case 1: Standard problem page
        if (pathParts[1] === 'problems') {
            problemSlug = pathParts[2];
        }
        // Case 2: Submission details page (sometimes happen after submit)
        else if (document.referrer && document.referrer.includes('/problems/')) {
            const refParts = new URL(document.referrer).pathname.split('/');
            problemSlug = refParts[2];
        }

        // Find the Title element on the page.
        const titleEl = document.querySelector('[data-cy="question-title"]') ||
            document.querySelector('span.text-lg.font-medium.text-label-1') ||
            document.querySelector('.mr-2.text-lg.font-medium');

        const title = titleEl ? titleEl.innerText : problemSlug.replace(/-/g, ' ');

        let difficulty = 'Medium'; // Default fallback
        let difficultySource = 'fallback';

        // Try Live DOM
        const difficultyNode = document.querySelector('div[class*="text-difficulty-"]');
        if (difficultyNode) {
            const text = difficultyNode.innerText.trim();
            if (['Easy', 'Medium', 'Hard'].includes(text)) {
                difficulty = text;
                difficultySource = 'dom';
            } else {
                console.warn(`[LeetCode EasyRepeat] [LEETCODE-DEBUG] Difficulty node found but text '${text}' is not valid.`);
            }
        } else {
            console.warn(`[LeetCode EasyRepeat] [LEETCODE-DEBUG] Difficulty node NOT found for ${problemSlug}. Selector: 'div[class*="text-difficulty-"]' failed.`);

            // Fallback attempt: Try to find by specific colors if class parsing fails
            const easyColor = document.querySelector('.text-difficulty-easy');
            const mediumColor = document.querySelector('.text-difficulty-medium');
            const hardColor = document.querySelector('.text-difficulty-hard');

            if (easyColor) { difficulty = 'Easy'; difficultySource = 'dom-fallback-easy'; }
            else if (mediumColor) { difficulty = 'Medium'; difficultySource = 'dom-fallback-medium'; }
            else if (hardColor) { difficulty = 'Hard'; difficultySource = 'dom-fallback-hard'; }
        }

        return { title, slug: problemSlug, difficulty, difficultySource };
    }

    return {
        getCurrentProblemSlug,
        extractProblemDetails
    };
}));
