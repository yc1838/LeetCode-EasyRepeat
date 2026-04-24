/**
 * @jest-environment jsdom
 */

describe('LLM Sidecar - Caveman Mode', () => {
    let LLMSidecar;

    beforeEach(() => {
        // Mock chrome storage
        global.chrome = {
            storage: {
                local: {
                    get: jest.fn().mockResolvedValue({
                        aiProvider: 'local',
                        isCavemanMode: false,
                        keys: { google: 'test', openai: 'test', anthropic: 'test' }
                    }),
                    set: jest.fn().mockResolvedValue(),
                    onChanged: { addListener: jest.fn() }
                }
            },
            runtime: {
                id: 'test-id',
                sendMessage: jest.fn(),
                onMessage: { addListener: jest.fn() },
                connect: jest.fn(() => ({
                    onMessage: { addListener: jest.fn() },
                    onDisconnect: { addListener: jest.fn() },
                    postMessage: jest.fn()
                }))
            }
        };

        // Mock fetch
        global.fetch = jest.fn(() =>
            Promise.resolve({
                json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: '{"root_cause": "test", "anti_pattern": "test"}' }] } }] }),
                ok: true
            })
        );

        // Mock VectorDB
        window.VectorDB = {
            search: jest.fn().mockResolvedValue([]),
            add: jest.fn().mockResolvedValue()
        };

        // Clear document
        document.body.innerHTML = '';

        // Load sidecar
        jest.isolateModules(() => {
            require('../src/content/llm_sidecar.js');
        });
        LLMSidecar = window.LLMSidecar;
    });

    test('should inject caveman persona when isCavemanMode is true', async () => {
        // 1. Setup state with Caveman Mode ON
        chrome.storage.local.get.mockResolvedValue({
            isCavemanMode: true,
            aiProvider: 'google',
            keys: { google: 'test' },
            selectedModelId: 'gemini-1.5-flash'
        });

        await LLMSidecar.init();

        // 2. Trigger analysis
        await LLMSidecar.analyzeMistake('print(x)', 'NameError', { title: 'Test', difficulty: 'Easy' });

        // 3. Verify fetch was called with caveman instructions in the prompt
        // Filter for generateContent calls
        const generateContentCall = global.fetch.mock.calls.find(call => call[0].includes('generateContent'));
        expect(generateContentCall).toBeDefined();

        const lastCallBody = JSON.parse(generateContentCall[1].body);
        const promptText = lastCallBody.contents[0].parts[0].text;

        expect(promptText).toContain('Respond like a SMART CAVEMAN');
        expect(promptText).toContain('Cut ALL articles (a, an, the)');
    });

    test('should NOT inject caveman persona when isCavemanMode is false', async () => {
        // 1. Setup state with Caveman Mode OFF
        chrome.storage.local.get.mockResolvedValue({
            isCavemanMode: false,
            aiProvider: 'google',
            keys: { google: 'test' },
            selectedModelId: 'gemini-1.5-flash'
        });

        await LLMSidecar.init();

        // 2. Trigger analysis
        await LLMSidecar.analyzeMistake('print(x)', 'NameError', { title: 'Test', difficulty: 'Easy' });

        // 3. Verify fetch does NOT contain caveman instructions
        const generateContentCall = global.fetch.mock.calls.find(call => call[0].includes('generateContent'));
        expect(generateContentCall).toBeDefined();

        const lastCallBody = JSON.parse(generateContentCall[1].body);
        const promptText = lastCallBody.contents[0].parts[0].text;

        expect(promptText).not.toContain('Respond like a smart caveman');
    });
});
