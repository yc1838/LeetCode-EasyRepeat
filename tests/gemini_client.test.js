/**
 * Gemini API Client Tests (TDD)
 * 
 * Tests for the Gemini API client with retry/backoff logic.
 */

// Mock fetch globally
global.fetch = jest.fn();

// Mock chrome storage for API key
global.chrome = {
    storage: {
        local: {
            get: jest.fn(() => Promise.resolve({ geminiApiKey: 'test-api-key' })),
            set: jest.fn(() => Promise.resolve())
        }
    }
};

describe('Gemini API Client', () => {
    let GeminiClient;

    beforeAll(() => {
        GeminiClient = require('../src/background/gemini_client');
    });

    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch.mockReset();
    });

    describe('analyzeSubmissions', () => {
        it('should call Gemini API with formatted prompt', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    candidates: [{
                        content: {
                            parts: [{ text: '{"skillUpdates": [], "insights": []}' }]
                        }
                    }]
                })
            });

            const prompt = 'Test prompt for analysis';
            await GeminiClient.analyzeSubmissions(prompt);

            expect(global.fetch).toHaveBeenCalledTimes(1);
            const [url, options] = global.fetch.mock.calls[0];
            expect(url).toContain('generativelanguage.googleapis.com');
            expect(options.method).toBe('POST');
            const body = JSON.parse(options.body);
            expect(body.generationConfig.temperature).toBe(1);
            expect(body.generationConfig.responseMimeType).toBe('application/json');
        });

        it('should parse skill updates from response', async () => {
            const mockResponse = {
                skillUpdates: [
                    { skillId: 'binary_search_basic', delta: -10, reason: 'Off-by-one error' },
                    { skillId: 'edge_empty', delta: -5, reason: 'Forgot empty check' }
                ],
                insights: ['Struggles with boundary conditions'],
                recommendedDrills: []
            };

            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    candidates: [{
                        content: {
                            parts: [{ text: JSON.stringify(mockResponse) }]
                        }
                    }]
                })
            });

            const result = await GeminiClient.analyzeSubmissions('test prompt');

            expect(result.skillUpdates).toHaveLength(2);
            expect(result.skillUpdates[0].skillId).toBe('binary_search_basic');
            expect(result.insights).toContain('Struggles with boundary conditions');
        });

        it('should handle API errors gracefully', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error'
            });

            const result = await GeminiClient.analyzeSubmissions('test', { maxRetries: 1 });

            expect(result).toHaveProperty('error');
        });

        it('should handle malformed JSON response', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    candidates: [{
                        content: {
                            parts: [{ text: 'not valid json' }]
                        }
                    }]
                })
            });

            const result = await GeminiClient.analyzeSubmissions('test', { maxRetries: 1 });

            expect(result).toHaveProperty('error');
            expect(global.fetch).toHaveBeenCalledTimes(1);
        });

        it('should retry when first response JSON is malformed', async () => {
            global.fetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({
                        candidates: [{ content: { parts: [{ text: 'not valid json' }] } }]
                    })
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({
                        candidates: [{ content: { parts: [{ text: '{"skillUpdates":[],"insights":[]}' }] } }]
                    })
                });

            const result = await GeminiClient.analyzeSubmissions('test', { maxRetries: 2 });
            expect(global.fetch).toHaveBeenCalledTimes(2);
            expect(Array.isArray(result.skillUpdates)).toBe(true);
        });
    });

    describe('retry logic', () => {
        it('should retry on transient errors', async () => {
            // First call fails, second succeeds
            global.fetch
                .mockResolvedValueOnce({ ok: false, status: 503 })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({
                        candidates: [{
                            content: { parts: [{ text: '{"skillUpdates": []}' }] }
                        }]
                    })
                });

            const result = await GeminiClient.analyzeSubmissions('test', { maxRetries: 2 });

            expect(global.fetch).toHaveBeenCalledTimes(2);
            expect(result.skillUpdates).toBeDefined();
        });

        it('should not retry on 4xx errors', async () => {
            global.fetch.mockResolvedValueOnce({ ok: false, status: 400 });

            await GeminiClient.analyzeSubmissions('test', { maxRetries: 3 });

            expect(global.fetch).toHaveBeenCalledTimes(1);
        });

        it('should respect max retries', async () => {
            global.fetch.mockResolvedValue({ ok: false, status: 503 });

            await GeminiClient.analyzeSubmissions('test', { maxRetries: 3 });

            expect(global.fetch).toHaveBeenCalledTimes(3);
        });

        it('should apply caller-provided temperature and token limits', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    candidates: [{
                        content: {
                            parts: [{ text: '{"skillUpdates": [], "insights": []}' }]
                        }
                    }]
                })
            });

            await GeminiClient.analyzeSubmissions('test', {
                temperature: 0.7,
                maxOutputTokens: 3000
            });

            const [, options] = global.fetch.mock.calls[0];
            const body = JSON.parse(options.body);
            expect(body.generationConfig.temperature).toBe(0.7);
            expect(body.generationConfig.maxOutputTokens).toBe(3000);
        });
    });

    describe('extractJSON', () => {
        it('should extract JSON from markdown code blocks', () => {
            const text = `Here's the analysis:
\`\`\`json
{"skillUpdates": [{"skillId": "bfs", "delta": 5}]}
\`\`\``;

            const result = GeminiClient.extractJSON(text);
            expect(result.skillUpdates[0].skillId).toBe('bfs');
        });

        it('should handle raw JSON', () => {
            const result = GeminiClient.extractJSON('{"test": true}');
            expect(result.test).toBe(true);
        });

        it('should return null for invalid JSON', () => {
            const result = GeminiClient.extractJSON('not json at all');
            expect(result).toBeNull();
        });
    });

    describe('getApiKey', () => {
        it('should retrieve API key from storage', async () => {
            const key = await GeminiClient.getApiKey();
            expect(key).toBe('test-api-key');
        });

        it('should return null if no key set', async () => {
            chrome.storage.local.get.mockResolvedValueOnce({});
            const key = await GeminiClient.getApiKey();
            expect(key).toBeNull();
        });
    });
});

describe('Response Schema Validation', () => {
    let GeminiClient;

    beforeAll(() => {
        GeminiClient = require('../src/background/gemini_client');
    });

    it('should validate skill update schema', () => {
        const valid = {
            skillUpdates: [{ skillId: 'bfs', delta: -5, reason: 'test' }],
            insights: ['insight1'],
            recommendedDrills: []
        };

        expect(GeminiClient.validateResponse(valid)).toBe(true);
    });

    it('should reject missing required fields', () => {
        const invalid = { insights: [] };
        expect(GeminiClient.validateResponse(invalid)).toBe(false);
    });
});
