(function (root, factory) {
    var exported = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = exported;
    }
    root.EasyRepeatProblemTitles = exported;
    if (typeof window !== 'undefined') {
        window.EasyRepeatProblemTitles = exported;
    }
}(typeof self !== 'undefined' ? self : this, function () {
    const STORAGE_KEY = 'localizedProblemTitles';
    const DEFAULTS = { [STORAGE_KEY]: {} };

    function getI18n() {
        if (typeof EasyRepeatI18n !== 'undefined') return EasyRepeatI18n;
        if (typeof window !== 'undefined' && window.EasyRepeatI18n) return window.EasyRepeatI18n;
        return null;
    }

    function normalizeLanguage(languageCode) {
        const i18n = getI18n();
        if (i18n && typeof i18n.normalizeLanguage === 'function') {
            return i18n.normalizeLanguage(languageCode);
        }
        return String(languageCode || '').startsWith('zh') ? 'zh' : 'en';
    }

    function storageGet(defaults) {
        if (!(typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local)) {
            return Promise.resolve(defaults || {});
        }
        try {
            const result = chrome.storage.local.get(defaults || {});
            if (result && typeof result.then === 'function') {
                return result;
            }
        } catch (e) {
            return new Promise(function (resolve) {
                chrome.storage.local.get(defaults || {}, function (result) {
                    resolve(result || (defaults || {}));
                });
            });
        }
        return new Promise(function (resolve) {
            chrome.storage.local.get(defaults || {}, function (result) {
                resolve(result || (defaults || {}));
            });
        });
    }

    async function getCache() {
        const result = await storageGet(DEFAULTS);
        return result[STORAGE_KEY] || {};
    }

    function buildNumberedTitle(title, questionId) {
        if (!title) return '';
        if (!questionId) return title;
        if (String(title).startsWith(questionId + '.')) return title;
        return questionId + '. ' + title;
    }

    function getCachedEntry(cache, slug) {
        if (!slug) return null;
        return (cache && cache[slug]) || null;
    }

    async function ensureLocalizedTitles(slugs, options) {
        const requestedSlugs = Array.isArray(slugs)
            ? Array.from(new Set(slugs.filter(Boolean)))
            : [];

        if (!requestedSlugs.length) {
            return {};
        }

        if (!(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage)) {
            return {};
        }

        try {
            const response = await chrome.runtime.sendMessage({
                action: 'fetchLocalizedProblemTitles',
                slugs: requestedSlugs,
                language: normalizeLanguage(options && options.language)
            });
            if (!response || !response.success) {
                return {};
            }
            return response.titles || {};
        } catch (e) {
            console.warn('[EasyRepeatProblemTitles] Failed to fetch localized titles:', e);
            return {};
        }
    }

    async function ensureProblemList(problemList, languageCode) {
        const language = normalizeLanguage(languageCode);
        if (language !== 'zh') return {};

        const cache = await getCache();
        const missing = (problemList || [])
            .map(function (problem) { return problem && problem.slug; })
            .filter(function (slug) {
                const entry = getCachedEntry(cache, slug);
                return slug && !(entry && entry.zh);
            });

        if (!missing.length) {
            return cache;
        }

        await ensureLocalizedTitles(missing, { language: language });
        return await getCache();
    }

    function getDisplayTitleSync(problem, languageCode, cache) {
        if (!problem) return '';
        const language = normalizeLanguage(languageCode);
        if (language !== 'zh') {
            return problem.title || problem.slug || '';
        }

        const entry = getCachedEntry(cache, problem.slug);
        if (entry && entry.zh) {
            return entry.zh;
        }

        return problem.title || problem.slug || '';
    }

    async function getDisplayTitle(problem, languageCode, options) {
        if (!problem) return '';
        const language = normalizeLanguage(languageCode || (getI18n() ? await getI18n().getLanguage() : 'en'));
        if (language !== 'zh') {
            return problem.title || problem.slug || '';
        }

        const cache = await getCache();
        const entry = getCachedEntry(cache, problem.slug);
        if (entry && entry.zh) {
            return entry.zh;
        }

        if (!problem.slug) {
            return problem.title || '';
        }

        if (!(options && options.hydrate === false)) {
            const fetched = await ensureLocalizedTitles([problem.slug], { language: language });
            const entry = getCachedEntry(fetched, problem.slug) || getCachedEntry(await getCache(), problem.slug);
            if (entry && entry.zh) {
                return entry.zh;
            }
        }

        return problem.title || problem.slug || '';
    }

    function buildTitleEntry(payload) {
        if (!payload) return null;
        const questionId = payload.questionId || payload.questionFrontendId || null;
        const translatedTitle = payload.translatedTitle || payload.title || '';
        if (!translatedTitle) return null;

        return {
            zh: buildNumberedTitle(translatedTitle, questionId),
            zhRaw: translatedTitle,
            questionId: questionId || null,
            source: payload.source || 'unknown',
            fetchedAt: payload.fetchedAt || Date.now()
        };
    }

    return {
        STORAGE_KEY: STORAGE_KEY,
        buildNumberedTitle: buildNumberedTitle,
        buildTitleEntry: buildTitleEntry,
        ensureLocalizedTitles: ensureLocalizedTitles,
        ensureProblemList: ensureProblemList,
        getCache: getCache,
        getDisplayTitle: getDisplayTitle,
        getDisplayTitleSync: getDisplayTitleSync,
        normalizeLanguage: normalizeLanguage
    };
}));
