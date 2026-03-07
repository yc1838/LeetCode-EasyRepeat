/**
 * AsyncNotifier.js
 * 
 * Chrome notifications for drill completion when the user's tab is inactive.
 * Allows background evaluation results to reach the user.
 */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.AsyncNotifier = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const DEFAULT_ICON = 'assets/icon-128.png';
    const NOTIFICATION_ID_PREFIX = 'drill-result-';

    /**
     * Check if notifications are enabled in settings.
     * 
     * @returns {Promise<boolean>}
     */
    async function isEnabled() {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            const result = await chrome.storage.local.get(['notificationsEnabled']);
            // Default to true if setting is not explicitly set
            return result.notificationsEnabled !== false;
        }
        return false;
    }

    /**
     * Create a notification for drill completion.
     * 
     * @param {string} drillId - The drill ID
     * @param {object} result - { success, passedCount, totalCount, skillId, error }
     * @returns {Promise<string|null>} The notification ID or null if not shown
     */
    async function notify(drillId, result) {
        // Check if notifications are enabled
        const enabled = await isEnabled();
        if (!enabled) {
            return null;
        }

        // Build notification content
        const title = result.success
            ? '✅ Drill Complete!'
            : '❌ Drill Needs Work';

        let message = '';
        if (result.passedCount !== undefined && result.totalCount !== undefined) {
            message = `Tests: ${result.passedCount}/${result.totalCount} passed`;
        }
        if (result.skillId) {
            message += message ? ` • ${result.skillId}` : result.skillId;
        }
        if (result.error && !result.success) {
            message = result.error;
        }

        const notificationId = `${NOTIFICATION_ID_PREFIX}${drillId}-${Date.now()}`;

        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.notifications) {
                const iconUrl = chrome.runtime?.getURL
                    ? chrome.runtime.getURL(DEFAULT_ICON)
                    : DEFAULT_ICON;

                chrome.notifications.create(
                    notificationId,
                    {
                        type: 'basic',
                        iconUrl,
                        title,
                        message: message || 'Drill evaluation complete',
                        priority: 2,
                        requireInteraction: false
                    },
                    (id) => {
                        resolve(id);
                    }
                );
            } else {
                // Fallback for non-Chrome environment (testing)
                console.log(`[AsyncNotifier] ${title}: ${message}`);
                resolve(null);
            }
        });
    }

    /**
     * Clear a notification.
     * 
     * @param {string} notificationId - The notification ID to clear
     * @returns {Promise<boolean>}
     */
    async function clearNotification(notificationId) {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.notifications) {
                chrome.notifications.clear(notificationId, (wasCleared) => {
                    resolve(wasCleared);
                });
            } else {
                resolve(false);
            }
        });
    }

    /**
     * Set up click handler to open drill details when notification is clicked.
     */
    function setupClickHandler() {
        if (typeof chrome !== 'undefined' && chrome.notifications) {
            chrome.notifications.onClicked.addListener((notificationId) => {
                if (notificationId.startsWith(NOTIFICATION_ID_PREFIX)) {
                    // Extract drill ID from notification ID
                    const drillId = notificationId
                        .replace(NOTIFICATION_ID_PREFIX, '')
                        .split('-')[0];

                    // Open drill results page
                    if (chrome.tabs) {
                        const drillUrl = chrome.runtime.getURL(
                            `dist/src/drills/drills.html?drillId=${drillId}&showResult=true`
                        );
                        chrome.tabs.create({ url: drillUrl });
                    }

                    // Clear the notification
                    clearNotification(notificationId);
                }
            });
        }
    }

    return {
        notify,
        isEnabled,
        clearNotification,
        setupClickHandler,
        NOTIFICATION_ID_PREFIX
    };
}));
