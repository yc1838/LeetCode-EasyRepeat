/**
 * @jest-environment jsdom
 */

const popupUI = require('../src/popup/popup_ui.js');

describe('UI Topic Rendering', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="vector-list"></div>';
    });

    test('should render topic tags', () => {
        const problems = [{
            slug: 'two-sum',
            title: 'Two Sum',
            difficulty: 'Easy',
            topics: ['Array', 'Hash Table'],
            interval: 1,
            nextReviewDate: new Date().toISOString(),
            easeFactor: 2.5
        }];

        popupUI.renderVectors(problems, 'vector-list', true);

        const card = document.querySelector('.vector-card');
        const topics = card.querySelectorAll('.topic-tag');

        expect(topics.length).toBe(2);
        expect(topics[0].textContent).toBe('ARRAY');
        expect(topics[1].textContent).toBe('HASH TABLE');
    });

    test('should limit topics to 3', () => {
        const problems = [{
            slug: 'test',
            title: 'Test',
            topics: ['A', 'B', 'C', 'D'],
            interval: 1,
            nextReviewDate: new Date().toISOString(),
            easeFactor: 2.5
        }];

        popupUI.renderVectors(problems, 'vector-list', true);
        const topics = document.querySelectorAll('.topic-tag');
        expect(topics.length).toBe(3);
        expect(topics[2].textContent).toBe('C');
    });

    test('should handle missing topics', () => {
        const problems = [{
            slug: 'test',
            title: 'Test',
            topics: null, // should handle null
            interval: 1,
            nextReviewDate: new Date().toISOString(),
            easeFactor: 2.5
        }];

        popupUI.renderVectors(problems, 'vector-list', true);
        const topics = document.querySelectorAll('.topic-tag');
        expect(topics.length).toBe(0);

        const topicRow = document.querySelector('.topic-row');
        expect(topicRow).toBeNull();
    });
});
