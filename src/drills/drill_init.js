/**
 * Drill Page Initialization
 * 
 * Entry point for the drill practice page.
 */

(async function () {
    // drillId is the single source of truth for which drill we should render.
    // If this is missing, we cannot decide what to show.
    const drillId = DrillPage.getDrillFromURL(window.location.search);
    let sessionDrills = []; // Store all drills for navigation

    if (!drillId) {
        const overviewUrl = chrome.runtime.getURL('dist/src/drills/drill_overview.html');
        document.getElementById('drill-content').innerHTML = `
            <div class="error-state">
                <div class="error-icon">⚠️</div>
                <div class="error-message">No drill specified</div>
                <a href="#" id="btn-return-to-overview">Return to Extension</a>
            </div>
        `;
        document.getElementById('btn-return-to-overview').addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = overviewUrl;
        });
        return;
    }

    // Session timer (UI only; navigation does not depend on this).
    let seconds = 0;
    const timerEl = document.getElementById('session-time');
    setInterval(() => {
        seconds++;
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        timerEl.textContent = `${mins}:${secs}`;
    }, 1000);

    /**
     * Navigate to the next drill in the session.
     * If no more drills, show completion screen.
     */
    function goToNextDrill(currentDrillId) {
        // Look up the current drill inside the in-memory session list.
        // IMPORTANT: if currentDrillId is missing or does not exist in sessionDrills,
        // findIndex returns -1 and nextDrill becomes sessionDrills[0],
        // which can look like "stuck on the same page".
        const currentIndex = sessionDrills.findIndex(d => d.id === currentDrillId);
        const nextDrill = sessionDrills[currentIndex + 1];

        if (nextDrill) {
            // Navigate to next drill (same tab) by changing the query param.
            const nextUrl = DrillPage.getDrillPageURL(nextDrill.id);
            window.location.href = nextUrl;
        } else {
            // No more drills - show completion
            showCompletionScreen();
        }
    }

    /**
     * Show session completion screen.
     */
    function showCompletionScreen() {
        console.log('[DrillInit] Showing completion screen');
        // Replace drill UI with a simple "done" message and a close button.
        const overviewUrl = chrome.runtime.getURL('dist/src/drills/drill_overview.html');
        console.log('[DrillInit] Overview URL:', overviewUrl);

        document.getElementById('drill-content').innerHTML = `
            <div class="completion-state">
                <div class="completion-icon">🎉</div>
                <div class="completion-title">Session Complete!</div>
                <div class="completion-subtitle">You've finished all drills in this session.</div>
                <button id="btn-close-session" class="btn-primary">Close</button>
            </div>
        `;
        document.getElementById('drill-result').style.display = 'none';

        // Wire up close button to navigate to overview page
        const closeBtn = document.getElementById('btn-close-session');
        console.log('[DrillInit] Close button element:', closeBtn);

        closeBtn.addEventListener('click', () => {
            console.log('[DrillInit] Close button clicked, navigating to:', overviewUrl);
            window.location.href = overviewUrl;
        });

        console.log('[DrillInit] Completion screen setup complete');
    }

    // Load drill session from storage (set by popup or overview page).
    try {
        const result = await chrome.storage.local.get('currentDrillSession');
        const session = result.currentDrillSession || {};
        sessionDrills = session.drills || [];

        let drill = null;

        // 1) Try to find the requested drill in the existing session list.
        if (drillId && sessionDrills.length > 0) {
            drill = sessionDrills.find(d => d.id === drillId);
        }

        // 2) If no drill found (invalid ID or empty session), handle fallback.
        if (!drill) {
            // If we have a session but ID is invalid, default to first drill
            if (sessionDrills.length > 0) {
                console.warn(`Drill ID ${drillId} not found in session, resetting to first drill.`);
                drill = sessionDrills[0];
                // NOTE: We do NOT update the URL here.
                // If you want the URL to match the displayed drill, uncomment below.
                // window.history.replaceState(null, '', DrillPage.getDrillPageURL(drill.id));
            }
            // 3) If NO session exists at all, create a Demo Session.
            else {
                console.log('No active session found. Creating Demo Session.');
                // Demo drills for testing - use fixed IDs
                sessionDrills = [
                    {
                        id: 'demo1',
                        type: 'fill-in-blank',
                        content: 'def binary_search(arr, target):\n    left, right = 0, len(arr) - 1\n    while left <= right:\n        mid = (left + right) // ___\n        if arr[mid] == target:\n            return mid\n    return -1',
                        answer: '2',
                        skillId: 'binary_search',
                        difficulty: 'medium'
                    },
                    {
                        id: 'demo2',
                        type: 'spot-bug',
                        skillId: 'two_pointers',
                        content: 'def reverse_string(s):\n    left, right = 0, len(s)\n    while left < right:\n        s[left], s[right] = s[right], s[left]\n        left += 1\n        right -= 1\n    return s',
                        answer: 'Line 2: off-by-one: right should be len(s) - 1'
                    },
                    {
                        id: 'demo3',
                        type: 'muscle-memory',
                        skillId: 'sliding_window',
                        content: 'Write the sliding window template for finding max sum of k consecutive elements',
                        answer: 'window sum pattern'
                    }
                ];

                // Save new demo session so navigation works on next/skip.
                await chrome.storage.local.set({
                    currentDrillSession: {
                        drills: sessionDrills,
                        currentDrill: sessionDrills[0],
                        startTime: Date.now()
                    }
                });

                // Set drill to first one
                drill = sessionDrills[0];
            }
        }

        // Render whatever we found or created.
        renderDrill(drill);

    } catch (e) {
        console.error('Failed to load drill:', e);
        document.getElementById('drill-content').innerHTML = `
            <div class="error-state">
                <div class="error-icon">❌</div>
                <div class="error-message">Failed to load drill</div>
                <p>${e.message}</p>
            </div>
        `;
    }

    function renderDrill(drill) {
        // Render the drill HTML, then wire up progress + handlers.
        const contentEl = document.getElementById('drill-content');
        const skillBadge = document.getElementById('current-skill');

        contentEl.innerHTML = DrillPage.renderDrillContent(drill);
        skillBadge.textContent = DrillPage.getSkillDisplayName(drill.skillId);

        // Update progress UI based on the position in sessionDrills.
        const total = sessionDrills.length;
        const index = sessionDrills.findIndex(d => d.id === drill.id);
        const current = index + 1;

        if (drill.type === 'muscle-memory') {
            console.log('[DrillAI] Rendering muscle-memory drill', {
                drillId: drill.id,
                skillId: drill.skillId,
                sessionIndex: current,
                sessionTotal: total
            });
        }

        const progressText = document.getElementById('drill-progress');
        const progressFill = document.getElementById('progress-fill');

        if (progressText) progressText.textContent = `Drill ${current} of ${total}`;
        if (progressFill) progressFill.style.width = `${(current / total) * 100}%`;

        // If the user is typing code, use Tab to indent instead of moving focus.
        const textareas = contentEl.querySelectorAll('textarea');
        textareas.forEach((textarea) => {
            textarea.addEventListener('keydown', (event) => {
                if (event.key !== 'Tab') return;
                event.preventDefault();

                const start = textarea.selectionStart || 0;
                const end = textarea.selectionEnd || 0;
                const value = textarea.value || '';

                // Insert a literal tab at the cursor (simple, predictable behavior).
                textarea.value = value.slice(0, start) + '\t' + value.slice(end);
                const nextCursor = start + 1;
                textarea.selectionStart = nextCursor;
                textarea.selectionEnd = nextCursor;
            });
        });

        // Spot-Bug Interactive Handler (select a token -> record line number).
        if (drill.type === 'spot-bug') {
            const tokens = contentEl.querySelectorAll('.code-token');
            const hiddenInput = document.getElementById('drill-answer');

            tokens.forEach(token => {
                token.addEventListener('click', (e) => {
                    // Remove active class from all tokens
                    tokens.forEach(t => t.classList.remove('selected'));

                    // Add to clicked
                    token.classList.add('selected');

                    // Find parent line for line number
                    const lineEl = token.closest('.code-line');
                    const lineNum = lineEl ? lineEl.dataset.line : null;

                    if (lineNum) {
                        // Set value to line number for compatibility with existing verification logic
                        hiddenInput.value = lineNum;
                    }

                    // Prevent propagation so we don't trigger any potential line click handlers
                    e.stopPropagation();
                });
            });
        }

        // Submit handler: verify answer, show result, then wire Next/Finish.
        document.getElementById('btn-submit').onclick = async () => {
            const answer = DrillPage.getUserAnswer(drill.type);
            const answerLineCount = answer ? answer.split('\n').length : 0;

            if (drill.type === 'muscle-memory') {
                console.log('[DrillAI] Submit clicked', {
                    drillId: drill.id,
                    skillId: drill.skillId,
                    answerLength: answer.length,
                    answerLineCount,
                    hasCodeGenerator: typeof CodeGeneratorAgent !== 'undefined',
                    hasInputHandler: typeof DrillInputHandler !== 'undefined',
                    hasHallucinationChecker: typeof HallucinationChecker !== 'undefined',
                    hasAsyncNotifier: typeof AsyncNotifier !== 'undefined'
                });
            }

            if (!answer.trim()) {
                if (drill.type === 'muscle-memory') {
                    console.warn('[DrillAI] Empty answer blocked', {
                        drillId: drill.id
                    });
                }
                alert('Please enter an answer');
                return;
            }

            // Verify answer using AI grading (muscle-memory) or DrillVerifier.
            let result;

            // For muscle-memory drills, use CodeGeneratorAgent for AI evaluation
            if (drill.type === 'muscle-memory' && typeof CodeGeneratorAgent !== 'undefined') {
                const aiStart = Date.now();
                const answerPreview = answer.length > 180 ? `${answer.slice(0, 180)}...` : answer;
                console.log('[DrillAI] Start evaluation', {
                    drillId: drill.id,
                    skillId: drill.skillId,
                    inputLength: answer.length,
                    inputLineCount: answerLineCount,
                    inputPreview: answerPreview
                });

                // Show processing indicator (Spinner) while AI evaluates.
                const submitBtn = document.getElementById('btn-submit');
                const originalText = submitBtn.textContent;

                // Disable button and show spinner in a modal/overlay style or inline
                submitBtn.disabled = true;

                // Create loading overlay to block input during grading.
                const loadingOverlay = document.createElement('div');
                loadingOverlay.id = 'loading-overlay';
                loadingOverlay.className = 'loading-overlay';
                loadingOverlay.innerHTML = `
                    <div class="loading-spinner"></div>
                    <div class="loading-text">AI Evaluating Solution...</div>
                `;
                document.querySelector('.drill-container').style.position = 'relative';
                document.querySelector('.drill-container').appendChild(loadingOverlay);

                try {
                    // Parse input type for AI grading.
                    const inputInfo = typeof DrillInputHandler !== 'undefined'
                        ? DrillInputHandler.parseInput(answer)
                        : { type: 'pseudo-code', content: answer };
                    const inputValidation = typeof DrillInputHandler !== 'undefined'
                        ? DrillInputHandler.validate(answer)
                        : { valid: true, errors: [] };
                    console.log('[DrillAI] Parsed input type', {
                        drillId: drill.id,
                        inputType: inputInfo.type,
                        valid: Boolean(inputInfo.valid && inputValidation.valid),
                        validationErrors: inputValidation.errors || []
                    });

                    if (!inputValidation.valid) {
                        console.warn('[DrillAI] Input quality warning', {
                            drillId: drill.id,
                            errors: inputValidation.errors
                        });
                    }

                    // Generate code from pseudo-code/natural language.
                    console.log('[DrillAI] Calling CodeGeneratorAgent.generateCode', {
                        drillId: drill.id,
                        skillId: drill.skillId,
                        inputType: inputInfo.type
                    });
                    const genResult = await CodeGeneratorAgent.generateCode(answer, {
                        skillId: drill.skillId,
                        drillType: drill.type,
                        inputType: inputInfo.type
                    });

                    loadingOverlay.remove(); // Remove loading state

                    console.log('[DrillAI] Code generation result', {
                        drillId: drill.id,
                        success: Boolean(genResult.success),
                        confidence: genResult.confidence,
                        codeLength: genResult.code ? genResult.code.length : 0,
                        retryable: Boolean(genResult.retryable),
                        error: genResult.error || null
                    });

                    if (genResult.success && genResult.code) {
                        // Run hallucination check if available.
                        let hallucinationWarning = null;
                        if (typeof HallucinationChecker !== 'undefined') {
                            const halluCheck = await HallucinationChecker.check(answer, genResult.code, {
                                skillId: drill.skillId,
                                drillType: drill.type
                            });
                            console.log('[DrillAI] Hallucination check', {
                                drillId: drill.id,
                                isHallucination: Boolean(halluCheck?.isHallucination),
                                reason: halluCheck?.reason || null
                            });
                            if (halluCheck.isHallucination) {
                                hallucinationWarning = `⚠️ Warning: ${halluCheck.reason}`;
                            }
                        } else {
                            console.log('[DrillAI] HallucinationChecker unavailable, skipping check', {
                                drillId: drill.id
                            });
                        }

                        // AI successfully generated code (consider hallucination).
                        result = {
                            correct: !hallucinationWarning,  // Only correct if no hallucination detected
                            feedback: hallucinationWarning
                                ? `${hallucinationWarning}\n\n✨ Generated Code:\n\n${genResult.code}`
                                : `✨ AI Generated Code (Confidence: ${Math.round(genResult.confidence * 100)}%):\n\n${genResult.code}`,
                            generatedCode: genResult.code
                        };

                        // Send async notification if available.
                        if (typeof AsyncNotifier !== 'undefined') {
                            AsyncNotifier.notify(drill.id, {
                                success: result.correct,
                                skillId: drill.skillId,
                                passedCount: result.correct ? 1 : 0,
                                totalCount: 1
                            });
                        } else {
                            console.log('[DrillAI] AsyncNotifier unavailable, skip notify', {
                                drillId: drill.id
                            });
                        }
                        console.log('[DrillAI] Evaluation complete', {
                            drillId: drill.id,
                            correct: result.correct,
                            elapsedMs: Date.now() - aiStart
                        });
                    } else {
                        // AI couldn't generate valid code.
                        const errorMsg = genResult.error || 'Unknown error';
                        console.warn('[DrillAI] Generation failed', {
                            drillId: drill.id,
                            error: errorMsg,
                            retryable: Boolean(genResult.retryable),
                            elapsedMs: Date.now() - aiStart
                        });

                        if (genResult.retryable) {
                            result = {
                                correct: false,
                                feedback: `⚠️ Evaluation Failed: ${errorMsg}\n\nThis seems to be a temporary issue.`,
                                retryable: true // Custom flag for UI
                            };
                        } else {
                            result = {
                                correct: false,
                                feedback: `⚠️ Could not evaluate: ${errorMsg}\n\nTry being more specific or use clearer pseudo-code.`
                            };
                        }
                    }
                } catch (e) {
                    console.error('[DrillInit] AI evaluation failed:', e);
                    if (document.getElementById('loading-overlay')) document.getElementById('loading-overlay').remove();

                    result = {
                        correct: false,
                        feedback: `AI evaluation error: ${e.message}`
                    };
                } finally {
                    console.log('[DrillAI] Resetting submit button state', {
                        drillId: drill.id
                    });
                    submitBtn.textContent = originalText;
                    submitBtn.disabled = false;
                }
            } else if (typeof DrillVerifier !== 'undefined' && DrillVerifier.verifyAnswer) {
                if (drill.type === 'muscle-memory') {
                    console.warn('[DrillAI] Falling back to DrillVerifier (CodeGeneratorAgent unavailable)', {
                        drillId: drill.id,
                        skillId: drill.skillId
                    });
                }
                result = await DrillVerifier.verifyAnswer(drill, answer);
            } else {
                // Simple fallback if verifier is missing.
                if (drill.type === 'muscle-memory') {
                    console.warn('[DrillAI] Falling back to local heuristic verifier', {
                        drillId: drill.id,
                        skillId: drill.skillId
                    });
                }
                result = {
                    correct: drill.answer && answer.toLowerCase().includes(drill.answer.toLowerCase()),
                    feedback: drill.answer ? `Expected: ${drill.answer}` : 'Answer recorded'
                };
            }

            if (drill.type === 'muscle-memory') {
                console.log('[DrillAI] Final result ready', {
                    drillId: drill.id,
                    correct: result?.correct,
                    retryable: Boolean(result?.retryable),
                    feedbackLength: result?.feedback ? result.feedback.length : 0,
                    hasGeneratedCode: Boolean(result?.generatedCode)
                });
            }

            // Show result panel and hide the drill content.
            document.getElementById('drill-content').style.display = 'none';
            const resultEl = document.getElementById('drill-result');
            resultEl.style.display = 'block';
            resultEl.style.display = 'block';
            resultEl.innerHTML = DrillPage.renderResult(result);

            // Add Retry Button if applicable (AI failure).
            if (result.retryable) {
                const actionsContainer = resultEl.querySelector('.result-actions');
                const retryBtn = document.createElement('button');
                retryBtn.className = 'btn-retry';
                retryBtn.textContent = '↻ Retry';
                retryBtn.onclick = () => {
                    document.getElementById('btn-submit').click();
                };
                actionsContainer.insertBefore(retryBtn, actionsContainer.firstChild);
            }

            // Track result (don't let tracking errors block navigation).
            try {
                if (typeof DrillTracker !== 'undefined' && DrillTracker.recordAttempt) {
                    await DrillTracker.recordAttempt(drill.id, {
                        correct: result.correct,
                        answer: answer,
                        timeSpent: seconds
                    });
                }
            } catch (e) {
                console.warn('[DrillInit] Tracking failed, continuing:', e.message);
            }

            // Wire buttons - navigate to next drill instead of closing.
            document.getElementById('btn-next')?.addEventListener('click', () => {
                goToNextDrill(drill.id);
            });
            document.getElementById('btn-finish')?.addEventListener('click', () => {
                window.close();
            });
        };

        // Skip handler - navigate to next drill instead of closing.
        document.getElementById('btn-skip')?.addEventListener('click', async () => {
            if (confirm('Skip this drill?')) {
                // Track skip (don't let tracking errors block navigation).
                try {
                    if (typeof DrillTracker !== 'undefined' && DrillTracker.recordAttempt) {
                        await DrillTracker.recordAttempt(drill.id, {
                            correct: false,
                            answer: '[SKIPPED]',
                            timeSpent: seconds,
                            skipped: true
                        });
                    }
                } catch (e) {
                    console.warn('[DrillInit] Skip tracking failed, continuing:', e.message);
                }
                goToNextDrill(drill.id);
            }
        });
    }
})();
