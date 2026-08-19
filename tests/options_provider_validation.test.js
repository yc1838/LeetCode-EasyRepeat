/**
 * @jest-environment jsdom
 */

describe('Options provider validation helpers', () => {
    let getCustomModelFallback;

    beforeEach(() => {
        jest.resetModules();
        delete window.EasyRepeatOptions;
        require('../src/options/options.js');
        ({ getCustomModelFallback } = window.EasyRepeatOptions.__test);
    });

    afterEach(() => {
        delete window.EasyRepeatOptions;
    });

    test('uses an exact custom model ID when model discovery is unavailable', () => {
        expect(getCustomModelFallback('custom', '  vendor-model-v2  ', 'HTTP 404')).toEqual([
            'vendor-model-v2'
        ]);
    });

    test('does not hide permission denial or missing custom configuration', () => {
        expect(getCustomModelFallback('custom', 'vendor-model-v2', new Error('Permission denied for https://example.com'))).toBeNull();
        expect(getCustomModelFallback('custom', '   ', 'HTTP 404')).toBeNull();
        expect(getCustomModelFallback('qwen', 'vendor-model-v2', 'HTTP 404')).toBeNull();
    });
});
