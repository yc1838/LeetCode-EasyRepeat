/**
 * Error Pattern Detector Tests (TDD)
 * 
 * Tests for detecting and categorizing error patterns from code submissions.
 */

// Mock chrome storage
global.chrome = {
    storage: {
        local: {
            get: jest.fn(() => Promise.resolve({})),
            set: jest.fn(() => Promise.resolve())
        }
    }
};

describe('ErrorPatternDetector', () => {
    let ErrorPatternDetector;

    beforeAll(() => {
        ErrorPatternDetector = require('../src/background/error_pattern_detector');
    });

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset pattern counts between tests
        ErrorPatternDetector._resetCounts();
    });

    describe('detectPatterns', () => {
        it('should detect off-by-one error pattern', () => {
            const code = `
def foo(arr):
    for i in range(len(arr) + 1):  # Bug: should be len(arr)
        print(arr[i])
            `;
            const error = 'IndexError: list index out of range';

            const patterns = ErrorPatternDetector.detectPatterns(code, error);

            expect(patterns).toContain('off-by-one');
        });

        it('should detect null/undefined check pattern', () => {
            const code = `
def foo(node):
    return node.val + node.left.val  # Bug: left could be None
            `;
            const error = "AttributeError: 'NoneType' object has no attribute 'val'";

            const patterns = ErrorPatternDetector.detectPatterns(code, error);

            expect(patterns).toContain('null-check-missing');
        });

        it('should detect bracket indexing error', () => {
            const code = `arr[len(arr)]`;
            const error = 'IndexError: list index out of range';

            const patterns = ErrorPatternDetector.detectPatterns(code, error);

            expect(patterns).toContain('bracket-indexing');
        });

        it('should detect loop boundary error', () => {
            const code = `
while left < right:  # Bug: should be <=
    mid = (left + right) // 2
            `;
            const error = 'Wrong Answer';

            const patterns = ErrorPatternDetector.detectPatterns(code, error);

            expect(patterns).toContain('loop-boundary');
        });

        it('should return empty array if no pattern detected', () => {
            const code = 'print("hello")';
            const error = '';

            const patterns = ErrorPatternDetector.detectPatterns(code, error);

            expect(patterns).toEqual([]);
        });
    });

    describe('pattern frequency tracking', () => {
        it('should increment pattern count', async () => {
            await ErrorPatternDetector.recordPattern('off-by-one');
            await ErrorPatternDetector.recordPattern('off-by-one');

            const counts = await ErrorPatternDetector.getPatternCounts();

            expect(counts['off-by-one']).toBe(2);
        });

        it('should create new pattern after threshold reached', async () => {
            // Record same error 3 times (threshold)
            await ErrorPatternDetector.recordPattern('my-custom-error');
            await ErrorPatternDetector.recordPattern('my-custom-error');
            await ErrorPatternDetector.recordPattern('my-custom-error');

            const isActive = await ErrorPatternDetector.isActivePattern('my-custom-error');

            expect(isActive).toBe(true);
        });

        it('should not create pattern below threshold', async () => {
            await ErrorPatternDetector.recordPattern('rare-error');
            await ErrorPatternDetector.recordPattern('rare-error');

            const isActive = await ErrorPatternDetector.isActivePattern('rare-error');

            expect(isActive).toBe(false);
        });
    });

    describe('built-in patterns', () => {
        it('should have predefined Layer 2 patterns', () => {
            const builtIn = ErrorPatternDetector.getBuiltInPatterns();

            expect(builtIn).toContainEqual(expect.objectContaining({ id: 'off-by-one' }));
            expect(builtIn).toContainEqual(expect.objectContaining({ id: 'null-check-missing' }));
            expect(builtIn).toContainEqual(expect.objectContaining({ id: 'bracket-indexing' }));
            expect(builtIn).toContainEqual(expect.objectContaining({ id: 'loop-boundary' }));
        });

        it('should return pattern with description', () => {
            const pattern = ErrorPatternDetector.getPattern('off-by-one');

            expect(pattern).toHaveProperty('id', 'off-by-one');
            expect(pattern).toHaveProperty('name');
            expect(pattern).toHaveProperty('description');
        });
    });

    describe('integration with SkillMatrix', () => {
        it('should format pattern as Layer 2 skill ID', () => {
            const skillId = ErrorPatternDetector.toSkillId('off-by-one');

            expect(skillId).toBe('pattern:off-by-one');
        });

        it('should extract pattern from skill ID', () => {
            const patternId = ErrorPatternDetector.fromSkillId('pattern:off-by-one');

            expect(patternId).toBe('off-by-one');
        });

        it('should identify Layer 2 skill IDs', () => {
            expect(ErrorPatternDetector.isLayer2Skill('pattern:off-by-one')).toBe(true);
            expect(ErrorPatternDetector.isLayer2Skill('binary_search')).toBe(false);
        });
    });
});
