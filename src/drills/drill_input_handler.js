/**
 * DrillInputHandler.js
 * Handles parsing, validation, and formatting of user input for muscle-memory drills.
 * Supports pseudo-code and natural language.
 */
const DrillInputHandler = {
    /**
     * Parse raw user input into structured format.
     * @param {string} rawInput - The user's input string
     * @param {string} [forcedType] - Optional override ('pseudo-code', 'natural-language')
     * @returns {object} { type, content, valid }
     */
    parseInput(rawInput, forcedType = null) {
        if (!rawInput || typeof rawInput !== 'string') {
            return { type: 'unknown', content: '', valid: false };
        }

        const cleanInput = rawInput.trim();

        if (forcedType) {
            return {
                type: forcedType,
                content: cleanInput,
                valid: this.validate(cleanInput).valid
            };
        }

        const type = this._detectType(cleanInput);

        return {
            type: type,
            content: cleanInput,
            valid: this.validate(cleanInput).valid
        };
    },

    /**
     * Validate if input is sufficient for processing.
     * @param {string} input 
     * @returns {object} { valid: boolean, errors: string[] }
     */
    validate(input) {
        const errors = [];
        if (!input || !input.trim()) {
            errors.push('Input cannot be empty');
        } else if (input.trim().length < 10) {
            errors.push('Input is too short (min 10 chars)');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    },

    /**
     * Format input for LLM prompt context
     * @param {string} input 
     * @param {string} type 
     */
    formatForLLM(input, type) {
        if (type === 'pseudo-code') {
            return "```pseudo\n" + input + "\n```";
        }
        return input;
    },

    // --- Internal Helpers ---

    _detectType(input) {
        // Pseudo-code heuristics
        // 1. Look for coding keywords
        const keywords = [
            'function', 'def', 'return', 'if', 'else', 'while', 'for',
            'var', 'let', 'const', 'print', 'len\\(', '\\(', '\\)',
            '=', '\\+', '-', '\\*', '/', '\\[', '\\]'
        ];

        // 2. Look for indentation (lines starting with 2+ spaces)
        const indentedLines = (input.match(/^\s{2,}/gm) || []).length;

        // 3. Count keyword occurrences
        let keywordCount = 0;
        keywords.forEach(kw => {
            const regex = new RegExp(`\\b${kw}`, 'g');
            keywordCount += (input.match(regex) || []).length;
        });

        // 4. Heuristic scoring
        // Pseudo-code typically has symbols and indentation
        const symbolRatio = (input.replace(/[a-zA-Z0-9\s]/g, '').length) / input.length;

        // If it looks structural (indentation OR enough keywords OR high symbol density)
        if (indentedLines > 0 || keywordCount > 2 || symbolRatio > 0.1) {
            return 'pseudo-code';
        }

        // Default to natural language
        return 'natural-language';
    }
};

// Export for both Node (Jest) and Browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DrillInputHandler;
} else {
    self.DrillInputHandler = DrillInputHandler;
}
