const storage = require('../src/shared/storage');

// Mock chrome.storage.local
const mockStorage = {
    get: jest.fn(),
    set: jest.fn()
};

global.chrome = {
    runtime: { id: 'test-id' },
    storage: {
        local: mockStorage
    }
};

describe('Notes Storage Logic', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockStorage.get.mockResolvedValue({ problems: {} });
        mockStorage.set.mockResolvedValue();
    });

    test('saveNotes should create new entry if problem does not exist', async () => {
        await storage.saveNotes('two-sum', 'My test note');

        expect(mockStorage.get).toHaveBeenCalled();
        expect(mockStorage.set).toHaveBeenCalledWith({
            problems: {
                'two-sum': {
                    slug: 'two-sum',
                    title: 'two-sum',
                    difficulty: 'Medium',
                    notes: 'My test note',
                    history: []
                }
            }
        });
    });

    test('saveNotes should update existing problem', async () => {
        // Setup existing data
        mockStorage.get.mockResolvedValue({
            problems: {
                'two-sum': {
                    slug: 'two-sum',
                    title: 'Two Sum',
                    difficulty: 'Easy',
                    notes: 'Old note',
                    history: []
                }
            }
        });

        await storage.saveNotes('two-sum', 'New note');

        expect(mockStorage.set).toHaveBeenCalledWith({
            problems: {
                'two-sum': {
                    slug: 'two-sum',
                    title: 'Two Sum',
                    difficulty: 'Easy',
                    notes: 'New note',
                    history: []
                }
            }
        });
    });

    test('getNotes should return empty string for non-existent problem', async () => {
        const notes = await storage.getNotes('unknown-problem');
        expect(notes).toBe('');
    });

    test('getNotes should return stored notes', async () => {
        mockStorage.get.mockResolvedValue({
            problems: {
                'two-sum': { notes: 'Found me!' }
            }
        });

        const notes = await storage.getNotes('two-sum');
        expect(notes).toBe('Found me!');
    });
});
