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
