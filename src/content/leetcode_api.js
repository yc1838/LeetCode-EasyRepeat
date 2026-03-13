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

        const apiData = await fetchQuestionDetails(slug);
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
    async function pollSubmissionResult(slug, clickTime, title, difficulty) {
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
            await checkSubmissionStatus(submissionId, title, slug, difficulty);
        } catch (e) {
            console.error("[LeetCode EasyRepeat] [LEETCODE-DEBUG] Critical error in pollSubmissionResult:", e);
        }
    }

    /**
     * Check status of a specific submission ID until it finishes processing.
     */
    async function checkSubmissionStatus(submissionId, title, slug, difficulty) {
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
                                    // 3. Get Code (Scrape from DOM)
                                    // Try to find Monaco lines
                                    let code = "";
                                    const lines = document.querySelectorAll('.view-lines .view-line');
                                    if (lines && lines.length > 0) {
                                        code = Array.from(lines).map(l => l.innerText).join('\n');
                                    } else {
                                        code = "// Code could not be scraped. Please check permissions.";
                                    }

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

                                        // Extract failing test case if available
                                        const testInput = data.last_testcase || data.input_formatted || data.input || "";
                                        console.log(`[LeetCode EasyRepeat] Failing Test Input: ${testInput}`);

                                        const analysis = await window.LLMSidecar.analyzeMistake(
                                            code,
                                            errorDetails,
                                            {
                                                title: finalTitle,
                                                difficulty: finalDifficulty,
                                                test_input: testInput
                                            },
                                            controller.signal,
                                            (status) => {
                                                if (progressUI) progressUI.update(status);
                                            }
                                        );

                                        // 6. Save to Notes
                                        if (analysis && saveNotes) {
                                            const now = new Date().toLocaleString();
                                            const noteEntry = `\n\n### 🤖 AI Analysis (${now})\n**Mistake:** ${data.status_msg}\n\n${analysis}`;

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
                        // Title & difficulty are just fallbacks here — getQuestionInfo()
                        // in checkSubmissionStatus() will fetch the real values from API
                        pollSubmissionResult(slug, clickTime, slug.replace(/-/g, ' '), 'Medium')
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
        /** Clear the in-memory question info cache (useful for testing). */
        clearQuestionInfoCache: () => _questionInfoCache.clear()
    };
}));
