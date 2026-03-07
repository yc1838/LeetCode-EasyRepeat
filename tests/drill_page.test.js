/**
 * Drill Page Tests (TDD)
 * 
 * Tests for the full-page drill practice experience.
 */

// Mock DOM environment
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>');
global.document = dom.window.document;
global.window = dom.window;
global.HTMLElement = dom.window.HTMLElement;

// Mock chrome
global.chrome = {
    storage: {
        local: {
            get: jest.fn(() => Promise.resolve({})),
            set: jest.fn(() => Promise.resolve())
        }
    },
    runtime: {
        getURL: jest.fn((path) => `chrome-extension://abc123/${path}`)
    }
};

describe('Drill Page', () => {
    let DrillPage;

    beforeAll(() => {
        DrillPage = require('../src/drills/drill_page');
    });

    beforeEach(() => {
        jest.clearAllMocks();
        document.body.innerHTML = '';
    });

    describe('getDrillFromURL', () => {
        it('should parse drill ID from URL params', () => {
            const drillId = DrillPage.getDrillFromURL('?drillId=abc123');
            expect(drillId).toBe('abc123');
        });

        it('should return null if no drill ID', () => {
            const drillId = DrillPage.getDrillFromURL('');
            expect(drillId).toBeNull();
        });
    });

    describe('renderDrillContent', () => {
        it('should render fill-in-blank drill', () => {
            const drill = {
                id: '1',
                type: 'fill-in-blank',
                content: 'Complete: for i in range(___):',
                answer: 'n',
                skillId: 'loops'
            };

            const html = DrillPage.renderDrillContent(drill);

            expect(html).toContain('fill-in-blank');
            expect(html).toContain('Complete');
            expect(html).toContain('input');
        });

        it('should render spot-bug drill', () => {
            const drill = {
                id: '2',
                type: 'spot-bug',
                content: 'def foo(arr):\n  return arr[len(arr)]',
                answer: 'off-by-one',
                skillId: 'arrays'
            };

            const html = DrillPage.renderDrillContent(drill);

            expect(html).toContain('spot-bug');
            expect(html).toContain('input');  // Hidden input for bug selection
        });

        it('should render critique drill', () => {
            const drill = {
                id: '3',
                type: 'critique',
                content: 'Analyze this O(n^2) solution',
                skillId: 'complexity'
            };

            const html = DrillPage.renderDrillContent(drill);

            expect(html).toContain('critique');
            expect(html).toContain('textarea');
        });

        it('should render muscle-memory drill', () => {
            const drill = {
                id: '4',
                type: 'muscle-memory',
                content: 'Write binary search from scratch',
                skillId: 'binary_search'
            };

            const html = DrillPage.renderDrillContent(drill);

            expect(html).toContain('muscle-memory');
            expect(html).toContain('textarea');
        });
    });

    describe('getSkillDisplayName', () => {
        it('should format snake_case to Title Case', () => {
            expect(DrillPage.getSkillDisplayName('binary_search')).toBe('Binary Search');
            expect(DrillPage.getSkillDisplayName('two_pointers')).toBe('Two Pointers');
        });
    });

    describe('getDrillTypeIcon', () => {
        it('should return different icons for each type', () => {
            expect(DrillPage.getDrillTypeIcon('fill-in-blank')).toBe('✍️');
            expect(DrillPage.getDrillTypeIcon('spot-bug')).toBe('🐛');
            expect(DrillPage.getDrillTypeIcon('critique')).toBe('💬');
            expect(DrillPage.getDrillTypeIcon('muscle-memory')).toBe('💪');
        });
    });

    describe('getUserAnswer', () => {
        it('should get value from input for fill-in-blank', () => {
            document.body.innerHTML = '<input id="drill-answer" value="test answer">';

            const answer = DrillPage.getUserAnswer('fill-in-blank');

            expect(answer).toBe('test answer');
        });

        it('should get value from textarea for other types', () => {
            document.body.innerHTML = '<textarea id="drill-answer">my critique</textarea>';

            const answer = DrillPage.getUserAnswer('critique');

            expect(answer).toBe('my critique');
        });
    });

    describe('renderResult', () => {
        it('should show success for correct answer', () => {
            const result = { correct: true, feedback: 'Great job!' };

            const html = DrillPage.renderResult(result);

            expect(html).toContain('correct');
            expect(html).toContain('Great job');
        });

        it('should show failure for incorrect answer', () => {
            const result = { correct: false, feedback: 'Try again' };

            const html = DrillPage.renderResult(result);

            expect(html).toContain('incorrect');
            expect(html).toContain('Try again');
        });
    });

    describe('openDrillPage', () => {
        it('should construct URL with drill ID', () => {
            const url = DrillPage.getDrillPageURL('drill123');

            expect(url).toContain('drills.html');
            expect(url).toContain('drillId=drill123');
        });
    });
});
