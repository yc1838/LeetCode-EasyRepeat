/**
 * Skill Matrix Tests
 * 
 * Tests for the Skill DNA schema, confidence calculation, and decay logic.
 */

// Mock chrome APIs
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

const {
    SkillMatrix,
    calculateConfidence,
    applyDecay,
    getTrend,
    createSkillDNA,
    DECAY_FACTOR,
    MAX_SCORE,
    MIN_SCORE
} = require('../src/background/skill_matrix');

describe('Skill Matrix', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('calculateConfidence', () => {
        it('should start at 50 (neutral) for new skill', () => {
            const score = calculateConfidence({
                correct: 0,
                mistakes: 0,
                drillsCompleted: 0
            });
            expect(score).toBe(50);
        });

        it('should increase score for correct submissions', () => {
            const score = calculateConfidence({
                correct: 3,
                mistakes: 0,
                drillsCompleted: 0
            });
            expect(score).toBeGreaterThan(50);
        });

        it('should decrease score for mistakes', () => {
            const score = calculateConfidence({
                correct: 0,
                mistakes: 3,
                drillsCompleted: 0
            });
            expect(score).toBeLessThan(50);
        });

        it('should cap score at MAX_SCORE (100)', () => {
            const score = calculateConfidence({
                correct: 100,
                mistakes: 0,
                drillsCompleted: 50
            });
            expect(score).toBe(MAX_SCORE);
        });

        it('should cap score at MIN_SCORE (0)', () => {
            const score = calculateConfidence({
                correct: 0,
                mistakes: 100,
                drillsCompleted: 0
            });
            expect(score).toBe(MIN_SCORE);
        });

        it('should boost score for completed drills', () => {
            const withDrills = calculateConfidence({
                correct: 5,
                mistakes: 2,
                drillsCompleted: 3
            });
            const withoutDrills = calculateConfidence({
                correct: 5,
                mistakes: 2,
                drillsCompleted: 0
            });
            expect(withDrills).toBeGreaterThan(withoutDrills);
        });
    });

    describe('applyDecay', () => {
        it('should decay score based on days since last seen', () => {
            const original = 80;
            const decayed = applyDecay(original, 7); // 1 week
            expect(decayed).toBeLessThan(original);
            expect(decayed).toBeGreaterThan(50); // Should trend toward 50, not 0
        });

        it('should not decay if seen today', () => {
            const original = 80;
            const decayed = applyDecay(original, 0);
            expect(decayed).toBe(original);
        });

        it('should decay more for longer periods', () => {
            const original = 80;
            const decay7 = applyDecay(original, 7);
            const decay30 = applyDecay(original, 30);
            expect(decay30).toBeLessThan(decay7);
        });

        it('should not decay below MIN_SCORE', () => {
            const original = 10;
            const decayed = applyDecay(original, 365);
            expect(decayed).toBeGreaterThanOrEqual(MIN_SCORE);
        });
    });

    describe('getTrend', () => {
        it('should return "improving" if recent scores higher', () => {
            const history = [40, 45, 50, 55, 60];
            expect(getTrend(history)).toBe('improving');
        });

        it('should return "declining" if recent scores lower', () => {
            const history = [60, 55, 50, 45, 40];
            expect(getTrend(history)).toBe('declining');
        });

        it('should return "stable" if scores are flat', () => {
            const history = [50, 51, 49, 50, 51];
            expect(getTrend(history)).toBe('stable');
        });

        it('should handle insufficient data', () => {
            expect(getTrend([])).toBe('unknown');
            expect(getTrend([50])).toBe('unknown');
        });
    });

    describe('createSkillDNA', () => {
        it('should initialize all skills from taxonomy', () => {
            const dna = createSkillDNA();

            // Check structure
            expect(dna).toHaveProperty('version');
            expect(dna).toHaveProperty('skills');
            expect(dna).toHaveProperty('lastUpdated');

            // Check skill count (should match taxonomy)
            const skillCount = Object.keys(dna.skills).length;
            expect(skillCount).toBeGreaterThanOrEqual(60);
        });

        it('should initialize all skills with base values', () => {
            const dna = createSkillDNA();
            const firstSkill = Object.values(dna.skills)[0];

            expect(firstSkill).toHaveProperty('score', 50);
            expect(firstSkill).toHaveProperty('correct', 0);
            expect(firstSkill).toHaveProperty('mistakes', 0);
            expect(firstSkill).toHaveProperty('trend', 'unknown');
        });
    });

    describe('SkillMatrix class', () => {
        let matrix;

        beforeEach(() => {
            matrix = new SkillMatrix();
        });

        it('should initialize with empty DNA', async () => {
            await matrix.init();
            expect(matrix.dna).toBeDefined();
        });

        it('should record a mistake for a skill', async () => {
            await matrix.init();
            await matrix.recordMistake('off_by_one');

            const skill = matrix.dna.skills['off_by_one'];
            expect(skill.mistakes).toBe(1);
            expect(skill.score).toBeLessThan(50);
        });

        it('should record a correct for a skill', async () => {
            await matrix.init();
            await matrix.recordCorrect('binary_search_basic');

            const skill = matrix.dna.skills['binary_search_basic'];
            expect(skill.correct).toBe(1);
            expect(skill.score).toBeGreaterThan(50);
        });

        it('should get weakest skills', async () => {
            await matrix.init();

            // Simulate some mistakes
            await matrix.recordMistake('off_by_one');
            await matrix.recordMistake('off_by_one');
            await matrix.recordMistake('edge_empty');

            const weakest = matrix.getWeakestSkills(3);
            expect(weakest.length).toBeLessThanOrEqual(3);
            expect(weakest[0].id).toBe('off_by_one'); // Most mistakes
        });
    });
});

describe('Ran Today Flag', () => {
    it('should prevent double runs', async () => {
        const { hasRunToday, markAsRunToday } = require('../src/background/skill_matrix');

        // First check - hasn't run
        chrome.storage.session.get.mockResolvedValueOnce({});
        const first = await hasRunToday();
        expect(first).toBe(false);

        // Mark as run
        await markAsRunToday();
        expect(chrome.storage.session.set).toHaveBeenCalled();
    });
});
