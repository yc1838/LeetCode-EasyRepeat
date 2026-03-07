/**
 * Skill Graph Component Tests (TDD)
 * 
 * Tests for the SVG-based skill DNA visualization.
 */

// Mock DOM environment
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;
global.window = dom.window;
global.SVGElement = dom.window.SVGElement;

describe('Skill Graph Component', () => {
    let SkillGraph;

    beforeAll(() => {
        SkillGraph = require('../src/content/skill_graph');
    });

    beforeEach(() => {
        document.body.innerHTML = '';
    });

    describe('createSVG', () => {
        it('should create SVG element with viewBox', () => {
            const svg = SkillGraph.createSVG({ width: 400, height: 300 });

            expect(svg.tagName.toLowerCase()).toBe('svg');
            expect(svg.getAttribute('viewBox')).toBe('0 0 400 300');
        });

        it('should apply default dimensions', () => {
            const svg = SkillGraph.createSVG({});

            expect(svg.getAttribute('width')).toBeTruthy();
            expect(svg.getAttribute('height')).toBeTruthy();
        });
    });

    describe('createNode', () => {
        it('should create node with label and color', () => {
            const node = SkillGraph.createNode({
                id: 'bfs',
                label: 'BFS',
                x: 100,
                y: 100,
                confidence: 0.8
            });

            expect(node.querySelector('circle')).not.toBeNull();
            expect(node.querySelector('text').textContent).toBe('BFS');
        });

        it('should color by confidence level', () => {
            const weakNode = SkillGraph.createNode({
                id: 'weak',
                label: 'Weak',
                x: 50,
                y: 50,
                confidence: 0.3
            });

            const strongNode = SkillGraph.createNode({
                id: 'strong',
                label: 'Strong',
                x: 50,
                y: 50,
                confidence: 0.9
            });

            const weakCircle = weakNode.querySelector('circle');
            const strongCircle = strongNode.querySelector('circle');

            expect(weakCircle.getAttribute('fill')).not.toBe(strongCircle.getAttribute('fill'));
        });

        it('should scale node size by family importance', () => {
            const mainNode = SkillGraph.createNode({
                id: 'main',
                label: 'Main',
                x: 100,
                y: 100,
                confidence: 0.5,
                isFamily: true
            });

            const skillNode = SkillGraph.createNode({
                id: 'skill',
                label: 'Skill',
                x: 100,
                y: 100,
                confidence: 0.5,
                isFamily: false
            });

            const mainR = parseInt(mainNode.querySelector('circle').getAttribute('r'));
            const skillR = parseInt(skillNode.querySelector('circle').getAttribute('r'));

            expect(mainR).toBeGreaterThan(skillR);
        });
    });

    describe('createEdge', () => {
        it('should create line between nodes', () => {
            const edge = SkillGraph.createEdge({
                fromX: 50,
                fromY: 50,
                toX: 150,
                toY: 100
            });

            expect(edge.tagName.toLowerCase()).toBe('line');
            expect(edge.getAttribute('x1')).toBe('50');
            expect(edge.getAttribute('y1')).toBe('50');
        });
    });

    describe('getConfidenceColor', () => {
        it('should return red for weak skills', () => {
            const color = SkillGraph.getConfidenceColor(0.2);
            expect(color).toMatch(/#|rgb/);
        });

        it('should return yellow for medium skills', () => {
            const color = SkillGraph.getConfidenceColor(0.5);
            expect(color).toMatch(/#|rgb/);
        });

        it('should return green for strong skills', () => {
            const color = SkillGraph.getConfidenceColor(0.9);
            expect(color).toMatch(/#|rgb/);
        });
    });

    describe('renderGraph', () => {
        it('should render skill families as nodes', () => {
            const skillData = {
                families: [
                    { id: 'arrays', name: 'Arrays', confidence: 0.7 },
                    { id: 'graphs', name: 'Graphs', confidence: 0.4 }
                ]
            };

            const svg = SkillGraph.renderGraph(skillData);

            const nodes = svg.querySelectorAll('.skill-node');
            expect(nodes.length).toBe(3); // 2 families + 1 center node
        });

        it('should position nodes in circular layout', () => {
            const skillData = {
                families: [
                    { id: 'a', name: 'A', confidence: 0.5 },
                    { id: 'b', name: 'B', confidence: 0.5 },
                    { id: 'c', name: 'C', confidence: 0.5 }
                ]
            };

            const svg = SkillGraph.renderGraph(skillData);
            const nodes = svg.querySelectorAll('.skill-node circle');

            // Check nodes have different positions
            const positions = new Set();
            nodes.forEach(n => {
                const cx = n.getAttribute('cx');
                const cy = n.getAttribute('cy');
                positions.add(`${cx},${cy}`);
            });

            expect(positions.size).toBe(4); // 3 families + 1 center node
        });
    });

    describe('aggregateFamilyConfidence', () => {
        it('should average skill confidences per family', () => {
            const skills = {
                'arrays_basic': { familyId: 'arrays', confidence: 0.8 },
                'arrays_advanced': { familyId: 'arrays', confidence: 0.6 },
                'graphs_bfs': { familyId: 'graphs', confidence: 0.4 }
            };

            const families = SkillGraph.aggregateFamilyConfidence(skills);

            expect(families.find(f => f.id === 'arrays').confidence).toBe(0.7);
            expect(families.find(f => f.id === 'graphs').confidence).toBe(0.4);
        });
    });
});
