/**
 * Error Pattern Detector
 * 
 * Detects and categorizes error patterns from code submissions.
 * Layer 2 of the skill taxonomy system.
 */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.ErrorPatternDetector = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    // --- Constants ---
    const PATTERN_THRESHOLD = 3; // Occurrences needed to become "active"
    const LAYER2_PREFIX = 'pattern:';

    // --- Built-in Pattern Definitions ---
    const BUILT_IN_PATTERNS = [
        {
            id: 'off-by-one',
            name: 'Off-by-One Error',
            description: 'Array/loop index is one too high or low',
            triggers: ['len(arr) + 1', 'len(arr)]', 'range(n + 1)', '< n + 1'],
            errorHints: ['IndexError', 'out of range', 'out of bounds']
        },
        {
            id: 'null-check-missing',
            name: 'Missing Null Check',
            description: 'Accessing property of potentially null object',
            triggers: ['.left.', '.right.', '.next.', '.val'],
            errorHints: ['NoneType', 'null', 'undefined', 'Cannot read properties']
        },
        {
            id: 'bracket-indexing',
            name: 'Bracket Indexing Error',
            description: 'Incorrect array/string index access',
            triggers: ['[len(', '[-0]', '[i + 1]'],
            errorHints: ['IndexError', 'out of range']
        },
        {
            id: 'loop-boundary',
            name: 'Loop Boundary Error',
            description: 'Incorrect loop termination condition',
            triggers: ['while left < right', 'while i < n', 'for i in range'],
            errorHints: ['Wrong Answer', 'Time Limit', 'infinite loop']
        },
        {
            id: 'edge-case-empty',
            name: 'Empty Input Not Handled',
            description: 'Missing check for empty array/string/null input',
            triggers: ['if not arr', 'if len(arr) == 0', 'if arr is None'],
            errorHints: ['empty', 'IndexError', 'out of range']
        },
        {
            id: 'integer-overflow',
            name: 'Integer Overflow',
            description: 'Calculation exceeds integer bounds',
            triggers: ['left + right', '* 10', '** 2'],
            errorHints: ['overflow', 'OverflowError', 'too large']
        }
    ];

    // In-memory pattern counts (for testing; real impl uses chrome.storage)
    let patternCounts = {};

    /**
     * Detect patterns in code and error message.
     */
    function detectPatterns(code, error) {
        const detected = [];

        for (const pattern of BUILT_IN_PATTERNS) {
            let score = 0;

            // Check triggers in code
            for (const trigger of pattern.triggers) {
                if (code.includes(trigger)) {
                    score += 2;
                }
            }

            // Check error hints
            for (const hint of pattern.errorHints) {
                if (error.toLowerCase().includes(hint.toLowerCase())) {
                    score += 3;
                }
            }

            // Threshold for detection
            if (score >= 3) {
                detected.push(pattern.id);
            }
        }

        return detected;
    }

    /**
     * Record a pattern occurrence.
     */
    async function recordPattern(patternId) {
        patternCounts[patternId] = (patternCounts[patternId] || 0) + 1;

        // Persist to storage
        if (typeof chrome !== 'undefined' && chrome.storage) {
            await chrome.storage.local.set({ patternCounts: { ...patternCounts } });
        }
    }

    /**
     * Get all pattern counts (returns in-memory state).
     */
    async function getPatternCounts() {
        return { ...patternCounts };
    }

    /**
     * Load pattern counts from storage (call on init).
     */
    async function loadFromStorage() {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            const result = await chrome.storage.local.get({ patternCounts: {} });
            patternCounts = result.patternCounts || {};
        }
    }

    /**
     * Check if pattern has reached threshold (is "active").
     */
    async function isActivePattern(patternId) {
        const counts = await getPatternCounts();
        return (counts[patternId] || 0) >= PATTERN_THRESHOLD;
    }

    /**
     * Get built-in pattern definitions.
     */
    function getBuiltInPatterns() {
        return BUILT_IN_PATTERNS.map(p => ({
            id: p.id,
            name: p.name,
            description: p.description
        }));
    }

    /**
     * Get a specific pattern by ID.
     */
    function getPattern(patternId) {
        const pattern = BUILT_IN_PATTERNS.find(p => p.id === patternId);
        if (!pattern) return null;

        return {
            id: pattern.id,
            name: pattern.name,
            description: pattern.description
        };
    }

    /**
     * Convert pattern ID to Layer 2 skill ID.
     */
    function toSkillId(patternId) {
        return LAYER2_PREFIX + patternId;
    }

    /**
     * Extract pattern ID from Layer 2 skill ID.
     */
    function fromSkillId(skillId) {
        if (!skillId.startsWith(LAYER2_PREFIX)) return null;
        return skillId.slice(LAYER2_PREFIX.length);
    }

    /**
     * Check if skill ID is a Layer 2 (pattern) skill.
     */
    function isLayer2Skill(skillId) {
        return skillId.startsWith(LAYER2_PREFIX);
    }

    /**
     * Reset counts (for testing).
     */
    function _resetCounts() {
        patternCounts = {};
    }

    return {
        detectPatterns,
        recordPattern,
        getPatternCounts,
        isActivePattern,
        getBuiltInPatterns,
        getPattern,
        toSkillId,
        fromSkillId,
        isLayer2Skill,
        PATTERN_THRESHOLD,
        _resetCounts
    };
}));
