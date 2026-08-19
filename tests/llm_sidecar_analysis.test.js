/**
 * @jest-environment jsdom
 */

describe('LLM Sidecar mistake-analysis contract', () => {
    let hooks;
    let uiLanguage;

    beforeEach(() => {
        jest.resetModules();
        document.body.innerHTML = '';
        uiLanguage = 'en';

        delete window.LLMSidecar;
        delete window.VectorDB;

        window.EasyRepeatI18n = {
            getLanguage: jest.fn(() => Promise.resolve(uiLanguage))
        };

        global.chrome = {
            runtime: {
                id: 'test-extension-id',
                lastError: null,
                sendMessage: jest.fn()
            },
            storage: {
                local: {
                    get: jest.fn((defaults) => Promise.resolve(defaults || {})),
                    set: jest.fn(() => Promise.resolve())
                },
                onChanged: {
                    addListener: jest.fn()
                }
            }
        };

        require('../src/content/llm_sidecar.js');
        hooks = window.LLMSidecar.__test;
    });

    afterEach(() => {
        delete global.chrome;
        delete window.EasyRepeatI18n;
        delete window.LLMSidecar;
        delete window.VectorDB;
    });

    test('resolves the requested analysis language from explicit metadata or UI language', async () => {
        expect(hooks.normalizeAnalysisLanguage('zh-CN')).toBe('zh');
        expect(hooks.normalizeAnalysisLanguage('en-US')).toBe('en');

        uiLanguage = 'zh';
        await expect(hooks.resolveAnalysisLanguage({})).resolves.toBe('zh');
        await expect(hooks.resolveAnalysisLanguage({ ui_language: 'en' })).resolves.toBe('en');
    });

    test('falls back to the language stored by the options page', async () => {
        delete window.EasyRepeatI18n;
        chrome.storage.local.get.mockResolvedValue({ uiLanguage: 'zh-CN' });

        await expect(hooks.resolveAnalysisLanguage({})).resolves.toBe('zh');
    });

    test.each([
        {
            language: 'en',
            systemLanguage: 'English',
            labels: [
                '### 🤖 Analysis:',
                '**Submission status:**',
                '**Why it failed:**',
                '**Correct approach:**',
                '**Corrected code:**',
                '**What is still missing (',
                '**Hint:**',
                '*(Skill:'
            ]
        },
        {
            language: 'zh',
            systemLanguage: 'Simplified Chinese',
            labels: [
                '### 🤖 错误分析',
                '**提交状态:**',
                '**为什么错',
                '**正确思路',
                '**正确写法',
                '**距离正确答案还缺什么（部分完成）',
                '**提示',
                '*(薄弱技能'
            ]
        }
    ])('builds $language prompts and formats all user-facing labels', ({ language, systemLanguage, labels }) => {
        const { systemPrompt, prompt } = hooks.buildMistakePrompts({
            language,
            submissionState: 'ANALYZABLE_ATTEMPT',
            title: 'Two Sum',
            difficulty: 'Easy',
            programmingLanguage: 'Python3',
            topics: ['Array', 'Hash Table'],
            captureStatus: 'partial',
            errorDetails: 'Wrong Answer',
            testInput: '[2, 7, 11, 15], 9',
            actualOutput: '[0, 0]',
            expectedOutput: '[0, 1]',
            code: 'return [0, 0]'
        });

        expect(systemPrompt).toContain(`requested response language is ${systemLanguage}`);
        expect(systemPrompt).toContain(`Write every user-facing value in ${systemLanguage}`);
        expect(systemPrompt).toContain(language === 'zh'
            ? '所有面向用户的说明字段必须使用简体中文'
            : 'All user-facing explanation fields must be written in English');
        expect(prompt).toContain('"schema_version": 2');
        expect(prompt).toContain('"submission_state"');
        expect(prompt).toContain('"root_cause"');
        expect(prompt).toContain('"fix"');
        expect(prompt).toContain('"corrected_code"');
        expect(prompt).toContain('"solution_progress"');
        expect(prompt).toContain('"missing_parts"');
        expect(prompt).toContain('"user_hint"');
        expect(prompt).toContain('Programming language: Python3');
        expect(prompt).toContain('Code capture status: partial');
        expect(prompt).toContain('captured code may be incomplete');
        expect(prompt).toContain('<actual_output>\n[0, 0]\n</actual_output>');
        expect(prompt).toContain('<expected_output>\n[0, 1]\n</expected_output>');

        const formatted = hooks.formatMistakeAnalysis({
            schema_version: 2,
            submission_state: 'ANALYZABLE_ATTEMPT',
            root_cause: language === 'zh' ? '边界条件少了等号。' : 'The boundary condition omits equality.',
            fix: language === 'zh' ? '循环应包含右边界。' : 'Include the right boundary in the loop.',
            corrected_code: 'while (left <= right) {}',
            solution_progress: 'PARTIAL',
            missing_parts: language === 'zh' ? '还需要处理空输入。' : 'Empty input handling is still missing.',
            user_hint: language === 'zh' ? '先写清循环不变式。' : 'Write down the loop invariant first.',
            family: 'LOGIC',
            specific_tag: 'OFF_BY_ONE',
            is_recurring: false,
            micro_skill: 'Boundary Conditions',
            anti_pattern: 'Off-by-one',
            micro_skill_label: language === 'zh' ? '边界条件' : 'Boundary Conditions',
            anti_pattern_label: language === 'zh' ? '边界差一' : 'Off-by-one',
            rationale: ''
        }, language);

        labels.forEach(label => expect(formatted).toContain(label));
        if (language === 'zh') {
            expect(formatted).not.toContain('**Why it failed:**');
            expect(formatted).not.toContain('**Correct approach:**');
        } else {
            expect(formatted).not.toContain('**为什么错');
            expect(formatted).not.toContain('**正确思路');
        }
    });

    test.each([
        ['empty code', '   ', { code_capture_status: 'partial' }, 'EMPTY_SUBMISSION'],
        ['zero-width-only code', '\u200B\uFEFF', { code_capture_status: 'partial' }, 'EMPTY_SUBMISSION'],
        ['comment-only code', '# nothing implemented', { code_capture_status: 'partial' }, 'EMPTY_SUBMISSION'],
        ['severely incomplete stub', 'class Solution:\n    def solve(self):\n        pass', { code_capture_status: 'partial' }, 'INCOMPLETE_ATTEMPT'],
        ['ellipsis stub', 'class Solution:\n    def solve(self):\n        ...', { code_capture_status: 'partial' }, 'INCOMPLETE_ATTEMPT'],
        ['bodyless Python function', 'class Solution:\n    def solve(self):', { code_capture_status: 'partial' }, 'INCOMPLETE_ATTEMPT'],
        ['empty JavaScript function', 'const solve = function(nums) { };', { code_capture_status: 'partial' }, 'INCOMPLETE_ATTEMPT'],
        ['capture failure', '', { code_capture_status: 'failed' }, 'CAPTURE_UNAVAILABLE'],
        ['legacy capture-failure sentinel', '// Code could not be scraped. Please check permissions.', {}, 'CAPTURE_UNAVAILABLE'],
        ['short but substantive code', 'def identity(x):\n    return x', { code_capture_status: 'partial' }, 'ANALYZABLE_ATTEMPT']
    ])('classifies %s without conflating empty input and capture failure', (_name, code, meta, expectedState) => {
        expect(hooks.assessCapturedCode(code, meta).state).toBe(expectedState);
    });

    test('asks the model for a localized starting hint when the submitted code is empty', async () => {
        const modelAnalysis = {
            schema_version: 2,
            submission_state: 'EMPTY_SUBMISSION',
            root_cause: '当前还没有可执行的解题逻辑。',
            fix: '先写出输入、核心循环与返回值。',
            corrected_code: '',
            solution_progress: 'FAR',
            missing_parts: '核心算法、边界处理和返回结果。',
            user_hint: '先用伪代码写出一条完整执行路径。',
            family: 'SETUP',
            specific_tag: 'GENERAL',
            is_recurring: false,
            micro_skill: 'Solution Setup',
            anti_pattern: 'Empty submission',
            micro_skill_label: '解题骨架',
            anti_pattern_label: '空提交',
            rationale: '没有代码时不能定位具体 Bug。'
        };

        chrome.runtime.sendMessage.mockImplementation((request, callback) => {
            callback({
                success: true,
                ok: true,
                status: 200,
                data: JSON.stringify({
                    message: { content: JSON.stringify(modelAnalysis) }
                })
            });
        });

        const result = await window.LLMSidecar.analyzeMistake('', 'Wrong Answer', {
            ui_language: 'zh',
            code_capture_status: 'partial',
            title: 'Two Sum',
            difficulty: 'Easy'
        });

        expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
        const request = chrome.runtime.sendMessage.mock.calls[0][0];
        const requestBody = JSON.parse(request.options.body);
        const userPrompt = requestBody.messages.find(message => message.role === 'user').content;
        expect(userPrompt).toContain('Preflight submission state: EMPTY_SUBMISSION');
        expect(result).toContain('**提交状态:** 可见编辑器快照中未读取到有效解答');
        expect(result).toContain('编辑器快照可能不完整');
        expect(result).toContain('**提示');
        expect(result).toContain('先用伪代码写出一条完整执行路径');
    });

    test('returns a local capture warning without calling the model when editor capture failed', async () => {
        const result = await window.LLMSidecar.analyzeMistake('', 'Wrong Answer', {
            ui_language: 'zh',
            code_capture_status: 'failed',
            code_capture_reason: 'editor_lines_not_found'
        });

        expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
        expect(result).toContain('扩展未能读取编辑器内容');
        expect(result).toContain('这并不代表你提交了空答案');
    });

    test('only sends provider-specific base URLs to the Safe Observer backend', () => {
        const providerBaseUrls = {
            deepseek: 'https://deepseek.example/v1',
            qwen: 'https://dashscope.example/v1',
            custom: 'https://compatible.example/v1'
        };
        const localEndpoint = 'http://localhost:11434';

        expect(hooks.resolveAutofixBaseUrl('ollama', providerBaseUrls, localEndpoint)).toBe(localEndpoint);
        expect(hooks.resolveAutofixBaseUrl('deepseek', providerBaseUrls, localEndpoint)).toBe(providerBaseUrls.deepseek);
        expect(hooks.resolveAutofixBaseUrl('qwen', providerBaseUrls, localEndpoint)).toBe(providerBaseUrls.qwen);
        expect(hooks.resolveAutofixBaseUrl('custom', providerBaseUrls, localEndpoint)).toBe(providerBaseUrls.custom);
        expect(hooks.resolveAutofixBaseUrl('openai', providerBaseUrls, localEndpoint)).toBeNull();
        expect(hooks.resolveAutofixBaseUrl('google', providerBaseUrls, localEndpoint)).toBeNull();
        expect(hooks.resolveAutofixBaseUrl('anthropic', providerBaseUrls, localEndpoint)).toBeNull();
    });

    test('extracts a fenced JSON object surrounded by model prose', () => {
        const parsed = hooks.extractJsonObject([
            'Here is the requested object:',
            '```json',
            '{"root_cause":"condition {x} is wrong","fix":"use <=","specific_tag":"OFF_BY_ONE"}',
            '```',
            'Done.'
        ].join('\n'));

        expect(parsed).toEqual({
            root_cause: 'condition {x} is wrong',
            fix: 'use <=',
            specific_tag: 'OFF_BY_ONE'
        });
    });

    test('normalizes legacy JSON fields into the v2 schema', () => {
        const normalized = hooks.normalizeMistakeAnalysis({
            root_cause: 'Loop stops one step early.',
            fix: 'Use <=.',
            code_fix: 'while (left <= right) {}',
            gap_to_solution: ['Boundary handling', 'Empty input'],
            hint: 'Check the final index.',
            category: 'logic',
            tag: 'off_by_one',
            micro_skill: 'Boundary Conditions',
            anti_pattern: 'Off-by-one'
        }, '', 'en', {
            submissionState: 'ANALYZABLE_ATTEMPT',
            isRecurrence: true
        });

        expect(normalized).toEqual(expect.objectContaining({
            schema_version: 2,
            submission_state: 'ANALYZABLE_ATTEMPT',
            corrected_code: 'while (left <= right) {}',
            missing_parts: 'Boundary handling; Empty input',
            user_hint: 'Check the final index.',
            family: 'LOGIC',
            specific_tag: 'OFF_BY_ONE',
            is_recurring: true,
            output_language: 'en'
        }));
    });

    test('keeps exact local empty/incomplete states even if the model tries to upgrade them', () => {
        const empty = hooks.normalizeMistakeAnalysis({
            submission_state: 'ANALYZABLE_ATTEMPT',
            root_cause: 'incorrect model classification'
        }, '', 'en', { submissionState: 'EMPTY_SUBMISSION' });
        const incomplete = hooks.normalizeMistakeAnalysis({
            submission_state: 'ANALYZABLE_ATTEMPT',
            root_cause: 'incorrect model classification'
        }, '', 'en', { submissionState: 'INCOMPLETE_ATTEMPT' });

        expect(empty.submission_state).toBe('EMPTY_SUBMISSION');
        expect(incomplete.submission_state).toBe('INCOMPLETE_ATTEMPT');
    });

    test('keeps malformed non-JSON model text in a localized fallback', () => {
        const normalized = hooks.normalizeMistakeAnalysis(
            null,
            '模型未返回 JSON，但保留这段分析。',
            'zh',
            { submissionState: 'ANALYZABLE_ATTEMPT' }
        );
        const formatted = hooks.formatMistakeAnalysis(normalized, 'zh');

        expect(normalized.root_cause).toBe('模型未返回 JSON，但保留这段分析。');
        expect(normalized.output_language).toBe('zh');
        expect(formatted).toContain('**为什么错');
        expect(formatted).toContain('**正确思路');
        expect(formatted).not.toContain('See detailed analysis.');
    });
});
