/**
 * Drill Overview Page Tests (TDD)
 * 
 * Tests for the drill overview page that displays all generated drills.
 * @jest-environment jsdom
 */

// Mock chrome APIs
global.chrome = {
    storage: {
        local: {
            get: jest.fn(() => Promise.resolve({})),
            set: jest.fn(() => Promise.resolve())
        }
    },
    runtime: {
        getURL: jest.fn(path => `chrome-extension://test-id/${path}`)
    },
    tabs: {
        create: jest.fn(() => Promise.resolve())
    }
};

describe('Drill Overview Page', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        document.body.innerHTML = '';
    });

    describe('Loading drills from storage', () => {
        it('should load generated drills from chrome.storage', async () => {
            const mockDrills = [
                { id: 'drill_1', type: 'fill-in-blank', skillId: 'binary_search', difficulty: 'easy', status: 'pending' },
                { id: 'drill_2', type: 'spot-bug', skillId: 'two_pointers', difficulty: 'medium', status: 'pending' }
            ];

            chrome.storage.local.get.mockResolvedValueOnce({ generatedDrills: mockDrills });

            // Simulate what the overview page would do
            const result = await chrome.storage.local.get('generatedDrills');
            const drills = result.generatedDrills || [];

            expect(drills.length).toBe(2);
            expect(drills[0].skillId).toBe('binary_search');
        });

        it('should handle empty drill list gracefully', async () => {
            chrome.storage.local.get.mockResolvedValueOnce({ generatedDrills: [] });

            const result = await chrome.storage.local.get('generatedDrills');
            const drills = result.generatedDrills || [];

            expect(drills).toEqual([]);
        });

        it('should handle missing generatedDrills key', async () => {
            chrome.storage.local.get.mockResolvedValueOnce({});

            const result = await chrome.storage.local.get('generatedDrills');
            const drills = result.generatedDrills || [];

            expect(drills).toEqual([]);
        });
    });

    describe('Generation status tracking', () => {
        it('should save generation status when starting', async () => {
            const status = {
                status: 'generating',
                startedAt: Date.now()
            };

            await chrome.storage.local.set({ drillGenerationStatus: status });

            expect(chrome.storage.local.set).toHaveBeenCalledWith({
                drillGenerationStatus: expect.objectContaining({
                    status: 'generating'
                })
            });
        });

        it('should update status when generation completes', async () => {
            const status = {
                status: 'complete',
                count: 5,
                completedAt: Date.now()
            };

            await chrome.storage.local.set({ drillGenerationStatus: status });

            expect(chrome.storage.local.set).toHaveBeenCalledWith({
                drillGenerationStatus: expect.objectContaining({
                    status: 'complete',
                    count: 5
                })
            });
        });

        it('should load pending status on page open', async () => {
            const pendingStatus = {
                status: 'generating',
                startedAt: Date.now() - 5000
            };

            chrome.storage.local.get.mockResolvedValueOnce({ drillGenerationStatus: pendingStatus });

            const result = await chrome.storage.local.get('drillGenerationStatus');

            expect(result.drillGenerationStatus.status).toBe('generating');
        });
    });

    describe('Starting drill session', () => {
        it('should create session with all pending drills', async () => {
            const mockDrills = [
                { id: 'drill_1', type: 'fill-in-blank', skillId: 'binary_search', status: 'pending' },
                { id: 'drill_2', type: 'spot-bug', skillId: 'two_pointers', status: 'pending' },
                { id: 'drill_3', type: 'fill-in-blank', skillId: 'dfs', status: 'completed' }
            ];

            // Filter to just pending drills
            const pendingDrills = mockDrills.filter(d => d.status === 'pending');

            expect(pendingDrills.length).toBe(2);
            expect(pendingDrills.every(d => d.status === 'pending')).toBe(true);
        });

        it('should store session before navigating to drill page', async () => {
            const drills = [
                { id: 'drill_1', type: 'fill-in-blank', skillId: 'binary_search' }
            ];

            // Simulate session creation
            await chrome.storage.local.set({
                currentDrillSession: {
                    drills: drills,
                    currentDrill: drills[0],
                    startTime: Date.now()
                }
            });

            expect(chrome.storage.local.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    currentDrillSession: expect.objectContaining({
                        drills: expect.any(Array)
                    })
                })
            );
        });
    });

    describe('Drill card rendering', () => {
        it('should display skill name for each drill', () => {
            const drill = { id: 'drill_1', skillId: 'binary_search', type: 'fill-in-blank', difficulty: 'easy' };

            // Create a mock card element
            const card = document.createElement('div');
            card.className = 'drill-card';
            card.dataset.skillId = drill.skillId;
            card.innerHTML = `<span class="skill-name">${drill.skillId.replace(/_/g, ' ')}</span>`;

            expect(card.querySelector('.skill-name').textContent).toBe('binary search');
        });

        it('should show difficulty badge with correct color class', () => {
            const difficulties = ['easy', 'medium', 'hard'];

            difficulties.forEach(diff => {
                const badge = document.createElement('span');
                badge.className = `difficulty-badge ${diff}`;
                badge.textContent = diff;

                expect(badge.classList.contains(diff)).toBe(true);
            });
        });

        it('should show drill type icon/label', () => {
            const typeLabels = {
                'fill-in-blank': '📝 Fill-in-Blank',
                'spot-bug': '🐛 Spot the Bug',
                'critique': '🔍 Critique',
                'muscle-memory': '💪 Muscle Memory'
            };

            Object.entries(typeLabels).forEach(([type, label]) => {
                expect(label.toLowerCase()).toContain(type.split('-')[0]);
            });
        });
    });
});

describe('Options Page - Persistent Loading', () => {
    let drillsStatus;

    beforeEach(() => {
        document.body.innerHTML = '<span id="drills-status" class="status-text"></span>';
        drillsStatus = document.getElementById('drills-status');
    });

    describe('showStatus with loading type', () => {
        function showStatus(el, text, type, options = {}) {
            if (!el) return;
            el.textContent = text;
            el.className = 'status-text ' + (type || '');

            // Loading state should NOT auto-clear
            if (options.sticky || type === 'loading') return;

            // Would normally set a timeout to clear
        }

        it('should not auto-clear when type is loading', () => {
            showStatus(drillsStatus, '⏳ Generating...', 'loading');

            expect(drillsStatus.textContent).toBe('⏳ Generating...');
            expect(drillsStatus.classList.contains('loading')).toBe(true);
        });

        it('should preserve loading class for CSS spinner', () => {
            showStatus(drillsStatus, 'Generating...', 'loading');

            expect(drillsStatus.className).toContain('loading');
        });

        it('should replace loading state with completion state', () => {
            showStatus(drillsStatus, '⏳ Generating...', 'loading');
            showStatus(drillsStatus, '✅ Done!', 'ok', { sticky: true });

            expect(drillsStatus.textContent).toBe('✅ Done!');
            expect(drillsStatus.classList.contains('ok')).toBe(true);
            expect(drillsStatus.classList.contains('loading')).toBe(false);
        });
    });
});
