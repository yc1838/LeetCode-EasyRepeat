
const fs = require('fs');
const path = require('path');

describe('Storage Layer - Activity Log', () => {
    let window;

    beforeEach(() => {
        // Mock Browser Environment
        window = {
            chrome: {
                runtime: { id: 'test-id' },
                storage: {
                    local: {
                        get: jest.fn().mockImplementation((defaults) => {
                            if (defaults.activityLog !== undefined) {
                                return Promise.resolve({ activityLog: window.mockStorage.activityLog || defaults.activityLog });
                            }
                            return Promise.resolve({ problems: window.mockStorage.problems || defaults.problems });
                        }),
                        set: jest.fn().mockImplementation((data) => {
                            window.mockStorage = { ...window.mockStorage, ...data };
                            return Promise.resolve();
                        })
                    }
                }
            }
        };
        window.mockStorage = { problems: {}, activityLog: [] };
        global.window = window;
        global.chrome = window.chrome;
        global.self = window;
    });

    afterEach(() => {
        delete global.window;
        delete global.chrome;
        delete global.self;
    });

    test('should export logActivity and getActivityLog', () => {
        const module = undefined; // Force Browser Mode
        const exports = undefined;
        const script = fs.readFileSync(path.resolve(__dirname, '../src/shared/storage.js'), 'utf8');
        eval(script);

        expect(window.logActivity).toBeDefined();
        expect(window.getActivityLog).toBeDefined();
    });

    test('logActivity should store dates correctly (handling local string input)', async () => {
        const module = undefined;
        const exports = undefined;
        const script = fs.readFileSync(path.resolve(__dirname, '../src/shared/storage.js'), 'utf8');
        eval(script);

        // test YYYY-MM-DD input
        await window.logActivity('2026-01-24');
        expect(window.mockStorage.activityLog).toContain('2026-01-24');

        // Check duplicate handling
        await window.logActivity('2026-01-24');
        expect(window.mockStorage.activityLog.length).toBe(1);
    });
});
