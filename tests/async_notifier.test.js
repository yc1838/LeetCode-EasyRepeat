/**
 * @jest-environment jsdom
 */

/**
 * Tests for AsyncNotifier module.
 * Chrome notifications for drill completion when tab is inactive.
 */

describe('AsyncNotifier', () => {
    let AsyncNotifier;
    let mockChrome;

    beforeEach(() => {
        jest.resetModules();

        // Mock chrome.notifications API
        mockChrome = {
            notifications: {
                create: jest.fn((id, options, callback) => {
                    if (callback) callback(id);
                }),
                clear: jest.fn((id, callback) => {
                    if (callback) callback(true);
                }),
                onClicked: {
                    addListener: jest.fn()
                }
            },
            storage: {
                local: {
                    get: jest.fn().mockResolvedValue({ notificationsEnabled: true })
                }
            },
            runtime: {
                getURL: jest.fn(path => `chrome-extension://abc123/${path}`)
            },
            tabs: {
                create: jest.fn()
            }
        };
        global.chrome = mockChrome;

        AsyncNotifier = require('../src/background/async_notifier');
    });

    afterEach(() => {
        delete global.chrome;
        jest.restoreAllMocks();
    });

    describe('notify', () => {
        it('should create a notification for successful drill completion', async () => {
            const drillId = 'drill-123';
            const result = {
                success: true,
                passedCount: 3,
                totalCount: 3,
                skillId: 'binary_search'
            };

            await AsyncNotifier.notify(drillId, result);

            expect(mockChrome.notifications.create).toHaveBeenCalledWith(
                expect.stringContaining('drill'),
                expect.objectContaining({
                    type: 'basic',
                    iconUrl: expect.any(String),
                    title: expect.stringContaining('Complete'),
                    message: expect.stringContaining('3/3')
                }),
                expect.any(Function)
            );
        });

        it('should create a notification for failed drill', async () => {
            const drillId = 'drill-456';
            const result = {
                success: false,
                passedCount: 1,
                totalCount: 3,
                skillId: 'dfs',
                error: 'Runtime Error'
            };

            await AsyncNotifier.notify(drillId, result);

            expect(mockChrome.notifications.create).toHaveBeenCalledWith(
                expect.stringContaining('drill'),
                expect.objectContaining({
                    title: expect.stringContaining('Needs Work')
                }),
                expect.any(Function)
            );
        });

        it('should not create notification if notifications are disabled', async () => {
            mockChrome.storage.local.get.mockResolvedValue({ notificationsEnabled: false });

            await AsyncNotifier.notify('drill-789', { success: true });

            expect(mockChrome.notifications.create).not.toHaveBeenCalled();
        });
    });

    describe('isEnabled', () => {
        it('should return true when notifications are enabled in settings', async () => {
            mockChrome.storage.local.get.mockResolvedValue({ notificationsEnabled: true });

            const enabled = await AsyncNotifier.isEnabled();

            expect(enabled).toBe(true);
        });

        it('should return false when notifications are disabled', async () => {
            mockChrome.storage.local.get.mockResolvedValue({ notificationsEnabled: false });

            const enabled = await AsyncNotifier.isEnabled();

            expect(enabled).toBe(false);
        });

        it('should default to true if setting is not found', async () => {
            mockChrome.storage.local.get.mockResolvedValue({});

            const enabled = await AsyncNotifier.isEnabled();

            expect(enabled).toBe(true);
        });
    });

    describe('clearNotification', () => {
        it('should clear the specified notification', async () => {
            await AsyncNotifier.clearNotification('drill-123');

            expect(mockChrome.notifications.clear).toHaveBeenCalledWith(
                'drill-123',
                expect.any(Function)
            );
        });
    });
});
