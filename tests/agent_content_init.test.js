/**
 * Agent Content Initializer Tests (TDD)
 * 
 * Tests for initializing the Neural Agent UI on LeetCode pages.
 */

// Mock DOM environment
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><head></head><body><div class="problem-content"></div></body></html>');
global.document = dom.window.document;
global.window = dom.window;
global.HTMLElement = dom.window.HTMLElement;

// Mock chrome
global.chrome = {
    storage: {
        local: {
            get: jest.fn(() => Promise.resolve({ agentEnabled: true })),
            set: jest.fn(() => Promise.resolve())
        }
    },
    runtime: {
        sendMessage: jest.fn(() => Promise.resolve({}))
    }
};

// Mock MorningGreeting
global.MorningGreeting = {
    createGreetingMessage: jest.fn(() => 'Test greeting'),
    renderBanner: jest.fn(() => {
        const el = document.createElement('div');
        el.className = 'morning-greeting';
        return el;
    }),
    injectIntoPage: jest.fn((banner) => {
        document.body.appendChild(banner);
        return true;
    }),
    styles: '.morning-greeting { color: red; }'
};

describe('Agent Content Initializer', () => {
    let AgentContentInit;

    beforeAll(() => {
        AgentContentInit = require('../src/content/agent_content_init');
    });

    beforeEach(() => {
        jest.clearAllMocks();
        document.body.innerHTML = '<div class="problem-content"></div>';
    });

    describe('shouldInitialize', () => {
        it('should return true on LeetCode problem page', () => {
            const result = AgentContentInit.shouldInitialize('https://leetcode.com/problems/two-sum/');
            expect(result).toBe(true);
        });

        it('should return false on non-problem pages', () => {
            const result = AgentContentInit.shouldInitialize('https://leetcode.com/explore/');
            expect(result).toBe(false);
        });

        it('should return false on non-LeetCode sites', () => {
            const result = AgentContentInit.shouldInitialize('https://github.com/');
            expect(result).toBe(false);
        });
    });

    describe('isAgentEnabled', () => {
        it('should check chrome storage for enabled state', async () => {
            chrome.storage.local.get.mockResolvedValueOnce({ agentEnabled: true });

            const enabled = await AgentContentInit.isAgentEnabled();

            expect(enabled).toBe(true);
            expect(chrome.storage.local.get).toHaveBeenCalledWith('agentEnabled');
        });

        it('should return false when not set', async () => {
            chrome.storage.local.get.mockResolvedValueOnce({});

            const enabled = await AgentContentInit.isAgentEnabled();

            expect(enabled).toBe(false);
        });
    });

    describe('injectStyles', () => {
        it('should inject CSS into document head', () => {
            AgentContentInit.injectStyles();

            const style = document.querySelector('style[data-agent-styles]');
            expect(style).not.toBeNull();
        });

        it('should not duplicate style injection', () => {
            AgentContentInit.injectStyles();
            AgentContentInit.injectStyles();

            const styles = document.querySelectorAll('style[data-agent-styles]');
            expect(styles.length).toBe(1);
        });
    });

    describe('initializeMorningGreeting', () => {
        it('should inject greeting when enabled', async () => {
            chrome.storage.local.get.mockResolvedValue({
                agentEnabled: true,
                greetingLastShown: null
            });

            await AgentContentInit.initializeMorningGreeting({
                totalSkills: 10,
                weakSkills: 2,
                pendingDrills: 3
            });

            const greeting = document.querySelector('.morning-greeting');
            expect(greeting).not.toBeNull();
        });
    });

    describe('cleanup', () => {
        it('should remove all agent UI elements', () => {
            document.body.innerHTML = `
                <div class="morning-greeting"></div>
                <div class="skill-graph"></div>
                <div class="drill-queue"></div>
            `;

            AgentContentInit.cleanup();

            expect(document.querySelector('.morning-greeting')).toBeNull();
            expect(document.querySelector('.skill-graph')).toBeNull();
            expect(document.querySelector('.drill-queue')).toBeNull();
        });
    });
});
