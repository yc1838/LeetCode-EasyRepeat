/**
 * Insights Store
 * 
 * Manages persistent storage of atomic insights about user mistakes.
 * Insights are extracted from daily analysis and compressed over time.
 */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        // Node.js (for testing)
        module.exports = factory();
    } else {
        // Browser
        root.InsightsStore = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const DECAY_INTERVAL_DAYS = 1;
    const DEFAULT_WEIGHT = 1.0;

    /**
     * Generate a unique ID for an insight.
     */
    function generateId() {
        return 'insight_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    }

    /**
     * Create a new insight entity.
     */
    function createInsight({ content, skillIds, source = 'gemini_analysis' }) {
        const now = new Date().toISOString();
        return {
            id: generateId(),
            content,
            skillIds: skillIds || [],
            source,
            frequency: 1,
            weight: DEFAULT_WEIGHT,
            createdAt: now,
            lastSeenAt: now
        };
    }

    /**
     * InsightsStore class - manages IndexedDB operations for insights.
     */
    class InsightsStore {
        constructor() {
            this.db = null;
            this.initialized = false;
        }

        /**
         * Initialize the database.
         */
        async init() {
            if (this.initialized) return;

            try {
                const Dexie = (typeof window !== 'undefined' && window.Dexie) ||
                    (typeof global !== 'undefined' && global.Dexie) ||
                    require('dexie');

                this.db = new Dexie('InsightsDB');
                this.db.version(1).stores({
                    insights: 'id, *skillIds, createdAt, lastSeenAt, weight, frequency'
                });
                await this.db.open();
                this.initialized = true;
                console.log('[InsightsStore] Database initialized.');
            } catch (e) {
                console.error('[InsightsStore] Failed to initialize:', e);
                throw e;
            }
        }

        /**
         * Add a new insight.
         */
        async add(insight) {
            if (!this.initialized) await this.init();
            await this.db.insights.add(insight);
            return insight;
        }

        /**
         * Get all insights.
         */
        async getAll() {
            if (!this.initialized) await this.init();
            return await this.db.insights.toArray();
        }

        /**
         * Get insight by ID.
         */
        async getById(id) {
            if (!this.initialized) await this.init();
            return await this.db.insights.get(id);
        }

        /**
         * Update an existing insight.
         */
        async update(insight) {
            if (!this.initialized) await this.init();
            await this.db.insights.put(insight);
            return insight;
        }

        /**
         * Delete an insight by ID.
         */
        async delete(id) {
            if (!this.initialized) await this.init();
            await this.db.insights.delete(id);
        }

        /**
         * Clear all insights.
         */
        async clear() {
            if (!this.initialized) await this.init();
            await this.db.insights.clear();
        }

        /**
         * Get insights by a single skill ID.
         */
        async getBySkillId(skillId) {
            if (!this.initialized) await this.init();
            const all = await this.db.insights.toArray();
            return all.filter(i => i.skillIds.includes(skillId));
        }

        /**
         * Get insights matching any of the given skill IDs.
         */
        async getBySkillIds(skillIds) {
            if (!this.initialized) await this.init();
            const all = await this.db.insights.toArray();
            return all.filter(i =>
                skillIds.some(sid => i.skillIds.includes(sid))
            );
        }

        /**
         * Get the N most recent insights.
         */
        async getRecent(n = 10) {
            if (!this.initialized) await this.init();
            return await this.db.insights
                .orderBy('createdAt')
                .reverse()
                .limit(n)
                .toArray();
        }

        /**
         * Get top N insights by weight.
         */
        async getTopByWeight(n = 10) {
            if (!this.initialized) await this.init();
            const all = await this.db.insights.toArray();
            return all
                .sort((a, b) => b.weight - a.weight)
                .slice(0, n);
        }

        /**
         * Increment the frequency of an insight (seen again).
         */
        async incrementFrequency(id) {
            if (!this.initialized) await this.init();
            const insight = await this.getById(id);
            if (insight) {
                insight.frequency++;
                insight.lastSeenAt = new Date().toISOString();
                await this.update(insight);
            }
        }

        /**
         * Apply decay to all insights based on age.
         * @param {number} decayFactor - Daily decay factor (e.g., 0.9 = 10% decay per day)
         */
        async applyDecay(decayFactor = 0.95) {
            if (!this.initialized) await this.init();

            const now = new Date();
            const all = await this.db.insights.toArray();

            for (const insight of all) {
                const lastSeen = new Date(insight.lastSeenAt);
                const daysSince = Math.floor((now - lastSeen) / (1000 * 60 * 60 * 24));

                if (daysSince >= DECAY_INTERVAL_DAYS) {
                    // Apply exponential decay
                    insight.weight = insight.weight * Math.pow(decayFactor, daysSince);
                    await this.update(insight);
                }
            }
        }

        /**
         * Get statistics about stored insights.
         */
        async getStats() {
            if (!this.initialized) await this.init();
            const all = await this.db.insights.toArray();

            const skillCounts = {};
            for (const insight of all) {
                for (const skillId of insight.skillIds) {
                    skillCounts[skillId] = (skillCounts[skillId] || 0) + 1;
                }
            }

            return {
                totalInsights: all.length,
                totalWeight: all.reduce((sum, i) => sum + i.weight, 0),
                avgFrequency: all.length > 0
                    ? all.reduce((sum, i) => sum + i.frequency, 0) / all.length
                    : 0,
                skillCounts
            };
        }
    }

    return {
        InsightsStore,
        createInsight,
        generateId,
        DEFAULT_WEIGHT
    };
}));
