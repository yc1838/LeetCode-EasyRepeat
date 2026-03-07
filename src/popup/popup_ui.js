/**
 * LeetCode EasyRepeat - Popup UI Logic
 * 
 * Contains purely visual rendering functions for the extension popup.
 * Separated from popup.js to improve maintainability.
 */

// --- Rendering Functions ---

/**
 * Render the list of problem cards (vectors).
 * @param {Array} problemList - Array of problem objects
 * @param {string} containerId - Element ID to inject into
 * @param {boolean} isInteractive - True for "Due" list (shows buttons), False for "All"
 */
export function renderVectors(problemList, containerId, isInteractive) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    if (problemList.length === 0) {
        container.innerHTML = `<div style="padding:20px; text-align:center; color:#555; font-size:0.7rem;">NO_DATA_DETECTED // BUFFER_EMPTY</div>`;
        return;
    }

    problemList.forEach(problem => {
        const uniqueId = problem.slug; // Assuming unique
        const interval = problem.interval;
        const nextReview = new Date(problem.nextReviewDate).toLocaleDateString();

        const card = document.createElement('div');
        card.className = 'vector-card';

        // Rating buttons removed - FSRS 4-choice rating is handled by content_ui.js after submission detection

        // Determine badge style
        const diffStyle = `difficulty-${(problem.difficulty || 'medium').toLowerCase()}`;

        card.innerHTML = `
                <div class="vector-meta">
                    <span>#${problem.slug}</span>
                    <span>RETENTION: ${Math.min(100, Math.round(problem.easeFactor * 40))}%</span>
                </div>
                <div class="vector-title">${problem.title.toUpperCase()}</div>
                ${(problem.topics && problem.topics.length > 0) ? `
                    <div class="topic-row" style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:6px;">
                        ${problem.topics.slice(0, 3).map(t => `<span class="stat-tag topic-tag">${t.toUpperCase()}</span>`).join('')}
                    </div>
                ` : ''}
                <div class="vector-stats" style="flex-wrap: wrap;">
                    <span class="stat-tag ${diffStyle}">${(problem.difficulty || 'MEDIUM').toUpperCase()}</span>
                    <span class="stat-tag">INT: ${interval}D</span>
                    <span class="stat-tag">DUE: ${nextReview}</span>
                    <div class="action-group" style="margin-left: auto; display: flex; flex-direction: column; gap: 4px; align-items: flex-end;">
                        <button class="del-btn" data-slug="${problem.slug}">DEL</button>
                        <button class="go-btn" data-slug="${problem.slug}">GO</button>
                    </div>
                </div>
                <button class="tactical-btn">INITIALIZE_SEQUENCE</button>
                
                <div class="vector-details">
                    <div class="mini-heatmap-label">PROJECTED_TIMELINE:</div>
                    <div class="heatmap-grid mini-heatmap" id="grid-${uniqueId}"></div>
                    ${problem.notes ? `
                        <div class="notes-flashcard">
                            <div class="notes-label">USER_NOTES //</div>
                            <div class="notes-content">${problem.notes.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</div>
                            <div class="notes-edit-hint" title="Editable notes">
                                <svg class="notes-edit-icon" viewBox="0 0 24 24" aria-hidden="true">
                                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.21a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0L15.12 4.1l3.75 3.75 1.84-1.81z"/>
                                </svg>
                                <span>EDIT NOTES</span>
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;

        // Expand Handler
        card.onclick = (e) => {
            // Prevent button click from toggling
            if (e.target.classList.contains('go-btn')) return;

            // Toggle
            card.classList.toggle('expanded');

            // Render Mini Heatmap on expand
            if (card.classList.contains('expanded')) {
                renderMiniHeatmap(problem, `grid-${uniqueId}`);
            }
        };

        // GO Button Handler
        const goBtn = card.querySelector('.go-btn');
        if (goBtn) {
            goBtn.onclick = (e) => {
                e.stopPropagation();
                if (typeof chrome !== 'undefined' && chrome.tabs) {
                    chrome.tabs.create({ url: `https://leetcode.com/problems/${problem.slug}/` });
                }
            };
        }

        // DELETE Button Handler
        const delBtn = card.querySelector('.del-btn');
        if (delBtn) {
            delBtn.onclick = async (e) => {
                e.stopPropagation();
                if (typeof deleteProblem === 'function') {
                    await deleteProblem(problem.slug);
                } else {
                    console.error("deleteProblem is not defined");
                }
            };
        }

        // Edit Notes Handler
        const attachEditListener = () => {
            const editBtn = card.querySelector('.notes-edit-hint');
            if (!editBtn) return;

            editBtn.onclick = (e) => {
                e.stopPropagation();
                const flashcard = card.querySelector('.notes-flashcard');
                if (!flashcard) return;

                const rawNotes = problem.notes || "";

                // Create Editor Elements
                const textarea = document.createElement('textarea');
                textarea.value = rawNotes;
                textarea.style.cssText = `
                    width: 100%;
                    min-height: 80px;
                    background: rgba(0,0,0,0.3);
                    border: 1px solid var(--electric);
                    color: var(--font-main);
                    font-family: 'JetBrains Mono', monospace;
                    font-size: 0.8rem;
                    padding: 8px;
                    margin-bottom: 8px;
                    resize: vertical;
                    border-radius: 4px;
                `;
                textarea.onclick = (ev) => ev.stopPropagation();
                textarea.onkeydown = (ev) => ev.stopPropagation();

                const btnRow = document.createElement('div');
                btnRow.style.cssText = 'display: flex; gap: 8px; justify-content: flex-end;';

                const saveBtn = document.createElement('button');
                saveBtn.innerText = 'SAVE';
                saveBtn.style.cssText = `
                    background: var(--terminal);
                    color: #000;
                    border: none;
                    padding: 4px 12px;
                    font-family: inherit;
                    font-weight: bold;
                    cursor: pointer;
                    font-size: 0.7rem;
                `;

                const cancelBtn = document.createElement('button');
                cancelBtn.innerText = 'CANCEL';
                cancelBtn.style.cssText = `
                    background: transparent;
                    color: var(--electric);
                    border: 1px solid var(--electric);
                    padding: 4px 12px;
                    font-family: inherit;
                    font-weight: bold;
                    cursor: pointer;
                    font-size: 0.7rem;
                `;

                // Save Logic
                saveBtn.onclick = async (ev) => {
                    ev.stopPropagation();
                    saveBtn.innerText = 'SAVING...';
                    if (typeof saveNotes === 'function') {
                        await saveNotes(problem.slug, textarea.value);
                        // Note: popup.js listener will trigger updateDashboard() automatically
                    } else {
                        console.error('saveNotes not found');
                    }
                };

                // Cancel Logic
                cancelBtn.onclick = (ev) => {
                    ev.stopPropagation();
                    // Restore original view
                    const formattedNotes = (problem.notes || "").replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
                    flashcard.innerHTML = `
                        <div class="notes-label">USER_NOTES //</div>
                        <div class="notes-content">${formattedNotes}</div>
                        <div class="notes-edit-hint" title="Editable notes">
                            <svg class="notes-edit-icon" viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.21a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0L15.12 4.1l3.75 3.75 1.84-1.81z"/>
                            </svg>
                            <span>EDIT NOTES</span>
                        </div>
                    `;
                    attachEditListener(); // Re-arm the listener
                };

                // Swap Content
                flashcard.innerHTML = '';
                flashcard.appendChild(textarea);
                btnRow.appendChild(cancelBtn);
                btnRow.appendChild(saveBtn);
                flashcard.appendChild(btnRow);
            };
        };
        attachEditListener();

        // Rating handlers removed - FSRS 4-choice rating is handled by content_ui.js

        container.appendChild(card);
    });
}

// Renders the rich timeline (History + Procrastination + Future)
// This function generates the visual grid of squares representing the problem's lifecycle.
export function renderMiniHeatmap(problem, gridId) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    grid.innerHTML = '';

    // Helper for consistent YYYY-MM-DD formatting to match keys in our logic
    const toDateStr = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

    // 1. Prepare History & Replay State
    // We look at the 'history' array in the problem object to see past reviews.
    const history = (problem.history || []).map(h => ({
        date: new Date(h.date),
        dateStr: toDateStr(new Date(h.date)), // Normalize to string for easy comparison
        rating: h.rating || 3 // Default to 'Good' (3) if no rating found (legacy data compliance)
    })).sort((a, b) => a.date - b.date); // Ensure history is sorted chronologically

    // Get "Today" to use as a reference point for what is Past vs Future
    const today = typeof window.getCurrentDate === 'function' ? window.getCurrentDate() : new Date();
    today.setHours(0, 0, 0, 0); // Normalize time to midnight so we strictly compare Dates
    const todayStr = toDateStr(today);

    // --- CORE LOGIC: DETERMINING HEATMAP START DATE ---
    // distinct behaviors noticed by users are defined here:
    // Case A: User has done this problem before (history.length > 0).
    //         Start Date = The date of the VERY FIRST review.
    //         This gives the user context on how long they've been practicing this problem.
    // Case B: User has NEVER done this problem (or history is empty).
    //         Start Date = Today.
    //         This starts the timeline from "Now" since there is no past to show.
    let startDate = history.length > 0 ? new Date(history[0].date) : new Date(today);
    startDate.setHours(0, 0, 0, 0); // Normalize to midnight

    // --- CORE LOGIC: DETERMINING HEATMAP END DATE ---
    // We want to show a reasonable window into the future.
    // Base Rule: Show at least 30 days from Today.
    let endLimit = new Date(today);
    endLimit.setDate(today.getDate() + 30);

    // Exception Rule: If the Next Review is very far away (e.g., 6 months later),
    // we extend the view to include that review + 7 days buffer,
    // so the user can actually see their next scheduled milestone.
    let nextReviewDate = new Date(problem.nextReviewDate);
    if (nextReviewDate > endLimit) {
        endLimit = new Date(nextReviewDate);
        endLimit.setDate(endLimit.getDate() + 7);
    }

    // --- REPLAY & PAST ANALYSIS ---
    // Simplified for FSRS: We trust the history dates. 
    // Detecting "missed" days in the past with FSRS is complex without full state reconstruction.
    // For now, we only check the gap from the *last* known due date (the stored one) to Today.

    // Sets to track status of specific dates for O(1) lookup during rendering
    const doneDates = new Set(history.map(h => h.dateStr)); // Dates where explicit action was taken
    const missedDates = new Set(); // Dates where action SHOULD have been taken but wasn't

    // (Replay Loop removed for FSRS stability - can be re-added if we implement full history simulation)
    // history.forEach(...) 

    // --- CHECK CURRENT PROCRASTINATION GAP ---
    // Logic: Compare the stored "Next Review Date" against "Today".
    // If Next Review Date is in the PAST, it means the user is late.
    // We mark every day from that Due Date until Yesterday as "Missed".
    const nextDueObj = new Date(problem.nextReviewDate);
    nextDueObj.setHours(0, 0, 0, 0);

    // Ensure we don't count today as "missed" yet (it's simply Due today)
    if (nextDueObj < today) {
        let curr = new Date(nextDueObj);
        // Loop from Due Date up to (but not including) Today
        while (curr < today) {
            const currStr = toDateStr(curr);
            // Only mark as missed if the user didn't actually do it on that day (edge case prevention)
            if (!doneDates.has(currStr)) {
                missedDates.add(currStr);
            }
            curr.setDate(curr.getDate() + 1); // Advance one day
        }
    }

    // --- FUTURE PROJECTION ---
    // We want to show the user when they will need to review this again in the future.
    const futureProjectedDates = new Set();

    // 1. Always include the stored Next Review Date if it's in the future
    // This is the most critical date to show.
    if (nextDueObj > today) {
        futureProjectedDates.add(toDateStr(nextDueObj));
    }

    // 2. Project subsequent reviews STARTING from the Next Review Date (or Today if overdue)
    // This simulates: "If I do the review on time, when is the NEXT one after that?"
    const simulationStartDate = (nextDueObj > today) ? nextDueObj : today;

    if (typeof fsrs !== 'undefined' && fsrs.projectScheduleFSRS) {
        // Use FSRS Projection logic if available (advanced algorithm)
        const card = {
            stability: problem.fsrs_stability,
            difficulty: problem.fsrs_difficulty,
            state: problem.fsrs_state,
            last_review: problem.fsrs_last_review || problem.lastSolved
        };

        const projected = fsrs.projectScheduleFSRS(card, simulationStartDate);
        projected.forEach(d => futureProjectedDates.add(d));

    } else if (typeof projectSchedule === 'function') {
        // Fallback to SM-2 logic if FSRS not loaded
        const projected = projectSchedule(problem.interval, problem.repetition, problem.easeFactor, simulationStartDate);
        projected.forEach(d => futureProjectedDates.add(d));
    }

    // --- RENDER ITERATION ---
    // Now we actually build the DOM elements.
    // We loop strictly Day-by-Day from StartDate to EndDate.
    const formatter = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    let currentDate = new Date(startDate);
    const MAX_DAYS = 90; // Hard Safety cap to prevent browser freezing if dates are corrupted
    let count = 0;

    while (currentDate <= endLimit && count < MAX_DAYS) {
        const dayStr = toDateStr(currentDate);
        const cell = document.createElement('div');
        cell.className = 'cell';

        // Tooltip text (e.g., "Mon, Jan 29")
        const dateText = formatter.format(currentDate);
        cell.setAttribute('title', dateText); // Native tooltip fallback

        let statusLabel = "";

        // LOGIC: COLOR DETERMINATION PRIORITY
        // We check conditions in specific order to determine the cell color.

        // Priority 1: Was it explicitly DONE on this date?
        if (doneDates.has(dayStr)) {
            cell.style.background = 'var(--status-done)'; // Green/Blue usually
            cell.style.boxShadow = '0 0 6px var(--status-done)';
            cell.classList.add('status-done');
            statusLabel = "Completed";
        }
        // Priority 2: Was it MISSED (overdue) on this date?
        else if (missedDates.has(dayStr)) {
            cell.style.background = 'var(--status-missed)'; // Red
            cell.classList.add('status-missed');
            statusLabel = "Missed";
        }
        // Priority 3: Is it DUE TODAY?
        else if (dayStr === todayStr && nextDueObj <= today) {
            cell.style.background = 'var(--status-due)'; // Bright Yellow/Neon
            cell.style.boxShadow = '0 0 8px var(--status-due)'; // Glowing effect
            cell.classList.add('status-due');
            statusLabel = "Due Today";
        }
        // Priority 4: Is it SCHEDULED for the future?
        else if (futureProjectedDates.has(dayStr) && currentDate > today) {
            cell.style.background = 'var(--status-projected)'; // Faint color
            cell.classList.add('status-projected');
            statusLabel = "Scheduled";
        }
        // Default: Empty cell (transparent/grey) handled by CSS

        // Interaction: Mouse hover for custom tooltip
        cell.onmouseenter = () => {
            const tooltip = document.getElementById('global-tooltip');
            if (tooltip) {
                tooltip.textContent = statusLabel ? `${dateText} (${statusLabel})` : dateText;
                tooltip.classList.add('visible');
                const rect = cell.getBoundingClientRect();
                tooltip.style.left = `${rect.left + rect.width / 2}px`; // Center align
                tooltip.style.top = `${rect.top}px`; // Position above
            }
        };
        cell.onmouseleave = () => {
            const t = document.getElementById('global-tooltip');
            if (t) t.classList.remove('visible');
        };

        grid.appendChild(cell);
        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
        count++;
    }
}

// Renders the top decorative heatmap
export function renderGlobalHeatmap() {
    const grid = document.getElementById('global-heatmap');
    if (!grid) return;
    grid.innerHTML = '';

    // Create animated cells with natural color transitions
    for (let i = 0; i < 140; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';

        // Give cells random initial colors so heatmap is visible immediately
        const initialColor = Math.random();
        if (initialColor > 0.95) cell.classList.add('v-4');
        else if (initialColor > 0.85) cell.classList.add('v-3');
        else if (initialColor > 0.70) cell.classList.add('v-2');
        else if (initialColor > 0.50) cell.classList.add('v-1');

        // Randomly choose one of 5 animation patterns for variety
        const animationType = Math.floor(Math.random() * 5);
        cell.classList.add(`pulse-${animationType + 1}`);

        // Add random animation delay for natural staggered effect
        const delay = Math.random() * 3; // 0-3 seconds
        cell.style.animationDelay = `${delay}s`;

        // Add random animation duration for varied pacing
        const duration = 3 + Math.random() * 3; // 3-6 seconds
        cell.style.animationDuration = `${duration}s`;

        grid.appendChild(cell);
    }
}

// --- Styled Notification Function ---
export function showNotification(type, code, message) {
    // Remove any existing notification
    const existing = document.querySelector('.srs-notification');
    if (existing) existing.remove();

    const colors = {
        error: { border: '#ff2a6d', bg: 'rgba(255, 42, 109, 0.1)', icon: '✕' },
        warning: { border: '#f1c40f', bg: 'rgba(241, 196, 15, 0.1)', icon: '⚠' },
        info: { border: '#2DE2E6', bg: 'rgba(45, 226, 230, 0.1)', icon: 'ℹ' }
    };
    const style = colors[type] || colors.info;

    const notification = document.createElement('div');
    notification.className = 'srs-notification';
    notification.innerHTML = `
            <div class="notif-header">
                <span class="notif-icon">${style.icon}</span>
                <span class="notif-code">[${code}]</span>
            </div>
            <div class="notif-message">${message}</div>
            <button class="notif-close">DISMISS</button>
        `;

    // Apply inline styles (since we can't easily add to popup.css dynamically)
    notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #111;
            border: 2px solid ${style.border};
            padding: 16px 24px;
            font-family: 'JetBrains Mono', monospace;
            z-index: 1000;
            animation: slideUp 0.2s ease;
            box-shadow: 0 0 20px ${style.bg}, 0 0 0 1000px rgba(0,0,0,0.5);
            min-width: 300px;
            max-width: 80%;
            text-align: center;
        `;

    notification.querySelector('.notif-header').style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
            font-size: 11px;
            color: ${style.border};
        `;

    notification.querySelector('.notif-icon').style.cssText = `font-size: 14px;`;
    notification.querySelector('.notif-code').style.cssText = `letter-spacing: 1px;`;

    notification.querySelector('.notif-message').style.cssText = `
            font-size: 12px;
            color: #fff;
            margin-bottom: 10px;
            line-height: 1.4;
        `;

    notification.querySelector('.notif-close').style.cssText = `
            background: transparent;
            border: 1px solid ${style.border};
            color: ${style.border};
            font-family: inherit;
            font-size: 10px;
            padding: 6px 12px;
            cursor: pointer;
            width: 100%;
        `;

    notification.querySelector('.notif-close').onclick = () => notification.remove();

    document.body.appendChild(notification);

    // Auto-dismiss after 8 seconds
    setTimeout(() => {
        if (notification.parentElement) notification.remove();
    }, 8000);
}
