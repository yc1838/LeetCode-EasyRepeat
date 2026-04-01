// src/content/neetcode_content.js
/**
 * NeetCode EasyRepeat - Content Script
 *
 * Detects accepted submissions on neetcode.io via DOM mutation observer.
 * Question details (title, difficulty) are scraped from the DOM and cached
 * to chrome.storage.local on page load.
 *
 * Topics are scraped from details a[href*="problem-list"] when present
 * (NeetCode 150 problems have them); "NeetCode" is always appended as
 * a source marker. Problems without tags store ["NeetCode"] only.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exported = factory();
    for (const key in exported) root[key] = exported[key];
  }
}(typeof self !== 'undefined' ? self : this, function () {

  // -- Pure functions (exported for testing) ---------------------------------

  function extractSlug(pathname) {
    const match = (pathname || '').match(/\/problems\/([^\/]+)/);
    return match ? match[1] : null;
  }

  function extractTitle(rawTitle) {
    return (rawTitle || '').replace(/\s*[-|]\s*NeetCode\s*$/i, '').trim();
  }

  function extractDifficulty(doc) {
    const el = doc.querySelector('[class*="difficulty-pill"]');
    if (!el) return null;
    const text = el.textContent.trim();
    return ['Easy', 'Medium', 'Hard'].includes(text) ? text : null;
  }

  function extractTopics(doc) {
    const tags = Array.from(doc.querySelectorAll('details a[href*="problem-list"]'))
      .map(a => a.textContent.trim())
      .filter(Boolean);
    return tags.length > 0 ? [...tags, 'NeetCode'] : ['NeetCode'];
  }

  function isAcceptedResult(text) {
    return (text || '').includes('Accepted');
  }

  // -- Browser-only logic (not exported, not run in Node) --------------------

  const _isBrowser = typeof window !== 'undefined' && typeof chrome !== 'undefined';

  const CACHE_KEY_PREFIX = 'neetcode_q_';

  function _getDep(name) {
    if (typeof window !== 'undefined' && window[name]) return window[name];
    return undefined;
  }

  function _getCurrentSlug() {
    return extractSlug(window.location.pathname);
  }

  async function _cacheQuestionInfo() {
    const slug = _getCurrentSlug();
    if (!slug) return;

    const title = extractTitle(document.title);
    const difficulty = extractDifficulty(document);
    const topics = extractTopics(document);
    if (!title) return;

    try {
      await chrome.storage.local.set({
        [CACHE_KEY_PREFIX + slug]: { slug, title, difficulty, topics, cachedAt: Date.now() }
      });
      console.log(`[NeetCode EasyRepeat] Cached question info: ${title} (${difficulty})`);
    } catch (e) {
      console.warn('[NeetCode EasyRepeat] Failed to cache question info:', e);
    }
  }

  async function _getQuestionInfo(slug) {
    let cached = null;
    try {
      const result = await chrome.storage.local.get({ [CACHE_KEY_PREFIX + slug]: null });
      cached = result[CACHE_KEY_PREFIX + slug];
    } catch (e) { /* ignore */ }

    // Merge cached data with live DOM to fill gaps (e.g. difficulty renders late)
    const liveTitle = extractTitle(document.title);
    const liveDifficulty = extractDifficulty(document);
    const liveTopics = extractTopics(document);

    return {
      slug,
      title: cached?.title || liveTitle,
      difficulty: cached?.difficulty || liveDifficulty,
      topics: cached?.topics?.length > 1 ? cached.topics : liveTopics,
    };
  }

  async function _isAlreadySavedToday(slug, difficulty) {
    try {
      if (!chrome.runtime?.id) return false;
      const result = await chrome.storage.local.get({ problems: {} });
      const problem = result.problems[slug];
      if (!problem || !problem.lastSolved) return false;
      const now = new Date();
      const last = new Date(problem.lastSolved);
      return now.getFullYear() === last.getFullYear() &&
        now.getMonth() === last.getMonth() &&
        now.getDate() === last.getDate() &&
        problem.difficulty === difficulty;
    } catch (e) {
      return false;
    }
  }

  async function _handleAccepted(slug) {
    const showRatingModal = _getDep('showRatingModal');
    const saveSubmission = _getDep('saveSubmission');
    if (!showRatingModal || !saveSubmission) {
      console.error('[NeetCode EasyRepeat] Missing dependencies: showRatingModal or saveSubmission');
      return;
    }

    const info = await _getQuestionInfo(slug);
    const title = info.title || slug;
    const difficulty = info.difficulty || 'Medium';

    if (await _isAlreadySavedToday(slug, difficulty)) {
      console.log(`[NeetCode EasyRepeat] Already saved today for ${slug}. Skipping.`);
      const showDuplicateSkipToast = _getDep('showDuplicateSkipToast');
      if (showDuplicateSkipToast) showDuplicateSkipToast(title, { slug });
      return;
    }

    const topics = info.topics || ['NeetCode'];
    const rating = await showRatingModal(title, { slug, maxRating: 4 });
    await saveSubmission(title, slug, difficulty, 'neetcode_dom', rating, topics);
    console.log(`[NeetCode EasyRepeat] Saved: ${title} (${difficulty})`);
  }

  function _startObserver(slug) {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;

          const check = (el) => {
            const cls = el.getAttribute?.('class') || '';
            if (!cls.includes('output-header')) return;
            if (!isAcceptedResult(el.textContent)) return;
            observer.disconnect();
            console.log('[NeetCode EasyRepeat] Accepted submission detected via DOM.');
            _handleAccepted(slug).catch(e =>
              console.error('[NeetCode EasyRepeat] handleAccepted failed:', e)
            );
          };

          check(node);
          node.querySelectorAll?.('[class*="output-header"]').forEach(check);
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    console.log(`[NeetCode EasyRepeat] Observer started for slug="${slug}"`);
    return observer;
  }

  function _init() {
    if (!_isBrowser) return;
    if (typeof chrome === 'undefined' || !chrome.runtime?.id) return;

    const slug = _getCurrentSlug();
    if (!slug) return;

    // Cache question details immediately (works if on Question tab)
    _cacheQuestionInfo();

    // Re-cache after 2s in case Angular hasn't rendered difficulty-pill yet
    setTimeout(_cacheQuestionInfo, 2000);

    // Start watching for submission result
    _startObserver(slug);
  }

  const isTestEnv = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';
  if (!isTestEnv) {
    _init();
  }

  return { extractSlug, extractTitle, extractDifficulty, extractTopics, isAcceptedResult };
}));
