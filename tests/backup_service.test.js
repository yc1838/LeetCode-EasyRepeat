/**
 * Backup Service Tests (TDD)
 *
 * Tests for the unified backup/restore service that exports
 * chrome.storage.local AND IndexedDB data (DrillsDB, InsightsDB, NeuralRetentionDB).
 */

require('fake-indexeddb/auto');
const Dexie = require('dexie');
global.Dexie = Dexie;

// Mock chrome.storage.local
const chromeStorageData = {};
global.chrome = {
    storage: {
        local: {
            get: jest.fn((keys) => {
                if (keys === null) {
                    return Promise.resolve({ ...chromeStorageData });
                }
                const result = {};
                if (typeof keys === 'string') {
                    result[keys] = chromeStorageData[keys] !== undefined
                        ? chromeStorageData[keys]
                        : undefined;
                } else if (Array.isArray(keys)) {
                    keys.forEach(k => {
                        result[k] = chromeStorageData[k] !== undefined
                            ? chromeStorageData[k]
                            : undefined;
                    });
                } else if (typeof keys === 'object') {
                    for (const [k, def] of Object.entries(keys)) {
                        result[k] = chromeStorageData[k] !== undefined
                            ? chromeStorageData[k]
                            : def;
                    }
                }
                return Promise.resolve(result);
            }),
            set: jest.fn((data) => {
                Object.assign(chromeStorageData, data);
                return Promise.resolve();
            }),
            clear: jest.fn(() => {
                for (const key of Object.keys(chromeStorageData)) {
                    delete chromeStorageData[key];
                }
                return Promise.resolve();
            })
        }
    },
    runtime: { id: 'test-extension-id', getManifest: () => ({ version: '1.0.0' }) }
};

// Load store modules
const DrillStoreMod = require('../src/background/drill_store');
const InsightsStoreMod = require('../src/background/insights_store');
const ShadowLoggerMod = require('../src/content/shadow_logger');

// Load backup service after globals are set
const BackupService = require('../src/shared/backup_service');

function clearChromeStorage() {
    for (const key of Object.keys(chromeStorageData)) {
        delete chromeStorageData[key];
    }
}

describe('Backup Service', () => {
    let drillStore, insightsStore, shadowLogger;

    beforeEach(async () => {
        clearChromeStorage();

        drillStore = new DrillStoreMod.DrillStore();
        await drillStore.init();
        await drillStore.clear();

        insightsStore = new InsightsStoreMod.InsightsStore();
        await insightsStore.init();
        await insightsStore.clear();

        shadowLogger = new ShadowLoggerMod.ShadowLogger();
        await shadowLogger.init();
        await shadowLogger.clear();
    });

    afterEach(async () => {
        await drillStore.clear();
        await insightsStore.clear();
        await shadowLogger.clear();
        clearChromeStorage();
    });

    describe('buildFullBackupPayload', () => {
        it('happy path: should include chrome.storage.local + all IndexedDB stores', async () => {
            // Seed chrome.storage.local
            chromeStorageData.problems = {
                'two-sum': { slug: 'two-sum', title: '1. Two Sum', difficulty: 'Easy' }
            };
            chromeStorageData.activityLog = ['2026-03-01'];
            chromeStorageData.theme = 'sakura';

            // Seed drills
            const drill = DrillStoreMod.createDrill({
                type: 'fill-in-blank', skillId: 'arrays', content: 'Test', answer: 'ans'
            });
            await drillStore.add(drill);

            // Seed insights
            const insight = InsightsStoreMod.createInsight({
                content: 'Off by one', skillIds: ['binary_search']
            });
            await insightsStore.add(insight);

            // Seed shadow logger
            await shadowLogger.log({
                problemSlug: 'two-sum', problemTitle: '1. Two Sum',
                difficulty: 'Easy', result: 'Accepted', language: 'javascript', code: '...'
            });

            const payload = await BackupService.buildFullBackupPayload();

            // Schema version
            expect(payload.backupSchemaVersion).toBe(2);
            expect(payload.storageArea).toBe('chrome.storage.local');
            expect(payload.exportedAt).toBeTruthy();

            // chrome.storage.local data
            expect(payload.data.problems).toBeDefined();
            expect(payload.data.problems['two-sum'].title).toBe('1. Two Sum');
            expect(payload.data.activityLog).toEqual(['2026-03-01']);

            // IndexedDB data
            expect(payload.indexedDBData).toBeDefined();
            expect(payload.indexedDBData.drills).toHaveLength(1);
            expect(payload.indexedDBData.drills[0].skillId).toBe('arrays');
            expect(payload.indexedDBData.insights).toHaveLength(1);
            expect(payload.indexedDBData.insights[0].content).toBe('Off by one');
            expect(payload.indexedDBData.submissionLog).toHaveLength(1);
            expect(payload.indexedDBData.submissionLog[0].problemSlug).toBe('two-sum');

            // Counts
            expect(payload.counts.problemCount).toBe(1);
            expect(payload.counts.totalKeys).toBeGreaterThanOrEqual(3);
        });

        it('should work when IndexedDB stores are empty', async () => {
            chromeStorageData.theme = 'matrix';

            const payload = await BackupService.buildFullBackupPayload();

            expect(payload.backupSchemaVersion).toBe(2);
            expect(payload.data.theme).toBe('matrix');
            expect(payload.indexedDBData.drills).toEqual([]);
            expect(payload.indexedDBData.insights).toEqual([]);
            expect(payload.indexedDBData.submissionLog).toEqual([]);
        });

        it('should work when chrome.storage.local is empty', async () => {
            const payload = await BackupService.buildFullBackupPayload();

            expect(payload.backupSchemaVersion).toBe(2);
            expect(payload.data).toEqual({});
            expect(payload.indexedDBData).toBeDefined();
        });

        it('should include drills but no insights when only drills exist', async () => {
            const drill = DrillStoreMod.createDrill({
                type: 'spot-bug', skillId: 'dfs', content: 'Bug', answer: 'fix'
            });
            await drillStore.add(drill);

            const payload = await BackupService.buildFullBackupPayload();

            expect(payload.indexedDBData.drills).toHaveLength(1);
            expect(payload.indexedDBData.insights).toEqual([]);
            expect(payload.indexedDBData.submissionLog).toEqual([]);
        });
    });

    describe('extractBackupData', () => {
        it('should extract v2 backup with indexedDBData', () => {
            const parsed = {
                backupSchemaVersion: 2,
                data: { problems: {}, theme: 'neural' },
                indexedDBData: {
                    drills: [{ id: 'd1' }],
                    insights: [{ id: 'i1' }],
                    submissionLog: [{ id: 's1' }]
                },
                exportedAt: '2026-03-07T10:00:00.000Z'
            };

            const result = BackupService.extractBackupData(parsed);

            expect(result.storageData).toEqual({ problems: {}, theme: 'neural' });
            expect(result.indexedDBData.drills).toHaveLength(1);
            expect(result.indexedDBData.insights).toHaveLength(1);
            expect(result.indexedDBData.submissionLog).toHaveLength(1);
            expect(result.exportedAt).toBe('2026-03-07T10:00:00.000Z');
        });

        it('backward compat: should handle v1 backup (no indexedDBData)', () => {
            const parsed = {
                backupSchemaVersion: 1,
                data: { problems: { 'two-sum': { title: '1. Two Sum' } } },
                exportedAt: '2026-03-01T08:00:00.000Z'
            };

            const result = BackupService.extractBackupData(parsed);

            expect(result.storageData).toEqual({ problems: { 'two-sum': { title: '1. Two Sum' } } });
            expect(result.indexedDBData).toBeNull();
            expect(result.exportedAt).toBe('2026-03-01T08:00:00.000Z');
        });

        it('backward compat: should handle raw object without envelope', () => {
            const parsed = { problems: { 'median-of-two': { title: '4. Median' } } };

            const result = BackupService.extractBackupData(parsed);

            expect(result.storageData).toEqual(parsed);
            expect(result.indexedDBData).toBeNull();
            expect(result.exportedAt).toBe('');
        });

        it('should throw on invalid input (non-object)', () => {
            expect(() => BackupService.extractBackupData('not-json'))
                .toThrow();
        });

        it('should throw on null input', () => {
            expect(() => BackupService.extractBackupData(null))
                .toThrow();
        });

        it('should throw on array input', () => {
            expect(() => BackupService.extractBackupData([1, 2, 3]))
                .toThrow();
        });
    });

    describe('restoreFullBackup', () => {
        it('happy path: round-trip export → restore preserves all data', async () => {
            // Seed data
            chromeStorageData.problems = {
                'two-sum': { slug: 'two-sum', title: '1. Two Sum', difficulty: 'Easy', topics: ['Array'] }
            };
            chromeStorageData.activityLog = ['2026-03-01', '2026-03-02'];
            chromeStorageData.theme = 'neural';

            const drill = DrillStoreMod.createDrill({
                type: 'fill-in-blank', skillId: 'arrays', content: 'Q', answer: 'A'
            });
            await drillStore.add(drill);

            const insight = InsightsStoreMod.createInsight({
                content: 'Important insight', skillIds: ['dp']
            });
            await insightsStore.add(insight);

            await shadowLogger.log({
                problemSlug: 'two-sum', result: 'Accepted', language: 'python', code: 'pass'
            });

            // Export
            const payload = await BackupService.buildFullBackupPayload();

            // Clear everything
            clearChromeStorage();
            await drillStore.clear();
            await insightsStore.clear();
            await shadowLogger.clear();

            // Verify everything is empty
            expect(Object.keys(chromeStorageData)).toHaveLength(0);
            expect(await drillStore.getAll()).toHaveLength(0);
            expect(await insightsStore.getAll()).toHaveLength(0);
            expect((await shadowLogger.getStats()).totalSubmissions).toBe(0);

            // Restore
            await BackupService.restoreFullBackup(payload);

            // Verify chrome.storage.local
            expect(chromeStorageData.problems['two-sum'].title).toBe('1. Two Sum');
            expect(chromeStorageData.activityLog).toEqual(['2026-03-01', '2026-03-02']);
            expect(chromeStorageData.theme).toBe('neural');

            // Verify IndexedDB
            const restoredDrills = await drillStore.getAll();
            expect(restoredDrills).toHaveLength(1);
            expect(restoredDrills[0].skillId).toBe('arrays');

            const restoredInsights = await insightsStore.getAll();
            expect(restoredInsights).toHaveLength(1);
            expect(restoredInsights[0].content).toBe('Important insight');

            const logStats = await shadowLogger.getStats();
            expect(logStats.totalSubmissions).toBe(1);
        });

        it('should restore v1 backup (no IndexedDB section) without touching IndexedDB', async () => {
            // Pre-populate IndexedDB with existing data
            const existingDrill = DrillStoreMod.createDrill({
                type: 'critique', skillId: 'test', content: 'Existing', answer: 'x'
            });
            await drillStore.add(existingDrill);

            const v1Payload = {
                backupSchemaVersion: 1,
                data: { problems: { 'add-two': { title: '2. Add Two' } }, theme: 'sakura' },
                exportedAt: '2026-03-01T00:00:00.000Z'
            };

            await BackupService.restoreFullBackup(v1Payload);

            // chrome.storage.local should be restored
            expect(chromeStorageData.problems['add-two'].title).toBe('2. Add Two');

            // IndexedDB should be untouched — existing drill remains
            const drills = await drillStore.getAll();
            expect(drills).toHaveLength(1);
            expect(drills[0].skillId).toBe('test');
        });

        it('should restore when IndexedDB section has empty arrays', async () => {
            const payload = {
                backupSchemaVersion: 2,
                data: { theme: 'matrix' },
                indexedDBData: { drills: [], insights: [], submissionLog: [] },
                exportedAt: '2026-03-07T10:00:00.000Z'
            };

            await BackupService.restoreFullBackup(payload);

            expect(chromeStorageData.theme).toBe('matrix');
            expect(await drillStore.getAll()).toHaveLength(0);
            expect(await insightsStore.getAll()).toHaveLength(0);
        });

        it('should handle missing fields in indexedDBData gracefully', async () => {
            const payload = {
                backupSchemaVersion: 2,
                data: { theme: 'sakura' },
                indexedDBData: { drills: [{ id: 'd1', type: 'spot-bug', skillId: 'x', status: 'pending' }] },
                exportedAt: '2026-03-07T00:00:00.000Z'
            };

            // Should not throw even though insights and submissionLog are missing
            await BackupService.restoreFullBackup(payload);

            const drills = await drillStore.getAll();
            expect(drills).toHaveLength(1);
        });
    });

    describe('summarizeStorageSnapshot', () => {
        it('should count problems and keys', () => {
            const data = {
                problems: { a: {}, b: {}, c: {} },
                activityLog: ['2026-03-01', '2026-03-02'],
                theme: 'sakura'
            };
            const summary = BackupService.summarizeStorageSnapshot(data);

            expect(summary.totalKeys).toBe(3);
            expect(summary.problemCount).toBe(3);
            expect(summary.activityDays).toBe(2);
        });

        it('should handle empty/undefined input', () => {
            expect(BackupService.summarizeStorageSnapshot({}).totalKeys).toBe(0);
            expect(BackupService.summarizeStorageSnapshot(undefined).totalKeys).toBe(0);
            expect(BackupService.summarizeStorageSnapshot(null).totalKeys).toBe(0);
        });

        it('should handle problems that is not a plain object', () => {
            const data = { problems: 'corrupted', activityLog: null };
            const summary = BackupService.summarizeStorageSnapshot(data);

            expect(summary.problemCount).toBe(0);
            expect(summary.activityDays).toBe(0);
        });
    });

    describe('idempotency', () => {
        it('restoring same backup twice should yield identical state', async () => {
            chromeStorageData.problems = {
                'x': { slug: 'x', title: 'X', difficulty: 'Hard' }
            };
            const drill = DrillStoreMod.createDrill({
                type: 'fill-in-blank', skillId: 'dp', content: 'Q', answer: 'A'
            });
            await drillStore.add(drill);

            const payload = await BackupService.buildFullBackupPayload();

            // Restore twice
            clearChromeStorage();
            await drillStore.clear();
            await BackupService.restoreFullBackup(payload);

            clearChromeStorage();
            await drillStore.clear();
            await BackupService.restoreFullBackup(payload);

            expect(chromeStorageData.problems['x'].title).toBe('X');
            const drills = await drillStore.getAll();
            expect(drills).toHaveLength(1);
        });
    });
});
