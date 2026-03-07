/**
 * Drill Quality Benchmark — Live LLM Runner
 * 
 * Paste this entire script into the extension's service worker DevTools console.
 * It will generate drills for several skills using the real LLM and report quality metrics.
 * 
 * Prerequisites:
 *   - Extension installed and API key configured
 *   - Service worker active (inspect via chrome://extensions)
 * 
 * Usage:
 *   1. Go to chrome://extensions
 *   2. Click "Inspect views: service worker" on LeetCode EasyRepeat
 *   3. Paste this script into the Console tab
 *   4. Wait for the benchmark to complete (~30-60 seconds)
 */

(async function runDrillBenchmark() {
    'use strict';

    if (typeof self.DrillGenerator === 'undefined' || typeof self.LLMGateway === 'undefined') {
        console.error('❌ DrillGenerator or LLMGateway not found. Are you in the service worker console?');
        return;
    }

    const SKILLS = [
        { skillId: 'binary_search', keywords: ['binary_search', 'binary search', 'bisect', 'mid', 'low', 'high'] },
        { skillId: 'bfs', keywords: ['bfs', 'breadth', 'deque', 'popleft', 'queue', 'level order'] },
        { skillId: 'dfs', keywords: ['dfs', 'depth', 'recursive', 'backtrack', 'stack'] },
        { skillId: 'two_pointers', keywords: ['two pointer', 'two_pointer', 'converge', 'slow', 'fast'] },
        { skillId: 'sliding_window', keywords: ['window', 'sliding', 'slide', 'shrink', 'expand'] },
    ];

    const DRILLS_PER_SKILL = 3;
    const results = [];

    console.log('🚀 Starting Drill Quality Benchmark...');
    console.log(`   Skills: ${SKILLS.map(s => s.skillId).join(', ')}`);
    console.log(`   Drills per skill: ${DRILLS_PER_SKILL}`);
    console.log('');

    for (const skill of SKILLS) {
        console.log(`⏳ Generating drills for "${skill.skillId}"...`);
        const startTime = Date.now();

        try {
            // Generate raw drills (generateDrillsForSkill already runs validateDrill internally)
            const validDrills = await self.DrillGenerator.generateDrillsForSkill(skill.skillId, {
                count: DRILLS_PER_SKILL,
                insight: `Benchmark test for ${skill.skillId}`,
                attempts: 2,
                maxRetriesPerAttempt: 1,
            });

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

            // --- Log each drill in detail ---
            for (let di = 0; di < validDrills.length; di++) {
                const d = validDrills[di];
                const lines = d.content.split('\n');
                const numberedContent = lines.map((l, i) => `  ${String(i + 1).padStart(2)}| ${l}`).join('\n');

                console.groupCollapsed(`   📝 [${skill.skillId}] Drill ${di + 1}/${validDrills.length} — ${d.type} (${d.difficulty || 'medium'})`);
                console.log(`Type:    ${d.type}`);
                console.log(`Answer:  ${d.answer === null ? '(null — user-graded)' : d.answer}`);
                console.log(`Content:\n${numberedContent}`);
                if (d.explanation) console.log(`Explain: ${d.explanation}`);

                // Per-drill relevance check
                const contentLower = d.content.toLowerCase();
                const matchedKw = skill.keywords.filter(kw => contentLower.includes(kw));
                const missedKw = skill.keywords.filter(kw => !contentLower.includes(kw));
                console.log(`Relevance: ${matchedKw.length > 0 ? '✅' : '❌'} matched=[${matchedKw.join(', ')}] missed=[${missedKw.join(', ')}]`);

                // Per-drill structural check
                if (d.type === 'fill-in-blank') {
                    const hasBlank = d.content.includes('___');
                    const filled = d.content.replace('___', d.answer);
                    const clean = !filled.includes('___') && filled !== d.content;
                    console.log(`FIB check: blank present=${hasBlank ? '✅' : '❌'}, substitution clean=${clean ? '✅' : '❌'}`);
                }
                if (d.type === 'spot-bug') {
                    const lm = String(d.answer).match(/line\s*(\d+)/i);
                    if (lm) {
                        const ln = parseInt(lm[1], 10);
                        const refLine = lines[ln - 1];
                        console.log(`Bug line: ${ln} → "${(refLine || '').trim()}" ${refLine ? '✅' : '❌ (out of range)'}`);
                    }
                }
                console.groupEnd();
            }

            // --- Metric 1: Validation pass rate ---
            const validationRate = validDrills.length / DRILLS_PER_SKILL;

            // --- Metric 2: Skill relevance ---
            let relevantCount = 0;
            for (const drill of validDrills) {
                const content = drill.content.toLowerCase();
                const isRelevant = skill.keywords.some(kw => content.includes(kw));
                if (isRelevant) relevantCount++;
            }
            const relevanceRate = validDrills.length > 0 ? relevantCount / validDrills.length : 0;

            // --- Metric 3: Self-consistency (fill-in-blank) ---
            let fibTotal = 0, fibConsistent = 0;
            for (const drill of validDrills) {
                if (drill.type !== 'fill-in-blank') continue;
                fibTotal++;
                const filled = drill.content.replace('___', drill.answer);
                if (!filled.includes('___') && filled !== drill.content) {
                    fibConsistent++;
                }
            }

            // --- Metric 4: Self-consistency via LLM (ask LLM to solve drill) ---
            let llmCheckTotal = 0, llmCheckCorrect = 0;
            for (const drill of validDrills.filter(d => d.type === 'fill-in-blank').slice(0, 1)) {
                llmCheckTotal++;
                try {
                    const solvePrompt = `Given this code snippet with a blank (___), what should replace the blank? Reply with ONLY the answer, nothing else.\n\n${drill.content}`;
                    const solveResponse = await self.LLMGateway.analyzeSubmissions(solvePrompt, {
                        temperature: 0.2,
                        maxOutputTokens: 256,
                        responseMimeType: 'text/plain'
                    });

                    // Check if the LLM answer matches (fuzzy match: trim, lowercase)
                    let llmAnswer = '';
                    if (typeof solveResponse === 'string') {
                        llmAnswer = solveResponse.trim().toLowerCase();
                    } else if (solveResponse?.text) {
                        llmAnswer = solveResponse.text.trim().toLowerCase();
                    } else if (solveResponse?.drills) {
                        llmAnswer = JSON.stringify(solveResponse).toLowerCase();
                    }

                    const expectedAnswer = drill.answer.trim().toLowerCase();
                    const matches = llmAnswer.includes(expectedAnswer) || expectedAnswer.includes(llmAnswer);
                    if (matches) llmCheckCorrect++;

                    console.log(`   🔍 Self-check: expected="${drill.answer}", got="${llmAnswer.slice(0, 50)}" → ${matches ? '✅' : '❌'}`);
                } catch (e) {
                    console.warn(`   ⚠️  Self-check failed: ${e.message}`);
                }
            }

            results.push({
                skill: skill.skillId,
                requested: DRILLS_PER_SKILL,
                generated: validDrills.length,
                validationRate,
                relevanceRate,
                fibConsistency: fibTotal > 0 ? fibConsistent / fibTotal : null,
                llmSelfCheck: llmCheckTotal > 0 ? llmCheckCorrect / llmCheckTotal : null,
                types: validDrills.map(d => d.type),
                elapsed: `${elapsed}s`,
            });

            console.log(`   ✅ ${skill.skillId}: ${validDrills.length}/${DRILLS_PER_SKILL} valid, relevance=${(relevanceRate*100).toFixed(0)}%, time=${elapsed}s`);
        } catch (e) {
            console.error(`   ❌ ${skill.skillId}: ${e.message}`);
            results.push({
                skill: skill.skillId,
                requested: DRILLS_PER_SKILL,
                generated: 0,
                validationRate: 0,
                relevanceRate: 0,
                error: e.message,
            });
        }
    }

    // =========================================================================
    // SUMMARY REPORT
    // =========================================================================
    console.log('\n' + '='.repeat(70));
    console.log('  📊 DRILL QUALITY BENCHMARK — SUMMARY');
    console.log('='.repeat(70));

    console.table(results.map(r => ({
        Skill: r.skill,
        'Generated': `${r.generated}/${r.requested}`,
        'Valid%': `${(r.validationRate * 100).toFixed(0)}%`,
        'Relevant%': `${(r.relevanceRate * 100).toFixed(0)}%`,
        'FIB Consistent': r.fibConsistency !== null ? `${(r.fibConsistency * 100).toFixed(0)}%` : 'N/A',
        'LLM Self-Check': r.llmSelfCheck !== null ? `${(r.llmSelfCheck * 100).toFixed(0)}%` : 'N/A',
        'Types': (r.types || []).join(', '),
        'Time': r.elapsed || 'N/A',
    })));

    // Aggregate scores
    const validResults = results.filter(r => r.generated > 0);
    if (validResults.length > 0) {
        const avgValidation = validResults.reduce((s, r) => s + r.validationRate, 0) / validResults.length;
        const avgRelevance = validResults.reduce((s, r) => s + r.relevanceRate, 0) / validResults.length;
        const fibResults = validResults.filter(r => r.fibConsistency !== null);
        const avgFib = fibResults.length > 0
            ? fibResults.reduce((s, r) => s + r.fibConsistency, 0) / fibResults.length
            : null;
        const llmResults = validResults.filter(r => r.llmSelfCheck !== null);
        const avgLlm = llmResults.length > 0
            ? llmResults.reduce((s, r) => s + r.llmSelfCheck, 0) / llmResults.length
            : null;

        console.log('\n--- AGGREGATE ---');
        console.log(`  Avg Validation Rate:  ${(avgValidation * 100).toFixed(1)}%`);
        console.log(`  Avg Relevance Rate:   ${(avgRelevance * 100).toFixed(1)}%`);
        if (avgFib !== null) console.log(`  Avg FIB Consistency:  ${(avgFib * 100).toFixed(1)}%`);
        if (avgLlm !== null) console.log(`  Avg LLM Self-Check:   ${(avgLlm * 100).toFixed(1)}%`);

        // Overall quality score (weighted average)
        const weights = { validation: 0.3, relevance: 0.3, fib: 0.2, llm: 0.2 };
        let overallScore = avgValidation * weights.validation + avgRelevance * weights.relevance;
        let totalWeight = weights.validation + weights.relevance;
        if (avgFib !== null) { overallScore += avgFib * weights.fib; totalWeight += weights.fib; }
        if (avgLlm !== null) { overallScore += avgLlm * weights.llm; totalWeight += weights.llm; }
        overallScore /= totalWeight;

        console.log(`\n  🏆 Overall Quality Score: ${(overallScore * 100).toFixed(1)}%`);
        if (overallScore >= 0.8) console.log('  ✅ GOOD — drills are high quality');
        else if (overallScore >= 0.6) console.log('  ⚠️  FAIR — some drills need improvement');
        else console.log('  ❌ POOR — significant quality issues');
    } else {
        console.log('\n  ❌ No drills generated — check API key and connectivity');
    }

    console.log('\n' + '='.repeat(70));
    return results;
})();
