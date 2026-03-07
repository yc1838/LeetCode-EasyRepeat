/**
 * Agent Loader Tests (TDD)
 * 
 * Tests for loading and initializing all Neural Agent modules.
 */

// Mock chrome APIs
global.chrome = {
    storage: {
        local: {
            get: jest.fn(() => Promise.resolve({})),
            set: jest.fn(() => Promise.resolve())
        }
    },
    runtime: {
        getManifest: jest.fn(() => ({
            version: '1.0.1',
            name: 'LeetCode EasyRepeat'
        }))
    }
};

// Setup fake IndexedDB
require('fake-indexeddb/auto');
const Dexie = require('dexie');
global.Dexie = Dexie;

describe('Agent Loader', () => {
    let AgentLoader;

    beforeAll(() => {
        AgentLoader = require('../src/background/agent_loader');
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getAgentStatus', () => {
        it('should return disabled by default', async () => {
            chrome.storage.local.get.mockResolvedValueOnce({});

            const status = await AgentLoader.getAgentStatus();

            expect(status.enabled).toBe(false);
        });

        it('should return enabled if previously set', async () => {
            chrome.storage.local.get.mockResolvedValueOnce({
                agentEnabled: true
            });

            const status = await AgentLoader.getAgentStatus();

            expect(status.enabled).toBe(true);
        });
    });

    describe('setAgentEnabled', () => {
        it('should persist enabled state', async () => {
            await AgentLoader.setAgentEnabled(true);

            expect(chrome.storage.local.set).toHaveBeenCalledWith({
                agentEnabled: true
            });
        });

        it('should persist disabled state', async () => {
            await AgentLoader.setAgentEnabled(false);

            expect(chrome.storage.local.set).toHaveBeenCalledWith({
                agentEnabled: false
            });
        });
    });

    describe('initializeModules', () => {
        it('should initialize all agent modules when enabled', async () => {
            chrome.storage.local.get.mockResolvedValueOnce({ agentEnabled: true });

            const result = await AgentLoader.initializeModules();

            expect(result.initialized).toBe(true);
            expect(result.modules).toContain('SkillMatrix');
            expect(result.modules).toContain('InsightsStore');
            expect(result.modules).toContain('DrillStore');
        });

        it('should skip initialization when disabled', async () => {
            chrome.storage.local.get.mockResolvedValueOnce({ agentEnabled: false });

            const result = await AgentLoader.initializeModules();

            expect(result.initialized).toBe(false);
            expect(result.modules).toEqual([]);
        });
    });

    describe('getAvailableModules', () => {
        it('should list all agent modules', () => {
            const modules = AgentLoader.getAvailableModules();

            expect(modules).toContain('SkillMatrix');
            expect(modules).toContain('InsightsStore');
            expect(modules).toContain('DrillStore');
            expect(modules).toContain('DigestScheduler');
            expect(modules).toContain('DrillGenerator');
        });
    });

    describe('getModuleStatus', () => {
        it('should return status for each module', async () => {
            chrome.storage.local.get.mockResolvedValueOnce({ agentEnabled: true });
            await AgentLoader.initializeModules();

            const status = AgentLoader.getModuleStatus();

            expect(status.SkillMatrix).toBeDefined();
            expect(status.InsightsStore).toBeDefined();
        });
    });

    describe('Feature Flags', () => {
        it('should respect individual feature flags', async () => {
            chrome.storage.local.get.mockResolvedValueOnce({
                agentEnabled: true,
                features: {
                    drillGenerator: false,
                    morningGreeting: true
                }
            });

            const flags = await AgentLoader.getFeatureFlags();

            expect(flags.drillGenerator).toBe(false);
            expect(flags.morningGreeting).toBe(true);
        });

        it('should default all features to true when enabled', async () => {
            chrome.storage.local.get.mockResolvedValueOnce({
                agentEnabled: true
            });

            const flags = await AgentLoader.getFeatureFlags();

            expect(flags.drillGenerator).toBe(true);
            expect(flags.morningGreeting).toBe(true);
            expect(flags.nightlyDigest).toBe(true);
        });
    });
});
