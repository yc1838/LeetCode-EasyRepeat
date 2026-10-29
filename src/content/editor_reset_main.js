/**
 * LeetCode EasyRepeat - Editor reset (MAIN world)
 *
 * Runs in the page's own JS world (manifest "world": "MAIN") so it can reach
 * LeetCode's Monaco editor. It does nothing on its own: it only acts when the
 * extension's content script asks it to (problem opened from the review queue).
 *
 * Flow:
 *   isolated content script --(postMessage ER_RESET_EDITOR)--> this script
 *   this script: wait for editor + draft restore, fetch default template,
 *                replace editor contents (undoable with Cmd/Ctrl+Z)
 *   this script --(postMessage ER_RESET_RESULT)--> content script
 */
(function () {
    const MONACO_TO_LANG_SLUGS = {
        python: ['python3', 'python'],
        cpp: ['cpp'],
        c: ['c'],
        java: ['java'],
        javascript: ['javascript'],
        typescript: ['typescript'],
        csharp: ['csharp'],
        go: ['golang'],
        kotlin: ['kotlin'],
        swift: ['swift'],
        rust: ['rust'],
        ruby: ['ruby'],
        scala: ['scala'],
        php: ['php'],
        dart: ['dart'],
        elixir: ['elixir'],
        erlang: ['erlang'],
        racket: ['racket'],
        scheme: ['racket'],
        sql: ['mysql', 'mssql', 'oraclesql', 'postgresql'],
        mysql: ['mysql'],
        pgsql: ['postgresql'],
        shell: ['bash'],
        cangjie: ['cangjie']
    };

    /** Read LeetCode's remembered language (stored as a JSON string, e.g. "\"python3\""). */
    function readStoredLang(storage) {
        try {
            const raw = storage && storage.getItem('global_lang');
            if (!raw) return null;
            try {
                const parsed = JSON.parse(raw);
                return typeof parsed === 'string' ? parsed : null;
            } catch (e) {
                return raw;
            }
        } catch (e) {
            return null;
        }
    }

    /** LeetCode's language picker labels -> langSlug. */
    const DISPLAY_TO_LANG_SLUG = {
        'C++': 'cpp', 'Java': 'java', 'Python': 'python', 'Python3': 'python3', 'C': 'c', 'C#': 'csharp',
        'JavaScript': 'javascript', 'TypeScript': 'typescript', 'PHP': 'php', 'Swift': 'swift', 'Kotlin': 'kotlin',
        'Dart': 'dart', 'Go': 'golang', 'Ruby': 'ruby', 'Scala': 'scala', 'Rust': 'rust', 'Racket': 'racket',
        'Erlang': 'erlang', 'Elixir': 'elixir', 'Cangjie': 'cangjie', '仓颉': 'cangjie'
    };

    /** Language shown on the editor's language picker button, if any. */
    function readUiLang(doc) {
        try {
            const buttons = Array.from((doc || document).querySelectorAll('button'));
            for (const b of buttons) {
                const text = (b.innerText || b.textContent || '').trim();
                if (Object.prototype.hasOwnProperty.call(DISPLAY_TO_LANG_SLUG, text)) return DISPLAY_TO_LANG_SLUG[text];
            }
        } catch (e) { /* ignore */ }
        return null;
    }

    /**
     * Choose the default template matching the editor language.
     * @param {Array<{langSlug: string, code: string}>} snippets
     * @param {Array<string|null>} hints  preferred langSlugs (picker label, LeetCode's global_lang)
     * @param {string|null} monacoLang  Monaco language id of the editor model
     */
    function pickSnippet(snippets, hints, monacoLang) {
        if (!Array.isArray(snippets) || snippets.length === 0) return null;
        const bySlug = new Map(snippets.map(s => [s.langSlug, s]));
        const family = MONACO_TO_LANG_SLUGS[monacoLang] || (monacoLang ? [monacoLang] : []);
        const hintList = (Array.isArray(hints) ? hints : [hints]).filter(Boolean);

        // A hint wins when it agrees with the editor's language (or the editor language is unknown).
        for (const hint of hintList) {
            if (bySlug.has(hint) && (!monacoLang || family.includes(hint))) return bySlug.get(hint);
        }
        for (const slug of family) {
            if (bySlug.has(slug)) return bySlug.get(slug);
        }
        return null;
    }

    if (typeof module === 'object' && module.exports) {
        module.exports = { pickSnippet, readStoredLang, readUiLang, MONACO_TO_LANG_SLUGS, DISPLAY_TO_LANG_SLUG };
    }
    if (typeof window === 'undefined' || window.__easyRepeatEditorResetMain) return;
    window.__easyRepeatEditorResetMain = true;

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    function findCodeEditor() {
        const monaco = window.monaco;
        if (!monaco || !monaco.editor) return null;
        const editors = typeof monaco.editor.getEditors === 'function' ? monaco.editor.getEditors() : [];
        const usable = editors.filter(ed => {
            try {
                const model = ed.getModel();
                if (!model) return false;
                const lang = model.getLanguageId ? model.getLanguageId() : model.getModeId();
                if (lang === 'plaintext' || lang === 'markdown') return false;
                if (ed.getOption && monaco.editor.EditorOption && ed.getOption(monaco.editor.EditorOption.readOnly)) return false;
                const node = ed.getDomNode && ed.getDomNode();
                return !node || node.offsetParent !== null;
            } catch (e) {
                return false;
            }
        });
        // Main code editor is the largest visible one.
        usable.sort((a, b) => (b.getDomNode()?.offsetHeight || 0) - (a.getDomNode()?.offsetHeight || 0));
        return usable[0] || null;
    }

    async function waitForEditor(timeoutMs) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const ed = findCodeEditor();
            if (ed && ed.getModel().getValue().length > 0) return ed;
            await sleep(250);
        }
        return null;
    }

    /** Wait until the editor content stops changing (LeetCode restores drafts asynchronously). */
    async function waitForStable(editor, quietMs, timeoutMs) {
        const start = Date.now();
        let last = editor.getModel().getValue();
        let lastChange = Date.now();
        while (Date.now() - start < timeoutMs) {
            await sleep(200);
            const now = editor.getModel().getValue();
            if (now !== last) {
                last = now;
                lastChange = Date.now();
            } else if (Date.now() - lastChange >= quietMs) {
                return;
            }
        }
    }

    async function fetchSnippets(slug) {
        const query = `query easyRepeatSnippets($titleSlug: String!) {
            question(titleSlug: $titleSlug) { codeSnippets { langSlug code } }
        }`;
        const res = await fetch('/graphql/', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'x-csrftoken': (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || ''
            },
            body: JSON.stringify({ query, variables: { titleSlug: slug } })
        });
        if (!res.ok) throw new Error(`graphql ${res.status}`);
        const data = await res.json();
        return (data && data.data && data.data.question && data.data.question.codeSnippets) || [];
    }

    function replaceAll(editor, code) {
        const model = editor.getModel();
        editor.pushUndoStop();
        editor.executeEdits('easyrepeat-review-reset', [{ range: model.getFullModelRange(), text: code, forceMoveMarkers: true }]);
        editor.pushUndoStop();
        editor.setPosition({ lineNumber: 1, column: 1 });
    }

    let running = false;

    async function resetEditor(slug) {
        const editor = await waitForEditor(30000);
        if (!editor) return { ok: false, reason: 'editor_not_found' };
        await waitForStable(editor, 1200, 8000);

        const snippets = await fetchSnippets(slug);
        const model = editor.getModel();
        const monacoLang = model.getLanguageId ? model.getLanguageId() : model.getModeId();
        const snippet = pickSnippet(snippets, [readUiLang(document), readStoredLang(window.localStorage)], monacoLang);
        if (!snippet) return { ok: false, reason: 'no_template', lang: monacoLang };

        if (model.getValue() === snippet.code) return { ok: true, already: true, lang: snippet.langSlug };
        replaceAll(editor, snippet.code);

        // If LeetCode restores the old draft right after us, apply once more.
        await sleep(1500);
        const current = findCodeEditor();
        if (current && current.getModel().getValue() !== snippet.code) {
            replaceAll(current, snippet.code);
        }
        return { ok: true, lang: snippet.langSlug };
    }

    window.addEventListener('message', async (event) => {
        if (event.source !== window) return;
        const msg = event.data;
        if (!msg || msg.source !== 'easyrepeat-isolated' || msg.type !== 'ER_RESET_EDITOR') return;
        window.postMessage({ source: 'easyrepeat-main', type: 'ER_RESET_ACK', nonce: msg.nonce }, '*');
        if (running) return;
        running = true;
        let result;
        try {
            result = await resetEditor(msg.slug);
        } catch (e) {
            result = { ok: false, reason: 'error', error: String(e && e.message || e) };
        }
        window.postMessage({ source: 'easyrepeat-main', type: 'ER_RESET_RESULT', nonce: msg.nonce, result }, '*');
    });
})();
