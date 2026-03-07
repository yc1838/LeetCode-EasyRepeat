
const assert = require('assert');

// --- MOCK: VectorDB Logic ---
// Copied/Adapted from src/algorithms/vector_db.js
function getStatsMock(records) {
    const stats = {
        totalMistakes: records.length,
        byCategory: {},
        byFamily: {},
        byTag: {},
        tree: {}
    };

    records.forEach(r => {
        const meta = r.metadata || {};
        const family = (meta.family || meta.category || 'Uncategorized').toUpperCase();

        // Exact logic from current vector_db.js
        const tag = (meta.tag) ? meta.tag.toUpperCase() : 'GENERAL';

        stats.byFamily[family] = (stats.byFamily[family] || 0) + 1;
        stats.byCategory[family] = stats.byFamily[family];
        stats.byTag[tag] = (stats.byTag[tag] || 0) + 1;

        if (!stats.tree[family]) stats.tree[family] = {};
        stats.tree[family][tag] = (stats.tree[family][tag] || 0) + 1;
    });
    return stats;
}

// --- MOCK: Popup Rendering Logic ---
// Copied/Adapted from src/popup/popup.js
function renderStatsHTMLMock(stats) {
    if (!stats.tree) return "Legacy Error";

    let html = "";

    // Sort families
    const sortedFamilies = Object.entries(stats.tree).sort((a, b) => {
        const countA = Object.values(a[1]).reduce((sum, v) => sum + v, 0);
        const countB = Object.values(b[1]).reduce((sum, v) => sum + v, 0);
        return countB - countA;
    });

    sortedFamilies.forEach(([family, tags]) => {
        const familyTotal = Object.values(tags).reduce((sum, v) => sum + v, 0);

        html += `FAMILY:${family}(${familyTotal})`;

        // Tags
        const sortedTags = Object.entries(tags).sort((a, b) => b[1] - a[1]);

        // New Logic: Check if only GENERAL
        const tagKeys = Object.keys(tags);
        const onlyGeneral = (tagKeys.length === 1 && tagKeys[0] === 'GENERAL');

        if (onlyGeneral) {
            // Collapsed view (no tags shown)
            html += ``;
        } else {
            // Expanded view
            html += `[`;
            sortedTags.forEach(([tag, count]) => {
                if (tag === 'GENERAL') return;
                html += `${tag}:${count},`;
            });
            html += `]`;
        }
    });
    return html;
}

// --- TESTS ---

console.log("Running Stats Logic Tests...\n");

// Scenario 1: Legacy Data (No tag, only category)
const legacyData = [
    { metadata: { category: 'Logic' } },
    { metadata: { category: 'Logic' } },
    { metadata: { category: 'Syntax' } }
];

const stats1 = getStatsMock(legacyData);
// Expect: Family LOGIC, Tag GENERAL
assert.strictEqual(stats1.byFamily['LOGIC'], 2);
assert.strictEqual(stats1.tree['LOGIC']['GENERAL'], 2);

console.log("[PASS] Data Aggregation - Legacy Data");

// Render Legacy
// Problem: If we skip GENERAL, output is empty brackets
const html1 = renderStatsHTMLMock(stats1);
console.log("Render Output (Legacy):", html1);
// Expected: FAMILY:LOGIC(2)[], FAMILY:SYNTAX(1)[]
// If this is what we see, it explains the user's empty UI.

// Scenario 2: New Data (With tags)
const newData = [
    { metadata: { family: 'LOGIC', tag: 'OFF_BY_ONE' } },
    { metadata: { family: 'LOGIC', tag: 'VISITED_MISSING' } },
    { metadata: { family: 'PYTHON', tag: 'PY_LIST_INDEX' } }
];

const stats2 = getStatsMock(newData);
assert.strictEqual(stats2.byFamily['LOGIC'], 2);
assert.strictEqual(stats2.tree['LOGIC']['OFF_BY_ONE'], 1);

console.log("[PASS] Data Aggregation - New Data");

const html2 = renderStatsHTMLMock(stats2);
console.log("Render Output (New):", html2);
// Expected: FAMILY:LOGIC(2)[OFF_BY_ONE:1,VISITED_MISSING:1,], FAMILY:PYTHON(1)[PY_LIST_INDEX:1,]

// Scenario 3: Mixed Data
const mixedData = [
    { metadata: { category: 'Logic' } }, // Legacy -> GENERAL
    { metadata: { family: 'LOGIC', tag: 'OFF_BY_ONE' } }
];
const stats3 = getStatsMock(mixedData);
const html3 = renderStatsHTMLMock(stats3);
console.log("Render Output (Mixed):", html3);

console.log("\nAll Tests Executed.");
