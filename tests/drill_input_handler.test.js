const DrillInputHandler = require('../src/drills/drill_input_handler');

// Mock DOM if needed, but we can test logic purely first
describe('DrillInputHandler', () => {
    describe('parseInput', () => {
        test('identifies pseudo-code by indentation and keywords', () => {
            const input = `
            function search(arr, target):
                left = 0
                right = len(arr) - 1
            `;
            const result = DrillInputHandler.parseInput(input);
            expect(result.type).toBe('pseudo-code');
            expect(result.valid).toBe(true);
        });

        test('identifies natural language by sentence structure', () => {
            const input = "I would start by initializing two pointers, left and right. Then I loop while left is less than right.";
            const result = DrillInputHandler.parseInput(input);
            expect(result.type).toBe('natural-language');
            expect(result.valid).toBe(true);
        });

        test('handles explicit type override', () => {
            const input = "some ambiguous input";
            const result = DrillInputHandler.parseInput(input, 'pseudo-code');
            expect(result.type).toBe('pseudo-code');
        });
    });

    describe('validate', () => {
        test('rejects empty input', () => {
            const result = DrillInputHandler.validate('');
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Input cannot be empty');
        });

        test('rejects input that is too short', () => {
            const result = DrillInputHandler.validate('abc');
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Input is too short (min 10 chars)');
        });

        test('accepts valid input', () => {
            const result = DrillInputHandler.validate('valid input string that is long enough');
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        test('rejects whitespace only', () => {
            const result = DrillInputHandler.validate('   \n   \t  ');
            expect(result.valid).toBe(false);
        });
    });

    describe('formatForLLM', () => {
        test('wraps pseudo-code in block', () => {
            const input = "x = 1";
            const formatted = DrillInputHandler.formatForLLM(input, 'pseudo-code');
            expect(formatted).toContain('```pseudo');
            expect(formatted).toContain('x = 1');
        });

        test('keeps natural language as is', () => {
            const input = "Just do it";
            const formatted = DrillInputHandler.formatForLLM(input, 'natural-language');
            expect(formatted).toBe(input);
        });
    });
});
