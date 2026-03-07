/**
 * Digest Orchestrator Tests (TDD)
 * 
 * Tests for the nightly digest pipeline that coordinates
 * harvesting, analysis, and skill updates.
 */

// Mock chrome APIs
global.chrome = {
    storage: {
        local: {
            get: jest.fn(() => Promise.resolve({
                geminiApiKey: 'test-key',
                skillDNA: null
            })),
            set: jest.fn(() => Promise.resolve())
        },
        session: {
            get: jest.fn(() => Promise.resolve({})),
            set: jest.fn(() => Promise.resolve())
        }
    }
};

// Mock fetch
global.fetch = jest.fn();

// Setup fake IndexedDB
require('fake-indexeddb/auto');
const Dexie = require('dexie');
global.Dexie = Dexie;

describe('Digest Orchestrator', () => {
    let DigestOrchestrator;
    let ShadowLogger;

    beforeAll(() => {
        // Import ShadowLogger first
        const shadowModule = require('../src/content/shadow_logger');
        ShadowLogger = shadowModule.ShadowLogger;

        // Then import orchestrator
        DigestOrchestrator = require('../src/background/digest_orchestrator');
    });

    beforeEach(async () => {
        jest.clearAllMocks();
        global.fetch.mockReset();

        // Reset ShadowLogger
        const logger = new ShadowLogger();
        await logger.init();
        await logger.clear();
    });

    describe('runNightlyDigest', () => {
        it('should skip if already run today', async () => {
            chrome.storage.session.get.mockResolvedValueOnce({
                digestRanToday: new Date().toISOString().split('T')[0]
            });

            const result = await DigestOrchestrator.runNightlyDigest();

            expect(result.skipped).toBe(true);
            expect(result.reason).toContain('already');
        });

        it('should skip if no submissions today', async () => {
            chrome.storage.session.get.mockResolvedValueOnce({});

            const result = await DigestOrchestrator.runNightlyDigest();

            expect(result.skipped).toBe(true);
            expect(result.reason).toContain('No submissions');
        });

        it('should run full pipeline with submissions', async () => {
            // Reset session (hasn't run)
            chrome.storage.session.get.mockResolvedValue({});

            // Add test submission
            const logger = new ShadowLogger();
            await logger.init();
            await logger.log({
                problemSlug: 'two-sum',
                problemTitle: '1. Two Sum',
                result: 'Wrong Answer',
                code: 'def twoSum(nums, target): return []',
                errorDetails: { type: 'Wrong Answer' }
            });

            // Mock Gemini response
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    candidates: [{
                        content: {
                            parts: [{
                                text: JSON.stringify({
                                    skillUpdates: [
                                        { skillId: 'two_sum_pattern', delta: -8, reason: 'Failed two sum' }
                                    ],
                                    insights: ['Forgot to use hashmap'],
                                    recommendedDrills: []
                                })
                            }]
                        }
                    }]
                })
            });

            const result = await DigestOrchestrator.runNightlyDigest();

            expect(result.success).toBe(true);
            expect(result.submissionsProcessed).toBe(1);
            expect(result.skillsUpdated).toBeGreaterThanOrEqual(0);
        });

        it('should handle Gemini API failure gracefully', async () => {
            chrome.storage.session.get.mockResolvedValue({});

            // Add submission
            const logger = new ShadowLogger();
            await logger.init();
            await logger.log({ problemSlug: 'test', result: 'Accepted' });

            // Mock API failure
            global.fetch.mockResolvedValueOnce({ ok: false, status: 500 });

            const result = await DigestOrchestrator.runNightlyDigest();

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('should mark as run after completion', async () => {
            chrome.storage.session.get.mockResolvedValue({});

            const logger = new ShadowLogger();
            await logger.init();
            await logger.log({ problemSlug: 'test', result: 'Accepted' });

            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    candidates: [{
                        content: { parts: [{ text: '{"skillUpdates":[],"insights":[]}' }] }
                    }]
                })
            });

            await DigestOrchestrator.runNightlyDigest();

            expect(chrome.storage.session.set).toHaveBeenCalled();
        });
    });

    describe('applySkillUpdates', () => {
        it('should update skill DNA based on analysis', async () => {
            const updates = [
                { skillId: 'bfs', delta: 5, reason: 'Correct BFS usage' },
                { skillId: 'off_by_one', delta: -10, reason: 'Off-by-one error' }
            ];

            const result = await DigestOrchestrator.applySkillUpdates(updates);

            expect(result.applied).toBe(2);
        });

        it('should skip unknown skills with warning', async () => {
            const updates = [
                { skillId: 'unknown_skill_xyz', delta: 5, reason: 'test' }
            ];

            const result = await DigestOrchestrator.applySkillUpdates(updates);

            expect(result.skipped).toBeGreaterThan(0);
        });
    });

    describe('generateDailySummary', () => {
        it('should create a summary of the digest results', async () => {
            const digestResult = {
                success: true,
                submissionsProcessed: 5,
                skillsUpdated: 3,
                insights: ['Weak on edge cases', 'Strong on hash maps'],
                recommendedDrills: [{ skillId: 'edge_empty', type: 'spot-bug' }]
            };

            const summary = DigestOrchestrator.generateDailySummary(digestResult);

            expect(summary).toContain('5');
            expect(summary).toContain('edge cases');
        });
    });
});
