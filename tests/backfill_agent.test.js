/**
 * Backfill Agent Tests (TDD)
 * 
 * Tests for BackfillAgent that fetches missing LeetCode tags.
 */

// Mock chrome storage
global.chrome = {
    storage: {
        local: {
            get: jest.fn(() => Promise.resolve({})),
            set: jest.fn(() => Promise.resolve())
        }
    }
};

// Mock fetch for LeetCode API
global.fetch = jest.fn();

describe('BackfillAgent', () => {
    let BackfillAgent;

    beforeAll(() => {
        BackfillAgent = require('../src/background/backfill_agent');
    });

    beforeEach(() => {
        jest.clearAllMocks();
        BackfillAgent._resetQueue();
    });

    describe('queue management', () => {
        it('should add problems to backfill queue', async () => {
            await BackfillAgent.addToQueue({ slug: 'two-sum', title: 'Two Sum' });

            const queue = await BackfillAgent.getQueue();
            expect(queue.length).toBe(1);
            expect(queue[0].slug).toBe('two-sum');
        });

        it('should skip problems already in queue', async () => {
            await BackfillAgent.addToQueue({ slug: 'two-sum' });
            await BackfillAgent.addToQueue({ slug: 'two-sum' });

            const queue = await BackfillAgent.getQueue();
            expect(queue.length).toBe(1);
        });

        it('should scan storage for problems missing tags', async () => {
            chrome.storage.local.get.mockResolvedValue({
                problems: {
                    'two-sum': { slug: 'two-sum', tags: null },
                    'add-two-numbers': { slug: 'add-two-numbers', tags: ['linked-list'] }
                }
            });

            const missing = await BackfillAgent.scanForMissingTags();

            expect(missing.length).toBe(1);
            expect(missing[0].slug).toBe('two-sum');
        });
    });

    describe('tag fetching', () => {
        it('should fetch tags from LeetCode GraphQL API', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    data: {
                        question: {
                            topicTags: [
                                { slug: 'array', name: 'Array' },
                                { slug: 'hash-table', name: 'Hash Table' }
                            ]
                        }
                    }
                })
            });

            const tags = await BackfillAgent.fetchTags('two-sum');

            expect(tags).toEqual(['array', 'hash-table']);
        });

        it('should handle API errors gracefully', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 429
            });

            const tags = await BackfillAgent.fetchTags('some-problem');

            expect(tags).toBeNull();
        });

        it('should respect rate limiting', async () => {
            const start = Date.now();

            await BackfillAgent.fetchTags('problem-1');
            await BackfillAgent.fetchTags('problem-2');

            const elapsed = Date.now() - start;
            expect(elapsed).toBeGreaterThanOrEqual(1900); // ~2s rate limit
        });
    });

    describe('backfill process', () => {
        it('should process queue and update storage', async () => {
            await BackfillAgent.addToQueue({ slug: 'two-sum' });

            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    data: {
                        question: { topicTags: [{ slug: 'array', name: 'Array' }] }
                    }
                })
            });

            const result = await BackfillAgent.processNext();

            expect(result.success).toBe(true);
            expect(result.tags).toEqual(['array']);
        });

        it('should report progress during backfill', async () => {
            await BackfillAgent.addToQueue({ slug: 'p1' });
            await BackfillAgent.addToQueue({ slug: 'p2' });
            await BackfillAgent.addToQueue({ slug: 'p3' });

            const progress = BackfillAgent.getProgress();

            expect(progress).toHaveProperty('total', 3);
            expect(progress).toHaveProperty('completed', 0);
            expect(progress).toHaveProperty('remaining', 3);
        });

        it('should pause and resume backfill', async () => {
            await BackfillAgent.addToQueue({ slug: 'p1' });

            BackfillAgent.pause();
            expect(BackfillAgent.isPaused()).toBe(true);

            BackfillAgent.resume();
            expect(BackfillAgent.isPaused()).toBe(false);
        });
    });

    describe('persistence', () => {
        it('should save queue state to storage', async () => {
            await BackfillAgent.addToQueue({ slug: 'test-problem' });

            expect(chrome.storage.local.set).toHaveBeenCalledWith(
                expect.objectContaining({ backfillQueue: expect.any(Array) })
            );
        });
    });
});
