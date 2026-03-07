/**
 * Drill Overview -> Session Start Tests
 *
 * Verify that clicking "Start Review" stores a session and navigates to drills.html.
 */

const { JSDOM } = require('jsdom');

const flushPromises = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

function setupDom() {
    const dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
        <body>
            <main>
                <div id="scroller">
                    <div id="card"></div>
                </div>
                <button id="btn-start">Start</button>
            </main>
            <ul id="folder-list"></ul>
        </body>
        </html>
    `, {
        url: 'chrome-extension://test-id/src/drills/drill_overview.html'
    });

    global.window = dom.window;
    global.document = dom.window.document;
    global.HTMLElement = dom.window.HTMLElement;

    // Ensure getSelection exists (used by click-to-flip logic).
    if (!global.window.getSelection) {
        global.window.getSelection = () => ({ toString: () => '' });
    }

    const location = { href: dom.window.location.href };
    Object.defineProperty(global.window, 'location', {
        value: location,
        writable: true
    });

    return dom;
}

describe('drill_overview start session', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.clearAllTimers();
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    test('clicking start stores currentDrillSession and navigates to first drill', async () => {
        setupDom();

        const drills = [
            { id: 'drillA', type: 'fill-in-blank', skillId: 'arrays', status: 'pending', content: 'x' },
            { id: 'drillB', type: 'spot-bug', skillId: 'hash_map', status: 'pending', content: 'y' }
        ];

        global.chrome = {
            storage: {
                local: {
                    set: jest.fn().mockResolvedValue(true)
                }
            },
            runtime: {
                getURL: jest.fn(path => `chrome-extension://test-id/${path}`)
            }
        };

        global.window.DrillStore = {
            DrillStore: class {
                async init() { }
                async getAll() {
                    return drills;
                }
            }
        };

        require('../src/drills/drill_overview');
        await flushPromises();

        // Allow selectFolder's animation delay to run so button state is updated.
        jest.advanceTimersByTime(350);

        const btnStart = document.getElementById('btn-start');
        btnStart.click();
        await flushPromises();

        expect(global.chrome.storage.local.set).toHaveBeenCalledWith(
            expect.objectContaining({
                currentDrillSession: expect.objectContaining({
                    drills: drills,
                    currentDrill: drills[0]
                })
            })
        );

        expect(global.window.location.href).toBe(
            'chrome-extension://test-id/dist/src/drills/drills.html?drillId=drillA'
        );
    });
});
