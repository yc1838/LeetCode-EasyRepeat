/**
 * LeetCode EasyRepeat - Background Service Worker
 * Handles events that persist beyond the lifecycle of a single page or popup.
 */

// Dependencies are bundled via Vite entry (src/background/worker.js).
console.log('[Background] Module bundle loaded.');

// --- Debug logging toggle ---
const DEBUG_LOG_KEY = 'agentDebugLogs';
let debugLogsEnabled = false;

function setDebugLogsEnabled(value) {
    const next = Boolean(value);
    if (debugLogsEnabled !== next) {
        debugLogsEnabled = next;
        console.log(`[Debug] Verbose logging ${next ? 'enabled' : 'disabled'}.`);
    }
}

function initDebugLogging() {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;

    chrome.storage.local.get({ [DEBUG_LOG_KEY]: false }).then((result) => {
        setDebugLogsEnabled(result[DEBUG_LOG_KEY]);
    }).catch(() => { });

    if (chrome.storage?.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local' || !changes[DEBUG_LOG_KEY]) return;
            setDebugLogsEnabled(changes[DEBUG_LOG_KEY].newValue);
        });
    }
}

const DebugLog = {
    log: (...args) => {
        if (debugLogsEnabled) console.log(...args);
    },
    warn: (...args) => {
        if (debugLogsEnabled) console.warn(...args);
    },
    groupCollapsed: (...args) => {
        if (debugLogsEnabled && console.groupCollapsed) console.groupCollapsed(...args);
    },
    groupEnd: () => {
        if (debugLogsEnabled && console.groupEnd) console.groupEnd();
    }
};

const debugRoot = typeof self !== 'undefined'
    ? self
    : (typeof globalThis !== 'undefined' ? globalThis : this);
if (debugRoot) {
    debugRoot.NeuralDebug = DebugLog;
}

initDebugLogging();

// --- Helpers for drill generation fallbacks ---
function normalizeSkillId(raw) {
    if (!raw) return null;
    return String(raw)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

const DRILL_QUEUE_TARGET_PENDING = 12;
const DRILL_QUEUE_MAX_PENDING = 12;
const DRILL_GENERATION_COOLDOWN_MS = 60 * 1000;
const DRILL_QUEUE_ROTATE_ON_FULL = 4;
const MANUAL_DRILL_TYPES = ['fill-in-blank', 'spot-bug', 'muscle-memory'];
const MANUAL_MAX_DRILLS_PER_SKILL = 9;
const MANUAL_MAX_DRILLS_PER_SKILL_TYPE = 3;

function getDrillQueueTargetPending() {
    return Math.min(DRILL_QUEUE_TARGET_PENDING, DRILL_QUEUE_MAX_PENDING);
}

async function inferWeakSkillsFromHistory() {
    const { problems } = await chrome.storage.local.get({ problems: {} });
    const problemValues = Object.values(problems);
    const lowRatingCounts = {};
    const topicCounts = {};

    for (const problem of problemValues) {
        const topics = Array.isArray(problem.topics) && problem.topics.length > 0
            ? problem.topics
            : (Array.isArray(problem.tags) && problem.tags.length > 0 ? problem.tags : []);

        let seeds = topics;
        if (!seeds || seeds.length === 0) {
            seeds = [problem.difficulty || 'general'];
        }

        const skillIds = seeds
            .map(normalizeSkillId)
            .filter(Boolean);

        if (skillIds.length === 0) continue;

        for (const id of skillIds) {
            topicCounts[id] = (topicCounts[id] || 0) + 1;
        }

        const history = Array.isArray(problem.history) ? problem.history : [];
        for (const h of history) {
            if (typeof h.rating === 'number' && h.rating <= 2) {
                for (const id of skillIds) {
                    lowRatingCounts[id] = (lowRatingCounts[id] || 0) + 1;
                }
            }
        }
    }

    DebugLog.log('[DrillFallback] History scan summary:', {
        totalProblems: problemValues.length,
        lowRatingSkills: Object.keys(lowRatingCounts).length,
        topicSkills: Object.keys(topicCounts).length
    });

    const toWeakList = (counts, insightLabel) => Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([skillId, count]) => ({
            skillId,
            insight: `${count} ${insightLabel}`
        }));

    if (Object.keys(lowRatingCounts).length > 0) {
        const weakSkills = toWeakList(lowRatingCounts, 'low-rating attempts');
        DebugLog.log('[DrillFallback] Using low-rating history:', { source: 'history_low_ratings', weakSkills });
        return { weakSkills, source: 'history_low_ratings' };
    }

    if (Object.keys(topicCounts).length > 0) {
        const weakSkills = toWeakList(topicCounts, 'recent solves');
        DebugLog.log('[DrillFallback] Using topic history:', { source: 'history_topics', weakSkills });
        return { weakSkills, source: 'history_topics' };
    }

    DebugLog.log('[DrillFallback] No history available for fallback.');
    return { weakSkills: [], source: 'no_history' };
}

function buildDemoDrills(count = 3) {
    const stamp = Date.now();
    const requested = Math.max(1, Number.isFinite(Number(count)) ? Math.floor(Number(count)) : 3);
    const templates = [
        {
            type: 'fill-in-blank',
            skillId: 'binary_search',
            content: 'def binary_search(arr, target):\n    left, right = 0, len(arr) - 1\n    while left <= right:\n        mid = (left + right) // ___',
            answer: '2',
            difficulty: 'easy'
        },
        {
            type: 'spot-bug',
            skillId: 'arrays',
            content: "arr[len(arr)] = value  # What's wrong?",
            answer: 'line 1',
            difficulty: 'easy'
        },
        {
            type: 'muscle-memory',
            skillId: 'two_pointers',
            content: 'Write the two-pointer template for finding a pair that sums to target',
            answer: null,
            difficulty: 'medium'
        }
    ];

    const drills = [];
    for (let i = 0; i < requested; i++) {
        const template = templates[i % templates.length];
        drills.push({
            ...template,
            id: `demo_${stamp}_${i + 1}`
        });
    }

    return drills;
}

function normalizeDrillSignatureValue(value) {
    if (value === undefined || value === null) return '';
    return String(value)
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

function buildDrillSignature(drill) {
    return [
        normalizeDrillSignatureValue(drill?.type),
        normalizeDrillSignatureValue(drill?.skillId),
        normalizeDrillSignatureValue(drill?.content),
        normalizeDrillSignatureValue(drill?.answer)
    ].join('::');
}

function getDrillCreatedAtMs(drill) {
    const parsed = Date.parse(drill?.createdAt || '');
    if (Number.isFinite(parsed)) return parsed;
    return 0;
}

function sortDrillsNewestFirst(drills) {
    return [...(Array.isArray(drills) ? drills : [])]
        .sort((a, b) => getDrillCreatedAtMs(b) - getDrillCreatedAtMs(a));
}

function isAllowedManualDrillType(type) {
    return MANUAL_DRILL_TYPES.includes(type);
}

function isDrillStoreAvailable() {
    return typeof DrillStore !== 'undefined' && Boolean(DrillStore.DrillStore);
}

async function getPendingDrillsFromStore() {
    if (!isDrillStoreAvailable()) {
        return [];
    }

    try {
        const store = new DrillStore.DrillStore();
        await store.init();
        return await store.getPending();
    } catch (e) {
        console.warn('[Background] Failed to load pending drills:', e.message);
        return [];
    }
}

async function getDrillQueueStatusSnapshot() {
    const pending = await getPendingDrillsFromStore();
    const pendingCount = pending.length;
    const targetPending = getDrillQueueTargetPending();
    return {
        pendingCount,
        targetPending,
        maxPending: DRILL_QUEUE_MAX_PENDING,
        isFull: pendingCount >= DRILL_QUEUE_MAX_PENDING,
        canRefill: pendingCount < targetPending
    };
}

async function normalizePendingQueue(limit = DRILL_QUEUE_MAX_PENDING) {
    if (!isDrillStoreAvailable()) {
        return { pending: [], removedDuplicates: 0, removedOverflow: 0 };
    }

    const store = new DrillStore.DrillStore();
    await store.init();
    const pending = await store.getPending();
    if (!Array.isArray(pending) || pending.length === 0) {
        return { pending: [], removedDuplicates: 0, removedOverflow: 0 };
    }

    const sorted = sortDrillsNewestFirst(pending);
    const signatures = new Set();
    const keep = [];
    const duplicateIds = [];
    const unsupportedTypeIds = [];
    const cappedIds = [];
    const skillCounts = new Map();
    const skillTypeCounts = new Map();

    for (const drill of sorted) {
        if (!isAllowedManualDrillType(drill.type)) {
            unsupportedTypeIds.push(drill.id);
            continue;
        }

        const signature = buildDrillSignature(drill);
        if (signatures.has(signature)) {
            duplicateIds.push(drill.id);
            continue;
        }

        const skillId = normalizeSkillId(drill.skillId) || 'general';
        const typeKey = `${skillId}::${drill.type}`;
        const skillCount = skillCounts.get(skillId) || 0;
        const skillTypeCount = skillTypeCounts.get(typeKey) || 0;

        if (skillCount >= MANUAL_MAX_DRILLS_PER_SKILL || skillTypeCount >= MANUAL_MAX_DRILLS_PER_SKILL_TYPE) {
            cappedIds.push(drill.id);
            continue;
        }

        signatures.add(signature);
        keep.push(drill);
        skillCounts.set(skillId, skillCount + 1);
        skillTypeCounts.set(typeKey, skillTypeCount + 1);
    }

    for (const id of [...duplicateIds, ...unsupportedTypeIds, ...cappedIds]) {
        await store.delete(id);
    }

    let overflow = [];
    if (keep.length > limit) {
        overflow = keep.slice(limit);
        for (const drill of overflow) {
            await store.delete(drill.id);
        }
    }

    return {
        pending: keep.slice(0, limit),
        removedDuplicates: duplicateIds.length,
        removedOverflow: overflow.length + unsupportedTypeIds.length + cappedIds.length
    };
}

async function rotateOldestPendingDrills(count = DRILL_QUEUE_ROTATE_ON_FULL) {
    if (!isDrillStoreAvailable()) {
        return { removed: 0, pending: [] };
    }

    const requested = Math.max(1, Math.floor(Number(count) || 0));
    const store = new DrillStore.DrillStore();
    await store.init();

    const pending = await store.getPending();
    const sorted = sortDrillsNewestFirst(pending);
    if (sorted.length === 0) {
        return { removed: 0, pending: [] };
    }

    const removable = sorted.slice(Math.max(0, sorted.length - requested));
    for (const drill of removable) {
        await store.delete(drill.id);
    }

    const after = await store.getPending();
    return {
        removed: removable.length,
        pending: sortDrillsNewestFirst(after)
    };
}

async function persistDrillsToStore(drills) {
    if (!Array.isArray(drills) || drills.length === 0) {
        return { saved: 0, skippedDuplicates: 0 };
    }

    if (typeof DrillGenerator !== 'undefined' && typeof DrillGenerator.saveDrills === 'function') {
        return DrillGenerator.saveDrills(drills, {
            allowedTypes: MANUAL_DRILL_TYPES,
            maxPerSkill: MANUAL_MAX_DRILLS_PER_SKILL,
            maxPerSkillType: MANUAL_MAX_DRILLS_PER_SKILL_TYPE
        });
    }

    if (!isDrillStoreAvailable() || typeof DrillStore.createDrill !== 'function') {
        return { saved: 0, skippedDuplicates: 0, error: 'DrillStore unavailable' };
    }

    const store = new DrillStore.DrillStore();
    await store.init();
    const existing = await store.getAll();
    const signatures = new Set(existing.map(buildDrillSignature));
    const pendingExisting = existing.filter(d => d.status === 'pending' && isAllowedManualDrillType(d.type));
    const skillCounts = new Map();
    const skillTypeCounts = new Map();

    for (const drill of pendingExisting) {
        const skillId = normalizeSkillId(drill.skillId) || 'general';
        const typeKey = `${skillId}::${drill.type}`;
        skillCounts.set(skillId, (skillCounts.get(skillId) || 0) + 1);
        skillTypeCounts.set(typeKey, (skillTypeCounts.get(typeKey) || 0) + 1);
    }

    let saved = 0;
    let skippedDuplicates = 0;
    let skippedByType = 0;
    let skippedBySkillCap = 0;
    let skippedByTypeCap = 0;

    for (const drill of drills) {
        if (!isAllowedManualDrillType(drill.type)) {
            skippedByType++;
            continue;
        }

        const signature = buildDrillSignature(drill);
        if (signatures.has(signature)) {
            skippedDuplicates++;
            continue;
        }

        const skillId = normalizeSkillId(drill.skillId) || 'general';
        const typeKey = `${skillId}::${drill.type}`;
        const skillCount = skillCounts.get(skillId) || 0;
        const skillTypeCount = skillTypeCounts.get(typeKey) || 0;

        if (skillCount >= MANUAL_MAX_DRILLS_PER_SKILL) {
            skippedBySkillCap++;
            continue;
        }
        if (skillTypeCount >= MANUAL_MAX_DRILLS_PER_SKILL_TYPE) {
            skippedByTypeCap++;
            continue;
        }

        const entity = DrillStore.createDrill({
            type: drill.type,
            skillId: drill.skillId,
            content: drill.content,
            answer: drill.answer,
            explanation: drill.explanation,
            difficulty: drill.difficulty || 'medium'
        });
        await store.add(entity);
        signatures.add(signature);
        skillCounts.set(skillId, skillCount + 1);
        skillTypeCounts.set(typeKey, skillTypeCount + 1);
        saved++;
    }

    return { saved, skippedDuplicates, skippedByType, skippedBySkillCap, skippedByTypeCap };
}

// --- History Backfill Helpers ---
const TOPIC_OVERRIDES = {
    'array': 'prefix_sum',
    'arrays': 'prefix_sum',
    'hash table': 'hashmap_lookup',
    'hashmap': 'hashmap_lookup',
    'hash set': 'hashset_dedup',
    'hashset': 'hashset_dedup',
    'two sum': 'two_sum_pattern',
    'two pointers': 'two_pointer_opposite',
    'sliding window': 'sliding_variable',
    'stack': 'stack_matching',
    'binary search': 'binary_search_basic',
    'linked list': 'll_reversal',
    'tree': 'tree_traversal_recursive',
    'binary tree': 'tree_traversal_recursive',
    'bst': 'bst_operations',
    'heap': 'heap_topk',
    'priority queue': 'heap_topk',
    'graph': 'bfs',
    'graphs': 'bfs',
    'dynamic programming': 'dp_1d',
    'dp': 'dp_1d',
    'backtracking': 'backtrack_template',
    'greedy': 'greedy_local_optimal',
    'bit manipulation': 'bit_basics',
    'bitmask': 'bit_masking',
    'math': 'math_gcd_lcm',
    'string': 'string_parsing',
    'strings': 'string_parsing',
    'trie': 'trie_basic',
    'interval': 'merge_intervals',
    'intervals': 'merge_intervals',
    'divide and conquer': 'mergesort',
    'prefix sum': 'prefix_sum',
    'union find': 'union_find',
    'dijkstra': 'dijkstra',
    'bfs': 'bfs',
    'dfs': 'dfs'
};

function normalizeTopic(topic) {
    if (!topic) return '';
    return String(topic)
        .toLowerCase()
        .replace(/[_-]+/g, ' ')
        .replace(/[^a-z0-9 ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenize(text) {
    const norm = normalizeTopic(text);
    if (!norm) return [];
    return norm.split(' ').filter(Boolean);
}

function expandToken(token) {
    if (token === 'hashmap') return ['hash', 'map'];
    if (token === 'hashset') return ['hash', 'set'];
    if (token === 'two') return ['two'];
    return [token];
}

function buildSkillIndexFromDNA(dna) {
    const index = [];
    const skills = dna?.skills || {};

    for (const skill of Object.values(skills)) {
        const tokens = new Set();
        tokenize(skill.id).forEach(t => expandToken(t).forEach(e => tokens.add(e)));
        tokenize(skill.name).forEach(t => expandToken(t).forEach(e => tokens.add(e)));
        tokenize(skill.family).forEach(t => expandToken(t).forEach(e => tokens.add(e)));
        index.push({ id: skill.id, tokens });
    }

    return index;
}

function mapTopicToSkillId(topic, skillIndex) {
    const norm = normalizeTopic(topic);
    if (!norm) return null;

    if (TOPIC_OVERRIDES[norm]) return TOPIC_OVERRIDES[norm];

    for (const [key, value] of Object.entries(TOPIC_OVERRIDES)) {
        if (norm.includes(key)) return value;
    }

    const topicTokens = new Set(tokenize(norm));
    if (topicTokens.size === 0) return null;

    let bestId = null;
    let bestScore = 0;

    for (const skill of skillIndex) {
        let hits = 0;
        topicTokens.forEach(t => {
            if (skill.tokens.has(t)) hits++;
        });
        if (hits === 0) continue;

        const score = hits / topicTokens.size;
        if (score > bestScore) {
            bestScore = score;
            bestId = skill.id;
        }
    }

    return bestScore >= 0.34 ? bestId : null;
}

function mapTopicsToSkillIds(topics, skillIndex) {
    const skillIds = new Set();
    (topics || []).forEach(t => {
        const id = mapTopicToSkillId(t, skillIndex);
        if (id) skillIds.add(id);
    });
    return Array.from(skillIds);
}

async function readSubmissionLog() {
    return new Promise((resolve) => {
        if (typeof indexedDB === 'undefined') return resolve([]);
        const request = indexedDB.open('NeuralRetentionDB');
        request.onerror = () => resolve([]);
        request.onsuccess = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('submissionLog')) {
                db.close();
                return resolve([]);
            }
            const tx = db.transaction(['submissionLog'], 'readonly');
            const store = tx.objectStore('submissionLog');
            const getAllReq = store.getAll();
            getAllReq.onsuccess = () => {
                const data = getAllReq.result || [];
                db.close();
                resolve(data);
            };
            getAllReq.onerror = () => {
                db.close();
                resolve([]);
            };
        };
    });
}

function classifyHistoryEntry(entry) {
    if (!entry) return null;
    if (typeof entry.rating === 'number') {
        return entry.rating <= 2 ? 'mistake' : 'correct';
    }
    const status = String(entry.status || '').toLowerCase();
    if (status.includes('accepted') || status.includes('reviewed')) {
        return 'correct';
    }
    return null;
}

function aggregateFromProblems(problems, skillIndex) {
    const stats = {};
    const lastSeen = {};
    let historyEntries = 0; // mapped + classified
    let historyEntriesRaw = 0; // classified regardless of mapping
    let unmappedTopics = 0;
    const unmappedTopicsMap = {};
    const details = [];

    for (const problem of problems) {
        const topics = [
            ...(Array.isArray(problem.topics) ? problem.topics : []),
            ...(Array.isArray(problem.tags) ? problem.tags : [])
        ];

        const skillIds = mapTopicsToSkillIds(topics, skillIndex);
        const history = Array.isArray(problem.history) ? problem.history : [];

        let correctCount = 0;
        let mistakeCount = 0;
        let unknownCount = 0;

        for (const h of history) {
            const outcome = classifyHistoryEntry(h);
            if (!outcome) {
                unknownCount++;
                continue;
            }

            historyEntriesRaw++;
            if (outcome === 'mistake') mistakeCount++;
            else correctCount++;

            if (skillIds.length === 0) {
                continue;
            }

            historyEntries++;
            const date = h.date ? new Date(h.date).toISOString() : null;

            for (const skillId of skillIds) {
                if (!stats[skillId]) stats[skillId] = { correct: 0, mistakes: 0 };
                if (outcome === 'mistake') stats[skillId].mistakes++;
                else stats[skillId].correct++;

                if (date) {
                    if (!lastSeen[skillId] || new Date(date) > new Date(lastSeen[skillId])) {
                        lastSeen[skillId] = date;
                    }
                }
            }
        }

        details.push({
            slug: problem.slug,
            title: problem.title,
            topics,
            mappedSkills: skillIds,
            historyTotal: history.length,
            correctCount,
            mistakeCount,
            unknownCount
        });

        if (skillIds.length === 0 && topics.length > 0) {
            unmappedTopics += 1;
            topics.forEach((t) => {
                const key = normalizeTopic(t) || String(t);
                unmappedTopicsMap[key] = (unmappedTopicsMap[key] || 0) + 1;
            });
        }
    }

    return { stats, lastSeen, historyEntries, historyEntriesRaw, unmappedTopics, unmappedTopicsMap, details };
}

function aggregateFromSubmissions(submissions, skillIndex) {
    const stats = {};
    const lastSeen = {};
    let historyEntries = 0;
    let historyEntriesRaw = 0;
    let unmappedTopics = 0;
    const unmappedTopicsMap = {};
    const details = [];

    for (const sub of submissions) {
        const topics = Array.isArray(sub.topics) ? sub.topics : [];
        const skillIds = mapTopicsToSkillIds(topics, skillIndex);
        const result = String(sub.result || '').toLowerCase();
        const outcome = result.includes('accepted') ? 'correct' : 'mistake';
        const date = sub.timestamp ? new Date(sub.timestamp).toISOString() : null;

        historyEntriesRaw++;

        if (skillIds.length === 0) {
            if (topics.length > 0) {
                unmappedTopics += 1;
                topics.forEach((t) => {
                    const key = normalizeTopic(t) || String(t);
                    unmappedTopicsMap[key] = (unmappedTopicsMap[key] || 0) + 1;
                });
            }
            details.push({
                submissionId: sub.submissionId,
                problemSlug: sub.problemSlug,
                result: sub.result,
                topics,
                mappedSkills: [],
                timestamp: sub.timestamp
            });
            continue;
        }

        historyEntries++;

        for (const skillId of skillIds) {
            if (!stats[skillId]) stats[skillId] = { correct: 0, mistakes: 0 };
            if (outcome === 'mistake') stats[skillId].mistakes++;
            else stats[skillId].correct++;

            if (date) {
                if (!lastSeen[skillId] || new Date(date) > new Date(lastSeen[skillId])) {
                    lastSeen[skillId] = date;
                }
            }
        }

        details.push({
            submissionId: sub.submissionId,
            problemSlug: sub.problemSlug,
            result: sub.result,
            topics,
            mappedSkills: skillIds,
            timestamp: sub.timestamp
        });
    }

    return { stats, lastSeen, historyEntries, historyEntriesRaw, unmappedTopics, unmappedTopicsMap, details };
}

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Handler: Open Options Page
    if (request.action === "openOptions") {
        console.log("[Background] Opening Options Page.");
        chrome.runtime.openOptionsPage();
        return true;
    }

    // Handler: Proxy Fetch
    if (request.action === "proxyFetch") {
        const { url, options } = request;
        console.log(`[Background] ---------------------------------------------------`);
        console.log(`[Background] PROXY FETCH START`);
        console.log(`[Background] URL: ${url}`);
        console.log(`[Background] Method: ${options.method || 'GET'}`);
        console.log(`[Background] Headers Sent:`, options.headers);

        fetch(url, options)
            .then(async (response) => {
                console.log(`[Background] PROXY FETCH RESPONSE`);
                console.log(`[Background] Status: ${response.status} ${response.statusText}`);

                const text = await response.text();
                // We consider it a "success" if the network call completed, 
                // even if the API returned 404/500 to let the caller handle logic.
                const result = {
                    success: true,
                    ok: response.ok,
                    status: response.status,
                    data: text
                };
                console.log(`[Background] Body Length: ${text.length}`);
                console.log(`[Background] ---------------------------------------------------`);
                sendResponse(result);
            })
            .catch((error) => {
                console.error(`[Background] PROXY FETCH ERROR:`, error.message);
                console.log(`[Background] ---------------------------------------------------`);
                sendResponse({ success: false, error: error.message });
            });

        return true; // Keep channel open for async response
    }

    // Handler: Manual Digest Trigger (from Settings page)
    if (request.action === "runDigestNow") {
        console.log("[Background] Manual digest trigger received.");
        (async () => {
            try {
                // Check if DigestOrchestrator exists
                if (typeof DigestOrchestrator !== 'undefined') {
                    await DigestOrchestrator.runNightlyDigest();
                    sendResponse({ success: true });
                } else {
                    // Fallback: just update skill matrix from shadow log
                    console.log("[Background] DigestOrchestrator not loaded. Running basic digest...");
                    // For now, just acknowledge
                    sendResponse({ success: true, message: 'Basic digest run (orchestrator not loaded)' });
                }
            } catch (e) {
                console.error("[Background] Digest error:", e);
                sendResponse({ success: false, error: e.message });
            }
        })();
        return true;
    }

    // Handler: Realtime Drill Queue Status (for options UI polling)
    if (request.action === "getDrillQueueStatus") {
        (async () => {
            try {
                const snapshot = await getDrillQueueStatusSnapshot();
                sendResponse({ success: true, ...snapshot });
            } catch (e) {
                sendResponse({ success: false, error: e.message });
            }
        })();
        return true;
    }

    // Handler: Manual Drill Generation (from Settings page)
    if (request.action === "generateDrillsNow") {
        console.log("[Background] Manual drill generation trigger received.");
        (async () => {
            const now = Date.now();
            try {
                let drills = [];
                let fallback = null;
                let apiKey = null;
                let persistedByGenerator = false;
                const drillStoreAvailable = isDrillStoreAvailable();
                let queueCleanupRemoved = 0;
                let queueRotatedOut = 0;
                let pendingBefore = await getPendingDrillsFromStore();
                if (drillStoreAvailable) {
                    const normalizedQueue = await normalizePendingQueue(DRILL_QUEUE_MAX_PENDING);
                    pendingBefore = normalizedQueue.pending;
                    queueCleanupRemoved = (normalizedQueue.removedDuplicates || 0) + (normalizedQueue.removedOverflow || 0);
                    if (queueCleanupRemoved > 0) {
                        DebugLog.log('[DrillGen] Normalized pending queue before refill:', {
                            removedDuplicates: normalizedQueue.removedDuplicates,
                            removedOverflow: normalizedQueue.removedOverflow,
                            remaining: pendingBefore.length
                        });
                    }
                }
                let pendingBeforeCount = pendingBefore.length;
                const targetPending = getDrillQueueTargetPending();

                if (pendingBeforeCount >= DRILL_QUEUE_MAX_PENDING && drillStoreAvailable) {
                    const rotated = await rotateOldestPendingDrills(
                        Math.min(DRILL_QUEUE_ROTATE_ON_FULL, DRILL_QUEUE_MAX_PENDING)
                    );
                    queueRotatedOut = rotated.removed || 0;
                    pendingBefore = rotated.pending || [];
                    pendingBeforeCount = pendingBefore.length;
                    if (queueRotatedOut > 0) {
                        fallback = 'queue_rotated';
                        DebugLog.log('[DrillGen] Queue full; rotated oldest pending drills:', {
                            removed: queueRotatedOut,
                            pendingAfterRotate: pendingBeforeCount
                        });
                    }
                }

                if (pendingBeforeCount >= DRILL_QUEUE_MAX_PENDING) {
                    fallback = 'queue_full';
                    await chrome.storage.local.set({
                        drillGenerationStatus: {
                            status: 'complete',
                            count: 0,
                            fallback,
                            pendingCount: pendingBeforeCount,
                            targetPending,
                            queueCleanupRemoved,
                            queueRotatedOut,
                            completedAt: now
                        }
                    });
                    sendResponse({
                        success: true,
                        count: 0,
                        fallback,
                        pendingCount: pendingBeforeCount,
                        targetPending,
                        queueCleanupRemoved,
                        queueRotatedOut
                    });
                    return;
                }

                const { drillGenerationStatus: previousStatus } = await chrome.storage.local.get({
                    drillGenerationStatus: null
                });
                const previousCompletedAt = Number(previousStatus?.completedAt || 0);
                const elapsedMs = previousCompletedAt > 0 ? now - previousCompletedAt : null;
                if (elapsedMs !== null && elapsedMs < DRILL_GENERATION_COOLDOWN_MS) {
                    const waitSeconds = Math.ceil((DRILL_GENERATION_COOLDOWN_MS - elapsedMs) / 1000);
                    fallback = 'cooldown';
                    await chrome.storage.local.set({
                        drillGenerationStatus: {
                            status: 'cooldown',
                            count: 0,
                            fallback,
                            waitSeconds,
                            pendingCount: pendingBeforeCount,
                            targetPending,
                            queueCleanupRemoved,
                            queueRotatedOut,
                            completedAt: now
                        }
                    });
                    sendResponse({
                        success: false,
                        error: 'cooldown',
                        fallback,
                        waitSeconds,
                        pendingCount: pendingBeforeCount,
                        targetPending,
                        queueCleanupRemoved,
                        queueRotatedOut
                    });
                    return;
                }

                const needed = Math.max(0, targetPending - pendingBeforeCount);
                if (needed <= 0) {
                    fallback = 'queue_target_met';
                    await chrome.storage.local.set({
                        drillGenerationStatus: {
                            status: 'complete',
                            count: 0,
                            fallback,
                            pendingCount: pendingBeforeCount,
                            targetPending,
                            queueCleanupRemoved,
                            queueRotatedOut,
                            completedAt: now
                        }
                    });
                    sendResponse({
                        success: true,
                        count: 0,
                        fallback,
                        pendingCount: pendingBeforeCount,
                        targetPending,
                        queueCleanupRemoved,
                        queueRotatedOut
                    });
                    return;
                }

                // Track generation status for UI persistence
                await chrome.storage.local.set({
                    drillGenerationStatus: {
                        status: 'generating',
                        startedAt: now,
                        requestedCount: needed,
                        pendingCount: pendingBeforeCount,
                        queueCleanupRemoved,
                        queueRotatedOut,
                        targetPending
                    }
                });

                const drillGenerationOptions = {
                    drillsPerSkill: Math.max(1, Math.min(3, needed)),
                    minTotalDrills: needed,
                    maxTotalDrills: needed,
                    allowedTypes: MANUAL_DRILL_TYPES,
                    maxPerSkill: MANUAL_MAX_DRILLS_PER_SKILL,
                    maxPerSkillType: MANUAL_MAX_DRILLS_PER_SKILL_TYPE,
                    skillAttempts: 3,
                    maxRetriesPerAttempt: 2
                };

                DebugLog.log('[DrillGen] Start:', {
                    hasLLMGateway: typeof LLMGateway !== 'undefined',
                    hasDrillGenerator: typeof DrillGenerator !== 'undefined',
                    pendingBefore: pendingBeforeCount,
                    queueCleanupRemoved,
                    queueRotatedOut,
                    targetPending,
                    needed
                });

                // Check for API key using LLMGateway (provider-agnostic)
                if (typeof LLMGateway !== 'undefined' && typeof LLMGateway.getApiKey === 'function') {
                    apiKey = await LLMGateway.getApiKey();
                }
                DebugLog.log('[DrillGen] API key present:', Boolean(apiKey));

                if (typeof DrillGenerator !== 'undefined' && apiKey) {
                    DebugLog.log('[DrillGen] Using DrillGenerator.generateFromWeakSkills()', drillGenerationOptions);
                    drills = await DrillGenerator.generateFromWeakSkills(null, drillGenerationOptions);
                    persistedByGenerator = drills.length > 0;
                    DebugLog.log('[DrillGen] DrillGenerator result:', { count: drills.length });

                    if (drills.length === 0) {
                        const inferred = await inferWeakSkillsFromHistory();
                        DebugLog.log('[DrillGen] Inferred weak skills:', inferred);
                        if (inferred.weakSkills.length > 0) {
                            drills = await DrillGenerator.generateFromWeakSkills(inferred.weakSkills, drillGenerationOptions);
                            persistedByGenerator = drills.length > 0;
                            DebugLog.log('[DrillGen] DrillGenerator result (fallback):', {
                                count: drills.length,
                                fallback: inferred.source
                            });
                            fallback = inferred.source;
                        } else {
                            fallback = inferred.source;
                        }
                    }
                } else {
                    // Generate from SkillMatrix patterns directly
                    const result = await chrome.storage.local.get({ skillDNA: null });
                    DebugLog.log('[DrillGen] Falling back to SkillDNA patterns:', {
                        hasSkillDNA: Boolean(result.skillDNA),
                        patternCount: Object.keys(result.skillDNA?.patterns || {}).length
                    });

                    if (result.skillDNA && result.skillDNA.patterns) {
                        const weakPatterns = Object.values(result.skillDNA.patterns)
                            .filter(p => p.mistakes >= 1)
                            .sort((a, b) => a.score - b.score)
                            .slice(0, Math.max(needed, 1));

                        DebugLog.log('[DrillGen] Weak patterns selected:', {
                            count: weakPatterns.length,
                            sample: weakPatterns.slice(0, 3).map(p => ({
                                id: p.patternId,
                                mistakes: p.mistakes,
                                score: p.score
                            }))
                        });

                        drills = weakPatterns.map((p, i) => ({
                            id: `skill_${p.patternId}_${Date.now()}_${i}`,
                            type: i % 2 === 0 ? 'spot-bug' : 'fill-in-blank',
                            skillId: p.patternId,
                            content: `Practice: "${p.patternId.replace(/-/g, ' ')}" - You've made ${p.mistakes} mistake(s) in this area.`,
                            answer: `Avoid ${p.patternId}`,
                            difficulty: p.score < 30 ? 'hard' : p.score < 50 ? 'medium' : 'easy'
                        })).slice(0, needed);
                        console.log(`[Background] Generated ${drills.length} drills from weak patterns`);
                        DebugLog.log('[DrillGen] Weak-pattern drills sample:', drills.slice(0, 3).map(d => ({
                            id: d.id,
                            skillId: d.skillId,
                            type: d.type,
                            difficulty: d.difficulty
                        })));
                    }

                    fallback = fallback || (apiKey ? null : 'missing_api_key');
                }

                // Fallback demo if no drills were generated
                if (drills.length === 0) {
                    drills = buildDemoDrills(needed);
                    fallback = fallback || (apiKey ? 'no_weak_skills' : 'missing_api_key');
                    console.warn('[Background] No drills generated; using demo drills.', { fallback });
                    DebugLog.warn('[DrillGen] Using demo drills fallback:', { fallback });
                }

                if (drills.length > needed) {
                    drills = drills.slice(0, needed);
                }

                if (!persistedByGenerator && drills.length > 0) {
                    const persisted = await persistDrillsToStore(drills);
                    if (persisted.error) {
                        DebugLog.warn('[DrillGen] Could not persist drills:', persisted.error);
                    } else {
                        DebugLog.log('[DrillGen] Persisted fallback drills:', persisted);
                    }
                }

                const pendingAfter = await getPendingDrillsFromStore();
                const pendingAfterCount = pendingAfter.length;
                const addedCount = drillStoreAvailable
                    ? Math.max(0, pendingAfterCount - pendingBeforeCount)
                    : drills.length;
                const effectivePendingCount = drillStoreAvailable
                    ? pendingAfterCount
                    : pendingBeforeCount + addedCount;

                DebugLog.groupCollapsed(`[Background] Drill list (${drills.length}) fallback=${fallback || 'none'}`);
                if (drills.length > 0) {
                    drills.forEach((drill, index) => {
                        DebugLog.log(`#${index + 1}`, {
                            id: drill.id,
                            type: drill.type,
                            skillId: drill.skillId,
                            difficulty: drill.difficulty,
                            content: drill.content,
                            answer: drill.answer
                        });
                    });
                }
                DebugLog.groupEnd();

                await chrome.storage.local.set({ generatedDrills: drills });
                // Update generation status to complete
                await chrome.storage.local.set({
                    drillGenerationStatus: {
                        status: 'complete',
                        count: addedCount,
                        fallback: fallback,
                        pendingCount: effectivePendingCount,
                        targetPending,
                        queueCleanupRemoved,
                        queueRotatedOut,
                        requestedCount: needed,
                        completedAt: Date.now()
                    }
                });
                DebugLog.log('[DrillGen] Stored generatedDrills:', {
                    count: addedCount,
                    pendingCount: effectivePendingCount,
                    fallback,
                    sample: drills.slice(0, 3).map(d => ({
                        id: d.id,
                        skillId: d.skillId,
                        type: d.type
                    }))
                });
                sendResponse({
                    success: true,
                    count: addedCount,
                    fallback,
                    pendingCount: effectivePendingCount,
                    targetPending,
                    queueCleanupRemoved,
                    queueRotatedOut,
                    requestedCount: needed
                });
            } catch (e) {
                console.error("[Background] Drill generation error:", e);
                // Update generation status to error
                await chrome.storage.local.set({
                    drillGenerationStatus: {
                        status: 'error',
                        error: e.message,
                        completedAt: Date.now()
                    }
                });
                sendResponse({ success: false, error: e.message });
            }
        })();
        return true;
    }

    // Handler: Backfill from ALL history (from Settings page)
    if (request.action === "backfillHistory") {
        console.log("[Background] Backfill history trigger received.");
        (async () => {
            try {
                const { problems } = await chrome.storage.local.get({ problems: {} });
                const problemList = Object.values(problems);
                const problemsWithHistory = problemList.filter(p => Array.isArray(p.history) && p.history.length > 0).length;
                const problemsWithTopics = problemList.filter(p => {
                    const topics = Array.isArray(p.topics) ? p.topics : [];
                    const tags = Array.isArray(p.tags) ? p.tags : [];
                    return topics.length > 0 || tags.length > 0;
                }).length;

                DebugLog.log('[Backfill] Input snapshot:', {
                    totalProblems: problemList.length,
                    problemsWithHistory,
                    problemsWithTopics,
                    sample: problemList.slice(0, 3).map(p => ({
                        slug: p.slug || null,
                        title: p.title || null,
                        history: Array.isArray(p.history) ? p.history.length : 0,
                        topics: (Array.isArray(p.topics) ? p.topics : []).length,
                        tags: (Array.isArray(p.tags) ? p.tags : []).length
                    }))
                });

                // Initialize SkillMatrix and build index
                console.log('[Backfill] Checking SkillMatrix availability:', {
                    hasSelf: typeof self !== 'undefined',
                    hasSelfSkillMatrix: typeof self.SkillMatrix !== 'undefined',
                    selfSkillMatrixType: typeof self.SkillMatrix,
                    hasSkillMatrixClass: typeof self.SkillMatrix !== 'undefined' && !!self.SkillMatrix.SkillMatrix,
                    selfKeys: typeof self !== 'undefined' ? Object.keys(self).filter(k => k.includes('Skill')) : [],
                    globalKeys: typeof globalThis !== 'undefined' ? Object.keys(globalThis).filter(k => k.includes('Skill')) : []
                });

                if (typeof self.SkillMatrix === 'undefined' || !self.SkillMatrix.SkillMatrix) {
                    console.error('[Backfill] SkillMatrix not loaded. Available globals:', Object.keys(self).slice(0, 20));
                    sendResponse({ success: false, error: 'SkillMatrix not loaded' });
                    return;
                }

                const matrix = new self.SkillMatrix.SkillMatrix();
                await matrix.init();
                DebugLog.log('[Backfill] SkillMatrix initialized:', {
                    skills: Object.keys(matrix.dna?.skills || {}).length,
                    patterns: Object.keys(matrix.dna?.patterns || {}).length
                });

                // Rebuild DNA for idempotent backfill; preserve drill completion counts if present
                if (typeof self.SkillMatrix.createSkillDNA === 'function') {
                    const previousDNA = matrix.dna;
                    matrix.dna = self.SkillMatrix.createSkillDNA();
                    if (previousDNA?.skills) {
                        for (const [skillId, prevSkill] of Object.entries(previousDNA.skills)) {
                            if (matrix.dna.skills[skillId] && typeof prevSkill.drillsCompleted === 'number') {
                                matrix.dna.skills[skillId].drillsCompleted = prevSkill.drillsCompleted;
                            }
                        }
                    }
                }

                if (!matrix.dna?.skills || Object.keys(matrix.dna.skills).length === 0) {
                    sendResponse({ success: false, error: 'Skill taxonomy not loaded; skill DNA is empty' });
                    return;
                }

                const skillIndex = buildSkillIndexFromDNA(matrix.dna);
                DebugLog.log('[Backfill] Skill index built:', {
                    topicKeys: Object.keys(skillIndex || {}).length
                });

                // Prefer ShadowLogger submissions if available, else fallback to problems history
                const submissions = await readSubmissionLog();
                const useSubmissions = submissions && submissions.length > 0;
                DebugLog.log('[Backfill] Submission log loaded:', { submissions: submissions ? submissions.length : 0 });

                let aggregate;
                if (useSubmissions) {
                    aggregate = aggregateFromSubmissions(submissions, skillIndex);
                } else {
                    aggregate = aggregateFromProblems(problemList, skillIndex);
                }

                const { stats, lastSeen, historyEntries, unmappedTopics } = aggregate;
                const statsCount = Object.keys(stats || {}).length;
                const topUnmapped = Object.entries(aggregate.unmappedTopicsMap || {})
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([topic, count]) => ({ topic, count }));

                DebugLog.log('[Backfill] Aggregate summary:', {
                    source: useSubmissions ? 'shadow_logger' : 'problem_history',
                    statsCount,
                    historyEntries,
                    historyEntriesRaw: aggregate.historyEntriesRaw,
                    unmappedTopics,
                    topUnmapped
                });
                DebugLog.log('[Backfill] Aggregate details sample:', aggregate.details.slice(0, 3));

                // Apply aggregates to Skill DNA
                let skillsUpdated = 0;
                let totalSignals = 0;
                const updatedSkillIds = [];

                for (const [skillId, counts] of Object.entries(stats)) {
                    const skill = matrix.dna.skills[skillId];
                    if (!skill) continue;

                    skill.correct += counts.correct;
                    skill.mistakes += counts.mistakes;
                    totalSignals += counts.correct + counts.mistakes;

                    if (lastSeen[skillId]) {
                        skill.lastSeen = lastSeen[skillId];
                    }

                    if (typeof self.SkillMatrix.calculateConfidence === 'function') {
                        skill.score = self.SkillMatrix.calculateConfidence({
                            correct: skill.correct,
                            mistakes: skill.mistakes,
                            drillsCompleted: skill.drillsCompleted
                        });
                    }

                    skillsUpdated++;
                    updatedSkillIds.push(skillId);
                }

                matrix.dna.totalSubmissions = (matrix.dna.totalSubmissions || 0) + totalSignals;
                DebugLog.log('[Backfill] Skill updates applied:', {
                    skillsUpdated,
                    totalSignals,
                    sampleSkillIds: updatedSkillIds.slice(0, 10)
                });
                await matrix.save();
                DebugLog.log('[Backfill] Skill DNA saved:', { totalSubmissions: matrix.dna.totalSubmissions });

                const source = useSubmissions ? 'shadow_logger' : 'problem_history';

                const backfillMeta = {
                    lastRun: new Date().toISOString(),
                    problemCount: problemList.length,
                    historyEntries,
                    skillsUpdated,
                    unmappedTopics,
                    source
                };

                await chrome.storage.local.set({ skillDNABackfill: backfillMeta });
                DebugLog.log('[Backfill] Saved backfill metadata:', backfillMeta);

                console.log('[Background] Backfill complete:', { source, skillsUpdated, historyEntries });
                DebugLog.log('[Backfill] Response payload:', {
                    success: true,
                    count: problemList.length,
                    historyEntries,
                    skills: skillsUpdated,
                    source
                });
                sendResponse({
                    success: true,
                    count: problemList.length,
                    historyEntries,
                    skills: skillsUpdated,
                    source
                });
            } catch (e) {
                console.error("[Background] Backfill error:", e);
                sendResponse({ success: false, error: e.message });
            }
        })();
        return true;
    }

    // Future: Handle other background tasks (e.g. daily reminders, alarms)
});

// Initialize digest scheduler on load
if (typeof DigestScheduler !== 'undefined') {
    DigestScheduler.initScheduler().then(() => {
        console.log('[Background] Digest scheduler initialized.');
    }).catch(err => {
        console.error('[Background] Failed to init digest scheduler:', err);
    });

    // Listen for digest alarms
    chrome.alarms.onAlarm.addListener((alarm) => {
        DigestScheduler.handleDigestAlarm(alarm, async () => {
            console.log('[Background] Running nightly digest via DigestOrchestrator...');

            if (typeof DigestOrchestrator !== 'undefined') {
                try {
                    await DigestOrchestrator.runNightlyDigest();
                    console.log('[Background] Nightly digest completed successfully.');
                } catch (e) {
                    console.error('[Background] Nightly digest failed:', e);
                }
            } else {
                console.warn('[Background] DigestOrchestrator not loaded.');
            }
        });
    });
}

console.log("[Background] Service Worker Loaded.");
