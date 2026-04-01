// tests/neetcode_content.test.js
const {
  extractSlug,
  extractTitle,
  extractDifficulty,
  extractTopics,
  isAcceptedResult,
} = require('../src/content/neetcode_content');

describe('extractSlug', () => {
  test('returns slug from problem URL', () => {
    expect(extractSlug('/problems/dynamicArray/')).toBe('dynamicArray');
  });
  test('returns slug without trailing slash', () => {
    expect(extractSlug('/problems/twoSum')).toBe('twoSum');
  });
  test('returns slug from sub-page URL', () => {
    expect(extractSlug('/problems/dynamicArray/history')).toBe('dynamicArray');
  });
  test('returns null when not on a problem page', () => {
    expect(extractSlug('/practice')).toBeNull();
  });
  test('returns null for empty pathname', () => {
    expect(extractSlug('')).toBeNull();
  });
});

describe('extractTitle', () => {
  test('strips " - NeetCode" suffix', () => {
    expect(extractTitle('Design Dynamic Array (Resizable Array) - NeetCode')).toBe('Design Dynamic Array (Resizable Array)');
  });
  test('strips " | NeetCode" suffix', () => {
    expect(extractTitle('Two Sum | NeetCode')).toBe('Two Sum');
  });
  test('handles already-clean title', () => {
    expect(extractTitle('Two Sum')).toBe('Two Sum');
  });
  test('returns empty string for empty input', () => {
    expect(extractTitle('')).toBe('');
  });
});

describe('extractDifficulty', () => {
  function makeDoc(className, text) {
    return {
      querySelector: (selector) => {
        if (selector === '[class*="difficulty-pill"]') {
          return className ? { className, textContent: text } : null;
        }
        return null;
      }
    };
  }

  test('returns Easy from difficulty-pill element', () => {
    expect(extractDifficulty(makeDoc('difficulty-pill easy ng-star-inserted', 'Easy'))).toBe('Easy');
  });
  test('returns Medium from difficulty-pill element', () => {
    expect(extractDifficulty(makeDoc('difficulty-pill medium ng-star-inserted', 'Medium'))).toBe('Medium');
  });
  test('returns Hard from difficulty-pill element', () => {
    expect(extractDifficulty(makeDoc('difficulty-pill hard ng-star-inserted', 'Hard'))).toBe('Hard');
  });
  test('returns null when element not found', () => {
    expect(extractDifficulty(makeDoc(null, null))).toBeNull();
  });
  test('returns null when text is not a valid difficulty', () => {
    expect(extractDifficulty(makeDoc('difficulty-pill', 'Unknown'))).toBeNull();
  });
});

describe('extractTopics', () => {
  function makeDoc(links) {
    return {
      querySelectorAll: (selector) => {
        if (selector === 'details a[href*="problem-list"]') {
          return links.map(text => ({ textContent: text }));
        }
        return [];
      }
    };
  }

  test('returns topic tags plus NeetCode for NeetCode 150 problem', () => {
    expect(extractTopics(makeDoc(['Array', 'Hash Table']))).toEqual(['Array', 'Hash Table', 'NeetCode']);
  });
  test('returns ["NeetCode"] only when no topic links found', () => {
    expect(extractTopics(makeDoc([]))).toEqual(['NeetCode']);
  });
  test('filters out empty strings from topic links', () => {
    expect(extractTopics(makeDoc(['Array', '  ', 'Hash Table']))).toEqual(['Array', 'Hash Table', 'NeetCode']);
  });
});

describe('isAcceptedResult', () => {
  test('returns true for Accepted text', () => {
    expect(isAcceptedResult('AcceptedPassed test cases:  12 / 12')).toBe(true);
  });
  test('returns false for Wrong Answer', () => {
    expect(isAcceptedResult('Wrong AnswerFailed test cases: 1 / 12')).toBe(false);
  });
  test('returns false for Time Limit Exceeded', () => {
    expect(isAcceptedResult('Time Limit Exceeded')).toBe(false);
  });
  test('returns false for empty string', () => {
    expect(isAcceptedResult('')).toBe(false);
  });
});
