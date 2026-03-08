/**
 * Drill Overview Page - Embossed Cardstock Logic
 *
 * This page builds a drill session and writes it to chrome.storage.local
 * so drill_init.js can load it and handle next/skip navigation.
 */

(async function () {
    const i18n = window.EasyRepeatI18n || null;
    const card = document.getElementById('card');
    const scroller = document.getElementById('scroller');
    const folderList = document.getElementById('folder-list');
    const btnStart = document.getElementById('btn-start');

    let currentLanguage = i18n ? await i18n.getLanguage() : 'en';
    let scrollAccumulator = 0;
    let isFlipped = false;
    let tiltDecay = null;

    let allDrills = [];
    let currentDrills = [];
    let currentFolderKey = 'All';
    let activeDrill = null; // The drill currently being previewed

    const t = (key, values = {}) => i18n ? i18n.t(key, values, currentLanguage) : key;
    const formatDifficulty = (difficulty) => i18n ? i18n.formatDifficulty(difficulty, currentLanguage) : difficulty;

    function applyStaticTranslations() {
        if (i18n && typeof i18n.applyTranslations === 'function') {
            i18n.applyTranslations(document, currentLanguage);
        }
    }

    applyStaticTranslations();

    if (i18n && typeof i18n.onLanguageChange === 'function') {
        i18n.onLanguageChange((language) => {
            currentLanguage = language;
            applyStaticTranslations();
            renderFolders();
            if (activeDrill) {
                renderCard(activeDrill, currentDrills.length);
                btnStart.textContent = t('drill_start_review_count', { count: currentDrills.length });
            } else {
                renderEmptyCard();
                btnStart.textContent = t('drill_no_drills');
            }
        });
    }

    // --- Kinetic Interaction Logic ---

    function updateFlipVisuals() {
        if (isFlipped) {
            card.classList.add('is-flipped');
            scroller.style.transform = 'rotateX(180deg)';
        } else {
            card.classList.remove('is-flipped');
            scroller.style.transform = 'rotateX(0deg)';
        }
        scrollAccumulator = 0;
    }

    // Click to Flip
    scroller.addEventListener('click', (e) => {
        // Don't flip if clicking inside input/textarea
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        // Don't flip if text is selected
        const selection = window.getSelection();
        if (selection.toString().length > 0) return;

        isFlipped = !isFlipped;
        updateFlipVisuals();
    });

    // Kinetic Scroll Interaction - Scoped to Main
    const mainArea = document.querySelector('main');

    mainArea.addEventListener('wheel', (e) => {
        if (!activeDrill) return;

        // Explicitly ignore if the event originated from the sidebar
        if (e.target.closest('aside')) return;

        scrollAccumulator += e.deltaY;

        // Sensitivity threshold
        if (scrollAccumulator > 300 && !isFlipped) {
            isFlipped = true;
            updateFlipVisuals();
        } else if (scrollAccumulator < -300 && isFlipped) {
            isFlipped = false;
            updateFlipVisuals();
        }

        // Subtle tilt effect based on accumulation
        const tilt = Math.min(Math.max(scrollAccumulator / 20, -10), 10);
        if (!isFlipped) {
            scroller.style.transform = `rotateX(${tilt}deg)`;
        } else {
            scroller.style.transform = `rotateX(${180 + tilt}deg)`;
        }

        // Decay the tilt
        clearTimeout(tiltDecay);
        tiltDecay = setTimeout(() => {
            updateFlipVisuals();
        }, 150);
    });

    // --- Data Loading & Binding ---

    async function loadDrills() {
        try {
            if (typeof window.DrillStore !== 'undefined') {
                const store = new window.DrillStore.DrillStore();
                await store.init();
                const drills = await store.getAll();
                // We show all drills, but prioritize pending?
                // The prompt implies "Reviewing", so let's stick to Pending for the "Queue"
                allDrills = drills.filter(d => d.status !== 'completed').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                console.log(`[DrillOverview] Loaded ${allDrills.length} pending drills.`);

                renderFolders();
                // Default to 'All'
                selectFolder('All', allDrills);
            } else {
                console.error('[DrillOverview] DrillStore not found!');
            }
        } catch (e) {
            console.error('[DrillOverview] Failed to load drills:', e);
        }
    }

    function renderFolders() {
        folderList.innerHTML = '';
        const generalLabel = currentLanguage === 'zh' ? '通用' : 'General';
        const generalKey = '__general__';

        // Group by Skill
        const skillsCount = allDrills.reduce((acc, drill) => {
            const skill = drill.skillId || generalKey;
            acc[skill] = (acc[skill] || 0) + 1;
            return acc;
        }, {});

        // Add "All" folder
        addFolderItem(t('drill_all_drills'), allDrills.length, () => selectFolder('All', allDrills), 'All');

        // Add Skill folders
        Object.entries(skillsCount).forEach(([skill, count]) => {
            const skillLabel = skill === generalKey ? generalLabel : skill.replace(/_/g, ' ');
            const filtered = allDrills.filter(d => (d.skillId || generalKey) === skill);
            addFolderItem(skillLabel, count, () => selectFolder(skill, filtered), skill);
        });
    }

    function addFolderItem(label, count, onClick, folderKey) {
        const li = document.createElement('li');
        li.className = 'folder-item';
        if (folderKey === currentFolderKey) {
            li.classList.add('active');
        }
        li.innerHTML = `
            <span>${label}</span>
            <span class="folder-count">${count}</span>
        `;
        li.onclick = () => {
            // Update active state
            document.querySelectorAll('.folder-item').forEach(f => f.classList.remove('active'));
            li.classList.add('active');
            onClick();
        };
        folderList.appendChild(li);
    }

    function selectFolder(name, drills) {
        currentFolderKey = name;
        currentDrills = drills;

        // Reset card state
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px) rotateX(0deg)';
        isFlipped = false;
        card.classList.remove('is-flipped');

        setTimeout(() => {
            if (drills.length > 0) {
                activeDrill = drills[0]; // Show first drill as preview
                renderCard(activeDrill, drills.length);
                btnStart.disabled = false;
                btnStart.textContent = t('drill_start_review_count', { count: drills.length });
            } else {
                activeDrill = null;
                renderEmptyCard();
                btnStart.disabled = true;
                btnStart.textContent = t('drill_no_drills');
            }

            // Animate in
            card.style.opacity = '1';
            card.style.transform = 'translateY(0) rotateX(0deg)';
        }, 300);
    }

    function renderCard(drill, totalCount) {
        const skillName = (drill.skillId || (currentLanguage === 'zh' ? '通用' : 'General')).replace(/_/g, ' ');
        const difficulty = formatDifficulty(drill.difficulty || 'medium');
        const rawContent = drill.content || '';
        const answerText = drill.answer || '';
        const explanationText = drill.explanation || '';

        // Extract Docstring for Description if present
        let description = '';
        let codeContent = rawContent;

        // Simple regex to catch triple-quoted strings at the start (Python style)
        // Matches """...""" or '''...''' including newlines
        const docstringMatch = rawContent.match(/^["']{3}([\s\S]*?)["']{3}/);
        if (docstringMatch) {
            description = docstringMatch[1].trim();
            codeContent = rawContent.replace(docstringMatch[0], '').trim();
        }

        // Generate Front Content
        let frontContent = '';
        if (description) {
            frontContent += `<div class="problem-description">${escapeHtml(description)}</div>`;
        }
        frontContent += `<div class="code-block">${escapeHtml(codeContent)}</div>`;

        // Generate Header based on Type
        const headerText = getDrillInstruction(drill.type);

        card.innerHTML = `
            <!-- Front Face -->
            <div class="card-face reveal">
                <div class="tag">${skillName} — ${difficulty}</div>
                <h2>${headerText}</h2>

                ${frontContent}

                <div style="margin-top: auto; font-size: 0.8rem; opacity: 0.5">
                    ${t('drill_card_progress', { count: totalCount })}
                </div>
            </div>

            <!-- Back Face -->
            <div class="card-face card-back">
                <div class="tag">${t('drill_solution')}</div>
                <h2>${t('drill_key_concept')}</h2>

                <div class="code-block" style="color: var(--accent);">
                    ${escapeHtml(answerText)}
                </div>

                <div style="margin-top: 2rem; font-size: 0.9rem; opacity: 0.7; line-height: 1.6;">
                    ${explanationText ? escapeHtml(explanationText) : t('drill_no_explanation')}
                </div>
            </div>
        `;

        // Prevent inputs from triggering scroll
        const inputs = card.querySelectorAll('input, textarea');
        inputs.forEach(input => {
            input.addEventListener('wheel', (e) => e.stopPropagation());
            input.addEventListener('click', (e) => e.stopPropagation());
        });

        // Prevent scroll on code blocks from triggering card flip
        const codeBlocks = card.querySelectorAll('.code-block, .problem-description');
        codeBlocks.forEach(block => {
            block.addEventListener('wheel', (e) => {
                // Only stop propagation if the content is actually scrollable
                if (block.scrollHeight > block.clientHeight) {
                    e.stopPropagation();
                }
            });
            // Prevent click on code/text from flipping if selecting text?
            // User requested click to flip.
            // If selecting text, click might be interpreted as flip.
            // Let's assume click anywhere bubbles to card unless stopped.
        });
    }

    function getDrillInstruction(type) {
        switch (type) {
            case 'fill-in-blank':
                return t('drill_type_fill_in_blank');
            case 'spot-bug':
                return t('drill_type_spot_bug');
            case 'critique':
                return t('drill_type_critique');
            case 'muscle-memory':
                return t('drill_type_muscle_memory');
            default:
                return currentLanguage === 'zh' ? '题目描述' : 'Problem Statement';
        }
    }

    function renderEmptyCard() {
        card.innerHTML = `
            <div class="card-face reveal" style="align-items: center; justify-content: center;">
                <div class="empty-message">${t('drill_empty_folder')}</div>
            </div>
             <div class="card-face card-back"></div>
        `;
    }

    function escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // --- Actions ---

    // Start Review = create a session snapshot + open drills.html.
    // drill_init.js will read currentDrillSession and use the drillId query param.
    btnStart.addEventListener('click', async () => {
        if (!currentDrills || currentDrills.length === 0) return;

        // Store session so the drill page can navigate through this exact list.
        await chrome.storage.local.set({
            currentDrillSession: {
                drills: currentDrills,
                currentDrill: currentDrills[0],
                startTime: Date.now()
            }
        });

        // Navigate to the first drill in the session.
        const drillUrl = chrome.runtime.getURL(`dist/src/drills/drills.html?drillId=${currentDrills[0].id}`);
        window.location.href = drillUrl;
    });

    // Initialize
    loadDrills();

})();
