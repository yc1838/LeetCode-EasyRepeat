/**
 * Morning Greeting Component Tests (TDD)
 * 
 * Tests for the morning greeting banner that shows skill summary.
 */

// Mock DOM environment
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;
global.window = dom.window;
global.HTMLElement = dom.window.HTMLElement;

// Setup fake IndexedDB
require('fake-indexeddb/auto');
const Dexie = require('dexie');
global.Dexie = Dexie;

describe('Morning Greeting Component', () => {
    let MorningGreeting;
    let SkillMatrix;

    beforeAll(() => {
        SkillMatrix = require('../src/background/skill_matrix');
        MorningGreeting = require('../src/content/morning_greeting');
    });

    beforeEach(() => {
        document.body.innerHTML = '';
    });

    describe('createGreetingMessage', () => {
        it('should include time-based greeting', () => {
            const message = MorningGreeting.createGreetingMessage({
                hour: 9,
                totalSkills: 10,
                weakSkills: 2
            });

            expect(message).toContain('Good morning');
        });

        it('should include afternoon greeting', () => {
            const message = MorningGreeting.createGreetingMessage({
                hour: 14,
                totalSkills: 10,
                weakSkills: 0
            });

            expect(message).toContain('Good afternoon');
        });

        it('should mention weak skills if any', () => {
            const message = MorningGreeting.createGreetingMessage({
                hour: 9,
                totalSkills: 20,
                weakSkills: 3,
                topWeakSkill: 'binary_search_basic'
            });

            expect(message).toContain('3');
            expect(message).toContain('practice');
        });

        it('should congratulate if no weak skills', () => {
            const message = MorningGreeting.createGreetingMessage({
                hour: 10,
                totalSkills: 15,
                weakSkills: 0
            });

            expect(message).toMatch(/great|excellent|strong/i);
        });
    });

    describe('renderBanner', () => {
        it('should create banner element', () => {
            const banner = MorningGreeting.renderBanner({
                message: 'Hello!',
                pendingDrills: 3
            });

            expect(banner).toBeInstanceOf(HTMLElement);
            expect(banner.className).toContain('morning-greeting');
        });

        it('should include drill count badge', () => {
            const banner = MorningGreeting.renderBanner({
                message: 'Hello!',
                pendingDrills: 5
            });

            expect(banner.innerHTML).toContain('5');
            expect(banner.innerHTML).toContain('drill');
        });

        it('should include dismiss button', () => {
            const banner = MorningGreeting.renderBanner({
                message: 'Test',
                pendingDrills: 0
            });

            const dismissBtn = banner.querySelector('.dismiss-btn');
            expect(dismissBtn).not.toBeNull();
        });
    });

    describe('injectIntoPage', () => {
        it('should inject banner before target element', () => {
            // Create mock LeetCode layout
            document.body.innerHTML = `
                <div id="app">
                    <div class="problem-content">Problem here</div>
                </div>
            `;

            const banner = document.createElement('div');
            banner.className = 'morning-greeting';
            banner.textContent = 'Test banner';

            MorningGreeting.injectIntoPage(banner, '.problem-content');

            const injected = document.querySelector('.morning-greeting');
            expect(injected).not.toBeNull();
        });

        it('should not inject if already exists', () => {
            document.body.innerHTML = `
                <div class="morning-greeting">Existing</div>
                <div class="problem-content"></div>
            `;

            const banner = document.createElement('div');
            banner.className = 'morning-greeting';
            banner.textContent = 'New banner';

            MorningGreeting.injectIntoPage(banner, '.problem-content');

            const greetings = document.querySelectorAll('.morning-greeting');
            expect(greetings.length).toBe(1);
        });
    });

    describe('getSkillSummary', () => {
        it('should return skill statistics', async () => {
            // Mock skill matrix
            const mockMatrix = {
                dna: {
                    skills: {
                        'skill_a': { confidence: 0.8 },
                        'skill_b': { confidence: 0.3 },
                        'skill_c': { confidence: 0.5 }
                    }
                }
            };

            const summary = MorningGreeting.getSkillSummary(mockMatrix);

            expect(summary.totalSkills).toBe(3);
            expect(summary.weakSkills).toBe(1); // Below 0.5
            expect(summary.strongSkills).toBe(1); // Above 0.7
        });

        it('should identify top weak skill', () => {
            const mockMatrix = {
                dna: {
                    skills: {
                        'binary_search': { confidence: 0.2 },
                        'dfs': { confidence: 0.6 }
                    }
                }
            };

            const summary = MorningGreeting.getSkillSummary(mockMatrix);

            expect(summary.topWeakSkill).toBe('binary_search');
        });
    });

    describe('shouldShowGreeting', () => {
        it('should show once per day', () => {
            const result1 = MorningGreeting.shouldShowGreeting({ lastShown: null });
            expect(result1).toBe(true);

            // Same day - don't show
            const today = new Date().toDateString();
            const result2 = MorningGreeting.shouldShowGreeting({ lastShown: today });
            expect(result2).toBe(false);

            // Yesterday - show
            const yesterday = new Date(Date.now() - 86400000).toDateString();
            const result3 = MorningGreeting.shouldShowGreeting({ lastShown: yesterday });
            expect(result3).toBe(true);
        });
    });
});
