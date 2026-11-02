/**
 * @jest-environment jsdom
 */
const RR = require('../src/shared/review_reset.js');
const { pickSnippet, readStoredLang, readUiLang } = require('../src/content/editor_reset_main.js');

describe('ReviewReset markers', () => {
    const now = 1_000_000_000_000;

    test('mark then consume once', () => {
        const markers = RR.mark({}, ['two-sum', 'lru-cache'], now);
        const first = RR.consume(markers, 'two-sum', now + 1000);
        expect(first.matched).toBe(true);
        expect(first.markers).toEqual({ 'lru-cache': now });
        expect(RR.consume(first.markers, 'two-sum', now + 2000).matched).toBe(false);
    });

    test('markers expire', () => {
        const markers = RR.mark({}, ['two-sum'], now);
        expect(RR.consume(markers, 'two-sum', now + RR.TTL_MS + 1).matched).toBe(false);
    });

    test('marking prunes stale entries', () => {
        const markers = RR.mark({ old: now - RR.TTL_MS - 5 }, ['new'], now);
        expect(Object.keys(markers)).toEqual(['new']);
    });

    test('batch size clamped to 1..20 and to what is available', () => {
        expect(RR.clampBatch('5')).toBe(5);
        expect(RR.clampBatch(0)).toBe(1);
        expect(RR.clampBatch('abc')).toBe(1);
        expect(RR.clampBatch(99)).toBe(20);
        expect(RR.clampBatch(5, 2)).toBe(2);
        expect(RR.clampBatch(5, 0)).toBe(0);
    });

    test('urls and slugs', () => {
        expect(RR.problemUrl('https://leetcode.cn/', 'two-sum')).toBe('https://leetcode.cn/problems/two-sum/');
        expect(RR.slugFromPath('/problems/two-sum/description/')).toBe('two-sum');
        expect(RR.slugFromPath('/problemset/')).toBe(null);
    });
});

describe('Editor template selection', () => {
    const snippets = [
        { langSlug: 'cpp', code: 'cpp' },
        { langSlug: 'python3', code: 'py3' },
        { langSlug: 'python', code: 'py2' },
        { langSlug: 'golang', code: 'go' }
    ];

    test('picker label disambiguates python vs python3', () => {
        expect(pickSnippet(snippets, ['python'], 'python').code).toBe('py2');
        expect(pickSnippet(snippets, ['python3'], 'python').code).toBe('py3');
        expect(pickSnippet(snippets, [null, null], 'python').code).toBe('py3'); // default
    });

    test('hint that disagrees with the editor language is ignored', () => {
        expect(pickSnippet(snippets, ['cpp'], 'go').code).toBe('go');
    });

    test('no template for unknown language', () => {
        expect(pickSnippet(snippets, [], 'haskell')).toBe(null);
        expect(pickSnippet([], ['cpp'], 'cpp')).toBe(null);
    });

    test('reads LeetCode global_lang and picker label', () => {
        expect(readStoredLang({ getItem: () => '"python3"' })).toBe('python3');
        expect(readStoredLang({ getItem: () => null })).toBe(null);
        document.body.innerHTML = '<button>Submit</button><button>Python3</button>';
        expect(readUiLang(document)).toBe('python3');
    });
});
