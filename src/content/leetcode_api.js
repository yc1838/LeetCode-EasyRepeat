/**
 * LeetCode EasyRepeat - API Interaction Layer
 * 
 * Handles interaction with LeetCode's internal APIs to check submission status.
 * This bypasses DOM scraping for more reliable "Accepted" detection.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        // Node.js
        module.exports = factory();
    } else {
        // Browser
        const exported = factory();
        for (const key in exported) {
            root[key] = exported[key];
        }
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const API_BASE = '/api/submissions';
    const SUBMISSION_CHECK_BASE = '/submissions/detail';

    // In-memory cache for question info (avoids redundant GraphQL calls within a session)
    const _questionInfoCache = new Map(); // slug -> { data, ts }
    const CACHE_TTL_MS = 5 * 60 * 1000;  // 5 minutes

    const getDep = (name) => {
        if (typeof global !== 'undefined' && global[name]) return global[name];
        if (typeof window !== 'undefined' && window[name]) return window[name];
        return undefined;
    };

    const getI18n = () => {
        if (typeof EasyRepeatI18n !== 'undefined') return EasyRepeatI18n;
        if (typeof window !== 'undefined' && window.EasyRepeatI18n) return window.EasyRepeatI18n;
        return null;
    };

    async function getCurrentUiLanguage() {
        const i18n = getI18n();
        if (i18n && typeof i18n.getLanguage === 'function') {
            try {
                // Read once so the language used for the prompt and the saved
                // note cannot diverge because of duplicate async reads.
                const storedLanguage = await i18n.getLanguage();
                const normalizedLanguage = typeof i18n.normalizeLanguage === 'function'
                    ? i18n.normalizeLanguage(storedLanguage)
                    : storedLanguage;
                return String(normalizedLanguage || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';
            } catch (e) { /* fall through to storage/default */ }
        }

        try {
            if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                const result = await chrome.storage.local.get({ uiLanguage: 'en' });
                return String(result.uiLanguage || 'en').startsWith('zh') ? 'zh' : 'en';
            }
        } catch (e) { /* use default */ }
        return 'en';
    }

    function translateUi(key, language, fallback) {
        const i18n = getI18n();
        if (i18n && typeof i18n.t === 'function') {
            const translated = i18n.t(key, {}, language);
            if (translated && translated !== key) return translated;
        }
        return fallback;
    }

    function localizeSubmissionStatus(status, language) {
        if (language !== 'zh') return status || 'Unknown Error';
        const statusMap = {
            'Wrong Answer': '答案错误',
            'Runtime Error': '运行错误',
            'Compile Error': '编译错误',
            'Time Limit Exceeded': '超出时间限制',
            'Memory Limit Exceeded': '超出内存限制',
            'Output Limit Exceeded': '超出输出限制',
            'Internal Error': '内部错误'
        };
        return statusMap[status] || status || '未知错误';
    }

    /**
     * Best-effort editor snapshot. Monaco virtualizes its DOM, so a successful
     * capture is explicitly marked as partial rather than pretending it is the
     * exact submitted source. Capturing at click time still avoids reading code
     * that the user edits after the submission has already been sent.
     */
    function captureEditorCodeFromDom() {
        if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') {
            return { status: 'failed', source: 'dom_viewport', code: '', reason: 'document_unavailable' };
        }

        const selectors = [
            '.monaco-editor.focused .view-lines .view-line',
            '.monaco-editor .view-lines .view-line',
            '.view-lines .view-line'
        ];

        try {
            for (const selector of selectors) {
                const lines = document.querySelectorAll(selector);
                if (lines && lines.length > 0) {
                    return {
                        status: 'partial',
                        source: 'dom_viewport',
                        code: Array.from(lines).map(line => line.innerText || line.textContent || '').join('\n'),
                        reason: 'monaco_virtualized_dom'
                    };
                }
            }
        } catch (e) {
            return { status: 'failed', source: 'dom_viewport', code: '', reason: e.message || 'capture_error' };
        }

        return { status: 'failed', source: 'dom_viewport', code: '', reason: 'editor_lines_not_found' };
    }

    const normalizeDifficulty = (value) => {
        const i18n = getI18n();
        if (i18n && typeof i18n.normalizeDifficulty === 'function') {
            return i18n.normalizeDifficulty(value) || '';
        }
        // Fallback if i18n not loaded yet
        const raw = String(value || '').trim().toLowerCase();
        if (raw === 'easy') return 'Easy';
        if (raw === 'medium') return 'Medium';
        if (raw === 'hard') return 'Hard';
        return '';
    };

    /**
     * Extract the problem "slug" from the current URL.
     */
    function getCurrentProblemSlug() {
        if (typeof window === 'undefined' || !window.location) return null;
        const match = window.location.pathname.match(/\/problems\/([^\/]+)/);
        return match ? match[1] : null;
    }

    /**
     * Fetch question details (difficulty) directly from LeetCode GraphQL API.
     * This is the source of truth, bypassing DOM issues.
     * @param {string} slug 
     */
    async function fetchQuestionDetails(slug) {
        try {
            const query = `
                query questionTitle($titleSlug: String!) {
                  question(titleSlug: $titleSlug) {
                    difficulty
                    title
                    questionFrontendId
                    topicTags {
                      name
                      slug
                    }
                  }
                }
            `;

            const response = await fetch('/graphql', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-csrftoken': document.cookie.match(/csrftoken=([^;]+)/)?.[1] || ''
                },
                body: JSON.stringify({
                    query: query,
                    variables: { titleSlug: slug }
                })
            });

            if (!response.ok) throw new Error("GraphQL request failed");

            const data = await response.json();
            if (data.data && data.data.question) {
                const q = data.data.question;
                const normalizedDifficulty = normalizeDifficulty(q.difficulty) || q.difficulty;
                console.log(`[LeetCode EasyRepeat] Fetched details from API: ${q.title} (${q.difficulty})`);
                return {
                    difficulty: normalizedDifficulty,
                    title: q.title,
                    questionId: q.questionFrontendId,
                    topics: q.topicTags ? q.topicTags.map(t => t.name) : []
                };
            }
            return null;
        } catch (e) {
            console.warn("[LeetCode EasyRepeat] Error fetching question details via API:", e);
            return null;
        }
    }

    /**
     * Shared, standardized function to get problem info from the LeetCode GraphQL API.
     * Single source of truth for title (with questionId), difficulty, and topics.
     * Used by both correct and wrong submission paths.
     *
     * @param {string} slug - The problem slug (e.g. "two-sum")
     * @returns {Promise<Object>} Standardized problem info
     */
    async function getQuestionInfo(slug) {
        // Check in-memory cache first
        const cached = _questionInfoCache.get(slug);
        if (cached && (Date.now() - cached.ts) < CACHE_TTL_MS) {
            console.log(`[LeetCode EasyRepeat] Cache hit for ${slug}`);
            return cached.data;
        }

        // Retry up to 2 times with short delays if API fails
        let apiData = null;
        for (let attempt = 0; attempt < 3; attempt++) {
            apiData = await fetchQuestionDetails(slug);
            if (apiData && apiData.questionId && apiData.title) break;
            if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
        if (apiData && apiData.questionId && apiData.title) {
            const result = {
                title: `${apiData.questionId}. ${apiData.title}`,
                difficulty: apiData.difficulty,
                topics: apiData.topics || [],
                questionId: apiData.questionId,
                source: 'api'
            };
            _questionInfoCache.set(slug, { data: result, ts: Date.now() });
            return result;
        }
        // Fallback: construct from slug if API fails (don't cache failures)
        return {
            title: slug.replace(/-/g, ' '),
            difficulty: 'Medium',
            topics: [],
            questionId: null,
            source: 'fallback'
        };
    }

    /**
     * Check the latest submission via API for the manual "Scan Now" feature.
     * 
     * @param {string} slug - The problem slug (e.g. "two-sum")
     * @returns {Promise<Object>} The result object for the popup
     */
    async function checkLatestSubmissionViaApi(slug) {
        try {
            // 1. Get recent submissions
            const response = await fetch(`${API_BASE}/${slug}/?offset=0&limit=1`);
            if (!response.ok) throw new Error("API request failed");

            const data = await response.json();
            const submissions = data.submission_list || data.submissions_dump;
            const latestInfo = submissions && submissions[0];

            if (!latestInfo) {
                return { success: false, error: "No submissions found." };
            }

            // 2. Check if it is Accepted
            if (latestInfo.status_display === "Accepted") {
                const showRatingModal = getDep('showRatingModal');
                const saveSubmission = getDep('saveSubmission');

                if (!showRatingModal || !saveSubmission) {
                    console.error("[LeetCode EasyRepeat] Missing dependencies for manual scan.");
                    return { success: false, error: "Internal Error: Missing dependencies" };
                }

                // Use shared API-first function for problem info
                const info = await getQuestionInfo(slug);
                const details = {
                    title: info.title,
                    slug: slug,
                    difficulty: info.difficulty,
                    topics: info.topics
                };

                // Skip rating modal if already saved today
                if (await isAlreadySavedToday(slug, details.difficulty)) {
                    console.log(`[LeetCode EasyRepeat] Already saved today for ${slug}. Skipping rating modal.`);
                    const showDuplicateSkipToast = getDep('showDuplicateSkipToast');
                    if (showDuplicateSkipToast) showDuplicateSkipToast(details.title, { slug });
                    try { await chrome.storage.local.remove('activeSession'); } catch (e) { /* ignore */ }
                    return { success: true, duplicate: true };
                }

                // Read fail count from active session to cap the rating
                let maxRating = 4;
                try {
                    const sessResult = await chrome.storage.local.get({ activeSession: null });
                    const sess = sessResult.activeSession;
                    if (sess && sess.slug === slug) {
                        if (sess.failCount >= 3) maxRating = 2;
                        else if (sess.failCount >= 1) maxRating = 3;
                    }
                } catch (e) { /* ignore */ }

                const rating = await showRatingModal(details.title, { slug, maxRating });
                const result = await saveSubmission(details.title, details.slug, details.difficulty, 'manual_api_scan', rating, details.topics);

                // Clear the active session
                try { await chrome.storage.local.remove('activeSession'); } catch (e) { /* ignore */ }
                return result || { success: true };
            }

            return { success: false, error: `Latest submission is ${latestInfo.status_display}`, status: latestInfo.status_display };

        } catch (e) {
            console.error("[LeetCode EasyRepeat] API check failed:", e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Poll the LeetCode API to find the result of the submission.
     */
    async function pollSubmissionResult(slug, clickTime, title, difficulty, submissionContext = {}) {
        try {
            console.log(`[LeetCode EasyRepeat] [LEETCODE-DEBUG] Polling for ${slug} since ${clickTime}`);
            let attempts = 0;
            // const maxAttempts = 20; // Unused

            // Step 1: Find the Submission ID
            let submissionId = null;

            const findSubmission = async () => {
                try {
                    const response = await fetch(`${API_BASE}/${slug}/?offset=0&limit=5`);
                    if (!response.ok) {
                        console.warn(`[LeetCode EasyRepeat] [LEETCODE-DEBUG] API error: ${response.status} ${response.statusText}`);
                        return null;
                    }
                    const data = await response.json();

                    const submissions = data.submission_list || data.submissions_dump;

                    if (!submissions) {
                        console.warn("[LeetCode EasyRepeat] [LEETCODE-DEBUG] Unexpected API response format (missing list):", JSON.stringify(data).substring(0, 200));
                        return null; // Retry
                    }

                    // Look for a submission that happened AFTER our click (with 5s buffer for clock skew)
                    const match = submissions.find(sub =>
                        sub.timestamp >= (clickTime - 5) &&
                        sub.status_display !== "Internal Error"
                    );

                    return match ? match.id : null;
                } catch (e) {
                    console.warn("[LeetCode EasyRepeat] [LEETCODE-DEBUG] Error fetching submission list:", e);
                    return null;
                }
            };

            // Retry loop to find the ID
            while (!submissionId && attempts < 10) {
                submissionId = await findSubmission();
                if (!submissionId) {
                    console.log(`[LeetCode EasyRepeat] [LEETCODE-DEBUG] Submission list check ${attempts + 1}/10...`);
                    attempts++;
                    await new Promise(r => setTimeout(r, 2000)); // Wait 2s
                }
            }

            if (!submissionId) {
                console.log("[LeetCode EasyRepeat] [LEETCODE-DEBUG] Timed out waiting for submission to appear in list.");
                return;
            }

            console.log(`[LeetCode EasyRepeat] [LEETCODE-DEBUG] Found submission ID: ${submissionId}. Polling status...`);

            // Step 2: Poll for Result (Accepted/Wrong Answer)
            await checkSubmissionStatus(submissionId, title, slug, difficulty, submissionContext);
        } catch (e) {
            console.error("[LeetCode EasyRepeat] [LEETCODE-DEBUG] Critical error in pollSubmissionResult:", e);
        }
    }

    /**
     * Check status of a specific submission ID until it finishes processing.
     */
    async function checkSubmissionStatus(submissionId, title, slug, difficulty, submissionContext = {}) {
        let checks = 0;
        while (checks < 20) {
            try {
                const res = await fetch(`${SUBMISSION_CHECK_BASE}/${submissionId}/check/`);
                if (!res.ok) throw new Error("Check API failed");

                const data = await res.json();
                console.log(`[LeetCode EasyRepeat] Poll check state: ${data.state}, msg: ${data.status_msg || 'none'}`);
                if (data.state === "SUCCESS") {
                    // Use shared API-first function for problem info (single source of truth)
                    const info = await getQuestionInfo(slug);
                    const finalTitle = info.source === 'api' ? info.title : title;
                    const finalDifficulty = info.source === 'api' ? info.difficulty : difficulty;
                    const finalTopics = info.topics;

                    console.log(`[LeetCode EasyRepeat] Submission ${submissionId} processed. Status: ${data.status_msg || 'Done'}, Title: ${finalTitle}`);

                    // DONE! Check if Accepted
                    if (data.status_code === 10 || data.status_msg === "Accepted") {
                        console.log(`[LeetCode EasyRepeat] Submission ${submissionId} ACCEPTED!`);

                        const showRatingModal = getDep('showRatingModal');
                        const saveSubmission = getDep('saveSubmission');

                        if (showRatingModal && saveSubmission) {
                            // Skip rating modal if this problem was already saved today
                            if (await isAlreadySavedToday(slug, finalDifficulty)) {
                                console.log(`[LeetCode EasyRepeat] Already saved today for ${slug}. Skipping rating modal.`);
                                const showDuplicateSkipToast = getDep('showDuplicateSkipToast');
                                if (showDuplicateSkipToast) showDuplicateSkipToast(finalTitle, { slug });
                                try { await chrome.storage.local.remove('activeSession'); } catch (e) { /* ignore */ }
                                return true;
                            }

                            // Read fail count from active session to cap the rating
                            let maxRating = 4;
                            try {
                                const sessResult = await chrome.storage.local.get({ activeSession: null });
                                const sess = sessResult.activeSession;
                                if (sess && sess.slug === slug) {
                                    if (sess.failCount >= 3) maxRating = 2;
                                    else if (sess.failCount >= 1) maxRating = 3;
                                }
                            } catch (e) { /* ignore */ }

                            const rating = await showRatingModal(finalTitle, { slug, maxRating });
                            await saveSubmission(finalTitle, slug, finalDifficulty, 'api_poll', rating, finalTopics);

                            // Clear the active session
                            try { await chrome.storage.local.remove('activeSession'); } catch (e) { /* ignore */ }
                            return true;
                        } else {
                            console.warn("[LeetCode EasyRepeat] Dependencies missing. Cannot save.");
                            return false;
                        }
                    } else {
                        console.log(`[LeetCode EasyRepeat] Submission ${submissionId} finished but NOT Accepted (${data.status_msg || 'Error'}). Tracking in active session...`);

                        // Track the fail in the active session instead of saving immediately
                        await updateActiveSession(slug, finalTitle, finalDifficulty, finalTopics);

                        console.log("[LeetCode EasyRepeat] [DEBUG] Checking window.LLMSidecar:", typeof window.LLMSidecar !== 'undefined');
                        if (typeof window.LLMSidecar !== 'undefined') {
                            console.log("[LeetCode EasyRepeat] [DEBUG] analyzeMistake:", typeof window.LLMSidecar.analyzeMistake);
                        }
                        
                        // --- AI Mistake Analysis Hook ---
                        if (typeof window.LLMSidecar !== 'undefined' &&
                            typeof window.LLMSidecar.analyzeMistake === 'function') {

                            (async () => {
                                console.log("[LeetCode EasyRepeat] AI Hook IIFE started.");
                                // 0. Check global AI toggle
                                let aiEnabled = true;
                                let shouldAnalyze = false;
                                try {
                                    if (typeof chrome === 'undefined' || !chrome.runtime?.id || !chrome.storage?.local) {
                                        return;
                                    }
                                    const aiStorage = await chrome.storage.local.get({
                                        aiAnalysisEnabled: true,
                                        alwaysAnalyze: false
                                    });
                                    // Keep explicit OFF respected, but default to ON when key is missing.
                                    aiEnabled = aiStorage.aiAnalysisEnabled !== false;
                                    shouldAnalyze = !!aiStorage.alwaysAnalyze;
                                } catch (e) { }

                                if (!aiEnabled) return;

                                const showAnalysisModal = getDep('showAnalysisModal');
                                const saveNotes = getDep('saveNotes');

                                // 1. Ask user when "always analyze" is not enabled.
                                if (!shouldAnalyze && showAnalysisModal) {
                                    shouldAnalyze = await showAnalysisModal(data.status_msg); // 'Wrong Answer', etc.
                                }

                                if (shouldAnalyze) {
                                    // 3. Use the click-time snapshot when available. Falling back to
                                    // a current DOM snapshot is best-effort and remains marked partial.
                                    const capture = submissionContext.capture || captureEditorCodeFromDom();
                                    const code = typeof capture.code === 'string' ? capture.code : '';

                                    // 4. Question info already available via shared getQuestionInfo() above
                                    // finalTitle, finalDifficulty, finalTopics are in scope from parent

                                    // 5. Run Analysis with Progress & Cancellation
                                    const showAnalysisProgress = getDep('showAnalysisProgress');
                                    const controller = new AbortController();

                                    let progressUI = null;
                                    if (showAnalysisProgress) {
                                        progressUI = showAnalysisProgress(() => {
                                            console.log("[LeetCode EasyRepeat] User cancelled analysis.");
                                            controller.abort();
                                        });
                                        if (progressUI.updateStep) {
                                            progressUI.updateStep({ key: 'captured_failed_submission', status: 'done' });
                                            progressUI.updateStep({ key: 'analyzing_error_pattern', status: 'active' });
                                        } else if (progressUI.update) {
                                            progressUI.update({ key: 'captured_failed_submission', status: 'done' });
                                            progressUI.update({ key: 'analyzing_error_pattern', status: 'active' });
                                        }
                                    }

                                    try {
                                        const errorDetails = data.runtime_error || data.compile_error || data.full_runtime_error || data.status_msg;
                                        // Resolve the language once for the entire analysis. This keeps
                                        // the model response and the note wrapper in the same language,
                                        // even if the option changes while the request is in flight.
                                        const language = await getCurrentUiLanguage();

                                        // Extract failing test case if available
                                        const testInput = data.last_testcase || data.input_formatted || data.input || "";
                                        console.log(`[LeetCode EasyRepeat] Failing Test Input: ${testInput}`);

                                        const analysis = await window.LLMSidecar.analyzeMistake(
                                            code,
                                            errorDetails,
                                            {
                                                title: finalTitle,
                                                difficulty: finalDifficulty,
                                                test_input: testInput,
                                                expected_output: data.expected_output || data.expected || '',
                                                actual_output: data.code_output || data.std_output || data.output || '',
                                                ui_language: language,
                                                code_capture_status: capture.status,
                                                code_capture_source: capture.source,
                                                code_capture_reason: capture.reason || '',
                                                language: data.lang || data.lang_name || data.language || '',
                                                topics: finalTopics
                                            },
                                            controller.signal,
                                            (status) => {
                                                if (progressUI) progressUI.update(status);
                                            }
                                        );

                                        // 6. Save to Notes
                                        if (analysis && saveNotes) {
                                            const locale = language === 'zh' ? 'zh-CN' : 'en-US';
                                            const now = new Date().toLocaleString(locale);
                                            const heading = translateUi('content_ai_analysis_heading', language, language === 'zh' ? 'AI 错误分析' : 'AI Analysis');
                                            const mistakeLabel = translateUi('content_mistake_label', language, language === 'zh' ? '错误类型' : 'Mistake');
                                            const localizedStatus = localizeSubmissionStatus(data.status_msg, language);
                                            const labelSeparator = language === 'zh' ? '：' : ':';
                                            const noteEntry = `\n\n### 🤖 ${heading} (${now})\n**${mistakeLabel}${labelSeparator}** ${localizedStatus}\n\n${analysis}`;

                                            // Append to existing
                                            const getNotes = getDep('getNotes');
                                            const existing = await getNotes(slug);
                                            await saveNotes(slug, existing + noteEntry);

                                            // Optional: Open notes widget to show result
                                            const widget = document.querySelector(`.lc-notes-container[data-slug="${slug}"]`);
                                            if (widget && !widget.classList.contains('expanded')) {
                                                const handle = widget.querySelector('.lc-notes-handle');
                                                if (handle) handle.click();
                                            }
                                        }

                                        if (progressUI) {
                                            if (progressUI.updateStep) {
                                                progressUI.updateStep({ key: 'analysis_complete', status: 'done' });
                                            } else {
                                                progressUI.update("Analysis Complete", 100);
                                            }
                                            setTimeout(() => progressUI.close(), 1000);
                                        }

                                    } catch (e) {
                                        if (e.name === 'AbortError') {
                                            // Handled by UI close usually, but ensure cleanup
                                            if (progressUI) progressUI.close();
                                        } else {
                                            console.error("[LeetCode EasyRepeat] Analysis failed:", e);
                                            if (progressUI) {
                                                if (progressUI.updateStep) {
                                                    progressUI.updateStep({ key: 'analysis_failed', status: 'error', message: e.message });
                                                } else {
                                                    progressUI.update("Error: " + e.message, 0);
                                                }
                                                setTimeout(() => progressUI.close(), 3000);
                                            }
                                        }
                                    }
                                }
                            })();
                        }

                        return false;
                    }
                }

                // Still Pending
                checks++;
                await new Promise(r => setTimeout(r, 1000)); // Wait 1s

            } catch (e) {
                console.warn("[LeetCode EasyRepeat] Error polling check API:", e);
                checks++;
                await new Promise(r => setTimeout(r, 2000));
            }
        }
        console.log("[LeetCode EasyRepeat] Timed out polling submission status.");
        return false;
    }

    /**
     * Monitor for clicks on the Submit button to trigger API polling.
     */
    function monitorSubmissionClicks() {
        if (typeof document === 'undefined') return;

        document.addEventListener('click', (e) => {
            try {
                // Try multiple possible selectors for the Submit button (LeetCode UI changes frequently)
                const btn = e.target.closest('[data-e2e-locator="console-submit-button"]') || 
                            e.target.closest('button.bg-blue-6') || 
                            e.target.closest('button[data-cy="submit-code-btn"]');

                if (btn) {
                    console.log('[LeetCode EasyRepeat] [DEBUG] Submit button clicked detected via locator.');
                    const clickTime = Math.floor(Date.now() / 1000); // Unix timestamp in seconds

                    const slug = getCurrentProblemSlug();
                    if (slug) {
                        const capture = captureEditorCodeFromDom();
                        // Title & difficulty are just fallbacks here — getQuestionInfo()
                        // in checkSubmissionStatus() will fetch the real values from API
                        pollSubmissionResult(slug, clickTime, slug.replace(/-/g, ' '), 'Medium', { capture })
                            .catch(err => console.error("[LeetCode EasyRepeat] [LEETCODE-DEBUG] Polling failed:", err));
                    } else {
                        console.warn("[LeetCode EasyRepeat] [LEETCODE-DEBUG] Could not determine slug on click.");
                    }
                }
            } catch (err) {
                console.error("[LeetCode EasyRepeat] [LEETCODE-DEBUG] Error in click listener:", err);
            }
        });
    }

    /**
     * Check if a problem was already saved to storage today (same local day + same difficulty).
     * Used to skip the rating modal on duplicate AC submissions within the same day.
     */
    async function isAlreadySavedToday(slug, difficulty) {
        try {
            if (typeof chrome === 'undefined' || !chrome.runtime?.id) return false;
            const result = await chrome.storage.local.get({ problems: {} });
            const problem = result.problems[slug];
            if (!problem || !problem.lastSolved) return false;

            const now = new Date();
            const lastSolved = new Date(problem.lastSolved);
            const sameDay = now.getFullYear() === lastSolved.getFullYear() &&
                now.getMonth() === lastSolved.getMonth() &&
                now.getDate() === lastSolved.getDate();

            return sameDay && problem.difficulty === difficulty;
        } catch (e) {
            return false;
        }
    }

    /**
     * Track a failed submission in the active session (stored in chrome.storage.local).
     * If a session exists for a different slug, auto-save the old one as Again first.
     */
    async function updateActiveSession(slug, title, difficulty, topics) {
        if (typeof chrome === 'undefined' || !chrome.runtime?.id) return;

        const result = await chrome.storage.local.get({ activeSession: null });
        const existing = result.activeSession;

        // If there's an existing session for a different problem, auto-save it as Again
        if (existing && existing.slug && existing.slug !== slug) {
            const saveSubmission = getDep('saveSubmission');
            if (saveSubmission) {
                await saveSubmission(existing.title, existing.slug, existing.difficulty,
                    'session_displaced', 1, existing.topics || []);
                console.log(`[LeetCode EasyRepeat] Auto-saved displaced session for ${existing.slug} as Again`);
            }
        }

        const session = (existing && existing.slug === slug) ? existing : {
            slug, title, difficulty, topics: topics || [],
            failCount: 0, accepted: false
        };

        // If existing session had empty topics but we now have them, update
        if (topics && topics.length > 0 && (!session.topics || session.topics.length === 0)) {
            session.topics = topics;
        }

        session.failCount += 1;
        session.lastActivity = new Date().toISOString();
        await chrome.storage.local.set({ activeSession: session });
        console.log(`[LeetCode EasyRepeat] Active session updated: ${slug}, failCount=${session.failCount}`);
    }

    return {
        getCurrentProblemSlug,
        checkLatestSubmissionViaApi,
        pollSubmissionResult,
        checkSubmissionStatus,
        monitorSubmissionClicks,
        fetchQuestionDetails,
        getQuestionInfo,
        updateActiveSession,
        captureEditorCodeFromDom,
        /** Clear the in-memory question info cache (useful for testing). */
        clearQuestionInfoCache: () => _questionInfoCache.clear()
    };
}));
