/**
 * Digest Scheduler
 * 
 * Handles scheduling of the nightly digest using chrome.alarms API.
 * The digest runs once per day (default 10 PM local time) to analyze
 * the day's submissions and update the Skill DNA.
 */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        // Node.js (for testing)
        module.exports = factory();
    } else {
        // Browser - attach to global
        const exports = factory();
        root.DigestScheduler = exports;
    }
}(typeof self !== 'undefined' ? self : this, function () {

    // --- Constants ---
    const DIGEST_ALARM_NAME = 'NIGHTLY_DIGEST';
    const DEFAULT_DIGEST_HOUR = 22; // 10 PM local time

    /**
     * Calculate the next digest time based on the target hour.
     * If we're past the target hour today, schedule for tomorrow.
     * 
     * @param {number} hour - Target hour in 24h format (0-23)
     * @param {Date} now - Current time (for testing)
     * @returns {number} - Timestamp in milliseconds
     */
    function calculateNextDigestTime(hour = DEFAULT_DIGEST_HOUR, now = new Date()) {
        const target = new Date(now);
        target.setHours(hour, 0, 0, 0);

        // If we're at or past the target hour, schedule for tomorrow
        if (now.getHours() >= hour) {
            target.setDate(target.getDate() + 1);
        }

        return target.getTime();
    }

    /**
     * Schedule the nightly digest alarm.
     * Uses chrome.alarms for reliability (survives service worker restarts).
     * 
     * @param {number} hour - Target hour (default 22 = 10 PM)
     */
    async function scheduleNightlyDigest(hour = DEFAULT_DIGEST_HOUR) {
        // Clear any existing alarm first
        if (typeof chrome !== 'undefined' && chrome.alarms) {
            await chrome.alarms.clear(DIGEST_ALARM_NAME);

            const when = calculateNextDigestTime(hour);

            chrome.alarms.create(DIGEST_ALARM_NAME, {
                when: when,
                periodInMinutes: 24 * 60 // Repeat every 24 hours
            });

            console.log(`[DigestScheduler] Scheduled nightly digest for ${new Date(when).toLocaleString()}`);
            return when;
        } else {
            console.warn('[DigestScheduler] chrome.alarms not available');
            return null;
        }
    }

    /**
     * Handle an alarm event.
     * Returns true if this was a digest alarm and it was handled.
     * 
     * @param {chrome.alarms.Alarm} alarm - The alarm that fired
     * @param {Function} digestCallback - Function to run the digest
     * @returns {Promise<boolean>} - True if handled successfully
     */
    async function handleDigestAlarm(alarm, digestCallback) {
        if (alarm.name !== DIGEST_ALARM_NAME) {
            return false;
        }

        console.log('[DigestScheduler] Nightly digest alarm fired!');

        try {
            if (typeof digestCallback === 'function') {
                await digestCallback();
            } else {
                console.log('[DigestScheduler] No digest callback provided. Digest engine not yet implemented.');
            }
            return true;
        } catch (error) {
            console.error('[DigestScheduler] Digest failed:', error);
            return false;
        }
    }

    /**
     * Initialize the digest scheduler.
     * Should be called when the extension loads.
     */
    async function initScheduler() {
        console.log('[DigestScheduler] Initializing...');

        // Check if alarm already exists
        if (typeof chrome !== 'undefined' && chrome.alarms) {
            const existing = await chrome.alarms.get(DIGEST_ALARM_NAME);

            if (existing) {
                console.log(`[DigestScheduler] Alarm already scheduled for ${new Date(existing.scheduledTime).toLocaleString()}`);
            } else {
                await scheduleNightlyDigest();
            }
        }
    }

    /**
     * Get the current alarm status (for debugging/UI).
     */
    async function getSchedulerStatus() {
        if (typeof chrome !== 'undefined' && chrome.alarms) {
            const alarm = await chrome.alarms.get(DIGEST_ALARM_NAME);
            if (alarm) {
                return {
                    scheduled: true,
                    nextRun: new Date(alarm.scheduledTime).toISOString(),
                    periodMinutes: alarm.periodInMinutes
                };
            }
        }
        return { scheduled: false };
    }

    return {
        DIGEST_ALARM_NAME,
        DEFAULT_DIGEST_HOUR,
        calculateNextDigestTime,
        scheduleNightlyDigest,
        handleDigestAlarm,
        initScheduler,
        getSchedulerStatus
    };
}));
