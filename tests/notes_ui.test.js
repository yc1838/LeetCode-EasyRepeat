/**
 * @jest-environment jsdom
 */

const contentUI = require('../src/content/content_ui');

describe('Notes UI', () => {
    test('createNotesWidget should return a container element', () => {
        const loadFn = jest.fn();
        const saveFn = jest.fn();
        const widget = contentUI.createNotesWidget('test-slug', loadFn, saveFn);

        expect(widget.tagName).toBe('DIV');
        expect(widget.className).toBe('lc-notes-container');
        expect(widget.querySelector('.lc-notes-handle')).not.toBeNull();
        expect(widget.querySelector('.lc-notes-panel')).not.toBeNull();
    });

    describe('insertNotesButton', () => {
        let deps;

        beforeEach(() => {
            document.body.innerHTML = ''; // Reset DOM
            deps = {
                getCurrentProblemSlug: jest.fn(),
                getNotes: jest.fn(),
                saveNotes: jest.fn(),
            };
        });

        test('should do nothing if dependencies missing', () => {
            contentUI.insertNotesButton({});
            expect(document.querySelector('.lc-notes-container')).toBeNull();
        });

        test('should insert widget if none exists', () => {
            deps.getCurrentProblemSlug.mockReturnValue('two-sum');
            contentUI.insertNotesButton(deps);

            const widget = document.querySelector('.lc-notes-container');
            expect(widget).not.toBeNull();
            expect(widget.dataset.slug).toBe('two-sum');
        });

        test('should not replace widget if slug is same', () => {
            deps.getCurrentProblemSlug.mockReturnValue('two-sum');

            // First call
            contentUI.insertNotesButton(deps);
            const w1 = document.querySelector('.lc-notes-container');

            // Second call
            contentUI.insertNotesButton(deps);
            const w2 = document.querySelector('.lc-notes-container');

            expect(w1).toBe(w2); // Should be same element reference
        });

        test('should replace widget if slug changed', () => {
            deps.getCurrentProblemSlug.mockReturnValue('two-sum');
            contentUI.insertNotesButton(deps);
            const w1 = document.querySelector('.lc-notes-container');
            expect(w1.dataset.slug).toBe('two-sum');

            // Change slug
            deps.getCurrentProblemSlug.mockReturnValue('three-sum');
            contentUI.insertNotesButton(deps);
            const w2 = document.querySelector('.lc-notes-container');

            expect(w2.dataset.slug).toBe('three-sum');
            expect(w2).not.toBe(w1); // Should be new element
        });
    });

    describe('theme sync', () => {
        let deps;
        let currentTheme;
        let storageListeners;

        beforeEach(() => {
            document.body.innerHTML = '';
            deps = {
                getCurrentProblemSlug: jest.fn(),
                getNotes: jest.fn(),
                saveNotes: jest.fn(),
            };

            currentTheme = 'matrix';
            storageListeners = [];

            global.chrome = {
                runtime: {
                    id: 'test-extension',
                    lastError: null
                },
                storage: {
                    local: {
                        get: jest.fn((keys, callback) => {
                            const result = {};
                            if (keys && typeof keys === 'object' && Object.prototype.hasOwnProperty.call(keys, 'theme')) {
                                result.theme = currentTheme;
                            }
                            if (Array.isArray(keys) && keys.includes('seenDragTooltip')) {
                                result.seenDragTooltip = true;
                            }
                            callback(result);
                        }),
                        set: jest.fn()
                    },
                    onChanged: {
                        addListener: jest.fn((listener) => storageListeners.push(listener)),
                        removeListener: jest.fn((listener) => {
                            storageListeners = storageListeners.filter((item) => item !== listener);
                        })
                    }
                }
            };
        });

        afterEach(() => {
            delete global.chrome;
        });

        test('should re-sync theme for the existing widget on repeat insert attempts', async () => {
            deps.getCurrentProblemSlug.mockReturnValue('two-sum');

            contentUI.insertNotesButton(deps);
            const widget = document.querySelector('.lc-notes-container');
            expect(widget.classList.contains('theme-sakura')).toBe(false);

            currentTheme = 'sakura';
            contentUI.insertNotesButton(deps);
            await Promise.resolve();

            expect(document.querySelector('.lc-notes-container')).toBe(widget);
            expect(widget.classList.contains('theme-sakura')).toBe(true);
        });

        test('should re-read storage on theme changes instead of trusting stale event payloads', async () => {
            deps.getCurrentProblemSlug.mockReturnValue('two-sum');

            contentUI.insertNotesButton(deps);
            const widget = document.querySelector('.lc-notes-container');
            expect(widget.classList.contains('theme-sakura')).toBe(false);

            currentTheme = 'sakura';
            storageListeners.forEach((listener) => listener({
                theme: {
                    oldValue: 'matrix',
                    newValue: 'matrix'
                }
            }, 'local'));
            await Promise.resolve();

            expect(widget.classList.contains('theme-sakura')).toBe(true);
        });

        test('should not throw when extension context is invalidated (chrome.runtime.id is falsy)', () => {
            deps.getCurrentProblemSlug.mockReturnValue('two-sum');

            // First insert with valid context
            contentUI.insertNotesButton(deps);
            const widget = document.querySelector('.lc-notes-container');
            expect(widget).not.toBeNull();

            // Simulate extension context invalidation
            global.chrome.runtime.id = undefined;

            // Re-insert should NOT throw even with invalid context
            expect(() => {
                contentUI.insertNotesButton(deps);
            }).not.toThrow();

            // Widget should still exist
            expect(document.querySelector('.lc-notes-container')).not.toBeNull();
        });

        test('should not throw when chrome.storage.local.get throws due to invalidated context', async () => {
            // Set up chrome.storage.local.get to throw (simulates invalidated context)
            global.chrome.storage.local.get = jest.fn(() => {
                throw new Error('Extension context invalidated.');
            });

            deps.getCurrentProblemSlug.mockReturnValue('three-sum');

            // Should not throw
            expect(() => {
                contentUI.insertNotesButton(deps);
            }).not.toThrow();

            const widget = document.querySelector('.lc-notes-container');
            expect(widget).not.toBeNull();
        });

        test('should not throw when onChanged listener fires after context invalidation', async () => {
            deps.getCurrentProblemSlug.mockReturnValue('two-sum');

            contentUI.insertNotesButton(deps);

            // Invalidate context
            global.chrome.runtime.id = undefined;
            global.chrome.storage.local.get = jest.fn(() => {
                throw new Error('Extension context invalidated.');
            });

            // Fire theme change event — should not throw
            expect(() => {
                storageListeners.forEach((listener) => listener({
                    theme: { oldValue: 'matrix', newValue: 'sakura' }
                }, 'local'));
            }).not.toThrow();
        });
    });
});
