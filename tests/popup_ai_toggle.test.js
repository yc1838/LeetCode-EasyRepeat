/**
 * @jest-environment jsdom
 */

describe('Popup AI Mode Toggle', () => {
    beforeEach(() => {
        document.body.innerHTML = '<button id="ai-mode-toggle"></button>';

        global.chrome = {
            storage: {
                local: {
                    get: jest.fn(),
                    set: jest.fn().mockResolvedValue()
                }
            }
        };

        jest.resetModules();
    });

    test('renders ON state when enabled in storage', async () => {
        global.chrome.storage.local.get.mockResolvedValue({ aiAnalysisEnabled: true });

        const popup = require('../src/popup/popup.js');
        await popup.setupAiModeToggle();

        const btn = document.getElementById('ai-mode-toggle');
        expect(btn.textContent).toBe('AI_MODE: ON');
        expect(btn.classList.contains('on')).toBe(true);
    });

    test('toggles state and persists to storage', async () => {
        global.chrome.storage.local.get.mockResolvedValue({ aiAnalysisEnabled: false });

        const popup = require('../src/popup/popup.js');
        await popup.setupAiModeToggle();

        const btn = document.getElementById('ai-mode-toggle');
        await btn.onclick();

        expect(btn.textContent).toBe('AI_MODE: ON');
        expect(global.chrome.storage.local.set).toHaveBeenCalledWith({ aiAnalysisEnabled: true });
    });
});
