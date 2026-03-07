const DrillTypes = require('../src/background/drill_types');
const DrillVerifier = require('../src/background/drill_verifier');

describe('Drill Edge Cases & Hardcoded Logic Audit', () => {

    describe('Spot-Bug Verification (Hardcoded Regex & Line Parsing)', () => {
        // "Line X" logic relies on regex /line\s*(\d+)/i
        // It's brittle to format changes.

        const drill = {
            type: 'spot-bug',
            answer: 'Line 2: off-by-one error',
            content: 'line 1\nline 2\nline 3'
        };

        test('should handle standard "Line X" format', () => {
            // UI sends string "2"
            expect(DrillTypes.verifySpotBug(drill, "2")).toBe(true);
            // Integer 2
            expect(DrillTypes.verifySpotBug(drill, 2)).toBe(true);
        });

        test('should fail gracefully if answer format misses "Line X"', () => {
            const badDrill = { ...drill, answer: 'Just text description' };
            // Should return false, not crash
            expect(DrillTypes.verifySpotBug(badDrill, "2")).toBe(false);
        });

        test('should be case insensitive to "line"', () => {
            const lowerDrill = { ...drill, answer: 'line 2: error' };
            expect(DrillTypes.verifySpotBug(lowerDrill, "2")).toBe(true);

            const upperDrill = { ...drill, answer: 'LINE 2: error' };
            expect(DrillTypes.verifySpotBug(upperDrill, "2")).toBe(true);
        });

        test('should handle whitespace in regex', () => {
            const spaceDrill = { ...drill, answer: 'Line   2 : error' };
            expect(DrillTypes.verifySpotBug(spaceDrill, "2")).toBe(true);
        });

        test('should NOT match if number is part of other text?', () => {
            // Regex is /line\s*(\d+)/i.
            // "Outline 2" -> matches "line 2" inside "Outline"? 
            // "Outline" contains "line". "line 2" matches.
            // This is a potential bug/feature.
            const trickyDrill = { ...drill, answer: 'Outline 2 sets the context' };
            expect(DrillTypes.verifySpotBug(trickyDrill, "2")).toBe(true);
        });
    });

    describe('Fill-In-Blank Verification (Hardcoded Whitespace/Case Rules)', () => {
        // Logic: 
        // if /^[a-zA-Z]+$/ (only letters) -> case insensitive
        // else -> exact match

        const drill = {
            type: 'fill-in-blank',
            answer: 'continue',
            content: 'while True: ___'
        };

        test('should be case insensitive for pure words', () => {
            expect(DrillTypes.verifyFillInBlank(drill, 'Continue')).toBe(true);
            expect(DrillTypes.verifyFillInBlank(drill, 'CONTINUE')).toBe(true);
        });

        test('should handle trimmed inputs', () => {
            expect(DrillTypes.verifyFillInBlank(drill, ' continue ')).toBe(true);
        });

        test('should be strict for symbols/mixed content', () => {
            const symbolDrill = { ...drill, answer: 'len(nums)' };
            // Not pure alpha, so strict match expected
            expect(DrillTypes.verifyFillInBlank(symbolDrill, 'Len(nums)')).toBe(false); // Case sensitive
            expect(DrillTypes.verifyFillInBlank(symbolDrill, 'len(nums)')).toBe(true);
        });

        test('should handle empty answers gracefully', () => {
            const emptyDrill = { ...drill, answer: '' };
            expect(DrillTypes.verifyFillInBlank(emptyDrill, '')).toBe(true);
            expect(DrillTypes.verifyFillInBlank(emptyDrill, '   ')).toBe(true); // Trims to empty
        });

        test('verifyFillInBlank should handle null/undefined user answer', () => {
            const drill = { answer: 'test' };
            // Should verify safely as false (empty string != 'test')
            expect(DrillTypes.verifyFillInBlank(drill, null)).toBe(false);
            expect(DrillTypes.verifyFillInBlank(drill, undefined)).toBe(false);
        });
    });

    describe('AI Grading Prompt Logic (Hardcoded Prompts)', () => {
        // We can't test AI response, but we can test the Prompt Builder

        test('should build critique prompt correctly', () => {
            const data = { original: 'def foo(): pass', response: 'Good code' };
            const prompt = DrillVerifier.buildGradingPrompt('critique', data);

            expect(prompt).toContain('Grade this code critique');
            expect(prompt).toContain('User\'s Critique:');
            // Check hardcoded JSON schema requirement
            expect(prompt).toContain('"score": 0.0-1.0');
        });

        test('should build muscle-memory prompt correctly', () => {
            const data = { prompt: 'Write loop', submission: 'for i in range(10): pass' };
            const prompt = DrillVerifier.buildGradingPrompt('muscle-memory', data);

            expect(prompt).toContain('Grade this code written from memory');
            // Check hardcoded passing threshold in prompt text
            expect(prompt).toContain('true if score >= 0.7');
        });

        test('should return empty string for unknown types', () => {
            expect(DrillVerifier.buildGradingPrompt('unknown-type', {})).toBe('');
        });
    });

    describe('Weird Inputs / Robustness', () => {
        test('verifySpotBug should handle non-integer inputs without crashing', () => {
            // UI could send "undefined" or keys
            expect(DrillTypes.verifySpotBug({ answer: 'Line 2' }, undefined)).toBe(false);
            expect(DrillTypes.verifySpotBug({ answer: 'Line 2' }, null)).toBe(false);
            expect(DrillTypes.verifySpotBug({ answer: 'Line 2' }, {})).toBe(false);
        });
    });

});
