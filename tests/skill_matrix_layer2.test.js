/**
 * Skill Matrix Layer 2 Integration Tests (TDD)
 * 
 * Tests for integrating error patterns (Layer 2) into SkillMatrix.
 */

// Mock chrome storage
global.chrome = {
    storage: {
        local: {
            get: jest.fn(() => Promise.resolve({})),
            set: jest.fn(() => Promise.resolve())
        },
        session: {
            get: jest.fn(() => Promise.resolve({})),
            set: jest.fn(() => Promise.resolve())
        }
    }
};

describe('SkillMatrix Layer 2 Integration', () => {
    let SkillMatrix, ErrorPatternDetector;

    beforeAll(() => {
        SkillMatrix = require('../src/background/skill_matrix');
        ErrorPatternDetector = require('../src/background/error_pattern_detector');
    });

    beforeEach(() => {
        jest.clearAllMocks();
        ErrorPatternDetector._resetCounts();
    });

    describe('recordPatternMistake', () => {
        it('should record a Layer 2 pattern mistake', async () => {
            const matrix = new SkillMatrix.SkillMatrix();
            await matrix.init();

            await matrix.recordPatternMistake('off-by-one');

            const summary = matrix.getPatternSummary();
            expect(summary.patterns['pattern:off-by-one']).toBeDefined();
            expect(summary.patterns['pattern:off-by-one'].mistakes).toBe(1);
        });

        it('should create pattern skill on first mistake', async () => {
            const matrix = new SkillMatrix.SkillMatrix();
            await matrix.init();

            await matrix.recordPatternMistake('null-check-missing');

            expect(matrix.dna.patterns).toBeDefined();
            expect(matrix.dna.patterns['pattern:null-check-missing']).toBeDefined();
        });

        it('should decrement pattern score on mistake', async () => {
            const matrix = new SkillMatrix.SkillMatrix();
            await matrix.init();

            await matrix.recordPatternMistake('off-by-one');
            await matrix.recordPatternMistake('off-by-one');

            const pattern = matrix.dna.patterns['pattern:off-by-one'];
            expect(pattern.score).toBeLessThan(50); // Started at BASE_SCORE
        });
    });

    describe('getWeakestPatterns', () => {
        it('should return weakest error patterns', async () => {
            const matrix = new SkillMatrix.SkillMatrix();
            await matrix.init();

            await matrix.recordPatternMistake('off-by-one');
            await matrix.recordPatternMistake('off-by-one');
            await matrix.recordPatternMistake('null-check-missing');

            const weakest = matrix.getWeakestPatterns(2);

            expect(weakest.length).toBe(2);
            expect(weakest[0].id).toBe('pattern:off-by-one'); // More mistakes = weaker
        });
    });

    describe('combined skill summary', () => {
        it('should include both Layer 1 and Layer 2 in getSummary', async () => {
            const matrix = new SkillMatrix.SkillMatrix();
            await matrix.init();

            // Record Layer 1 mistake (if binary_search exists)
            if (matrix.dna.skills['binary_search']) {
                await matrix.recordMistake('binary_search');
            }

            // Record Layer 2 mistake
            await matrix.recordPatternMistake('off-by-one');

            const summary = matrix.getCombinedSummary();

            expect(summary).toHaveProperty('layer1'); // LeetCode tags
            expect(summary).toHaveProperty('layer2'); // Error patterns
        });

        it('should show pattern activation status', async () => {
            const matrix = new SkillMatrix.SkillMatrix();
            await matrix.init();

            // Record pattern 3 times (threshold)
            await matrix.recordPatternMistake('loop-boundary');
            await matrix.recordPatternMistake('loop-boundary');
            await matrix.recordPatternMistake('loop-boundary');

            const summary = matrix.getPatternSummary();
            const pattern = summary.patterns['pattern:loop-boundary'];

            expect(pattern.active).toBe(true);
        });
    });

    describe('pattern tracking', () => {
        it('should track pattern count in ErrorPatternDetector', async () => {
            // Make ErrorPatternDetector available globally for cross-module tracking
            global.ErrorPatternDetector = ErrorPatternDetector;

            const matrix = new SkillMatrix.SkillMatrix();
            await matrix.init();

            await matrix.recordPatternMistake('bracket-indexing');
            await matrix.recordPatternMistake('bracket-indexing');

            const counts = await ErrorPatternDetector.getPatternCounts();
            expect(counts['bracket-indexing']).toBe(2);

            delete global.ErrorPatternDetector;
        });
    });
});
