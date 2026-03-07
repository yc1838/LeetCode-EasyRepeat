/**
 * CodeGeneratorAgent.js
 * 
 * Converts pseudo-code or natural language to executable Python code using LLM.
 * Part of Sprint 11.2: AI Judgment & Scaffolding.
 */

const CodeGeneratorAgent = {
    /**
     * Convert pseudo-code or natural language to Python code.
     * @param {string} input - User's pseudo-code or natural language
     * @param {object} context - { skillId, drillType, inputType }
     * @returns {Promise<object>} { success, code, language, confidence, error, retryable }
     */
    async generateCode(input, context = {}, retries = 2) {
        const traceId = context.traceId || `cg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        const startTime = Date.now();
        const safeContext = this._summarizeContext(context);
        const inputLength = typeof input === 'string' ? input.length : 0;

        console.log('[CodeGenerator] generateCode:start', {
            traceId,
            retriesRemaining: retries,
            inputLength,
            context: safeContext
        });

        // Edge case: empty, null, undefined input
        if (!input || typeof input !== 'string' || !input.trim()) {
            console.warn('[CodeGenerator] generateCode:invalid_input', {
                traceId,
                inputType: typeof input,
                inputLength
            });
            return {
                success: false,
                code: null,
                language: 'python',
                confidence: 0,
                error: 'Input is empty or invalid',
                retryable: false
            };
        }

        const cleanInput = input.trim();

        // Edge case: very long input (>10KB)
        const maxLength = 10000;
        const truncatedInput = cleanInput.length > maxLength
            ? cleanInput.slice(0, maxLength) + '\n# ... (truncated)'
            : cleanInput;

        if (cleanInput.length > maxLength) {
            console.warn('[CodeGenerator] generateCode:input_truncated', {
                traceId,
                originalLength: cleanInput.length,
                truncatedLength: truncatedInput.length,
                maxLength
            });
        }

        try {
            console.log('[CodeGenerator] generateCode:call_llm', {
                traceId,
                promptInputLength: truncatedInput.length
            });
            const response = await this._callLLM(truncatedInput, context, traceId);
            console.log('[CodeGenerator] generateCode:llm_response_received', {
                traceId,
                responseShape: this._summarizeResponseShape(response)
            });

            // Parse response
            const code = this._extractPythonCode(response, traceId);

            if (!code) {
                console.warn('[CodeGenerator] generateCode:python_extraction_failed', {
                    traceId,
                    elapsedMs: Date.now() - startTime,
                    responsePreview: this._extractResponsePreview(response)
                });
                return {
                    success: false,
                    code: null,
                    language: 'python',
                    confidence: 0,
                    error: 'LLM did not return valid Python code',
                    retryable: true
                };
            }

            const confidence = this._calculateConfidence(response, code);

            console.log('[CodeGenerator] generateCode:success', {
                traceId,
                elapsedMs: Date.now() - startTime,
                codeLength: code.length,
                confidence
            });

            return {
                success: true,
                code: code,
                language: 'python',
                confidence,
                error: null,
                retryable: false
            };

        } catch (error) {
            const errorMessage = error?.message || String(error);
            const normalizedMessage = errorMessage.toLowerCase();
            const isRateLimited = error?.status === 429 || normalizedMessage.includes('rate');
            const isTimeout = normalizedMessage.includes('timeout')
                || normalizedMessage.includes('network')
                || normalizedMessage.includes('fetch');

            console.error('[CodeGenerator] generateCode:error', {
                traceId,
                elapsedMs: Date.now() - startTime,
                retriesRemaining: retries,
                status: error?.status || null,
                message: errorMessage,
                isRateLimited,
                isTimeout
            });

            // Internal Retry for transient network errors
            if (retries > 0 && (isTimeout || isRateLimited)) {
                console.warn('[CodeGenerator] generateCode:retry_scheduled', {
                    traceId,
                    delayMs: 1000,
                    nextRetriesRemaining: retries - 1
                });
                // Simple backoff: 1s wait
                await new Promise(r => setTimeout(r, 1000));
                return this.generateCode(input, { ...context, traceId }, retries - 1);
            }

            const finalError = isTimeout ? 'Request timeout or network error' : (errorMessage || 'Unknown error');
            console.warn('[CodeGenerator] generateCode:failed', {
                traceId,
                error: finalError,
                retryable: isRateLimited || isTimeout
            });

            return {
                success: false,
                code: null,
                language: 'python',
                confidence: 0,
                error: finalError,
                retryable: isRateLimited || isTimeout
            };
        }
    },

    /**
     * Generate a pre-filled scaffold template with strategic blanks.
     * @param {object} options - { skillId, weakPattern, difficulty }
     * @returns {Promise<object>} { template, blanks }
     */
    async generateScaffold(options = {}) {
        const { skillId, weakPattern, difficulty } = options;

        // Get base template for the skill
        const baseTemplate = await this._getSkillTemplate(skillId, difficulty);

        if (!weakPattern) {
            // No weak pattern, return full template without blanks
            return {
                template: baseTemplate,
                blanks: []
            };
        }

        // Insert blanks at positions related to weak pattern
        const { template, blanks } = this._insertBlanks(baseTemplate, weakPattern);

        return {
            template,
            blanks
        };
    },

    // ============================================
    // Internal Methods
    // ============================================

    /**
     * Call LLM API to generate code.
     * @param {string} input 
     * @param {object} context 
     */
    async _callLLM(input, context, traceId = null) {
        // Check if LLMGateway is available (browser context)
        // Note: CodeGeneratorAgent might be used in context where LLMGateway is global
        const gateway = (typeof LLMGateway !== 'undefined') ? LLMGateway :
            (typeof self !== 'undefined' && self.LLMGateway) ? self.LLMGateway : null;

        if (gateway && gateway.generateContent) {
            const prompt = this._buildPrompt(input, context);
            console.log('[CodeGenerator] _callLLM:gateway_request', {
                traceId,
                promptLength: prompt.length,
                provider: gateway.currentProvider || gateway.provider || 'unknown'
            });
            try {
                const gatewayResponse = await gateway.generateContent(prompt);
                console.log('[CodeGenerator] _callLLM:gateway_response', {
                    traceId,
                    responseShape: this._summarizeResponseShape(gatewayResponse)
                });
                return gatewayResponse;
            } catch (error) {
                console.error('[CodeGenerator] _callLLM:gateway_error', {
                    traceId,
                    status: error?.status || null,
                    message: error?.message || String(error)
                });
                throw error;
            }
        }

        // Fallback for testing or when no LLM available
        console.warn('[CodeGenerator] _callLLM:fallback_stub', {
            traceId,
            reason: 'LLMGateway unavailable'
        });
        return {
            choices: [{
                message: {
                    content: `\`\`\`python\ndef solution():\n    pass\n\`\`\``
                }
            }]
        };
    },

    /**
     * Build prompt for LLM.
     */
    _buildPrompt(input, context) {
        const inputType = context.inputType || 'pseudo-code';
        const skill = context.skillId || 'algorithm';

        return `You are a Python code generator. Convert the following ${inputType} into clean, executable Python code.

Skill/Topic: ${skill}

User Input:
${input}

Requirements:
1. Output ONLY valid Python code
2. Use proper indentation
3. Include type hints where appropriate
4. Handle edge cases (empty input, None, etc.)
5. Wrap the code in \`\`\`python ... \`\`\` block

Generate the Python code:`;
    },

    /**
     * Extract Python code from LLM response.
     */
    _extractPythonCode(response, traceId = null) {
        if (!response) {
            console.warn('[CodeGenerator] _extractPythonCode:empty_response', { traceId });
            return null;
        }

        // Handle different response formats
        let content = '';
        let source = 'unknown';

        if (typeof response === 'string') {
            content = response;
            source = 'string';
        } else if (response.choices && response.choices[0]) {
            content = response.choices[0].message?.content || response.choices[0].text || '';
            source = 'choices[0]';
        } else if (response.text) {
            content = response.text;
            source = 'text';
        }

        if (!content) {
            console.warn('[CodeGenerator] _extractPythonCode:empty_content', {
                traceId,
                source,
                responseShape: this._summarizeResponseShape(response)
            });
            return null;
        }

        // Extract code from markdown block
        const pythonMatch = content.match(/```python\s*([\s\S]*?)```/);
        if (pythonMatch) {
            console.log('[CodeGenerator] _extractPythonCode:python_block', {
                traceId,
                source,
                extractedLength: pythonMatch[1].trim().length
            });
            return pythonMatch[1].trim();
        }

        // Try generic code block
        const genericMatch = content.match(/```\s*([\s\S]*?)```/);
        if (genericMatch) {
            console.warn('[CodeGenerator] _extractPythonCode:generic_block', {
                traceId,
                source,
                extractedLength: genericMatch[1].trim().length
            });
            return genericMatch[1].trim();
        }

        // If no code block, check if content looks like code
        if (content.includes('def ') || content.includes('class ')) {
            console.warn('[CodeGenerator] _extractPythonCode:heuristic_match', {
                traceId,
                source,
                extractedLength: content.trim().length
            });
            return content.trim();
        }

        console.warn('[CodeGenerator] _extractPythonCode:no_code_found', {
            traceId,
            source,
            preview: this._extractResponsePreview(content)
        });

        return null;
    },

    /**
     * Calculate confidence score based on response quality.
     */
    _calculateConfidence(response, extractedCode = null) {
        if (!response) return 0;

        let score = 0.5; // Base score

        const code = extractedCode || this._extractPythonCode(response);
        if (code) {
            // Has valid Python syntax markers
            if (code.includes('def ')) score += 0.2;
            if (code.includes('return ')) score += 0.1;
            if (code.includes(':')) score += 0.1;
        }

        return Math.min(score, 1.0);
    },

    /**
     * Keep context logs compact and stable.
     */
    _summarizeContext(context = {}) {
        return {
            skillId: context.skillId || null,
            drillType: context.drillType || null,
            inputType: context.inputType || null
        };
    },

    /**
     * Summarize response structure without dumping full payloads.
     */
    _summarizeResponseShape(response) {
        if (response === null || response === undefined) {
            return { type: String(response) };
        }

        if (typeof response === 'string') {
            return { type: 'string', length: response.length };
        }

        if (typeof response !== 'object') {
            return { type: typeof response };
        }

        const keys = Object.keys(response);
        return {
            type: 'object',
            keys: keys.slice(0, 8),
            hasChoices: Array.isArray(response.choices),
            choiceCount: Array.isArray(response.choices) ? response.choices.length : 0,
            hasText: typeof response.text === 'string'
        };
    },

    /**
     * Get compact preview for troubleshooting.
     */
    _extractResponsePreview(response, maxLength = 160) {
        let content = '';

        if (typeof response === 'string') {
            content = response;
        } else if (response && typeof response === 'object' && Array.isArray(response.choices) && response.choices[0]) {
            content = response.choices[0].message?.content || response.choices[0].text || '';
        } else if (response && typeof response === 'object' && typeof response.text === 'string') {
            content = response.text;
        } else if (response && typeof response === 'object') {
            content = JSON.stringify(this._summarizeResponseShape(response));
        } else {
            content = String(response || '');
        }

        const normalized = content.replace(/\s+/g, ' ').trim();
        if (normalized.length <= maxLength) return normalized;
        return `${normalized.slice(0, maxLength)}...`;
    },

    /**
     * Get base template for a skill.
     */
    async _getSkillTemplate(skillId, difficulty) {
        // Templates for common skills
        const templates = {
            binary_search: `def binary_search(arr, target):
    left, right = 0, len(arr) - 1
    while left <= right:
        mid = (left + right) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1`,

            two_pointers: `def two_pointers(arr):
    left, right = 0, len(arr) - 1
    while left < right:
        # Process elements
        left += 1
        right -= 1
    return result`,

            sliding_window: `def sliding_window(arr, k):
    window_sum = sum(arr[:k])
    max_sum = window_sum
    for i in range(k, len(arr)):
        window_sum += arr[i] - arr[i - k]
        max_sum = max(max_sum, window_sum)
    return max_sum`
        };

        return templates[skillId] || templates.binary_search;
    },

    /**
     * Insert blanks at strategic positions based on weak pattern.
     */
    _insertBlanks(template, weakPattern) {
        const lines = template.split('\n');
        const blanks = [];

        // Pattern to line keyword mapping
        const patternKeywords = {
            'off-by-one': ['len(', '- 1', '+ 1'],
            'loop-boundary': ['while', 'for', '<=', '<'],
            'null-check': ['if ', 'None', 'not '],
            'index-error': ['[', ']', 'mid']
        };

        const keywords = patternKeywords[weakPattern] || patternKeywords['off-by-one'];

        // Find lines containing keywords and blank them
        lines.forEach((line, index) => {
            for (const keyword of keywords) {
                if (line.includes(keyword) && blanks.length < 2) {
                    // Replace the keyword with blank
                    const blankLine = line.replace(keyword, '___');
                    lines[index] = blankLine;
                    blanks.push({
                        lineNumber: index + 1,
                        original: keyword,
                        hint: `Fill in the ${weakPattern} related code`
                    });
                    break;
                }
            }
        });

        return {
            template: lines.join('\n'),
            blanks
        };
    }
};

// Export for both Node (Jest) and Browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CodeGeneratorAgent;
} else {
    self.CodeGeneratorAgent = CodeGeneratorAgent;
}
