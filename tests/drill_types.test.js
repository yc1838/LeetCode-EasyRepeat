/**
 * Drill Types Tests (TDD)
 * 
 * Tests for each drill type's rendering and interaction logic.
 */

// Setup fake IndexedDB
require('fake-indexeddb/auto');
const Dexie = require('dexie');
global.Dexie = Dexie;

describe('Drill Types', () => {
    let DrillTypes;

    beforeAll(() => {
        DrillTypes = require('../src/background/drill_types');
    });

    describe('Fill-in-Blank', () => {
        it('should render question with blank placeholder', () => {
            const drill = {
                type: 'fill-in-blank',
                content: 'In binary search, use left ___ right',
                answer: '<='
            };

            const rendered = DrillTypes.renderFillInBlank(drill);

            expect(rendered.html).toContain('___');
            expect(rendered.inputType).toBe('text');
        });

        it('should verify correct answer', () => {
            const drill = { answer: '<=' };

            expect(DrillTypes.verifyFillInBlank(drill, '<=')).toBe(true);
            expect(DrillTypes.verifyFillInBlank(drill, '<')).toBe(false);
        });

        it('should handle case-insensitive matching for words', () => {
            const drill = { answer: 'queue' };

            expect(DrillTypes.verifyFillInBlank(drill, 'Queue')).toBe(true);
            expect(DrillTypes.verifyFillInBlank(drill, 'QUEUE')).toBe(true);
        });
    });

    describe('Spot-the-Bug', () => {
        it('should render buggy code with line numbers', () => {
            const drill = {
                type: 'spot-bug',
                content: 'for (int i = 0; i <= n; i++) {\n  arr[i] = 0;\n}',
                answer: 'line 1'
            };

            const rendered = DrillTypes.renderSpotBug(drill);

            expect(rendered.html).toContain('1:');
            expect(rendered.html).toContain('2:');
            expect(rendered.inputType).toBe('select-line');
        });

        it('should verify correct line selection', () => {
            const drill = { answer: 'line 1' };

            expect(DrillTypes.verifySpotBug(drill, 1)).toBe(true);
            expect(DrillTypes.verifySpotBug(drill, 2)).toBe(false);
        });

        it('should handle answer variations', () => {
            const drill = { answer: 'Line 3: off-by-one' };

            expect(DrillTypes.verifySpotBug(drill, 3)).toBe(true);
        });
    });

    describe('Critique', () => {
        it('should render code for review', () => {
            const drill = {
                type: 'critique',
                content: 'def fib(n):\n  if n <= 1: return n\n  return fib(n-1) + fib(n-2)',
                answer: null
            };

            const rendered = DrillTypes.renderCritique(drill);

            expect(rendered.html).toContain('fib');
            expect(rendered.inputType).toBe('textarea');
        });

        it('should return response for AI grading', () => {
            const drill = { type: 'critique', content: 'code here' };
            const response = 'Could use memoization for O(n) time';

            const result = DrillTypes.prepareCritiqueForGrading(drill, response);

            expect(result.original).toBe('code here');
            expect(result.response).toBe(response);
            expect(result.needsAIGrading).toBe(true);
        });
    });

    describe('Muscle-Memory', () => {
        it('should render prompt without showing solution', () => {
            const drill = {
                type: 'muscle-memory',
                content: 'Write BFS traversal from memory',
                answer: null
            };

            const rendered = DrillTypes.renderMuscleMemory(drill);

            expect(rendered.html).toContain('Write BFS');
            expect(rendered.inputType).toBe('code-editor');
        });

        it('should return response for AI grading', () => {
            const drill = { type: 'muscle-memory', content: 'Write DFS' };
            const code = 'def dfs(node): ...';

            const result = DrillTypes.prepareMuscleMemoryForGrading(drill, code);

            expect(result.prompt).toBe('Write DFS');
            expect(result.submission).toBe(code);
            expect(result.needsAIGrading).toBe(true);
        });
    });

    describe('getDrillRenderer', () => {
        it('should return correct renderer for each type', () => {
            expect(DrillTypes.getDrillRenderer('fill-in-blank')).toBe(DrillTypes.renderFillInBlank);
            expect(DrillTypes.getDrillRenderer('spot-bug')).toBe(DrillTypes.renderSpotBug);
            expect(DrillTypes.getDrillRenderer('critique')).toBe(DrillTypes.renderCritique);
            expect(DrillTypes.getDrillRenderer('muscle-memory')).toBe(DrillTypes.renderMuscleMemory);
        });

        it('should return null for invalid type', () => {
            expect(DrillTypes.getDrillRenderer('invalid')).toBeNull();
        });
    });
});
