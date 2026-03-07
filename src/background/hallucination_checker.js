/**
 * HallucinationChecker.js
 * 
 * Validates that LLM-generated code matches the user's original intent.
 * Detects when the AI generates irrelevant or overly complex code.
 */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.HallucinationChecker = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    // Stop words to filter out when extracting key terms
    const STOP_WORDS = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'else', 'when',
        'at', 'by', 'for', 'with', 'about', 'to', 'from', 'up', 'down', 'in',
        'out', 'on', 'off', 'over', 'under', 'is', 'are', 'was', 'were', 'be',
        'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
        'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can',
        'need', 'of', 'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you',
        'we', 'they', 'he', 'she', 'also', 'so', 'as', 'not', 'no', 'yes'
    ]);

    // Algorithm signatures for detection
    const ALGORITHM_PATTERNS = {
        bfs: [/queue/i, /deque/i, /popleft/i, /breadth/i],
        dfs: [/stack.*pop\(\)/i, /depth/i, /recursive/i],
        binary_search: [/left.*right.*mid/i, /mid\s*=\s*\(left\s*\+\s*right\)/i, /bisect/i],
        two_pointer: [/left.*right/i, /two.*pointer/i, /\bleft\b.*\bright\b.*while/is],
        sliding_window: [/window/i, /slide/i, /start.*end/i],
        dp: [/dp\[/i, /memo/i, /cache/i, /dynamic.*programming/i],
        backtrack: [/backtrack/i, /permut/i, /combin/i]
    };

    // Complexity thresholds
    const MAX_REASONABLE_LINES = 50;
    const MAX_REASONABLE_IMPORTS = 5;
    const COMPLEXITY_RATIO_THRESHOLD = 10; // generated:input ratio

    /**
     * Check if generated code matches user intent.
     * 
     * @param {string} userInput - Original pseudo-code or natural language
     * @param {string} generatedCode - LLM-generated Python code
     * @param {object} context - { skillId, drillType }
     * @returns {Promise<object>} { isHallucination, confidence, reason, suggestion }
     */
    async function check(userInput, generatedCode, context = {}) {
        // Handle empty input
        if (!userInput || !userInput.trim()) {
            return {
                isHallucination: true,
                confidence: 1.0,
                reason: 'User input is empty',
                suggestion: 'Please provide some pseudo-code or description'
            };
        }

        if (!generatedCode || !generatedCode.trim()) {
            return {
                isHallucination: true,
                confidence: 1.0,
                reason: 'Generated code is empty',
                suggestion: null
            };
        }

        const issues = [];
        let confidenceDeduction = 0;

        // 1. Keyword matching check
        const keywordResult = checkKeywordMatch(userInput, generatedCode);
        if (!keywordResult.matches) {
            issues.push(`Missing key terms: ${keywordResult.missingTerms.slice(0, 3).join(', ')}`);
            confidenceDeduction += 0.3;
        }

        // 2. Algorithm family check
        const algoResult = checkAlgorithmFamily(userInput, generatedCode, context.skillId);
        if (!algoResult.matches) {
            issues.push(`Algorithm mismatch: expected ${algoResult.expected}, got ${algoResult.detected}`);
            confidenceDeduction += 0.4;
        }

        // 3. Complexity check
        const complexityResult = checkComplexity(userInput, generatedCode);
        if (complexityResult.tooComplex) {
            issues.push(`Code is excessively complex: ${complexityResult.reason}`);
            confidenceDeduction += 0.3;
        }

        const confidence = Math.max(0, 1 - confidenceDeduction);
        const isHallucination = confidence < 0.5;

        return {
            isHallucination,
            confidence,
            reason: issues.length > 0 ? issues.join('; ') : null,
            suggestion: isHallucination ? 'Try regenerating or simplifying your description' : null,
            details: {
                keyword: keywordResult,
                algorithm: algoResult,
                complexity: complexityResult
            }
        };
    }

    /**
     * Extract key programming terms from text.
     */
    function extractKeyTerms(text) {
        const words = text.toLowerCase()
            .replace(/[^a-z0-9_\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2 && !STOP_WORDS.has(w));

        return [...new Set(words)];
    }

    /**
     * Check if generated code contains key terms from user input.
     */
    function checkKeywordMatch(userInput, generatedCode) {
        const userTerms = extractKeyTerms(userInput);
        const codeTerms = extractKeyTerms(generatedCode);

        const missingTerms = userTerms.filter(term =>
            !codeTerms.some(ct => ct.includes(term) || term.includes(ct))
        );

        // Allow up to 40% missing terms (some will be language-specific)
        const matchRatio = 1 - (missingTerms.length / Math.max(userTerms.length, 1));

        return {
            matches: matchRatio >= 0.6,
            matchRatio,
            missingTerms,
            userTerms,
            codeTerms
        };
    }

    /**
     * Detect the algorithm family from code.
     */
    function detectAlgorithmFamily(code) {
        const codeLower = code.toLowerCase();

        for (const [family, patterns] of Object.entries(ALGORITHM_PATTERNS)) {
            for (const pattern of patterns) {
                if (pattern.test(codeLower)) {
                    return family;
                }
            }
        }

        return 'unknown';
    }

    /**
     * Check if algorithm family matches expected.
     */
    function checkAlgorithmFamily(userInput, generatedCode, expectedSkillId) {
        const userAlgo = detectAlgorithmFamily(userInput);
        const codeAlgo = detectAlgorithmFamily(generatedCode);

        // If skill ID hints at algorithm, use that
        let expected = userAlgo;
        if (expectedSkillId) {
            for (const family of Object.keys(ALGORITHM_PATTERNS)) {
                if (expectedSkillId.includes(family)) {
                    expected = family;
                    break;
                }
            }
        }

        // If both unknown, can't determine mismatch
        if (expected === 'unknown' && codeAlgo === 'unknown') {
            return { matches: true, expected, detected: codeAlgo };
        }

        // If user specified an algorithm but code uses a different one
        if (expected !== 'unknown' && codeAlgo !== 'unknown' && expected !== codeAlgo) {
            return { matches: false, expected, detected: codeAlgo };
        }

        return { matches: true, expected, detected: codeAlgo };
    }

    /**
     * Check if generated code is excessively complex.
     */
    function checkComplexity(userInput, generatedCode) {
        const issues = [];

        // Line count
        const codeLines = generatedCode.split('\n').filter(l => l.trim()).length;
        const inputLines = userInput.split('\n').filter(l => l.trim()).length;

        if (codeLines > MAX_REASONABLE_LINES) {
            issues.push(`${codeLines} lines (max ${MAX_REASONABLE_LINES})`);
        }

        // Ratio check
        const ratio = codeLines / Math.max(inputLines, 1);
        if (ratio > COMPLEXITY_RATIO_THRESHOLD) {
            issues.push(`${ratio.toFixed(1)}x expansion ratio`);
        }

        // Import check
        const imports = (generatedCode.match(/^import\s+|^from\s+\w+\s+import/gm) || []).length;
        if (imports > MAX_REASONABLE_IMPORTS) {
            issues.push(`${imports} imports (max ${MAX_REASONABLE_IMPORTS})`);
        }

        // Class detection for simple inputs
        if (inputLines < 5 && generatedCode.includes('class ')) {
            issues.push('unnecessary class definition');
        }

        return {
            tooComplex: issues.length > 0,
            reason: issues.join(', '),
            metrics: { codeLines, inputLines, ratio, imports }
        };
    }

    return {
        check,
        extractKeyTerms,
        detectAlgorithmFamily,
        checkKeywordMatch,
        checkAlgorithmFamily,
        checkComplexity
    };
}));
