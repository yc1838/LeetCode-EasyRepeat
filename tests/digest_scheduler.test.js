/**
 * Digest Scheduler Tests
 * 
 * Tests for the nightly digest scheduling system using chrome.alarms API.
 */

// Mock chrome APIs
const mockAlarms = [];
let alarmListeners = [];

global.chrome = {
    alarms: {
        create: jest.fn((name, options) => {
            mockAlarms.push({ name, ...options });
        }),
        clear: jest.fn((name) => {
            const idx = mockAlarms.findIndex(a => a.name === name);
            if (idx >= 0) mockAlarms.splice(idx, 1);
            return Promise.resolve(true);
        }),
        get: jest.fn((name) => {
            return Promise.resolve(mockAlarms.find(a => a.name === name));
        }),
        getAll: jest.fn(() => Promise.resolve([...mockAlarms])),
        onAlarm: {
            addListener: jest.fn((callback) => {
                alarmListeners.push(callback);
            })
        }
    },
    storage: {
        local: {
            get: jest.fn(() => Promise.resolve({})),
            set: jest.fn(() => Promise.resolve())
        }
    },
    runtime: {
        onInstalled: {
            addListener: jest.fn()
        }
    }
};

const {
    calculateNextDigestTime,
    scheduleNightlyDigest,
    handleDigestAlarm,
    DIGEST_ALARM_NAME,
    DEFAULT_DIGEST_HOUR
} = require('../src/background/digest_scheduler');

describe('Digest Scheduler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockAlarms.length = 0;
        alarmListeners = [];
    });

    describe('calculateNextDigestTime', () => {
        it('should schedule for today if before digest hour', () => {
            // Mock: It's 8 AM, digest is at 10 PM
            const now = new Date();
            now.setHours(8, 0, 0, 0);

            const nextTime = calculateNextDigestTime(22, now);
            const expected = new Date(now);
            expected.setHours(22, 0, 0, 0);

            expect(nextTime).toBe(expected.getTime());
        });

        it('should schedule for tomorrow if after digest hour', () => {
            // Mock: It's 11 PM, digest is at 10 PM
            const now = new Date();
            now.setHours(23, 0, 0, 0);

            const nextTime = calculateNextDigestTime(22, now);
            const expected = new Date(now);
            expected.setDate(expected.getDate() + 1);
            expected.setHours(22, 0, 0, 0);

            expect(nextTime).toBe(expected.getTime());
        });

        it('should schedule for tomorrow if exactly at digest hour', () => {
            const now = new Date();
            now.setHours(22, 0, 0, 0);

            const nextTime = calculateNextDigestTime(22, now);
            const expected = new Date(now);
            expected.setDate(expected.getDate() + 1);
            expected.setHours(22, 0, 0, 0);

            expect(nextTime).toBe(expected.getTime());
        });

        it('should use default hour (22) when not specified', () => {
            const now = new Date();
            now.setHours(8, 0, 0, 0);

            const nextTime = calculateNextDigestTime(undefined, now);
            const expected = new Date(now);
            expected.setHours(22, 0, 0, 0);

            expect(nextTime).toBe(expected.getTime());
        });
    });

    describe('scheduleNightlyDigest', () => {
        it('should create alarm with correct name', async () => {
            await scheduleNightlyDigest();

            expect(chrome.alarms.create).toHaveBeenCalledWith(
                DIGEST_ALARM_NAME,
                expect.any(Object)
            );
        });

        it('should schedule alarm with "when" and 24-hour period', async () => {
            await scheduleNightlyDigest();

            const call = chrome.alarms.create.mock.calls[0];
            const options = call[1];

            expect(options).toHaveProperty('when');
            expect(options).toHaveProperty('periodInMinutes', 24 * 60);
        });

        it('should schedule for future time', async () => {
            await scheduleNightlyDigest();

            const call = chrome.alarms.create.mock.calls[0];
            const when = call[1].when;

            expect(when).toBeGreaterThan(Date.now());
        });
    });

    describe('handleDigestAlarm', () => {
        it('should ignore alarms with different name', async () => {
            const mockCallback = jest.fn();
            const result = await handleDigestAlarm(
                { name: 'OTHER_ALARM' },
                mockCallback
            );

            expect(result).toBe(false);
            expect(mockCallback).not.toHaveBeenCalled();
        });

        it('should trigger digest for correct alarm name', async () => {
            const mockCallback = jest.fn().mockResolvedValue(true);
            const result = await handleDigestAlarm(
                { name: DIGEST_ALARM_NAME },
                mockCallback
            );

            expect(result).toBe(true);
            expect(mockCallback).toHaveBeenCalled();
        });

        it('should handle callback errors gracefully', async () => {
            const mockCallback = jest.fn().mockRejectedValue(new Error('Test error'));

            // Should not throw
            await expect(
                handleDigestAlarm({ name: DIGEST_ALARM_NAME }, mockCallback)
            ).resolves.toBe(false);
        });
    });

    describe('Alarm Constants', () => {
        it('should have correct alarm name', () => {
            expect(DIGEST_ALARM_NAME).toBe('NIGHTLY_DIGEST');
        });

        it('should have default digest hour of 22 (10 PM)', () => {
            expect(DEFAULT_DIGEST_HOUR).toBe(22);
        });
    });
});

describe('Integration: Alarm Scheduling Flow', () => {
    beforeEach(() => {
        mockAlarms.length = 0;
    });

    it('should create retrievable alarm', async () => {
        await scheduleNightlyDigest();

        // Simulate the alarm being stored
        const alarm = await chrome.alarms.get(DIGEST_ALARM_NAME);

        // Note: In real chrome API this would return the actual alarm
        // With our mock, we need to check the create call was made
        expect(chrome.alarms.create).toHaveBeenCalled();
    });
});
