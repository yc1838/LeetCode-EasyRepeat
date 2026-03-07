/**
 * @jest-environment jsdom
 */

/**
 * Tests for HallucinationChecker module.
 * Validates that LLM-generated code matches user intent.
 */

describe('HallucinationChecker', () => {
    let HallucinationChecker;

    beforeEach(() => {
        jest.resetModules();
        HallucinationChecker = require('../src/background/hallucination_checker');
    });

    describe('check', () => {
        it('should pass when generated code contains key terms from pseudo-code', async () => {
            const userInput = `function binarySearch(arr, target):
                left = 0, right = len(arr)
                while left < right:
                    mid = (left + right) / 2
                    if arr[mid] == target: return mid
                return -1`;

            const generatedCode = `def binary_search(arr, target):
                left, right = 0, len(arr)
                while left < right:
                    mid = (left + right) // 2
                    if arr[mid] == target:
                        return mid
                return -1`;

            const context = { skillId: 'binary_search_basic', drillType: 'muscle-memory' };

            const result = await HallucinationChecker.check(userInput, generatedCode, context);

            expect(result.isHallucination).toBe(false);
            expect(result.confidence).toBeGreaterThan(0.7);
        });

        it('should detect hallucination when algorithm family is wrong', async () => {
            const userInput = `use BFS to traverse the graph
                queue = [start]
                while queue not empty:
                    node = queue.pop(0)
                    visit neighbors`;

            // LLM generated DFS instead of BFS
            const generatedCode = `def dfs(graph, start):
                stack = [start]
                visited = set()
                while stack:
                    node = stack.pop()
                    if node in visited:
                        continue
                    visited.add(node)
                    for neighbor in graph[node]:
                        stack.append(neighbor)`;

            const context = { skillId: 'bfs', drillType: 'muscle-memory' };

            const result = await HallucinationChecker.check(userInput, generatedCode, context);

            expect(result.isHallucination).toBe(true);
            expect(result.reason.toLowerCase()).toContain('algorithm');
        });

        it('should detect excessive complexity as potential hallucination', async () => {
            const userInput = `return the sum of two numbers`;

            // Overly complex generated code
            const generatedCode = `
import numpy as np
from functools import reduce
from itertools import combinations

class Calculator:
    def __init__(self):
        self.cache = {}
        self.history = []
    
    def add(self, a, b):
        key = (a, b)
        if key in self.cache:
            return self.cache[key]
        result = self._recursive_add(a, b)
        self.cache[key] = result
        self.history.append({'op': 'add', 'a': a, 'b': b, 'result': result})
        return result
    
    def _recursive_add(self, a, b):
        if b == 0:
            return a
        return self._recursive_add(a + 1, b - 1)
`;

            const context = { skillId: 'basic_math', drillType: 'muscle-memory' };

            const result = await HallucinationChecker.check(userInput, generatedCode, context);

            expect(result.isHallucination).toBe(true);
            expect(result.reason).toContain('complex');
        });

        it('should pass simple matching code', async () => {
            const userInput = `add two numbers a + b`;
            const generatedCode = `def add(a, b):\n    return a + b`;
            const context = { skillId: 'basic_math' };

            const result = await HallucinationChecker.check(userInput, generatedCode, context);

            expect(result.isHallucination).toBe(false);
        });

        it('should handle empty input gracefully', async () => {
            const result = await HallucinationChecker.check('', 'def foo(): pass', {});

            expect(result.isHallucination).toBe(true);
            expect(result.reason).toContain('empty');
        });
    });

    describe('extractKeyTerms', () => {
        it('should extract programming keywords from pseudo-code', () => {
            const input = 'use binary search with left and right pointers, return mid';
            const terms = HallucinationChecker.extractKeyTerms(input);

            expect(terms).toContain('binary');
            expect(terms).toContain('search');
            expect(terms).toContain('left');
            expect(terms).toContain('right');
            expect(terms).toContain('return');
        });

        it('should filter out common stop words', () => {
            const input = 'the function should return a value and also check if';
            const terms = HallucinationChecker.extractKeyTerms(input);

            expect(terms).not.toContain('the');
            expect(terms).not.toContain('a');
            expect(terms).not.toContain('and');
            expect(terms).toContain('function');
            expect(terms).toContain('return');
        });
    });

    describe('detectAlgorithmFamily', () => {
        it('should detect BFS algorithm', () => {
            const code = 'queue = deque([start])\nwhile queue:\n    node = queue.popleft()';
            const family = HallucinationChecker.detectAlgorithmFamily(code);

            expect(family).toBe('bfs');
        });

        it('should detect DFS algorithm', () => {
            const code = 'stack = [start]\nwhile stack:\n    node = stack.pop()';
            const family = HallucinationChecker.detectAlgorithmFamily(code);

            expect(family).toBe('dfs');
        });

        it('should detect binary search', () => {
            const code = 'left, right = 0, len(arr)\nwhile left < right:\n    mid = (left + right) // 2';
            const family = HallucinationChecker.detectAlgorithmFamily(code);

            expect(family).toBe('binary_search');
        });

        it('should detect two pointers', () => {
            const code = 'left, right = 0, len(arr) - 1\nwhile left < right:\n    sum = arr[left] + arr[right]';
            const family = HallucinationChecker.detectAlgorithmFamily(code);

            expect(family).toBe('two_pointer');
        });

        it('should return unknown for unrecognized patterns', () => {
            const code = 'x = 1\ny = 2\nreturn x + y';
            const family = HallucinationChecker.detectAlgorithmFamily(code);

            expect(family).toBe('unknown');
        });
    });
});
