/**
 * Skill Animations Tests (TDD)
 * 
 * Tests for CSS animations on skill nodes.
 */

// Mock DOM environment
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>');
global.document = dom.window.document;
global.window = dom.window;
global.HTMLElement = dom.window.HTMLElement;

describe('Skill Animations', () => {
    let SkillAnimations;

    beforeAll(() => {
        SkillAnimations = require('../src/content/skill_animations');
    });

    beforeEach(() => {
        document.body.innerHTML = '';
    });

    describe('addPulsingEffect', () => {
        it('should add pulse class to declining skill node', () => {
            document.body.innerHTML = '<div class="skill-node" data-skill-id="bfs"></div>';
            const node = document.querySelector('.skill-node');

            SkillAnimations.addPulsingEffect(node);

            expect(node.classList.contains('pulsing')).toBe(true);
        });

        it('should not add pulse if already pulsing', () => {
            document.body.innerHTML = '<div class="skill-node pulsing" data-skill-id="bfs"></div>';
            const node = document.querySelector('.skill-node');

            SkillAnimations.addPulsingEffect(node);

            expect([...node.classList].filter(c => c === 'pulsing').length).toBe(1);
        });
    });

    describe('addSparkleEffect', () => {
        it('should add sparkle class to mastered skill', () => {
            document.body.innerHTML = '<div class="skill-node" data-skill-id="dp"></div>';
            const node = document.querySelector('.skill-node');

            SkillAnimations.addSparkleEffect(node);

            expect(node.classList.contains('sparkle')).toBe(true);
        });
    });

    describe('removeAnimations', () => {
        it('should remove all animation classes', () => {
            document.body.innerHTML = '<div class="skill-node pulsing sparkle"></div>';
            const node = document.querySelector('.skill-node');

            SkillAnimations.removeAnimations(node);

            expect(node.classList.contains('pulsing')).toBe(false);
            expect(node.classList.contains('sparkle')).toBe(false);
        });
    });

    describe('animateConfidenceChange', () => {
        it('should add decrease animation for confidence drop', () => {
            document.body.innerHTML = '<div class="skill-node" data-skill-id="test"></div>';
            const node = document.querySelector('.skill-node');

            SkillAnimations.animateConfidenceChange(node, 0.7, 0.5);

            expect(node.classList.contains('confidence-decrease')).toBe(true);
        });

        it('should add increase animation for confidence gain', () => {
            document.body.innerHTML = '<div class="skill-node" data-skill-id="test"></div>';
            const node = document.querySelector('.skill-node');

            SkillAnimations.animateConfidenceChange(node, 0.5, 0.8);

            expect(node.classList.contains('confidence-increase')).toBe(true);
        });
    });

    describe('getCSS', () => {
        it('should return CSS with keyframe animations', () => {
            const css = SkillAnimations.getCSS();

            expect(css).toContain('@keyframes');
            expect(css).toContain('pulse');
        });
    });

    describe('injectStyles', () => {
        it('should add style element to head', () => {
            SkillAnimations.injectStyles();

            const styleTag = document.querySelector('style[data-skill-animations]');
            expect(styleTag).not.toBeNull();
        });

        it('should not duplicate style tags', () => {
            SkillAnimations.injectStyles();
            SkillAnimations.injectStyles();

            const styleTags = document.querySelectorAll('style[data-skill-animations]');
            expect(styleTags.length).toBe(1);
        });
    });
});
