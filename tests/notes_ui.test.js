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
                extractProblemDetails: jest.fn()
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
});
