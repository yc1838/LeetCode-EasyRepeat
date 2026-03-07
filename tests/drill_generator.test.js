/**
 * Drill Generator Tests (TDD)
 * 
 * Tests for generating personalized drills from weak skills.
 */

// Mock chrome APIs
global.chrome = {
    storage: {
        local: {
            get: jest.fn(() => Promise.resolve({ geminiApiKey: 'test-key' })),
            set: jest.fn(() => Promise.resolve())
        }
    }
};

jest.mock('../src/background/llm_gateway', () => ({
    analyzeSubmissions: jest.fn()
}));

// Setup fake IndexedDB
require('fake-indexeddb/auto');
const Dexie = require('dexie');
global.Dexie = Dexie;

describe('Drill Generator', () => {
    let DrillGenerator;
    let DrillStore;
    let LLMGateway;

    beforeAll(() => {
        DrillStore = require('../src/background/drill_store');
        DrillGenerator = require('../src/background/drill_generator');
        LLMGateway = require('../src/background/llm_gateway');
    });

    beforeEach(async () => {
        jest.clearAllMocks();
        LLMGateway.analyzeSubmissions.mockReset();

        const store = new DrillStore.DrillStore();
        await store.init();
        await store.clear();
    });

    describe('generateDrillsForSkill', () => {
        it('should generate drills for a weak skill', async () => {
            LLMGateway.analyzeSubmissions.mockResolvedValueOnce({
                drills: [{
                    type: 'fill-in-blank',
                    content: 'In binary search, the condition should be left ___ right',
                    answer: '<=',
                    difficulty: 'easy'
                }]
            });

            const drills = await DrillGenerator.generateDrillsForSkill('binary_search_basic', {
                insight: 'Off-by-one errors in loop bounds',
                count: 1
            });

            expect(drills.length).toBe(1);
            expect(drills[0].type).toBe('fill-in-blank');
            expect(drills[0].skillId).toBe('binary_search_basic');
        });

        it('should handle multiple drill generation', async () => {
            LLMGateway.analyzeSubmissions.mockResolvedValueOnce({
                drills: [
                    { type: 'fill-in-blank', content: 'Complete the loop condition:\nwhile ___:\n    mid = (l + r) // 2', answer: 'l <= r', difficulty: 'easy' },
                    { type: 'spot-bug', content: 'def solve(nums):\n    return nums[len(nums)]', answer: 'line 2', difficulty: 'medium' }
                ]
            });

            const drills = await DrillGenerator.generateDrillsForSkill('off_by_one', { count: 2 });

            expect(drills.length).toBe(2);
        });

        it('should handle API failure gracefully', async () => {
            LLMGateway.analyzeSubmissions.mockResolvedValueOnce({ error: 'HTTP 500' });

            const drills = await DrillGenerator.generateDrillsForSkill('bfs');

            expect(drills).toEqual([]);
        });
    });

    describe('buildGenerationPrompt', () => {
        it('should include skill context in prompt', () => {
            const prompt = DrillGenerator.buildGenerationPrompt('binary_search_basic', {
                insight: 'Often forgets to handle mid calculation overflow'
            });

            expect(prompt).toContain('binary_search_basic');
            expect(prompt).toContain('overflow');
        });

        it('should request specific drill types', () => {
            const prompt = DrillGenerator.buildGenerationPrompt('dfs', {
                types: ['fill-in-blank', 'spot-bug']
            });

            expect(prompt).toContain('fill-in-blank');
            expect(prompt).toContain('spot-bug');
        });

        it('should specify output format', () => {
            const prompt = DrillGenerator.buildGenerationPrompt('bfs');

            expect(prompt).toContain('drills');
            expect(prompt).toContain('type');
            expect(prompt).toContain('content');
            expect(prompt).toContain('answer');
        });
    });

    describe('validateDrill', () => {
        it('should accept valid drill structure', () => {
            const valid = {
                type: 'fill-in-blank',
                content: 'What is the time complexity of ___? Hint: binary search.',
                answer: 'O(log n)',
                difficulty: 'easy'
            };

            expect(DrillGenerator.validateDrill(valid)).toBe(true);
        });

        it('should reject drill with missing fields', () => {
            const invalid = {
                type: 'fill-in-blank',
                content: 'Complete the blank: while ___:'
                // missing answer
            };

            expect(DrillGenerator.validateDrill(invalid)).toBe(false);
        });

        it('should reject invalid drill type', () => {
            const invalid = {
                type: 'invalid-type',
                content: 'This is a longer content string for testing purposes',
                answer: 'Test answer value'
            };

            expect(DrillGenerator.validateDrill(invalid)).toBe(false);
        });
    });

    describe('saveDrills', () => {
        it('should save generated drills to store', async () => {
            const drills = [
                { type: 'fill-in-blank', skillId: 'bfs', content: 'BFS uses a ___ data structure for traversal', answer: 'queue' },
                { type: 'spot-bug', skillId: 'bfs', content: 'def bfs(graph, start):\n    visited = set()\n    queue = [start]', answer: 'line 2' }
            ];

            await DrillGenerator.saveDrills(drills);

            const store = new DrillStore.DrillStore();
            await store.init();
            const all = await store.getAll();

            expect(all.length).toBe(2);
        });
    });

    describe('generateFromWeakSkills', () => {
        it('should generate drills for multiple weak skills', async () => {
            LLMGateway.analyzeSubmissions
                .mockResolvedValueOnce({
                    drills: [{ type: 'fill-in-blank', content: 'Binary search: while ___:\n    mid = (l + r) // 2', answer: 'l <= r', difficulty: 'easy' }]
                })
                .mockResolvedValueOnce({
                    drills: [{ type: 'spot-bug', content: 'def solve(nums):\n    return nums[len(nums)]', answer: 'line 2', difficulty: 'medium' }]
                });

            const weakSkills = [
                { skillId: 'binary_search_basic', confidence: 0.3 },
                { skillId: 'off_by_one', confidence: 0.4 }
            ];

            const result = await DrillGenerator.generateFromWeakSkills(weakSkills, {
                drillsPerSkill: 1,
                minTotalDrills: 2,
                skillAttempts: 1
            });

            // Result is now an array of drills, not { generated: N }
            expect(result.length).toBe(2);
        });

        it('should default to generating 3 drills per skill', async () => {
            LLMGateway.analyzeSubmissions.mockResolvedValueOnce({
                drills: [
                    { type: 'fill-in-blank', content: 'Binary search: while ___:\n    mid = (l + r) // 2', answer: 'l <= r', difficulty: 'easy' },
                    { type: 'spot-bug', content: 'def solve(nums):\n    return nums[len(nums)]', answer: 'line 2', difficulty: 'easy' },
                    { type: 'critique', content: 'def solve(nums):\n    out = []\n    for i in range(len(nums)):\n        out.append(nums[i])\n    return out', answer: null, difficulty: 'medium' }
                ]
            });

            const weakSkills = [{ skillId: 'binary_search_basic', confidence: 0.3 }];
            const result = await DrillGenerator.generateFromWeakSkills(weakSkills, {
                minTotalDrills: 3,
                skillAttempts: 1
            });

            expect(result.length).toBe(3);
            expect(LLMGateway.analyzeSubmissions).toHaveBeenCalled();
            const firstPrompt = LLMGateway.analyzeSubmissions.mock.calls[0][0];
            expect(firstPrompt).toContain('EXACTLY 3');
        });

        it('should backfill with template drills when model keeps failing', async () => {
            LLMGateway.analyzeSubmissions.mockResolvedValue({ error: 'Failed to parse JSON from response' });

            const weakSkills = [{ skillId: 'off_by_one', insight: 'boundary mistakes' }];
            const result = await DrillGenerator.generateFromWeakSkills(weakSkills, {
                drillsPerSkill: 3,
                minTotalDrills: 3,
                skillAttempts: 1
            });

            expect(result.length).toBe(3);
            expect(result.every(d => d.skillId === 'off_by_one')).toBe(true);
        });
    });

    // ========================================================
    // NEW TDD TESTS — Drill Quality Improvements
    // ========================================================

    describe('validateDrill — semantic checks', () => {
        it('should reject fill-in-blank without ___ in content', () => {
            const drill = {
                type: 'fill-in-blank',
                content: 'def binary_search(arr, target):\n    left, right = 0, len(arr) - 1',
                answer: 'left <= right'
            };

            expect(DrillGenerator.validateDrill(drill)).toBe(false);
        });

        it('should accept fill-in-blank with ___ in content', () => {
            const drill = {
                type: 'fill-in-blank',
                content: 'def binary_search(arr, target):\n    while ___:\n        mid = (left + right) // 2',
                answer: 'left <= right'
            };

            expect(DrillGenerator.validateDrill(drill)).toBe(true);
        });

        it('should reject spot-bug where line number exceeds content lines', () => {
            const drill = {
                type: 'spot-bug',
                content: 'def solve(nums):\n    return nums[len(nums)]',
                answer: 'line 5'   // only 2 lines exist
            };

            expect(DrillGenerator.validateDrill(drill)).toBe(false);
        });

        it('should accept spot-bug where line number is within range', () => {
            const drill = {
                type: 'spot-bug',
                content: 'def solve(nums):\n    return nums[len(nums)]\n# end',
                answer: 'line 2'
            };

            expect(DrillGenerator.validateDrill(drill)).toBe(true);
        });

        it('should reject spot-bug without valid line reference in answer', () => {
            const drill = {
                type: 'spot-bug',
                content: 'def solve(nums):\n    return nums[len(nums)]',
                answer: 'the return statement is wrong'
            };

            expect(DrillGenerator.validateDrill(drill)).toBe(false);
        });

        it('should reject spot-bug where answer description does not match referenced line', () => {
            // This is the real-world bug: LLM says "Line 5: continue should be removed"
            // but the continue is actually on line 7, not line 5
            const drill = {
                type: 'spot-bug',
                content: 'def bfs(graph, start):\n    visited = set()\n    queue = [start]\n    while queue:\n        node = queue.pop(0)\n        if node in visited:\n            continue\n        visited.add(node)\n        for neighbor in graph[node]:\n            if neighbor not in visited:\n                queue.append(neighbor)\n    return visited',
                answer: "Line 5: The 'continue' statement should be removed"
            };

            // Line 5 is "node = queue.pop(0)" — does NOT contain "continue"
            expect(DrillGenerator.validateDrill(drill)).toBe(false);
        });

        it('should accept spot-bug where answer description matches referenced line', () => {
            const drill = {
                type: 'spot-bug',
                content: 'def bfs(graph, start):\n    visited = set()\n    queue = [start]\n    while queue:\n        node = queue.pop(0)\n        if node in visited:\n            continue\n        visited.add(node)',
                answer: "line 7: The 'continue' statement should be removed"
            };

            // Line 7 is "continue" — matches the description
            expect(DrillGenerator.validateDrill(drill)).toBe(true);
        });

        it('should accept spot-bug with just line number and no description', () => {
            const drill = {
                type: 'spot-bug',
                content: 'def solve(nums):\n    return nums[len(nums)]\n# end',
                answer: 'line 2'
            };

            // No description text to cross-check, so just validate line exists
            expect(DrillGenerator.validateDrill(drill)).toBe(true);
        });

        it('should reject drill with very short content (< 20 chars)', () => {
            const drill = {
                type: 'fill-in-blank',
                content: 'x = ___',
                answer: '5'
            };

            expect(DrillGenerator.validateDrill(drill)).toBe(false);
        });

        it('should accept critique without answer (null)', () => {
            const drill = {
                type: 'critique',
                content: 'def solve(nums):\n    out = []\n    for i in range(len(nums)):\n        out.append(nums[i])\n    return out',
                answer: null
            };

            expect(DrillGenerator.validateDrill(drill)).toBe(true);
        });

        it('should accept muscle-memory without answer (null)', () => {
            const drill = {
                type: 'muscle-memory',
                content: 'Write a function that implements binary search on a sorted array.',
                answer: null
            };

            expect(DrillGenerator.validateDrill(drill)).toBe(true);
        });
    });

    describe('buildGenerationPrompt — quality', () => {
        it('should include a few-shot example for fill-in-blank', () => {
            const prompt = DrillGenerator.buildGenerationPrompt('binary_search');
            // Must show a concrete example of what a fill-in-blank drill looks like
            expect(prompt).toMatch(/___/);
            expect(prompt).toMatch(/example/i);
        });

        it('should include structural constraint that fill-in-blank must contain ___', () => {
            const prompt = DrillGenerator.buildGenerationPrompt('bfs');
            expect(prompt).toMatch(/must contain.*___/i);
        });

        it('should include structural constraint that spot-bug answer must be line N', () => {
            const prompt = DrillGenerator.buildGenerationPrompt('dfs');
            expect(prompt).toMatch(/line\s*\d+/i);
            expect(prompt).toMatch(/answer.*line/i);
        });

        it('should instruct drills to be skill-specific', () => {
            const prompt = DrillGenerator.buildGenerationPrompt('sliding_window');
            expect(prompt).toMatch(/specific.*skill|directly.*related|relevant.*skill/i);
        });

        it('should instruct code to be syntactically valid', () => {
            const prompt = DrillGenerator.buildGenerationPrompt('two_pointers');
            expect(prompt).toMatch(/syntactically valid|valid.*syntax|compilable|no syntax error/i);
        });
    });

    describe('buildTemplateDrills — skill-specific', () => {
        it('should produce skill-specific templates for binary_search', () => {
            const drills = DrillGenerator.buildTemplateDrills(
                [{ skillId: 'binary_search' }], 3
            );

            expect(drills.length).toBe(3);
            // At least one drill should reference binary search concepts
            const hasRelevantContent = drills.some(d =>
                d.content.toLowerCase().includes('binary') ||
                d.content.toLowerCase().includes('search') ||
                d.content.toLowerCase().includes('mid') ||
                d.content.toLowerCase().includes('left') ||
                d.content.toLowerCase().includes('right')
            );
            expect(hasRelevantContent).toBe(true);
        });

        it('should produce skill-specific templates for bfs', () => {
            const drills = DrillGenerator.buildTemplateDrills(
                [{ skillId: 'bfs' }], 2
            );

            expect(drills.length).toBe(2);
            const hasRelevantContent = drills.some(d =>
                d.content.toLowerCase().includes('bfs') ||
                d.content.toLowerCase().includes('queue') ||
                d.content.toLowerCase().includes('breadth')
            );
            expect(hasRelevantContent).toBe(true);
        });

        it('should still produce valid drills for unknown skills', () => {
            const drills = DrillGenerator.buildTemplateDrills(
                [{ skillId: 'some_unknown_skill' }], 3
            );

            expect(drills.length).toBe(3);
            drills.forEach(d => {
                expect(DrillGenerator.validateDrill(d)).toBe(true);
            });
        });

        it('all template drills should pass semantic validation', () => {
            const skills = [
                { skillId: 'binary_search' },
                { skillId: 'bfs' },
                { skillId: 'dfs' },
                { skillId: 'two_pointers' },
                { skillId: 'sliding_window' },
                { skillId: 'general' }
            ];

            for (const skill of skills) {
                const drills = DrillGenerator.buildTemplateDrills([skill], 4);
                drills.forEach(d => {
                    expect(DrillGenerator.validateDrill(d)).toBe(true);
                });
            }
        });
    });

    describe('temperature default', () => {
        it('should use temperature <= 0.7 by default', async () => {
            LLMGateway.analyzeSubmissions.mockResolvedValueOnce({
                drills: [{ type: 'fill-in-blank', content: 'while ___:\n    mid = (l + r) // 2', answer: 'l <= r', difficulty: 'easy' }]
            });

            await DrillGenerator.generateDrillsForSkill('binary_search', { count: 1 });

            expect(LLMGateway.analyzeSubmissions).toHaveBeenCalled();
            const callOptions = LLMGateway.analyzeSubmissions.mock.calls[0][1];
            expect(callOptions.temperature).toBeLessThanOrEqual(0.7);
        });
    });

    // =====================================================================
    // DRILL CATEGORIES
    // =====================================================================
    describe('DRILL_CATEGORIES', () => {
        it('should export DRILL_CATEGORIES constant', () => {
            expect(DrillGenerator.DRILL_CATEGORIES).toBeDefined();
            expect(Array.isArray(DrillGenerator.DRILL_CATEGORIES)).toBe(true);
        });

        it('should contain problem, language, and algo', () => {
            expect(DrillGenerator.DRILL_CATEGORIES).toContain('problem');
            expect(DrillGenerator.DRILL_CATEGORIES).toContain('language');
            expect(DrillGenerator.DRILL_CATEGORIES).toContain('algo');
        });
    });

    describe('buildGenerationPrompt — category: problem', () => {
        it('should include user code when category is problem', () => {
            const userCode = 'def two_sum(nums, target):\n    for i in range(len(nums)):\n        for j in range(i+1, len(nums)):\n            if nums[i] + nums[j] == target:\n                return [i, j]';
            const prompt = DrillGenerator.buildGenerationPrompt('two_pointers', {
                category: 'problem',
                userCode,
                count: 2
            });

            expect(prompt).toContain(userCode);
        });

        it('should instruct drills to focus on the specific code', () => {
            const userCode = 'def solve(nums):\n    return sorted(nums)';
            const prompt = DrillGenerator.buildGenerationPrompt('sorting', {
                category: 'problem',
                userCode
            });

            // Should reference the specific code, not generic algorithm patterns
            expect(prompt).toMatch(/specific|this code|this solution|submission/i);
        });

        it('should still work without userCode (graceful fallback)', () => {
            const prompt = DrillGenerator.buildGenerationPrompt('binary_search', {
                category: 'problem'
            });

            // Should not crash, should produce a valid prompt
            expect(typeof prompt).toBe('string');
            expect(prompt.length).toBeGreaterThan(50);
        });
    });

    describe('buildGenerationPrompt — category: language', () => {
        it('should focus on Python language pitfalls', () => {
            const prompt = DrillGenerator.buildGenerationPrompt('binary_search', {
                category: 'language'
            });

            expect(prompt).toMatch(/python|language|syntax|pitfall/i);
        });

        it('should mention common Python traps', () => {
            const prompt = DrillGenerator.buildGenerationPrompt('sorting', {
                category: 'language'
            });

            // Should reference at least one common Python pitfall category
            expect(prompt).toMatch(/mutable|default|sort.*sorted|integer division|is\b.*==|off.by.one|index|slice/i);
        });

        it('should not include user code', () => {
            const userCode = 'SECRET_USER_CODE_MARKER';
            const prompt = DrillGenerator.buildGenerationPrompt('dfs', {
                category: 'language',
                userCode // should be ignored for language category
            });

            expect(prompt).not.toContain(userCode);
        });
    });

    describe('buildGenerationPrompt — category: algo (default)', () => {
        it('should default to algo behavior when no category given', () => {
            const prompt = DrillGenerator.buildGenerationPrompt('binary_search', { count: 2 });

            // Should be skill-focused (existing behavior)
            expect(prompt).toContain('binary_search');
            expect(prompt).toMatch(/skill/i);
        });

        it('should produce same output for explicit algo category as default', () => {
            const defaultPrompt = DrillGenerator.buildGenerationPrompt('bfs', { count: 1 });
            const algoPrompt = DrillGenerator.buildGenerationPrompt('bfs', { count: 1, category: 'algo' });

            expect(algoPrompt).toBe(defaultPrompt);
        });
    });

    describe('buildTemplateDrills — language templates', () => {
        it('should produce language pitfall templates when category is language', () => {
            const drills = DrillGenerator.buildTemplateDrills(
                [{ skillId: 'sorting' }], 4, { category: 'language' }
            );

            expect(drills.length).toBeGreaterThan(0);
            // All drills should have category = 'language'
            drills.forEach(d => {
                expect(d.category).toBe('language');
            });
        });

        it('language template drills should pass validation', () => {
            const drills = DrillGenerator.buildTemplateDrills(
                [{ skillId: 'general' }], 4, { category: 'language' }
            );

            drills.forEach(d => {
                expect(DrillGenerator.validateDrill(d)).toBe(true);
            });
        });

        it('algo templates should still work (backward compatible)', () => {
            const drills = DrillGenerator.buildTemplateDrills(
                [{ skillId: 'binary_search' }], 4
            );

            expect(drills.length).toBe(4);
            // Should NOT have category set or should be 'algo'
            drills.forEach(d => {
                expect(!d.category || d.category === 'algo').toBe(true);
            });
        });
    });

    describe('generateDrillsForSkill — category passthrough', () => {
        it('should pass category to generated drills', async () => {
            LLMGateway.analyzeSubmissions.mockResolvedValueOnce({
                drills: [{
                    type: 'fill-in-blank',
                    content: 'In Python, list.sort() returns ___',
                    answer: 'None',
                    difficulty: 'easy'
                }]
            });

            const drills = await DrillGenerator.generateDrillsForSkill('sorting', {
                count: 1,
                category: 'language'
            });

            expect(drills.length).toBe(1);
            expect(drills[0].category).toBe('language');
        });

        it('should pass userCode in prompt for problem category', async () => {
            const userCode = 'def solve(n): return n * 2';
            LLMGateway.analyzeSubmissions.mockResolvedValueOnce({
                drills: [{
                    type: 'fill-in-blank',
                    content: 'def solve(n):\n    return n * ___',
                    answer: '2',
                    difficulty: 'easy'
                }]
            });

            await DrillGenerator.generateDrillsForSkill('math', {
                count: 1,
                category: 'problem',
                userCode
            });

            expect(LLMGateway.analyzeSubmissions).toHaveBeenCalled();
            const promptArg = LLMGateway.analyzeSubmissions.mock.calls[0][0];
            expect(promptArg).toContain(userCode);
        });
    });

    // =====================================================================
    // DYNAMIC SKILL SYSTEM (Phase 2)
    // =====================================================================
    describe('Dynamic Skill System', () => {
        beforeEach(() => {
            // Reset mocks
            chrome.storage.local.get.mockImplementation((keys) => {
                if (keys === 'custom_skills') return Promise.resolve({ custom_skills: {} });
                return Promise.resolve({});
            });
            chrome.storage.local.set.mockResolvedValue();
        });

        it('should have init() method', () => {
            expect(typeof DrillGenerator.init).toBe('function');
        });

        it('should have getValidSkills() method returning default skills initially', async () => {
            await DrillGenerator.init();
            const skills = DrillGenerator.getValidSkills();
            
            expect(skills).toContain('binary_search');
            expect(skills).toContain('bfs');
            expect(skills).toContain('dfs');
            expect(skills).toContain('two_pointers');
            expect(skills).toContain('sliding_window');
            expect(skills.length).toBeGreaterThanOrEqual(5);
        });

        it('should load custom skills from storage on init()', async () => {
            // Mock storage having a custom skill
            chrome.storage.local.get.mockImplementation((keys) => {
                if (keys === 'custom_skills') {
                    return Promise.resolve({
                        custom_skills: {
                            'union_find': [
                                { type: 'fill-in-blank', content: 'uf parent', answer: 'root', difficulty: 'easy' }
                            ]
                        }
                    });
                }
                return Promise.resolve({});
            });

            await DrillGenerator.init();
            const skills = DrillGenerator.getValidSkills();
            
            expect(skills).toContain('union_find');
            expect(skills).toContain('binary_search'); // defaults still there
        });

        describe('acquireNewSkill', () => {
            it('should call LLM to generate templates for new skill', async () => {
                LLMGateway.analyzeSubmissions.mockResolvedValueOnce({
                    templates: [
                        { type: 'fill-in-blank', content: 'This is a long enough content string with a ___ placeholder', answer: 'ans1', difficulty: 'easy' },
                        { type: 'spot-bug', content: 'def spot_bug_content():\n    return "lines must be > 20 chars"\n# line 2', answer: 'line 2', difficulty: 'medium' },
                        { type: 'muscle-memory', content: 'Write a muscle memory drill content that is sufficiently long.', answer: null, difficulty: 'hard' },
                        { type: 'critique', content: 'Critique this code snippet which is also long enough to pass validation.', answer: null, difficulty: 'medium' }
                    ]
                });

                await DrillGenerator.init(); // ensure initialized
                const success = await DrillGenerator.acquireNewSkill('trie', 'Tree structure for strings');

                expect(success).toBe(true);
                expect(LLMGateway.analyzeSubmissions).toHaveBeenCalled();
                const prompt = LLMGateway.analyzeSubmissions.mock.calls[0][0];
                expect(prompt).toContain('trie');
                expect(prompt).toContain('Tree structure for strings');
            });

            it('should validate and save generated templates to storage', async () => {
                const newTemplates = [
                    { type: 'fill-in-blank', content: 'Trie node has children map and uses ___ for values', answer: 'map', difficulty: 'easy' }
                ];
                
                LLMGateway.analyzeSubmissions.mockResolvedValueOnce({
                    templates: newTemplates
                });

                await DrillGenerator.init();
                await DrillGenerator.acquireNewSkill('trie', 'Prefix tree');

                expect(chrome.storage.local.set).toHaveBeenCalled();
                const setCall = chrome.storage.local.set.mock.calls[0][0];
                expect(setCall.custom_skills.trie).toEqual(newTemplates);
            });

            it('should update in-memory valid skills immediately', async () => {
                LLMGateway.analyzeSubmissions.mockResolvedValueOnce({
                    templates: [{ type: 'fill-in-blank', content: 'Segment tree range query with default ___ values', answer: '...', difficulty: 'easy' }]
                });

                await DrillGenerator.init();
                await DrillGenerator.acquireNewSkill('segment_tree', 'Range queries');

                const skills = DrillGenerator.getValidSkills();
                expect(skills).toContain('segment_tree');
            });

            it('should handle LLM failure (invalid JSON or error)', async () => {
                LLMGateway.analyzeSubmissions.mockResolvedValueOnce({ error: 'LLM failed' });

                await DrillGenerator.init();
                const success = await DrillGenerator.acquireNewSkill('fail_skill', '...');

                expect(success).toBe(false);
                const skills = DrillGenerator.getValidSkills();
                expect(skills).not.toContain('fail_skill');
            });

            it('should not overwrite existing skills if they already exist', async () => {
                await DrillGenerator.init();
                
                // prevent acquireNewSkill from overwriting 'binary_search'
                const success = await DrillGenerator.acquireNewSkill('binary_search', '...');
                // Should return true (already exists) or false depending on logic, 
                // but crucially should NOT call LLM if checks properly
                
                // Assuming implementation checks existing first:
                expect(LLMGateway.analyzeSubmissions).not.toHaveBeenCalled();
            });
        });
    });
});
