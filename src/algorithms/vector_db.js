/**
 * VectorDB - Local Vector Store using Chrome Storage
 *
 * Stores embeddings and allows for cosine similarity search.
 * MIGRATED from IndexedDB to Chrome Storage Local for cross-context access.
 */
(function (root, factory) {
    var exported = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = exported;
    } else {
        root.VectorDB = exported;
    }
    // Also set on window for bundled contexts
    if (typeof window !== 'undefined') {
        window.VectorDB = exported;
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const STORAGE_KEY = 'LEETCODE_SRS_VECTORS';
    const IDB_NAME = 'LeetCodeSRSMistakeDB'; // Legacy DB Name

    // --- LEGACY IDB HELPER (For Migration) ---
    function getLegacyData() {
        return new Promise((resolve) => {
            if (typeof indexedDB === 'undefined') return resolve([]);

            const request = indexedDB.open(IDB_NAME, 1);
            request.onerror = () => resolve([]);
            request.onupgradeneeded = () => resolve([]);
            request.onsuccess = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('vectors')) return resolve([]);
                const tx = db.transaction(['vectors'], 'readonly');
                const store = tx.objectStore('vectors');
                const req = store.getAll();
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => resolve([]);
            };
        });
    }

    // --- CORE STORAGE ---
    function getChromeStorage() {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
            return null;
        }
        return chrome.storage.local;
    }

    async function loadVectors() {
        const storage = getChromeStorage();
        if (!storage) {
            console.warn("Chrome Storage not available");
            return [];
        }
        return new Promise((resolve) => {
            storage.get([STORAGE_KEY], (result) => {
                resolve(result[STORAGE_KEY] || []);
            });
        });
    }

    async function saveVectors(vectors) {
        const storage = getChromeStorage();
        if (!storage) return;
        return new Promise((resolve) => {
            storage.set({ [STORAGE_KEY]: vectors }, () => resolve());
        });
    }

    // --- MIGRATION CHECK ---
    async function checkMigration() {
        // Migration only runs in a context where IDB is accessible (Pages)
        // AND where we can write to storage.
        if (typeof indexedDB === 'undefined' || !getChromeStorage()) return;

        const current = await loadVectors();
        if (current.length > 0) return; // Already initialized

        console.log("[VectorDB] Checking for legacy IndexedDB data...");
        const legacy = await getLegacyData();
        if (legacy && legacy.length > 0) {
            console.log(`[VectorDB] Migrating ${legacy.length} records...`);
            // Clean legacy data if needed? No, just copy.
            await saveVectors(legacy);
            console.log("[VectorDB] Migration Done.");
        }
    }

    // Auto-run migration check on load
    checkMigration();

    // --- HELPER ---
    function cosineSimilarity(vecA, vecB) {
        if (vecA.length !== vecB.length) return 0;
        let dot = 0.0, normA = 0.0, normB = 0.0;
        for (let i = 0; i < vecA.length; i++) {
            dot += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        if (normA === 0 || normB === 0) return 0;
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    // --- PUBLIC API ---

    async function add(entry) {
        const vectors = await loadVectors();
        const record = {
            id: Date.now() + Math.random(),
            vector: entry.vector,
            text: entry.text,
            advice: entry.advice,
            metadata: entry.metadata || {},
            timestamp: Date.now()
        };
        vectors.push(record);
        await saveVectors(vectors);
        return record.id;
    }

    async function search(queryVector, limit = 3, threshold = 0.7) {
        const vectors = await loadVectors();
        const results = vectors
            .map(record => ({ ...record, score: cosineSimilarity(queryVector, record.vector) }))
            .filter(r => r.score >= threshold)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
        return results;
    }

    async function getStats() {
        const records = await loadVectors();
        const stats = {
            totalMistakes: records.length,
            byCategory: {},
            byFamily: {},
            byTag: {},
            byMicroSkill: {}, // NEW
            byAntiPattern: {}, // NEW
            tree: {}
        };

        records.forEach(r => {
            const meta = r.metadata || {};
            const family = (meta.family || meta.category || 'Uncategorized').toUpperCase();
            const tag = (meta.tag) ? meta.tag.toUpperCase() : 'GENERAL';
            const microSkill = (meta.micro_skill || 'Unknown');
            const antiPattern = (meta.anti_pattern || 'Unknown');

            stats.byFamily[family] = (stats.byFamily[family] || 0) + 1;
            stats.byCategory[family] = stats.byFamily[family];
            stats.byTag[tag] = (stats.byTag[tag] || 0) + 1;

            // New aggregations
            stats.byMicroSkill[microSkill] = (stats.byMicroSkill[microSkill] || 0) + 1;
            stats.byAntiPattern[antiPattern] = (stats.byAntiPattern[antiPattern] || 0) + 1;

            if (!stats.tree[family]) stats.tree[family] = {};
            stats.tree[family][tag] = (stats.tree[family][tag] || 0) + 1;
        });
        return stats;
    }

    async function getAllWithKeys() {
        return await loadVectors();
    }

    async function update(id, newData) {
        const vectors = await loadVectors();
        const index = vectors.findIndex(v => v.id === id);
        if (index === -1) throw new Error("Record not found");

        vectors[index] = { ...vectors[index], ...newData };
        await saveVectors(vectors);
        return true;
    }

    async function prune(keepCount = 1000) {
        const vectors = await loadVectors();
        if (vectors.length > keepCount) {
            // Keep last N
            const newVecs = vectors.slice(vectors.length - keepCount);
            await saveVectors(newVecs);
        }
        return true;
    }

    return {
        add,
        search,
        getStats,
        getAllWithKeys,
        update,
        prune // Export prune just in case
    };

}));
