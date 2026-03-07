/**
 * Drill Store
 *
 * Manages persistent storage of drills (personalized exercises).
 * Drills target specific weak skills identified by the Skill Matrix.
 */

(function (root, factory) {
    console.log('[DrillStore] UMD wrapper executing');

    const exports = factory();

    // Always attach to self in browser contexts (including ES modules)
    if (typeof self !== 'undefined') {
        self.DrillStore = exports;
        console.log('[DrillStore] Attached to self.DrillStore');
    }

    // Also support CommonJS for tests
    if (typeof module === 'object' && module.exports) {
        module.exports = exports;
    }

    // Also set on window for bundled contexts (legacy support)
    if (typeof window !== 'undefined') {
        window.DrillStore = exports;
    }
}(typeof self !== 'undefined' ? self : this, function () {

    // Valid drill types
    const DRILL_TYPES = ['fill-in-blank', 'spot-bug', 'critique', 'muscle-memory'];
    let sharedDb = null;
    let sharedInitPromise = null;
    let loggedSharedInit = false;

    /**
     * Generate a unique ID for a drill.
     */
    function generateId() {
        return 'drill_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    }

    /**
     * Check if a drill type is valid.
     */
    function isValidDrillType(type) {
        return DRILL_TYPES.includes(type);
    }

    /**
     * Create a new drill entity.
     */
    function createDrill({ type, skillId, content, answer, test_cases, explanation, difficulty = 'medium', submissionId = null, category = null }) {
        const now = new Date().toISOString();
        return {
            id: generateId(),
            type,
            skillId,
            content,
            answer,
            test_cases: test_cases || [],
            explanation: explanation || null,
            difficulty,
            status: 'pending',      // pending | completed | skipped
            correct: null,          // true | false | null
            createdAt: now,
            completedAt: null,
            attempts: 0,
            submissionId,           // FK → submissionLog.id (null for legacy drills)
            category                // 'problem' | 'language' | 'algo' | null
        };
    }

    /**
     * DrillStore class - manages IndexedDB operations for drills.
     */
    class DrillStore {
        constructor() {
            this.db = null;
            this.initialized = false;
        }

        /**
         * Initialize the database.
         */
        async init() {
            if (this.initialized && this.db) return;
            if (sharedDb) {
                this.db = sharedDb;
                this.initialized = true;
                return;
            }

            if (sharedInitPromise) {
                this.db = await sharedInitPromise;
                this.initialized = true;
                return;
            }

            try {
                sharedInitPromise = (async () => {
                    const Dexie = (typeof globalThis !== 'undefined' && globalThis.Dexie) ||
                        (typeof window !== 'undefined' && window.Dexie) ||
                        (typeof self !== 'undefined' && self.Dexie) ||
                        (typeof global !== 'undefined' && global.Dexie);

                    if (!Dexie) {
                        throw new Error('Dexie not found. Ensure dexie.min.js is imported.');
                    }

                    const db = new Dexie('DrillsDB');
                    db.version(1).stores({
                        drills: 'id, type, skillId, status, createdAt, difficulty'
                    });
                    await db.open();
                    if (!loggedSharedInit) {
                        console.log('[DrillStore] Database initialized.');
                        loggedSharedInit = true;
                    }
                    return db;
                })();

                sharedDb = await sharedInitPromise;
                this.db = sharedDb;
                this.initialized = true;
            } catch (e) {
                console.error('[DrillStore] Failed to initialize:', e);
                throw e;
            } finally {
                sharedInitPromise = null;
            }
        }

        /**
         * Add a new drill.
         */
        async add(drill) {
            if (!this.initialized) await this.init();
            await this.db.drills.add(drill);
            return drill;
        }

        /**
         * Get all drills.
         */
        async getAll() {
            if (!this.initialized) await this.init();
            return await this.db.drills.toArray();
        }

        /**
         * Get drill by ID.
         */
        async getById(id) {
            if (!this.initialized) await this.init();
            return await this.db.drills.get(id);
        }

        /**
         * Update an existing drill.
         */
        async update(drill) {
            if (!this.initialized) await this.init();
            await this.db.drills.put(drill);
            return drill;
        }

        /**
         * Delete a drill by ID.
         */
        async delete(id) {
            if (!this.initialized) await this.init();
            await this.db.drills.delete(id);
        }

        /**
         * Clear all drills.
         */
        async clear() {
            if (!this.initialized) await this.init();
            await this.db.drills.clear();
        }

        /**
         * Get drills by skill ID.
         */
        async getBySkillId(skillId) {
            if (!this.initialized) await this.init();
            return await this.db.drills.where('skillId').equals(skillId).toArray();
        }

        /**
         * Get drills by type.
         */
        async getByType(type) {
            if (!this.initialized) await this.init();
            return await this.db.drills.where('type').equals(type).toArray();
        }

        /**
         * Get pending drills.
         */
        async getPending() {
            if (!this.initialized) await this.init();
            return await this.db.drills.where('status').equals('pending').toArray();
        }

        /**
         * Get today's drill queue (N pending drills).
         */
        async getTodayQueue(limit = 5) {
            if (!this.initialized) await this.init();
            return await this.db.drills
                .where('status')
                .equals('pending')
                .limit(limit)
                .toArray();
        }

        /**
         * Get drill statistics.
         */
        async getStats() {
            if (!this.initialized) await this.init();
            const all = await this.db.drills.toArray();

            const completed = all.filter(d => d.status === 'completed');
            const correct = completed.filter(d => d.correct === true);
            const pending = all.filter(d => d.status === 'pending');

            return {
                total: all.length,
                completed: completed.length,
                pending: pending.length,
                correct: correct.length,
                accuracy: completed.length > 0
                    ? ((correct.length / completed.length) * 100).toFixed(1) + '%'
                    : '0%'
            };
        }

        /**
         * Mark a drill as completed.
         */
        async markCompleted(id, correct) {
            if (!this.initialized) await this.init();
            const drill = await this.getById(id);
            if (drill) {
                drill.status = 'completed';
                drill.correct = correct;
                drill.completedAt = new Date().toISOString();
                drill.attempts++;
                await this.update(drill);
            }
            return drill;
        }
    }

    return {
        DrillStore,
        createDrill,
        generateId,
        isValidDrillType,
        DRILL_TYPES
    };
}));
