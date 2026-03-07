/**
 * Drill Quality Benchmark
 * 
 * Repeatable offline benchmark measuring drill quality metrics:
 * - Validation pass rate (good/bad responses through validateDrill)
 * - Prompt completeness audit
 * - Template coverage and correctness
 * - Self-consistency (fill-in-blank answer substitution check)
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

require('fake-indexeddb/auto');
const Dexie = require('dexie');
global.Dexie = Dexie;

describe('Drill Quality Benchmark', () => {
    let DrillGenerator;

    beforeAll(() => {
        require('../src/background/drill_store');
        DrillGenerator = require('../src/background/drill_generator');
    });

    // =========================================================================
    // 1. VALIDATION PASS RATE — how well does validateDrill filter bad output?
    // =========================================================================
    describe('Validation pass rate', () => {
        const GOOD_DRILLS = [
            { type: 'fill-in-blank', content: 'def binary_search(arr, t):\n    l, r = 0, len(arr)-1\n    while ___:\n        mid = (l+r)//2', answer: 'l <= r' },
            { type: 'spot-bug', content: 'def solve(n):\n    return n[len(n)]', answer: 'line 2' },
            { type: 'critique', content: 'def solve(nums):\n    out = []\n    for i in range(len(nums)):\n        out.append(nums[i])\n    return out', answer: null },
            { type: 'muscle-memory', content: 'Write a binary search function from memory that finds an element in a sorted array.', answer: null },
            { type: 'fill-in-blank', content: 'from collections import deque\ndef bfs(graph, s):\n    q = ___([s])\n    visited = {s}', answer: 'deque' },
            { type: 'spot-bug', content: 'def dfs(g, node, vis=None):\n    if vis is None:\n        vis = set()\n    vis.add(node)\n    for nb in g[node]:\n        dfs(g, nb, vis)\n    return vis', answer: 'line 6' },
        ];

        const BAD_DRILLS = [
            // fill-in-blank without ___
            { type: 'fill-in-blank', content: 'def binary_search(arr, target): return -1', answer: 'something' },
            // spot-bug answer not "line N"
            { type: 'spot-bug', content: 'def solve(nums):\n    return nums[len(nums)]', answer: 'the return statement' },
            // spot-bug line number out of range
            { type: 'spot-bug', content: 'def solve(nums):\n    return nums[0]', answer: 'line 10' },
            // too short content
            { type: 'fill-in-blank', content: 'x = ___', answer: '5' },
            // missing type
            { type: '', content: 'def foo():\n    return ___', answer: 'bar' },
            // null content
            { type: 'fill-in-blank', content: null, answer: 'test' },
            // fill-in-blank missing answer
            { type: 'fill-in-blank', content: 'while ___:\n    process(item)\n    item = next()', answer: '' },
            // invalid type
            { type: 'multiple-choice', content: 'What is BFS? A long question about breadth-first search...', answer: 'A' },
        ];

        it('should accept all well-formed drills', () => {
            let accepted = 0;
            for (const drill of GOOD_DRILLS) {
                if (DrillGenerator.validateDrill(drill)) accepted++;
            }
            expect(accepted).toBe(GOOD_DRILLS.length);
        });

        it('should reject all malformed drills', () => {
            let rejected = 0;
            for (const drill of BAD_DRILLS) {
                if (!DrillGenerator.validateDrill(drill)) rejected++;
            }
            expect(rejected).toBe(BAD_DRILLS.length);
        });

        it('benchmark: pass rate should be 100% for good, 0% for bad', () => {
            const goodRate = GOOD_DRILLS.filter(d => DrillGenerator.validateDrill(d)).length / GOOD_DRILLS.length;
            const badRate = BAD_DRILLS.filter(d => DrillGenerator.validateDrill(d)).length / BAD_DRILLS.length;

            console.log(`\n📊 Validation Benchmark:`);
            console.log(`   Good drill acceptance: ${(goodRate * 100).toFixed(1)}% (${GOOD_DRILLS.length} drills)`);
            console.log(`   Bad drill rejection:   ${((1 - badRate) * 100).toFixed(1)}% (${BAD_DRILLS.length} drills)`);

            expect(goodRate).toBe(1.0);
            expect(badRate).toBe(0.0);
        });
    });

    // =========================================================================
    // 2. PROMPT COMPLETENESS AUDIT
    // =========================================================================
    describe('Prompt completeness audit', () => {
        const SKILLS = ['binary_search', 'bfs', 'dfs', 'two_pointers', 'sliding_window'];

        const REQUIRED_ELEMENTS = [
            { name: 'few-shot example', pattern: /example/i },
            { name: 'fill-in-blank ___ rule', pattern: /must contain.*___/i },
            { name: 'spot-bug line format rule', pattern: /line\s*N|line\s*\d+/i },
            { name: 'skill-specificity instruction', pattern: /specific.*skill|directly.*related|relevant.*skill/i },
            { name: 'syntax validity instruction', pattern: /syntactically valid|valid.*syntax|no syntax error/i },
            { name: 'min content length rule', pattern: /at least 20 characters/i },
            { name: 'JSON-only instruction', pattern: /JSON ONLY/i },
            { name: 'exact count instruction', pattern: /EXACTLY \d+/i },
        ];

        it('should contain all required elements for every skill', () => {
            const results = [];

            for (const skill of SKILLS) {
                const prompt = DrillGenerator.buildGenerationPrompt(skill);
                const missing = REQUIRED_ELEMENTS.filter(el => !el.pattern.test(prompt));
                results.push({ skill, missing: missing.map(m => m.name), total: REQUIRED_ELEMENTS.length });
            }

            console.log(`\n📊 Prompt Audit:`);
            for (const r of results) {
                const score = ((r.total - r.missing.length) / r.total * 100).toFixed(0);
                console.log(`   ${r.skill}: ${score}% (${r.missing.length === 0 ? 'all present' : 'missing: ' + r.missing.join(', ')})`);
            }

            // Every skill should have 0 missing elements
            for (const r of results) {
                expect(r.missing).toEqual([]);
            }
        });
    });

    // =========================================================================
    // 3. TEMPLATE COVERAGE & CORRECTNESS
    // =========================================================================
    describe('Template coverage', () => {
        const KNOWN_SKILLS = ['binary_search', 'bfs', 'dfs', 'two_pointers', 'sliding_window'];
        const ALL_TYPES = ['fill-in-blank', 'spot-bug', 'critique', 'muscle-memory'];

        it('each known skill should have all 4 drill types in templates', () => {
            console.log(`\n📊 Template Coverage:`);

            for (const skill of KNOWN_SKILLS) {
                const drills = DrillGenerator.buildTemplateDrills([{ skillId: skill }], 4);
                const types = new Set(drills.map(d => d.type));
                const missing = ALL_TYPES.filter(t => !types.has(t));

                console.log(`   ${skill}: ${types.size}/4 types (${missing.length === 0 ? '✅ complete' : '❌ missing: ' + missing.join(', ')})`);
                expect(missing).toEqual([]);
            }
        });

        it('every template drill should pass validation', () => {
            let total = 0, passed = 0;

            for (const skill of [...KNOWN_SKILLS, 'unknown_skill', 'dynamic_programming']) {
                const drills = DrillGenerator.buildTemplateDrills([{ skillId: skill }], 4);
                for (const d of drills) {
                    total++;
                    if (DrillGenerator.validateDrill(d)) passed++;
                    else console.warn(`   ❌ Invalid template: ${skill}/${d.type}`);
                }
            }

            console.log(`\n📊 Template Validation: ${passed}/${total} pass (${(passed/total*100).toFixed(1)}%)`);
            expect(passed).toBe(total);
        });
    });

    // =========================================================================
    // 4. SELF-CONSISTENCY — does substituting answer into ___ produce valid code?
    // =========================================================================
    describe('Self-consistency', () => {
        it('fill-in-blank: substituting answer into ___ should produce well-formed code', () => {
            const KNOWN_SKILLS = ['binary_search', 'bfs', 'dfs', 'two_pointers', 'sliding_window'];
            let total = 0, consistent = 0;

            console.log(`\n📊 Self-Consistency (fill-in-blank answer substitution):`);

            for (const skill of KNOWN_SKILLS) {
                const drills = DrillGenerator.buildTemplateDrills([{ skillId: skill }], 4);
                const fibDrills = drills.filter(d => d.type === 'fill-in-blank');

                for (const drill of fibDrills) {
                    total++;
                    const filled = drill.content.replace('___', drill.answer);

                    // Basic checks: no remaining ___, non-empty, reasonable length
                    const noRemainingBlank = !filled.includes('___');
                    const nonEmpty = filled.trim().length > 0;
                    const answerApplied = filled !== drill.content;

                    if (noRemainingBlank && nonEmpty && answerApplied) {
                        consistent++;
                    } else {
                        console.warn(`   ❌ ${skill}: answer "${drill.answer}" didn't substitute cleanly`);
                    }
                    console.log(`   ${skill}: "${drill.answer}" → ${noRemainingBlank && answerApplied ? '✅' : '❌'}`);
                }
            }

            console.log(`   Result: ${consistent}/${total} consistent (${(consistent/total*100).toFixed(1)}%)`);
            expect(consistent).toBe(total);
        });

        it('spot-bug: referenced line should exist and contain code', () => {
            const KNOWN_SKILLS = ['binary_search', 'bfs', 'dfs', 'two_pointers', 'sliding_window'];
            let total = 0, valid = 0;

            console.log(`\n📊 Self-Consistency (spot-bug line reference):`);

            for (const skill of KNOWN_SKILLS) {
                const drills = DrillGenerator.buildTemplateDrills([{ skillId: skill }], 4);
                const sbDrills = drills.filter(d => d.type === 'spot-bug');

                for (const drill of sbDrills) {
                    total++;
                    const lineMatch = drill.answer.match(/line\s*(\d+)/i);
                    const lineNum = parseInt(lineMatch[1], 10);
                    const lines = drill.content.split('\n');
                    const referencedLine = lines[lineNum - 1];

                    // The referenced line should exist and contain actual code (not just comments/whitespace)
                    const hasCode = referencedLine && referencedLine.trim().length > 0;
                    const notJustComment = referencedLine && !referencedLine.trim().startsWith('#');

                    if (hasCode && notJustComment) {
                        valid++;
                        console.log(`   ${skill}: line ${lineNum} → "${referencedLine.trim().slice(0, 50)}" ✅`);
                    } else {
                        console.warn(`   ❌ ${skill}: line ${lineNum} is empty or comment-only`);
                    }
                }
            }

            console.log(`   Result: ${valid}/${total} valid (${(valid/total*100).toFixed(1)}%)`);
            expect(valid).toBe(total);
        });
    });

    // =========================================================================
    // 5. SUMMARY REPORT
    // =========================================================================
    afterAll(() => {
        console.log('\n' + '='.repeat(60));
        console.log('  DRILL QUALITY BENCHMARK — COMPLETE');
        console.log('='.repeat(60));
    });
});
