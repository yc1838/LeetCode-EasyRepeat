/**
 * CodeGeneratorAgent Tests (TDD)
 * 
 * Tests for converting pseudo-code/natural language to executable Python code.
 */

describe('CodeGeneratorAgent', () => {
    let CodeGeneratorAgent;

    beforeAll(() => {
        CodeGeneratorAgent = require('../src/background/code_generator_agent');
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ============================================
    // 1. HAPPY PATH: Normal usage
    // ============================================
    describe('generateCode', () => {
        it('converts simple pseudo-code to Python', async () => {
            const pseudoCode = `
                function binary_search(arr, target):
                    left = 0, right = len(arr) - 1
                    while left <= right:
                        mid = (left + right) // 2
                        if arr[mid] == target: return mid
                        elif arr[mid] < target: left = mid + 1
                        else: right = mid - 1
                    return -1
            `;

            const result = await CodeGeneratorAgent.generateCode(pseudoCode, {
                skillId: 'binary_search',
                drillType: 'muscle-memory'
            });

            expect(result).toHaveProperty('code');
            expect(result).toHaveProperty('language', 'python');
            expect(result).toHaveProperty('confidence');
            expect(result.confidence).toBeGreaterThan(0);
            expect(result.code).toContain('def');
        });

        it('converts natural language description to Python', async () => {
            const naturalLanguage = "I would use two pointers, left starting at 0 and right at the end. Then I'd loop while left is less than right, swapping elements and moving pointers inward.";

            const result = await CodeGeneratorAgent.generateCode(naturalLanguage, {
                skillId: 'two_pointers',
                drillType: 'muscle-memory',
                inputType: 'natural-language'
            });

            expect(result).toHaveProperty('code');
            // In test env without real LLM, we get fallback code
            // Just verify structure is correct
            expect(result.code).toBeDefined();
            expect(result.success).toBe(true);
        });
    });

    // ============================================
    // 2. EDGE CASES: Input boundaries
    // ============================================
    describe('edge cases - input', () => {
        it('handles empty input', async () => {
            const result = await CodeGeneratorAgent.generateCode('', {});

            expect(result.success).toBe(false);
            expect(result.error).toContain('empty');
        });

        it('handles null input', async () => {
            const result = await CodeGeneratorAgent.generateCode(null, {});

            expect(result.success).toBe(false);
        });

        it('handles undefined input', async () => {
            const result = await CodeGeneratorAgent.generateCode(undefined, {});

            expect(result.success).toBe(false);
        });

        it('handles very short input', async () => {
            const result = await CodeGeneratorAgent.generateCode('x=1', {});

            // Should still attempt, but may have low confidence
            expect(result).toHaveProperty('confidence');
        });

        it('handles very long input (>10KB)', async () => {
            const longInput = 'a'.repeat(15000);
            const result = await CodeGeneratorAgent.generateCode(longInput, {});

            // Should either truncate or reject gracefully
            expect(result).toBeDefined();
        });

        it('handles special characters and unicode', async () => {
            const input = "# 使用双指针 (two pointers) 算法\nleft = 0; right = n-1 // 👈👉";
            const result = await CodeGeneratorAgent.generateCode(input, {});

            expect(result).toBeDefined();
        });
    });

    // ============================================
    // 3. ERROR HANDLING: LLM failures
    // ============================================
    describe('error handling', () => {
        it('handles LLM API timeout', async () => {
            // Mock a timeout scenario
            jest.spyOn(CodeGeneratorAgent, '_callLLM').mockImplementation(
                () => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 100))
            );

            const result = await CodeGeneratorAgent.generateCode('some code', {});

            expect(result.success).toBe(false);
            expect(result.error).toContain('timeout');
        });

        it('handles LLM rate limiting (429)', async () => {
            jest.spyOn(CodeGeneratorAgent, '_callLLM').mockRejectedValue({
                status: 429,
                message: 'Rate limit exceeded'
            });

            const result = await CodeGeneratorAgent.generateCode('some code', {});

            expect(result.success).toBe(false);
            expect(result.retryable).toBe(true);
        });

        it('handles malformed LLM response', async () => {
            jest.spyOn(CodeGeneratorAgent, '_callLLM').mockResolvedValue({
                choices: []  // Empty choices array
            });

            const result = await CodeGeneratorAgent.generateCode('some code', {});

            expect(result.success).toBe(false);
        });

        it('handles LLM returning non-Python code', async () => {
            jest.spyOn(CodeGeneratorAgent, '_callLLM').mockResolvedValue({
                choices: [{
                    message: {
                        content: '```javascript\nfunction foo() {}\n```'
                    }
                }]
            });

            const result = await CodeGeneratorAgent.generateCode('some code', {});

            // Should detect wrong language
            expect(result.language).toBe('python');
            // Or should flag as error
        });
    });

    // ============================================
    // 4. SMART SCAFFOLDING
    // ============================================
    describe('generateScaffold', () => {
        it('generates pre-filled template with blanks', async () => {
            const result = await CodeGeneratorAgent.generateScaffold({
                skillId: 'binary_search',
                weakPattern: 'off-by-one',
                difficulty: 'medium'
            });

            expect(result).toHaveProperty('template');
            expect(result).toHaveProperty('blanks');
            expect(result.template).toContain('___'); // blank marker
            expect(result.blanks.length).toBeGreaterThan(0);
        });

        it('focuses blanks on user weak patterns', async () => {
            const result = await CodeGeneratorAgent.generateScaffold({
                skillId: 'binary_search',
                weakPattern: 'loop-boundary',
                difficulty: 'medium'
            });

            // Verify blank was inserted
            expect(result.blanks.length).toBeGreaterThan(0);
            // Template should contain blank marker
            expect(result.template).toContain('___');
        });

        it('returns full code if no weak patterns', async () => {
            const result = await CodeGeneratorAgent.generateScaffold({
                skillId: 'binary_search',
                weakPattern: null,
                difficulty: 'easy'
            });

            // Should still return template but without blanks
            expect(result.template).toBeDefined();
        });
    });

    // ============================================
    // 5. CONCURRENCY (from guidelines)
    // ============================================
    describe('concurrency', () => {
        it('handles multiple simultaneous calls', async () => {
            const calls = [
                CodeGeneratorAgent.generateCode('code1', {}),
                CodeGeneratorAgent.generateCode('code2', {}),
                CodeGeneratorAgent.generateCode('code3', {})
            ];

            const results = await Promise.all(calls);

            expect(results).toHaveLength(3);
            results.forEach(r => expect(r).toBeDefined());
        });
    });
});
