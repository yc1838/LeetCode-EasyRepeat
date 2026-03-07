/**
 * Drill Init Logic Tests
 *
 * These tests focus on the navigation flow:
 * - load session from storage
 * - render drill by drillId from URL
 * - skip/next should move forward instead of looping
 */

const { JSDOM } = require('jsdom');

const flushPromises = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

function setupDom(search = '?drillId=drill1') {
    const dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
        <body>
            <div id="drill-content"></div>
            <div id="session-time"></div>
            <div id="current-skill"></div>
            <div id="drill-progress"></div>
            <div id="progress-fill"></div>
            <div id="drill-result" style="display:none;"></div>
        </body>
        </html>
    `, {
        url: `chrome-extension://test-id/src/drills/drills.html${search}`
    });

    global.window = dom.window;
    global.document = dom.window.document;
    global.HTMLElement = dom.window.HTMLElement;

    // JSDOM's location is read-only; override with a simple mutable object.
    const location = { href: dom.window.location.href, search };
    Object.defineProperty(global.window, 'location', {
        value: location,
        writable: true
    });

    return dom;
}

function installGlobals({ session, drillMarkup } = {}) {
    const defaultSession = {
        drills: [
            { id: 'drill1', type: 'fill-in-blank', skillId: 'arrays' }
        ],
        currentDrill: { id: 'drill1', type: 'fill-in-blank', skillId: 'arrays' },
        startTime: Date.now()
    };

    global.chrome = {
        storage: {
            local: {
                get: jest.fn().mockResolvedValue({
                    currentDrillSession: session || defaultSession
                }),
                set: jest.fn().mockResolvedValue(true)
            }
        },
        runtime: {
            getURL: jest.fn(path => `chrome-extension://test-id/${path}`)
        }
    };

    const html = drillMarkup || `
        <div class="drill-container">
            <input id="drill-answer" value="answer" />
            <button id="btn-submit">Submit</button>
            <button id="btn-skip">Skip</button>
        </div>
    `;

    global.DrillPage = {
        getDrillFromURL: jest.fn(search => new URLSearchParams(search).get('drillId')),
        getDrillPageURL: jest.fn(id => `chrome-extension://test-id/src/drills/drills.html?drillId=${id}`),
        getSkillDisplayName: jest.fn(id => id),
        renderDrillContent: jest.fn(() => html),
        getUserAnswer: jest.fn(() => 'answer'),
        renderResult: jest.fn(() => '<div class="result-actions"></div>')
    };

    global.DrillTracker = {
        recordAttempt: jest.fn().mockResolvedValue(true)
    };

    global.confirm = jest.fn(() => true);
    global.window.confirm = global.confirm;
}

describe('drill_init navigation flow', () => {
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

    test('renders the drill that matches drillId in the URL and updates progress', async () => {
        setupDom('?drillId=drill2');

        const session = {
            drills: [
                { id: 'drill1', type: 'fill-in-blank', skillId: 'arrays' },
                { id: 'drill2', type: 'fill-in-blank', skillId: 'hash_map' }
            ],
            currentDrill: { id: 'drill1', type: 'fill-in-blank', skillId: 'arrays' },
            startTime: Date.now()
        };

        installGlobals({ session });

        require('../src/drills/drill_init');
        await flushPromises();

        expect(global.DrillPage.renderDrillContent).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'drill2' })
        );

        expect(document.getElementById('drill-progress').textContent).toBe('Drill 2 of 2');
        expect(document.getElementById('progress-fill').style.width).toBe('100%');
    });

    test('falls back to the first drill when drillId is not found', async () => {
        setupDom('?drillId=missing');

        const session = {
            drills: [
                { id: 'drill1', type: 'fill-in-blank', skillId: 'arrays' },
                { id: 'drill2', type: 'fill-in-blank', skillId: 'hash_map' }
            ],
            currentDrill: { id: 'drill1', type: 'fill-in-blank', skillId: 'arrays' },
            startTime: Date.now()
        };

        installGlobals({ session });

        require('../src/drills/drill_init');
        await flushPromises();

        expect(global.DrillPage.renderDrillContent).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'drill1' })
        );
        expect(document.getElementById('drill-progress').textContent).toBe('Drill 1 of 2');
    });

    test('skip navigates to the next drill in the session', async () => {
        setupDom('?drillId=drill1');

        const session = {
            drills: [
                { id: 'drill1', type: 'fill-in-blank', skillId: 'arrays' },
                { id: 'drill2', type: 'fill-in-blank', skillId: 'hash_map' }
            ],
            currentDrill: { id: 'drill1', type: 'fill-in-blank', skillId: 'arrays' },
            startTime: Date.now()
        };

        installGlobals({ session });

        require('../src/drills/drill_init');
        await flushPromises();

        document.getElementById('btn-skip').click();
        await flushPromises();

        expect(global.confirm).toHaveBeenCalled();
        expect(global.window.location.href).toBe(
            'chrome-extension://test-id/src/drills/drills.html?drillId=drill2'
        );
    });

    test('skip does not navigate when user cancels confirm', async () => {
        setupDom('?drillId=drill1');

        const session = {
            drills: [
                { id: 'drill1', type: 'fill-in-blank', skillId: 'arrays' },
                { id: 'drill2', type: 'fill-in-blank', skillId: 'hash_map' }
            ],
            currentDrill: { id: 'drill1', type: 'fill-in-blank', skillId: 'arrays' },
            startTime: Date.now()
        };

        installGlobals({ session });
        global.confirm = jest.fn(() => false);
        global.window.confirm = global.confirm;

        const initialHref = global.window.location.href;

        require('../src/drills/drill_init');
        await flushPromises();

        document.getElementById('btn-skip').click();
        await flushPromises();

        expect(global.confirm).toHaveBeenCalled();
        expect(global.window.location.href).toBe(initialHref);
    });

    test('skip on last drill shows completion screen', async () => {
        setupDom('?drillId=drill1');

        const session = {
            drills: [
                { id: 'drill1', type: 'fill-in-blank', skillId: 'arrays' }
            ],
            currentDrill: { id: 'drill1', type: 'fill-in-blank', skillId: 'arrays' },
            startTime: Date.now()
        };

        installGlobals({ session });

        require('../src/drills/drill_init');
        await flushPromises();

        document.getElementById('btn-skip').click();
        await flushPromises();

        expect(document.getElementById('drill-content').innerHTML).toContain('Session Complete!');
    });

    test('missing drillId shows an error state and exits early', async () => {
        setupDom('');

        installGlobals();

        require('../src/drills/drill_init');
        await flushPromises();

        const content = document.getElementById('drill-content').innerHTML;
        expect(content).toContain('No drill specified');
    });
});
