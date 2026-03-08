/**
 * LeetCode EasyRepeat - Background Service Worker
 * Handles events that persist beyond the lifecycle of a single page or popup.
 */

// Dependencies are bundled via Vite entry (src/background/worker.js).
console.log('[Background] Module bundle loaded.');

// --- Debug logging toggle ---
const DEBUG_LOG_KEY = 'agentDebugLogs';
const LOCALIZED_TITLE_STORAGE_KEY = 'localizedProblemTitles';
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

function getLocalizedTitleCache() {
    return chrome.storage.local.get({ [LOCALIZED_TITLE_STORAGE_KEY]: {} })
        .then((result) => result[LOCALIZED_TITLE_STORAGE_KEY] || {});
}

function setLocalizedTitleCache(cache) {
    return chrome.storage.local.set({ [LOCALIZED_TITLE_STORAGE_KEY]: cache || {} });
}

function buildLocalizedTitleEntry(payload) {
    if (!payload || !payload.translatedTitle) return null;

    const questionId = payload.questionId || payload.questionFrontendId || null;
    const zhTitle = questionId
        ? `${questionId}. ${payload.translatedTitle}`
        : payload.translatedTitle;

    return {
        zh: zhTitle,
        zhRaw: payload.translatedTitle,
        questionId: questionId || null,
        source: payload.source || 'unknown',
        fetchedAt: Date.now()
    };
}

async function fetchTranslatedTitleViaGraphQL(slug) {
    const query = `
        query questionTranslations($titleSlug: String!) {
            question(titleSlug: $titleSlug) {
                questionFrontendId
                translatedTitle
                titleSlug
            }
        }
    `;

    const response = await fetch('https://leetcode.cn/graphql/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            query,
            variables: { titleSlug: slug }
        })
    });

    if (!response.ok) {
        throw new Error(`leetcode.cn GraphQL HTTP ${response.status}`);
    }

    const data = await response.json();
    const question = data?.data?.question;
    if (!question?.translatedTitle) {
        return null;
    }

    return buildLocalizedTitleEntry({
        translatedTitle: question.translatedTitle,
        questionId: question.questionFrontendId,
        source: 'leetcode.cn/graphql'
    });
}

async function fetchTranslatedTitleViaPage(slug) {
    const response = await fetch(`https://leetcode.cn/problems/${slug}/`);
    if (!response.ok) {
        throw new Error(`leetcode.cn page HTTP ${response.status}`);
    }

    const html = await response.text();
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (!titleMatch) {
        return null;
    }

    const rawTitle = titleMatch[1]
        .replace(/\s*-\s*力扣（LeetCode）\s*$/u, '')
        .replace(/\s*-\s*LeetCode\s*$/u, '')
        .trim();

    if (!rawTitle) {
        return null;
    }

    const numberedMatch = rawTitle.match(/^(\d+)\.\s*(.+)$/);
    return buildLocalizedTitleEntry({
        translatedTitle: numberedMatch ? numberedMatch[2] : rawTitle,
        questionId: numberedMatch ? numberedMatch[1] : null,
        source: 'leetcode.cn/page'
    });
}

async function resolveLocalizedTitle(slug) {
    try {
        const graphqlEntry = await fetchTranslatedTitleViaGraphQL(slug);
        if (graphqlEntry?.zh) {
            return graphqlEntry;
        }
    } catch (e) {
        DebugLog.warn('[Background] leetcode.cn GraphQL title fetch failed:', slug, e.message);
    }

    try {
        const pageEntry = await fetchTranslatedTitleViaPage(slug);
        if (pageEntry?.zh) {
            return pageEntry;
        }
    } catch (e) {
        DebugLog.warn('[Background] leetcode.cn page title fallback failed:', slug, e.message);
    }

    return null;
}

async function fetchLocalizedTitlesForSlugs(slugs, language) {
    const normalizedLanguage = String(language || 'en').startsWith('zh') ? 'zh' : 'en';
    if (normalizedLanguage !== 'zh') {
        return {};
    }

    const requestedSlugs = Array.from(new Set((slugs || []).filter(Boolean)));
    if (!requestedSlugs.length) {
        return {};
    }

    const cache = await getLocalizedTitleCache();
    const output = {};

    for (const slug of requestedSlugs) {
        if (cache[slug]?.zh) {
            output[slug] = cache[slug];
            continue;
        }

        const entry = await resolveLocalizedTitle(slug);
        if (entry?.zh) {
            cache[slug] = entry;
            output[slug] = entry;
        }
    }

    await setLocalizedTitleCache(cache);
    return output;
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
        DebugLog.log(`[Background] PROXY FETCH START: ${url}`);

        fetch(url, options)
            .then(async (response) => {
                const text = await response.text();
                const result = {
                    success: true,
                    ok: response.ok,
                    status: response.status,
                    data: text
                };
                sendResponse(result);
            })
            .catch((error) => {
                console.error(`[Background] PROXY FETCH ERROR:`, error.message);
                sendResponse({ success: false, error: error.message });
            });

        return true; // Keep channel open for async response
    }

    if (request.action === 'fetchLocalizedProblemTitles') {
        (async () => {
            try {
                const titles = await fetchLocalizedTitlesForSlugs(request.slugs, request.language);
                sendResponse({ success: true, titles });
            } catch (e) {
                console.error('[Background] fetchLocalizedProblemTitles error:', e);
                sendResponse({ success: false, error: e.message });
            }
        })();
        return true;
    }

    // Handler: List Available Models (via provider)
    if (request.action === "listModels") {
        (async () => {
            try {
                if (typeof LLMGateway !== 'undefined' && typeof LLMGateway.listModels === 'function') {
                    const models = await LLMGateway.listModels();
                    sendResponse({ success: true, models: models });
                } else {
                    sendResponse({ success: false, error: 'LLMGateway.listModels not available' });
                }
            } catch (e) {
                console.error("[Background] listModels error:", e);
                sendResponse({ success: false, error: e.message });
            }
        })();
        return true;
    }

    // Handler: Change Options
    if (request.action === "updateOptions") {
        chrome.storage.local.set(request.options, () => {
            sendResponse({ success: true });
        });
        return true;
    }
});

console.log("[Background] Service Worker Loaded.");
