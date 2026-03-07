/**
 * Drill Types
 * 
 * Rendering and verification logic for each drill type:
 * - fill-in-blank: Code with blanks to fill in
 * - spot-bug: Find the bug in code
 * - critique: Review and critique code
 * - muscle-memory: Write code from memory
 */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.DrillTypes = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    // ============================================
    // Fill-in-Blank
    // ============================================

    function renderFillInBlank(drill) {
        return {
            html: `<pre class="drill-code">${escapeHtml(drill.content)}</pre>
                   <input type="text" class="drill-input" placeholder="Fill in the blank (___)" />`,
            inputType: 'text'
        };
    }

    function verifyFillInBlank(drill, userAnswer) {
        const expected = (drill.answer || '').trim();
        const actual = (userAnswer || '').trim();

        // Case-insensitive for words, exact for operators
        if (/^[a-zA-Z]+$/.test(expected)) {
            return expected.toLowerCase() === actual.toLowerCase();
        }
        return expected === actual;
    }

    // ============================================
    // Spot-the-Bug
    // ============================================

    function renderSpotBug(drill) {
        const lines = drill.content.split('\n');
        const numberedLines = lines.map((line, i) =>
            `<div class="code-line" data-line="${i + 1}"><span class="line-num">${i + 1}:</span> ${escapeHtml(line)}</div>`
        ).join('\n');

        return {
            html: `<pre class="drill-code buggy">${numberedLines}</pre>
                   <p>Click on the line with the bug</p>`,
            inputType: 'select-line'
        };
    }

    function verifySpotBug(drill, selectedLine) {
        // Extract line number from answer like "line 1" or "Line 3: off-by-one"
        const match = drill.answer.match(/line\s*(\d+)/i);
        if (match) {
            return parseInt(match[1], 10) === parseInt(selectedLine, 10);
        }
        return false;
    }

    // ============================================
    // Critique
    // ============================================

    function renderCritique(drill) {
        return {
            html: `<pre class="drill-code">${escapeHtml(drill.content)}</pre>
                   <p>What would you improve in this code?</p>
                   <textarea class="drill-textarea" placeholder="Write your critique..."></textarea>`,
            inputType: 'textarea'
        };
    }

    function prepareCritiqueForGrading(drill, response) {
        return {
            original: drill.content,
            response: response,
            needsAIGrading: true
        };
    }

    // ============================================
    // Muscle-Memory
    // ============================================

    function renderMuscleMemory(drill) {
        return {
            html: `<div class="drill-prompt">${escapeHtml(drill.content)}</div>
                   <div class="code-editor" contenteditable="true" placeholder="Write your code here..."></div>`,
            inputType: 'code-editor'
        };
    }

    function prepareMuscleMemoryForGrading(drill, code) {
        return {
            prompt: drill.content,
            submission: code,
            needsAIGrading: true
        };
    }

    // ============================================
    // Helpers
    // ============================================

    function escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function getDrillRenderer(type) {
        const renderers = {
            'fill-in-blank': renderFillInBlank,
            'spot-bug': renderSpotBug,
            'critique': renderCritique,
            'muscle-memory': renderMuscleMemory
        };
        return renderers[type] || null;
    }

    function getDrillVerifier(type) {
        const verifiers = {
            'fill-in-blank': verifyFillInBlank,
            'spot-bug': verifySpotBug
        };
        return verifiers[type] || null;
    }

    return {
        // Renderers
        renderFillInBlank,
        renderSpotBug,
        renderCritique,
        renderMuscleMemory,
        getDrillRenderer,

        // Verifiers
        verifyFillInBlank,
        verifySpotBug,
        getDrillVerifier,

        // AI Grading prep
        prepareCritiqueForGrading,
        prepareMuscleMemoryForGrading,

        // Helpers
        escapeHtml
    };
}));
