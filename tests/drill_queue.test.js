/**
 * Drill Queue Widget Tests (TDD)
 * 
 * Tests for the drill queue display in the popup.
 */

// Mock DOM environment
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;
global.window = dom.window;
global.HTMLElement = dom.window.HTMLElement;

describe('Drill Queue Widget', () => {
    let DrillQueue;

    beforeAll(() => {
        DrillQueue = require('../src/content/drill_queue');
    });

    beforeEach(async () => {
        document.body.innerHTML = '';
    });

    describe('renderQueue', () => {
        it('should render empty state when no drills', () => {
            const queue = DrillQueue.renderQueue([]);

            expect(queue.className).toContain('drill-queue');
            expect(queue.innerHTML).toContain('No drills');
        });

        it('should render list of pending drills', () => {
            const drills = [
                { id: '1', type: 'fill-in-blank', skillId: 'bfs', content: 'Q1' },
                { id: '2', type: 'spot-bug', skillId: 'dfs', content: 'Q2' }
            ];

            const queue = DrillQueue.renderQueue(drills);

            const items = queue.querySelectorAll('.drill-item');
            expect(items.length).toBe(2);
        });

        it('should show drill type icons', () => {
            const drills = [
                { id: '1', type: 'fill-in-blank', skillId: 'a', content: 'Q' }
            ];

            const queue = DrillQueue.renderQueue(drills);

            expect(queue.innerHTML).toMatch(/📝|✍️/); // Fill icon
        });
    });

    describe('getDrillTypeIcon', () => {
        it('should return different icons for each type', () => {
            const fillIcon = DrillQueue.getDrillTypeIcon('fill-in-blank');
            const bugIcon = DrillQueue.getDrillTypeIcon('spot-bug');
            const critiqueIcon = DrillQueue.getDrillTypeIcon('critique');
            const memoryIcon = DrillQueue.getDrillTypeIcon('muscle-memory');

            expect(fillIcon).not.toBe(bugIcon);
            expect(critiqueIcon).not.toBe(memoryIcon);
        });
    });

    describe('renderDrillItem', () => {
        it('should render drill with type and skill', () => {
            const drill = {
                id: 'test',
                type: 'fill-in-blank',
                skillId: 'binary_search',
                content: 'Test question'
            };

            const item = DrillQueue.renderDrillItem(drill);

            expect(item.className).toContain('drill-item');
            expect(item.dataset.drillId).toBe('test');
            expect(item.innerHTML.toLowerCase()).toContain('binary');
        });

        it('should include start button', () => {
            const drill = {
                id: 'test',
                type: 'spot-bug',
                skillId: 'dfs',
                content: 'Find bug'
            };

            const item = DrillQueue.renderDrillItem(drill);

            const btn = item.querySelector('.start-drill-btn');
            expect(btn).not.toBeNull();
        });
    });

    describe('renderHeader', () => {
        it('should show drill count', () => {
            const header = DrillQueue.renderHeader(5);

            expect(header.innerHTML).toContain('5');
            expect(header.innerHTML).toContain('Drill');
        });
    });

    describe('attachStartHandler', () => {
        it('should call callback when start clicked', () => {
            const callback = jest.fn();
            const drill = { id: 'test', type: 'fill-in-blank', skillId: 'a', content: 'Q' };
            const item = DrillQueue.renderDrillItem(drill);

            DrillQueue.attachStartHandler(item, drill, callback);
            item.querySelector('.start-drill-btn').click();

            expect(callback).toHaveBeenCalledWith(drill);
        });
    });

    describe('formatSkillName', () => {
        it('should convert snake_case to Title Case', () => {
            expect(DrillQueue.formatSkillName('binary_search_basic')).toBe('Binary Search Basic');
        });
    });
});
