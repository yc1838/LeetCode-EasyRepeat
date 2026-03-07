/**
 * Shadow Logger
 * 
 * Silently captures all LeetCode submissions (pass or fail) for the Neural Retention Agent.
 * Data is stored in IndexedDB and processed by the nightly Digest Engine.
 * 
 * This module does NOT make any API calls - it only captures and stores locally.
 */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        // Node.js (for testing)
        module.exports = factory();
    } else {
        // Browser
        root.ShadowLogger = factory().ShadowLogger;
        root.getSessionId = factory().getSessionId;
        root.createSubmissionEntry = factory().createSubmissionEntry;
    }
}(typeof self !== 'undefined' ? self : this, function () {

    // --- Helper Functions ---

    /**
     * Generate a UUID v4
     */
    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Get the current session ID (day-based grouping)
     * Format: "day-YYYY-MM-DD"
     */
    function getSessionId(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `day-${year}-${month}-${day}`;
    }

    /**
     * Create a submission entry object with all required fields
     */
    function createSubmissionEntry(data) {
        return {
            id: generateUUID(),
            timestamp: new Date().toISOString(),
            sessionId: getSessionId(),

            // Problem Info
            problemSlug: data.problemSlug || '',
            problemTitle: data.problemTitle || '',
            difficulty: data.difficulty || 'Unknown',
            topics: data.topics || [],

            // Code
            language: data.language || 'unknown',
            code: data.code || '',

            // Result
            result: data.result || 'Unknown',
            errorDetails: data.errorDetails,

            // LeetCode Reference
            submissionId: data.submissionId || null,

            // Attempt tracking (will be set by logger)
            attemptNumber: data.attemptNumber || 1,

            // Verification data (from MCP, if available)
            verifiedFix: data.verifiedFix || null
        };
    }

    /**
     * ShadowLogger Class
     * 
     * Manages submission logging to IndexedDB via Dexie.
     */
    class ShadowLogger {
        constructor() {
            this.db = null;
            this.initialized = false;
        }

        /**
         * Initialize the database connection
         */
        async init() {
            if (this.initialized) return;

            try {
                // Dynamic import for browser environment
                if (typeof Dexie !== 'undefined') {
                    this.db = new Dexie('NeuralRetentionDB');
                    this.db.version(1).stores({
                        submissionLog: '++id, sessionId, problemSlug, timestamp, result, submissionId',
                        attemptCounter: '[sessionId+problemSlug], count'
                    });
                    await this.db.open();
                    this.initialized = true;
                    console.log('[ShadowLogger] Database initialized.');
                } else {
                    // Use in-memory fallback for testing or when Dexie not available
                    console.warn('[ShadowLogger] Dexie not available. Using in-memory storage.');
                    this._memoryStore = [];
                    this._attemptCounters = {};
                    this.initialized = true;
                }
            } catch (e) {
                console.error('[ShadowLogger] Failed to initialize database:', e);
                // Fallback to memory
                this._memoryStore = [];
                this._attemptCounters = {};
                this.initialized = true;
            }
        }

        /**
         * Get the next attempt number for a problem in current session
         */
        async _getNextAttemptNumber(sessionId, problemSlug) {
            if (this.db) {
                const key = { sessionId, problemSlug };
                const existing = await this.db.attemptCounter.get(key);
                const nextCount = (existing?.count || 0) + 1;
                await this.db.attemptCounter.put({ ...key, count: nextCount });
                return nextCount;
            } else {
                // Memory fallback
                const key = `${sessionId}:${problemSlug}`;
                this._attemptCounters[key] = (this._attemptCounters[key] || 0) + 1;
                return this._attemptCounters[key];
            }
        }

        /**
         * Log a submission to the database
         * 
         * @param {Object} data - Submission data
         * @param {string} data.problemSlug - Problem slug (e.g., "two-sum")
         * @param {string} data.problemTitle - Full title (e.g., "1. Two Sum")
         * @param {string} data.difficulty - Easy/Medium/Hard
         * @param {string[]} data.topics - Topic tags
         * @param {string} data.language - Programming language
         * @param {string} data.code - Submitted code
         * @param {string} data.result - Accepted/Wrong Answer/TLE/etc.
         * @param {Object} data.errorDetails - Error info if failed
         * @param {string} data.submissionId - LeetCode submission ID
         */
        async log(data) {
            if (!this.initialized) {
                await this.init();
            }

            const sessionId = getSessionId();
            const attemptNumber = await this._getNextAttemptNumber(sessionId, data.problemSlug);

            const entry = createSubmissionEntry({
                ...data,
                attemptNumber
            });

            if (this.db) {
                await this.db.submissionLog.add(entry);
            } else {
                this._memoryStore.push(entry);
            }

            console.log(`[ShadowLogger] Logged submission: ${data.problemSlug} (Attempt #${attemptNumber}) - ${data.result}`);
            return entry;
        }

        /**
         * Get all submissions from today
         */
        async getToday() {
            if (!this.initialized) await this.init();

            const sessionId = getSessionId();

            if (this.db) {
                return this.db.submissionLog
                    .where('sessionId')
                    .equals(sessionId)
                    .sortBy('timestamp');
            } else {
                return this._memoryStore
                    .filter(e => e.sessionId === sessionId)
                    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            }
        }

        /**
         * Get all submissions for a specific problem
         */
        async getByProblem(problemSlug) {
            if (!this.initialized) await this.init();

            if (this.db) {
                return this.db.submissionLog
                    .where('problemSlug')
                    .equals(problemSlug)
                    .sortBy('timestamp');
            } else {
                return this._memoryStore
                    .filter(e => e.problemSlug === problemSlug)
                    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            }
        }

        /**
         * Get submissions by session ID (day)
         */
        async getBySession(sessionId) {
            if (!this.initialized) await this.init();

            if (this.db) {
                return this.db.submissionLog
                    .where('sessionId')
                    .equals(sessionId)
                    .sortBy('timestamp');
            } else {
                return this._memoryStore
                    .filter(e => e.sessionId === sessionId)
                    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            }
        }

        /**
         * Get submission statistics
         */
        async getStats() {
            if (!this.initialized) await this.init();

            let entries;
            if (this.db) {
                entries = await this.db.submissionLog.toArray();
            } else {
                entries = this._memoryStore;
            }

            const uniqueProblems = new Set(entries.map(e => e.problemSlug));
            const acceptedCount = entries.filter(e => e.result === 'Accepted').length;
            const failedCount = entries.filter(e => e.result !== 'Accepted').length;

            return {
                totalSubmissions: entries.length,
                uniqueProblems: uniqueProblems.size,
                acceptedCount,
                failedCount,
                successRate: entries.length > 0 ? (acceptedCount / entries.length * 100).toFixed(1) : 0
            };
        }

        /**
         * Clean up old entries (keep only last N days)
         */
        async cleanup(daysToKeep = 30) {
            if (!this.initialized) await this.init();

            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
            const cutoffSessionId = getSessionId(cutoffDate);

            if (this.db) {
                // Delete entries with sessionId older than cutoff
                await this.db.submissionLog
                    .where('sessionId')
                    .below(cutoffSessionId)
                    .delete();

                await this.db.attemptCounter
                    .where('sessionId')
                    .below(cutoffSessionId)
                    .delete();
            } else {
                this._memoryStore = this._memoryStore.filter(
                    e => e.sessionId >= cutoffSessionId
                );
            }

            console.log(`[ShadowLogger] Cleaned up entries older than ${daysToKeep} days.`);
        }

        /**
         * Clear all data (for testing)
         */
        async clear() {
            if (!this.initialized) await this.init();

            if (this.db) {
                await this.db.submissionLog.clear();
                await this.db.attemptCounter.clear();
            } else {
                this._memoryStore = [];
                this._attemptCounters = {};
            }
        }

        /**
         * Export all data (for debugging or backup)
         */
        async exportAll() {
            if (!this.initialized) await this.init();

            if (this.db) {
                return this.db.submissionLog.toArray();
            } else {
                return [...this._memoryStore];
            }
        }
    }

    // Create singleton instance for browser
    let instance = null;

    function getInstance() {
        if (!instance) {
            instance = new ShadowLogger();
        }
        return instance;
    }

    return {
        ShadowLogger,
        getSessionId,
        createSubmissionEntry,
        getInstance
    };
}));
