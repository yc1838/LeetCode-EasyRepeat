/**
 * @jest-environment jsdom
 */

/**
 * Tests for SandboxClient module.
 * Tests HTTP communication with MCP server's /verify endpoint.
 */

describe('SandboxClient', () => {
    let SandboxClient;
    let mockFetch;

    beforeEach(() => {
        jest.resetModules();

        // Mock global fetch
        mockFetch = jest.fn();
        global.fetch = mockFetch;

        SandboxClient = require('../src/background/sandbox_client');
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('verify', () => {
        it('should call /verify endpoint with code and test input', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    result: '[{"index": 0, "input": "[1,2,3]", "output": "6", "status": "Passed"}]'
                })
            });

            const result = await SandboxClient.verify('def solution(): return 1', '[1,2,3]');

            expect(mockFetch).toHaveBeenCalledWith(
                'http://localhost:8000/verify',
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        code: 'def solution(): return 1',
                        test_input: '[1,2,3]'
                    })
                })
            );
            expect(result.success).toBe(true);
            expect(result.results).toHaveLength(1);
            expect(result.results[0].status).toBe('Passed');
        });

        it('should handle failed tests', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    result: '[{"index": 0, "input": "[1,2]", "output": "3", "status": "Runtime Error", "error": "IndexError"}]'
                })
            });

            const result = await SandboxClient.verify('def solution(): return arr[5]', '[1,2]');

            expect(result.success).toBe(false);
            expect(result.results[0].status).toBe('Runtime Error');
        });

        it('should handle network errors gracefully', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const result = await SandboxClient.verify('def solution(): pass', '[]');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Network error');
        });

        it('should handle server errors (500)', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error'
            });

            const result = await SandboxClient.verify('def solution(): pass', '[]');

            expect(result.success).toBe(false);
            expect(result.error).toContain('500');
        });
    });

    describe('verifyBatch', () => {
        it('should verify multiple test inputs', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    result: JSON.stringify([
                        { index: 0, input: '[1]', output: '1', status: 'Passed' },
                        { index: 1, input: '[2]', output: '2', status: 'Passed' }
                    ])
                })
            });

            const result = await SandboxClient.verifyBatch('def sol(): pass', ['[1]', '[2]']);

            expect(result.success).toBe(true);
            expect(result.results).toHaveLength(2);
        });

        it('should return false if any test fails', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    result: JSON.stringify([
                        { index: 0, input: '[1]', output: '1', status: 'Passed' },
                        { index: 1, input: '[2]', output: '2', status: 'Runtime Error', error: 'Failed' }
                    ])
                })
            });

            const result = await SandboxClient.verifyBatch('def sol(): pass', ['[1]', '[2]']);

            expect(result.success).toBe(false);
            expect(result.passedCount).toBe(1);
            expect(result.failedCount).toBe(1);
        });
    });

    describe('isServerRunning', () => {
        it('should return true when server responds to /health', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ status: 'ok' })
            });

            const running = await SandboxClient.isServerRunning();

            expect(running).toBe(true);
            expect(mockFetch).toHaveBeenCalledWith(
                'http://localhost:8000/health',
                expect.any(Object)
            );
        });

        it('should return false when server is down', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

            const running = await SandboxClient.isServerRunning();

            expect(running).toBe(false);
        });
    });
});
