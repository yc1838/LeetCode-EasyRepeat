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

    const getDep = (name) => {
        if (typeof global !== 'undefined' && global[name]) return global[name];
        if (typeof window !== 'undefined' && window[name]) return window[name];
        return undefined;
    };

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
                console.log(`[LeetCode EasyRepeat] Fetched details from API: ${q.title} (${q.difficulty})`);
                return {
                    difficulty: q.difficulty,
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
                const extractProblemDetails = getDep('extractProblemDetails');
                const showRatingModal = getDep('showRatingModal');
                const saveSubmission = getDep('saveSubmission');

                if (!extractProblemDetails || !showRatingModal || !saveSubmission) {
                    console.error("[LeetCode EasyRepeat] Missing dependencies for manual scan.");
                    return { success: false, error: "Internal Error: Missing dependencies" };
                }

                const details = extractProblemDetails();

                // Enhance details with reliable API difficulty
                // Enhance details with reliable API data
                const apiData = await fetchQuestionDetails(slug);
                if (apiData) {
                    details.difficulty = apiData.difficulty;
                    // details.slug is already correct (input arg)
                    // Construct standard title "1. Two Sum"
                    if (apiData.title && apiData.questionId) {
                        details.title = `${apiData.questionId}. ${apiData.title}`;
                    }
                    details.topics = apiData.topics || [];
                }

                // Prompt for rating manually too? Yes.
                const rating = await showRatingModal(details.title);
                const result = await saveSubmission(details.title, details.slug, details.difficulty, 'manual_api_scan', rating, details.topics);
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
                // data.state could be "PENDING", "STARTED", "SUCCESS"

                if (data.state === "SUCCESS") {
                    // Fetch question details ONCE and share across all hooks
                    const apiData = await fetchQuestionDetails(slug);
                    const finalDifficulty = apiData?.difficulty || difficulty;
                    const finalTitle = apiData?.title && apiData?.questionId
                        ? `${apiData.questionId}. ${apiData.title}`
                        : title;
                    const finalTopics = apiData?.topics || [];

                    // --- Shadow Logger Hook ---
                    // Log ALL submissions (pass or fail) for Neural Retention Agent
                    (async () => {
                        try {
                            if (typeof window.ShadowLogger !== 'undefined') {
                                const logger = window.ShadowLogger.getInstance ?
                                    window.ShadowLogger.getInstance() :
                                    new window.ShadowLogger();

                                await logger.init();

                                // Extract code from Monaco Editor
                                let code = "";
                                const lines = document.querySelectorAll('.view-lines .view-line');
                                if (lines && lines.length > 0) {
                                    code = Array.from(lines).map(l => l.innerText).join('\n');
                                }

                                // Detect language from UI
                                let language = 'python3';
                                const langBtn = document.querySelector('[data-e2e-locator="console-lang-button"]');
                                if (langBtn) {
                                    language = langBtn.textContent?.trim().toLowerCase() || 'python3';
                                }

                                await logger.log({
                                    problemSlug: slug,
                                    problemTitle: finalTitle,
                                    difficulty: finalDifficulty,
                                    topics: finalTopics,
                                    language: language,
                                    code: code,
                                    result: data.status_msg ||
                                        (data.status_code === 10 ? 'Accepted' : 'Failed'),
                                    errorDetails: data.status_code !== 10 ? {
                                        type: data.status_msg,
                                        testInput: data.last_testcase || data.input || '',
                                        expected: data.expected_output || '',
                                        actual: data.code_output || '',
                                        runtimeError: data.runtime_error || data.compile_error || ''
                                    } : undefined,
                                    submissionId: String(submissionId)
                                });
                            }
                        } catch (e) {
                            console.warn('[ShadowLogger] Failed to log submission:', e);
                        }
                    })();

                    // DONE! Check if Accepted
                    if (data.status_code === 10 || data.status_msg === "Accepted") {
                        console.log(`[LeetCode EasyRepeat] Submission ${submissionId} ACCEPTED!`);

                        const showRatingModal = getDep('showRatingModal');
                        const saveSubmission = getDep('saveSubmission');

                        if (showRatingModal && saveSubmission) {
                            // Use already-fetched apiData (no duplicate call!)
                            const rating = await showRatingModal(finalTitle);
                            await saveSubmission(finalTitle, slug, finalDifficulty, 'api_poll', rating, finalTopics);
                            return true;
                        } else {
                            console.warn("[LeetCode EasyRepeat] Dependencies missing. Cannot save.");
                            return false;
                        }
                    } else {
                        console.log(`[LeetCode EasyRepeat] Submission ${submissionId} finished but NOT Accepted (${data.status_msg}).`);

                        // --- AI Mistake Analysis Hook ---
                        if (typeof window.LLMSidecar !== 'undefined' &&
                            typeof window.LLMSidecar.analyzeMistake === 'function') {

                            (async () => {
                                // 0. Check global AI toggle
                                let aiEnabled = true;
                                let shouldAnalyze = false;
                                try {
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

                                    // 4. Retrieve Question Info
                                    const apiData = await fetchQuestionDetails(slug);
                                    let finalTitle = title;
                                    if (apiData && apiData.title) finalTitle = apiData.title;

                                    // 5. Run Analysis with Progress & Cancellation
                                    const showAnalysisProgress = getDep('showAnalysisProgress');
                                    const controller = new AbortController();

                                    let progressUI = null;
                                    if (showAnalysisProgress) {
                                        progressUI = showAnalysisProgress(() => {
                                            console.log("[LeetCode EasyRepeat] User cancelled analysis.");
                                            controller.abort();
                                        });
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
                                                difficulty: difficulty,
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
                                            progressUI.update("Analysis Complete", 100);
                                            setTimeout(() => progressUI.close(), 1000);
                                        }

                                    } catch (e) {
                                        if (e.name === 'AbortError') {
                                            // Handled by UI close usually, but ensure cleanup
                                            if (progressUI) progressUI.close();
                                        } else {
                                            console.error("[LeetCode EasyRepeat] Analysis failed:", e);
                                            if (progressUI) {
                                                progressUI.update("Error: " + e.message, 0);
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
                const btn = e.target.closest('[data-e2e-locator="console-submit-button"]');
                if (btn) {
                    console.log('[LeetCode EasyRepeat] [LEETCODE-DEBUG] Submit button clicked. Starting API poll...');
                    const clickTime = Math.floor(Date.now() / 1000); // Unix timestamp in seconds

                    const getCurrentProblemSlug = getDep('getCurrentProblemSlug');
                    const extractProblemDetails = getDep('extractProblemDetails');

                    if (getCurrentProblemSlug) {
                        const slug = getCurrentProblemSlug();
                        if (slug) {
                            if (extractProblemDetails) {
                                const details = extractProblemDetails();
                                pollSubmissionResult(slug, clickTime, details.title, details.difficulty)
                                    .catch(err => console.error("[LeetCode EasyRepeat] [LEETCODE-DEBUG] Polling failed:", err));
                            } else {
                                console.warn("[LeetCode EasyRepeat] extractProblemDetails not found.");
                            }
                        } else {
                            console.warn("[LeetCode EasyRepeat] [LEETCODE-DEBUG] Could not determine slug on click.");
                        }
                    } else {
                        console.warn("[LeetCode EasyRepeat] getCurrentProblemSlug not found.");
                    }
                }
            } catch (err) {
                console.error("[LeetCode EasyRepeat] [LEETCODE-DEBUG] Error in click listener:", err);
            }
        });
    }

    return {
        checkLatestSubmissionViaApi,
        pollSubmissionResult,
        checkSubmissionStatus,
        monitorSubmissionClicks,
        fetchQuestionDetails
    };
}));
