/**
 * Backup Service
 *
 * Unified backup/restore that covers:
 *   1. chrome.storage.local (settings, problems, activity log, etc.)
 *   2. IndexedDB stores (DrillsDB, InsightsDB, NeuralRetentionDB)
 *
 * Backward-compatible with schema v1 backups (no IndexedDB section).
 */

(function (root, factory) {
    const exports = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = exports;
    } else {
        root.BackupService = exports;
    }
    if (typeof window !== 'undefined') {
        window.BackupService = exports;
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const BACKUP_SCHEMA_VERSION = 2;

    function isPlainObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    /**
     * Summarize a chrome.storage.local snapshot for metadata.
     */
    function summarizeStorageSnapshot(storageData) {
        const data = isPlainObject(storageData) ? storageData : {};
        return {
            totalKeys: Object.keys(data).length,
            problemCount: isPlainObject(data.problems) ? Object.keys(data.problems).length : 0,
            activityDays: Array.isArray(data.activityLog) ? data.activityLog.length : 0
        };
    }

    /**
     * Get a Dexie table handle, initializing the database if needed.
     * Returns null if Dexie is not available.
     */
    async function getDexieDb(dbName, storesDef) {
        const DexieClass = (typeof globalThis !== 'undefined' && globalThis.Dexie) ||
            (typeof window !== 'undefined' && window.Dexie) ||
            (typeof self !== 'undefined' && self.Dexie) ||
            (typeof global !== 'undefined' && global.Dexie);

        if (!DexieClass) return null;

        const db = new DexieClass(dbName);
        db.version(1).stores(storesDef);
        await db.open();
        return db;
    }

    /**
     * Read all rows from an IndexedDB store via Dexie.
     * Returns [] if the store doesn't exist or Dexie isn't available.
     */
    async function readAllFromStore(dbName, storesDef, tableName) {
        try {
            const db = await getDexieDb(dbName, storesDef);
            if (!db) return [];
            const rows = await db[tableName].toArray();
            return rows;
        } catch (e) {
            console.warn(`[BackupService] Could not read ${dbName}.${tableName}:`, e);
            return [];
        }
    }

    /**
     * Clear and write rows into an IndexedDB store via Dexie.
     */
    async function writeAllToStore(dbName, storesDef, tableName, rows) {
        if (!Array.isArray(rows) || rows.length === 0) return;
        try {
            const db = await getDexieDb(dbName, storesDef);
            if (!db) return;
            await db[tableName].clear();
            await db[tableName].bulkAdd(rows);
        } catch (e) {
            console.warn(`[BackupService] Could not write ${dbName}.${tableName}:`, e);
        }
    }

    // IndexedDB schema definitions (must match the real stores)
    const IDB_SCHEMAS = {
        DrillsDB: { drills: 'id, type, skillId, status, createdAt, difficulty' },
        InsightsDB: { insights: 'id, *skillIds, createdAt, lastSeenAt, weight, frequency' },
        NeuralRetentionDB: {
            submissionLog: '++id, sessionId, problemSlug, timestamp, result, submissionId',
            attemptCounter: '[sessionId+problemSlug], count'
        }
    };

    /**
     * Build a complete backup payload including chrome.storage.local + IndexedDB.
     */
    async function buildFullBackupPayload() {
        // 1. Read chrome.storage.local
        const storageData = await chrome.storage.local.get(null);
        const data = isPlainObject(storageData) ? storageData : {};

        // Strip sensitive data — never export API keys
        const SENSITIVE_KEYS = ['keys', 'geminiApiKey'];
        for (const key of SENSITIVE_KEYS) {
            delete data[key];
        }

        // 2. Read IndexedDB stores
        const drills = await readAllFromStore('DrillsDB', IDB_SCHEMAS.DrillsDB, 'drills');
        const insights = await readAllFromStore('InsightsDB', IDB_SCHEMAS.InsightsDB, 'insights');
        const submissionLog = await readAllFromStore(
            'NeuralRetentionDB', IDB_SCHEMAS.NeuralRetentionDB, 'submissionLog'
        );

        const exportedAt = new Date().toISOString();

        return {
            backupSchemaVersion: BACKUP_SCHEMA_VERSION,
            storageArea: 'chrome.storage.local',
            exportedAt,
            extensionVersion: chrome.runtime?.getManifest?.().version || '',
            counts: summarizeStorageSnapshot(data),
            data,
            indexedDBData: {
                drills,
                insights,
                submissionLog
            }
        };
    }

    /**
     * Extract backup data from a parsed JSON object.
     *
     * Handles:
     *   - v2 backup (with indexedDBData envelope)
     *   - v1 backup (chrome.storage.local only)
     *   - raw object (legacy: no envelope at all)
     *
     * @param {*} parsed - Parsed JSON from backup file
     * @returns {{ storageData: object, indexedDBData: object|null, exportedAt: string }}
     */
    function extractBackupData(parsed) {
        // v2 with indexedDBData
        if (isPlainObject(parsed) && isPlainObject(parsed.data) && isPlainObject(parsed.indexedDBData)) {
            return {
                storageData: parsed.data,
                indexedDBData: parsed.indexedDBData,
                exportedAt: parsed.exportedAt || ''
            };
        }

        // v1 or envelope with data but no indexedDBData
        if (isPlainObject(parsed) && isPlainObject(parsed.data)) {
            return {
                storageData: parsed.data,
                indexedDBData: null,
                exportedAt: parsed.exportedAt || ''
            };
        }

        // Raw object (no envelope)
        if (isPlainObject(parsed)) {
            return {
                storageData: parsed,
                indexedDBData: null,
                exportedAt: ''
            };
        }

        throw new Error('Invalid backup format.');
    }

    /**
     * Restore a full backup, including chrome.storage.local and IndexedDB stores.
     *
     * @param {object} payload - The full backup payload (as returned by buildFullBackupPayload or parsed from file)
     */
    async function restoreFullBackup(payload) {
        const { storageData, indexedDBData } = extractBackupData(payload);

        // 1. Restore chrome.storage.local
        await chrome.storage.local.clear();
        if (Object.keys(storageData).length > 0) {
            await chrome.storage.local.set(storageData);
        }

        // 2. Restore IndexedDB (only if backup includes IndexedDB data)
        if (indexedDBData) {
            const drills = Array.isArray(indexedDBData.drills) ? indexedDBData.drills : [];
            const insights = Array.isArray(indexedDBData.insights) ? indexedDBData.insights : [];
            const submissionLog = Array.isArray(indexedDBData.submissionLog) ? indexedDBData.submissionLog : [];

            if (drills.length > 0) {
                await writeAllToStore('DrillsDB', IDB_SCHEMAS.DrillsDB, 'drills', drills);
            }
            if (insights.length > 0) {
                await writeAllToStore('InsightsDB', IDB_SCHEMAS.InsightsDB, 'insights', insights);
            }
            if (submissionLog.length > 0) {
                await writeAllToStore(
                    'NeuralRetentionDB', IDB_SCHEMAS.NeuralRetentionDB, 'submissionLog', submissionLog
                );
            }
        }
    }

    return {
        BACKUP_SCHEMA_VERSION,
        buildFullBackupPayload,
        extractBackupData,
        restoreFullBackup,
        summarizeStorageSnapshot
    };
}));
