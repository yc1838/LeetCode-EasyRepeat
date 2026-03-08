(function (root, factory) {
    var exported = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = exported;
    }
    root.EasyRepeatI18n = exported;
    if (typeof window !== 'undefined') {
        window.EasyRepeatI18n = exported;
    }
}(typeof self !== 'undefined' ? self : this, function () {
    const STORAGE_KEY = 'uiLanguage';
    const DEFAULT_LANGUAGE = 'en';
    const SUPPORTED_LANGUAGES = new Set(['en', 'zh']);

    const DICTIONARY = {
        en: {
            common_language_toggle_title: 'Switch to 中文',
            common_save: 'Save',
            common_cancel: 'Cancel',
            common_close: 'Close',
            common_dismiss: 'Dismiss',
            common_error: 'Error',
            common_submit: 'Submit',
            common_skip: 'Skip',
            common_retry: 'Retry',
            common_return: 'Return',
            common_analyze: 'Analyze',
            common_synced: 'Synced',
            common_loading: 'Loading...',
            difficulty_easy: 'Easy',
            difficulty_medium: 'Medium',
            difficulty_hard: 'Hard',
            difficulty_unknown: 'Unknown',
            rating_again: 'Again',
            rating_again_desc: 'Could not recall',
            rating_hard: 'Hard',
            rating_hard_desc: 'Struggled',
            rating_good: 'Good',
            rating_good_desc: 'Recalled',
            rating_easy: 'Easy',
            rating_easy_desc: 'Trivial',
            popup_page_title: 'LeetCode EasyRepeat',
            popup_brand: 'LeetCode EasyRepeat OS',
            popup_sys_ready: '[SYS_READY]',
            popup_welcome: 'WELCOME! READY FOR SOME LEETCODE?',
            popup_streak_days: 'STREAK DAYS:',
            popup_queue_due_today: 'PROBLEMS DUE TODAY',
            popup_queue_all_problems: 'ALL PROBLEMS',
            popup_nav_dashboard_title: 'Dashboard',
            popup_nav_all_vectors_title: 'All Vectors',
            popup_nav_switch_theme_title: 'Switch Theme',
            popup_nav_open_setup_title: 'Open Setup',
            popup_empty_buffer: 'NO_DATA_DETECTED // BUFFER_EMPTY',
            popup_retention: 'RETENTION',
            popup_interval_days: 'INT: {days}D',
            popup_due_date: 'DUE: {date}',
            popup_action_delete: 'DEL',
            popup_action_go: 'GO',
            popup_action_initialize: 'INITIALIZE_SEQUENCE',
            popup_user_notes: 'USER_NOTES //',
            popup_edit_notes: 'EDIT NOTES',
            popup_edit_notes_title: 'Editable notes',
            popup_timeline: 'PROJECTED_TIMELINE:',
            popup_status_completed: 'Completed',
            popup_status_missed: 'Missed',
            popup_status_due_today: 'Due Today',
            popup_status_scheduled: 'Scheduled',
            popup_delete_confirm: 'Are you sure you want to delete "{slug}" from your SRS history? This cannot be undone.',
            content_submission_captured: 'Submission Captured',
            content_next_review: 'NEXT_REVIEW:',
            content_difficulty_check: 'Difficulty Check',
            content_difficulty_hint: 'Rate your recall difficulty. This helps FSRS adjust the next review time.',
            content_mistake_detected: 'Mistake Detected',
            content_error_type: 'Type: {errorType}',
            content_always_analyze: 'Always analyze mistakes',
            content_notes: 'Notes',
            content_notes_placeholder: 'Type your notes here... (CMD+Enter to Save)',
            content_external_update_pending: 'External update pending',
            content_loading_notes: 'Loading...',
            content_saving: 'Saving...',
            content_saved_via_sync: 'Saved via Sync',
            content_drag_tooltip: 'Long press to drag!',
            content_cancel_analysis: 'Cancel Analysis',
            content_analyzing_request: 'Analyzing Request...',
            content_analysis_complete: 'Analysis Complete',
            drill_overview_page_title: 'Drill Overview',
            drill_overview_brand: 'Drill Practices',
            drill_select_folder_prompt: 'Select a folder to view drills',
            drill_start_review_session: 'Start Review Session',
            drill_start_review_count: 'Start Review ({count})',
            drill_no_drills: 'No Drills',
            drill_scroll_hint: 'Scroll Card to Flip',
            drill_all_drills: 'All Drills',
            drill_card_progress: 'Drill 1 of {count}',
            drill_solution: 'Solution',
            drill_key_concept: 'Key Concept',
            drill_no_explanation: 'No explanation provided.',
            drill_empty_folder: 'No drills in this folder.',
            drill_type_fill_in_blank: 'Fill in the Blanks',
            drill_type_spot_bug: 'Find the Bug',
            drill_type_critique: 'Critique the Code',
            drill_type_muscle_memory: 'Type the Solution',
            drills_page_title: 'Neural Drill Practice',
            drills_logo: '🧠 Drill Practice',
            drill_loading: 'Loading drill...',
            drill_loading_skill: 'Loading...',
            drill_progress: 'Drill {current} of {total}',
            drill_fill_blank_label: 'Fill in the blank:',
            drill_fill_blank_placeholder: 'Your answer...',
            drill_spot_bug_instruction: 'Click the bug (token) to investigate.',
            drill_critique_label: 'Your analysis:',
            drill_critique_placeholder: 'Time complexity: O(...)\nSpace complexity: O(...)\nExplanation:',
            drill_write_solution_label: 'Write your solution:',
            drill_ai_hint: 'AI Evaluation Enabled (Pseudo-code or Python)',
            drill_write_solution_placeholder: 'function binarySearch(arr, target):\n    left = 0, right = len(arr) - 1\n    while left <= right:\n        mid = (left + right) / 2\n        ...',
            drill_submit_answer: 'Submit Answer',
            drill_correct: 'Correct!',
            drill_incorrect: 'Incorrect',
            drill_next: 'Next Drill',
            drill_finish_session: 'Finish Session',
            drill_missing_id: 'No drill specified',
            drill_return_extension: 'Return to Extension',
            drill_session_complete: 'Session Complete!',
            drill_session_complete_subtitle: "You've finished all drills in this session.",
            drill_load_failed: 'Failed to load drill',
            drill_enter_answer: 'Please enter an answer',
            drill_ai_evaluating: 'AI Evaluating Solution...',
            drill_skip_confirm: 'Skip this drill?',
            drill_expected_answer: 'Expected: {answer}',
            drill_answer_recorded: 'Answer recorded',
            drill_unknown_error: 'Unknown error',
            greeting_morning: 'Good morning',
            greeting_afternoon: 'Good afternoon',
            greeting_evening: 'Good evening',
            greeting_all_strong: "You're doing great! All skills are strong. 💪",
            greeting_one_skill: '1 skill needs practice{skill}. Let\'s work on it!',
            greeting_many_skills: '{count} skills need practice. Ready for some drills?',
            greeting_drills_ready_one: '{count} drill ready',
            greeting_drills_ready_many: '{count} drills ready',
            greeting_dismiss: 'Dismiss'
        },
        zh: {
            common_language_toggle_title: '切换到 English',
            common_save: '保存',
            common_cancel: '取消',
            common_close: '关闭',
            common_dismiss: '关闭提示',
            common_error: '错误',
            common_submit: '提交',
            common_skip: '跳过',
            common_retry: '重试',
            common_return: '返回',
            common_analyze: '分析',
            common_synced: '已同步',
            common_loading: '加载中...',
            difficulty_easy: '简单',
            difficulty_medium: '中等',
            difficulty_hard: '困难',
            difficulty_unknown: '未知',
            rating_again: '重来',
            rating_again_desc: '完全没想起来',
            rating_hard: '困难',
            rating_hard_desc: '想得很吃力',
            rating_good: '正常',
            rating_good_desc: '能回忆出来',
            rating_easy: '简单',
            rating_easy_desc: '几乎秒答',
            popup_page_title: 'LeetCode EasyRepeat',
            popup_brand: 'LeetCode EasyRepeat 系统',
            popup_sys_ready: '[系统就绪]',
            popup_welcome: '准备好继续刷题了吗？',
            popup_streak_days: '连续天数：',
            popup_queue_due_today: '今天待复习题目',
            popup_queue_all_problems: '全部题目',
            popup_nav_dashboard_title: '仪表盘',
            popup_nav_all_vectors_title: '全部向量',
            popup_nav_switch_theme_title: '切换主题',
            popup_nav_open_setup_title: '打开设置',
            popup_empty_buffer: '未检测到数据 // 缓冲为空',
            popup_retention: '保留率',
            popup_interval_days: '间隔：{days}天',
            popup_due_date: '到期：{date}',
            popup_action_delete: '删除',
            popup_action_go: '去做题',
            popup_action_initialize: '开始复习',
            popup_user_notes: '用户笔记 //',
            popup_edit_notes: '编辑笔记',
            popup_edit_notes_title: '可编辑笔记',
            popup_timeline: '预计时间线：',
            popup_status_completed: '已完成',
            popup_status_missed: '已错过',
            popup_status_due_today: '今天到期',
            popup_status_scheduled: '未来计划',
            popup_delete_confirm: '确定要从你的 SRS 历史里删除 “{slug}” 吗？此操作不可撤销。',
            content_submission_captured: '已记录提交',
            content_next_review: '下次复习：',
            content_difficulty_check: '难度确认',
            content_difficulty_hint: '评价一下刚才的回忆难度，FSRS 会据此调整下一次复习时间。',
            content_mistake_detected: '检测到错误',
            content_error_type: '类型：{errorType}',
            content_always_analyze: '以后始终自动分析错误',
            content_notes: '笔记',
            content_notes_placeholder: '在这里记笔记...（CMD+Enter 保存）',
            content_external_update_pending: '有外部更新待同步',
            content_loading_notes: '加载中...',
            content_saving: '保存中...',
            content_saved_via_sync: '已通过同步保存',
            content_drag_tooltip: '长按即可拖动！',
            content_cancel_analysis: '取消分析',
            content_analyzing_request: '正在分析请求...',
            content_analysis_complete: '分析完成',
            drill_overview_page_title: '练习概览',
            drill_overview_brand: '练习集',
            drill_select_folder_prompt: '选择一个文件夹查看练习',
            drill_start_review_session: '开始复习',
            drill_start_review_count: '开始复习（{count}）',
            drill_no_drills: '暂无练习',
            drill_scroll_hint: '滚动卡片可翻面',
            drill_all_drills: '全部练习',
            drill_card_progress: '第 1 / {count} 题',
            drill_solution: '答案',
            drill_key_concept: '关键点',
            drill_no_explanation: '暂无解释。',
            drill_empty_folder: '这个文件夹里没有练习。',
            drill_type_fill_in_blank: '填空题',
            drill_type_spot_bug: '找 Bug',
            drill_type_critique: '代码点评',
            drill_type_muscle_memory: '默写解法',
            drills_page_title: '练习模式',
            drills_logo: '🧠 练习模式',
            drill_loading: '正在加载练习...',
            drill_loading_skill: '加载中...',
            drill_progress: '第 {current} / {total} 题',
            drill_fill_blank_label: '请填写空白：',
            drill_fill_blank_placeholder: '输入你的答案...',
            drill_spot_bug_instruction: '点击你认为有问题的 token。',
            drill_critique_label: '你的分析：',
            drill_critique_placeholder: '时间复杂度：O(...)\n空间复杂度：O(...)\n解释：',
            drill_write_solution_label: '写出你的解法：',
            drill_ai_hint: '已启用 AI 评估（支持伪代码或 Python）',
            drill_write_solution_placeholder: 'function binarySearch(arr, target):\n    left = 0, right = len(arr) - 1\n    while left <= right:\n        mid = (left + right) / 2\n        ...',
            drill_submit_answer: '提交答案',
            drill_correct: '回答正确！',
            drill_incorrect: '回答不正确',
            drill_next: '下一题',
            drill_finish_session: '结束本轮',
            drill_missing_id: '没有指定练习题',
            drill_return_extension: '返回扩展',
            drill_session_complete: '本轮完成！',
            drill_session_complete_subtitle: '你已经完成了本轮的所有练习。',
            drill_load_failed: '加载练习失败',
            drill_enter_answer: '请先输入答案',
            drill_ai_evaluating: 'AI 正在评估答案...',
            drill_skip_confirm: '要跳过这道题吗？',
            drill_expected_answer: '期望答案：{answer}',
            drill_answer_recorded: '已记录答案',
            drill_unknown_error: '未知错误',
            greeting_morning: '早上好',
            greeting_afternoon: '下午好',
            greeting_evening: '晚上好',
            greeting_all_strong: '你状态不错，所有技能都很稳。💪',
            greeting_one_skill: '有 1 个技能需要练习{skill}，继续巩固一下吧！',
            greeting_many_skills: '有 {count} 个技能需要练习，准备来几道 drill 吗？',
            greeting_drills_ready_one: '已有 {count} 道练习待做',
            greeting_drills_ready_many: '已有 {count} 道练习待做',
            greeting_dismiss: '关闭'
        }
    };

    const languageListeners = new Set();
    let storageListenerAttached = false;

    function normalizeLanguage(languageCode) {
        if (typeof languageCode !== 'string' || !languageCode) {
            return DEFAULT_LANGUAGE;
        }

        if (SUPPORTED_LANGUAGES.has(languageCode)) {
            return languageCode;
        }

        if (languageCode.startsWith('zh')) {
            return 'zh';
        }

        return DEFAULT_LANGUAGE;
    }

    function getLocaleTag(languageCode) {
        return normalizeLanguage(languageCode) === 'zh' ? 'zh-CN' : 'en-US';
    }

    function interpolate(template, values) {
        return String(template).replace(/\{(\w+)\}/g, function (match, key) {
            return Object.prototype.hasOwnProperty.call(values || {}, key) ? values[key] : match;
        });
    }

    function t(key, values, languageCode) {
        const language = normalizeLanguage(languageCode);
        const table = DICTIONARY[language] || DICTIONARY.en;
        const fallback = DICTIONARY.en || {};
        const template = table[key] || fallback[key] || key;
        return interpolate(template, values || {});
    }

    function getToggleLabel(languageCode) {
        return normalizeLanguage(languageCode) === 'zh' ? '中' : 'E';
    }

    function formatDate(dateValue, languageCode, options) {
        const date = new Date(dateValue);
        if (Number.isNaN(date.getTime())) return '';
        return new Intl.DateTimeFormat(getLocaleTag(languageCode), options || {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(date);
    }

    function formatDifficulty(difficulty, languageCode) {
        const normalized = String(difficulty || '').trim().toLowerCase();
        if (normalized === 'easy') return t('difficulty_easy', {}, languageCode);
        if (normalized === 'medium') return t('difficulty_medium', {}, languageCode);
        if (normalized === 'hard') return t('difficulty_hard', {}, languageCode);
        return t('difficulty_unknown', {}, languageCode);
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

    function storageSet(payload) {
        if (!(typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local)) {
            return Promise.resolve();
        }
        try {
            const result = chrome.storage.local.set(payload || {});
            if (result && typeof result.then === 'function') {
                return result;
            }
        } catch (e) {
            return new Promise(function (resolve) {
                chrome.storage.local.set(payload || {}, function () {
                    resolve();
                });
            });
        }
        return new Promise(function (resolve) {
            chrome.storage.local.set(payload || {}, function () {
                resolve();
            });
        });
    }

    async function getLanguage() {
        const result = await storageGet({ [STORAGE_KEY]: DEFAULT_LANGUAGE });
        return normalizeLanguage(result[STORAGE_KEY]);
    }

    async function setLanguage(languageCode) {
        const nextLanguage = normalizeLanguage(languageCode);
        await storageSet({ [STORAGE_KEY]: nextLanguage });
        notifyLanguageChange(nextLanguage);
        return nextLanguage;
    }

    async function toggleLanguage() {
        const currentLanguage = await getLanguage();
        return setLanguage(currentLanguage === 'zh' ? 'en' : 'zh');
    }

    function rememberDefault(node, key, value) {
        if (node.dataset[key] === undefined) {
            node.dataset[key] = value;
        }
    }

    function applyTranslations(rootNode, languageCode) {
        const root = rootNode || document;
        const language = normalizeLanguage(languageCode);

        if (root === document && document.documentElement) {
            document.documentElement.lang = getLocaleTag(language);
        }

        root.querySelectorAll('[data-i18n]').forEach(function (node) {
            rememberDefault(node, 'i18nDefault', node.textContent);
            node.textContent = t(node.dataset.i18n, {}, language) || node.dataset.i18nDefault;
        });

        root.querySelectorAll('[data-i18n-html]').forEach(function (node) {
            rememberDefault(node, 'i18nDefaultHtml', node.innerHTML);
            node.innerHTML = t(node.dataset.i18nHtml, {}, language) || node.dataset.i18nDefaultHtml;
        });

        root.querySelectorAll('[data-i18n-placeholder]').forEach(function (node) {
            rememberDefault(node, 'i18nDefaultPlaceholder', node.getAttribute('placeholder') || '');
            node.setAttribute('placeholder', t(node.dataset.i18nPlaceholder, {}, language) || node.dataset.i18nDefaultPlaceholder);
        });

        root.querySelectorAll('[data-i18n-title]').forEach(function (node) {
            rememberDefault(node, 'i18nDefaultTitle', node.getAttribute('title') || '');
            node.setAttribute('title', t(node.dataset.i18nTitle, {}, language) || node.dataset.i18nDefaultTitle);
        });

        root.querySelectorAll('[data-i18n-aria-label]').forEach(function (node) {
            rememberDefault(node, 'i18nDefaultAriaLabel', node.getAttribute('aria-label') || '');
            node.setAttribute('aria-label', t(node.dataset.i18nAriaLabel, {}, language) || node.dataset.i18nDefaultAriaLabel);
        });
    }

    function notifyLanguageChange(languageCode) {
        const normalized = normalizeLanguage(languageCode);
        languageListeners.forEach(function (listener) {
            try {
                listener(normalized);
            } catch (e) {
                console.warn('[EasyRepeatI18n] Language listener failed:', e);
            }
        });
    }

    function attachStorageListener() {
        if (storageListenerAttached) return;
        if (!(typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged)) return;

        chrome.storage.onChanged.addListener(function (changes, areaName) {
            if (areaName !== 'local' || !changes[STORAGE_KEY]) return;
            notifyLanguageChange(changes[STORAGE_KEY].newValue);
        });
        storageListenerAttached = true;
    }

    function onLanguageChange(listener, options) {
        if (typeof listener !== 'function') {
            return function () { };
        }

        attachStorageListener();
        languageListeners.add(listener);

        if (options && options.immediate) {
            getLanguage().then(listener).catch(function () {
                listener(DEFAULT_LANGUAGE);
            });
        }

        return function unsubscribe() {
            languageListeners.delete(listener);
        };
    }

    return {
        STORAGE_KEY: STORAGE_KEY,
        DEFAULT_LANGUAGE: DEFAULT_LANGUAGE,
        DICTIONARY: DICTIONARY,
        normalizeLanguage: normalizeLanguage,
        getLocaleTag: getLocaleTag,
        getLanguage: getLanguage,
        setLanguage: setLanguage,
        toggleLanguage: toggleLanguage,
        getToggleLabel: getToggleLabel,
        applyTranslations: applyTranslations,
        formatDate: formatDate,
        formatDifficulty: formatDifficulty,
        onLanguageChange: onLanguageChange,
        t: t,
        interpolate: interpolate
    };
}));
