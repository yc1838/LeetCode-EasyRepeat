/**
 * Drill Generator
 * 
 * Generates personalized drills using the active user-selected model based on weak skills.
 */

(function (root, factory) {
    console.log('[DrillGenerator] UMD wrapper executing');

    const exports = factory();

    // Always attach to self in browser contexts (including ES modules)
    if (typeof self !== 'undefined') {
        self.DrillGenerator = exports;
        console.log('[DrillGenerator] Attached to self.DrillGenerator');
    }

    // Also support CommonJS for tests
    if (typeof module === 'object' && module.exports) {
        module.exports = exports;
    }
}(typeof self !== 'undefined' ? self : this, function () {

    // Import dependencies
    let LLMGateway, DrillStore;
    const globalRoot = typeof self !== 'undefined'
        ? self
        : (typeof globalThis !== 'undefined' ? globalThis : this);
    const DebugLog = globalRoot?.NeuralDebug || {
        log: () => { },
        warn: () => { },
        groupCollapsed: () => { },
        groupEnd: () => { }
    };

    if (typeof require !== 'undefined') {
        LLMGateway = require('./llm_gateway');
        DrillStore = require('./drill_store');
    }
    // Browser/service-worker fallback to globals loaded via importScripts
    if (!LLMGateway && globalRoot && globalRoot.LLMGateway) {
        LLMGateway = globalRoot.LLMGateway;
    }
    if (!DrillStore && globalRoot && globalRoot.DrillStore) {
        DrillStore = globalRoot.DrillStore;
    }
    if (!LLMGateway) {
        DebugLog.warn('[DrillGenerator] LLMGateway not found on global scope.');
    }
    if (!DrillStore) {
        DebugLog.warn('[DrillGenerator] DrillStore not found on global scope.');
    }

    const DRILL_TYPES = ['fill-in-blank', 'spot-bug', 'critique', 'muscle-memory'];
    const DEFAULT_DRILLS_PER_SKILL = 3;
    const DEFAULT_MIN_TOTAL_DRILLS = 6;
    const DEFAULT_SKILL_ATTEMPTS = 3;
    const DEFAULT_MAX_RETRIES_PER_ATTEMPT = 2;
    const DEFAULT_DRILL_TEMPERATURE = 0.6;
    const MIN_CONTENT_LENGTH = 20;
    const DRILL_CATEGORIES = ['problem', 'language', 'algo'];
    const DEFAULT_MAX_OUTPUT_TOKENS = 4096;
    const DEFAULT_ALLOWED_TYPES = ['fill-in-blank', 'spot-bug', 'muscle-memory'];
    const DEFAULT_MAX_PER_SKILL = 9;
    const DEFAULT_MAX_PER_SKILL_TYPE = 3;

    function toPositiveInt(value, fallback) {
        const num = Number(value);
        if (!Number.isFinite(num) || num <= 0) return fallback;
        return Math.floor(num);
    }

    function dedupeWeakSkills(weakSkills) {
        const map = new Map();
        for (const item of weakSkills || []) {
            const skillId = typeof item?.skillId === 'string' ? item.skillId.trim() : '';
            if (!skillId) continue;
            const insight = typeof item?.insight === 'string' ? item.insight.trim() : '';
            if (!map.has(skillId)) {
                map.set(skillId, { skillId, insight });
                continue;
            }

            if (!insight) continue;
            const existing = map.get(skillId);
            if (!existing.insight) {
                existing.insight = insight;
            } else if (!existing.insight.includes(insight)) {
                existing.insight = `${existing.insight}; ${insight}`;
            }
        }
        return Array.from(map.values());
    }

    function normalizeAllowedTypes(types) {
        const source = Array.isArray(types) && types.length > 0 ? types : DEFAULT_ALLOWED_TYPES;
        const filtered = source.filter(type => DRILL_TYPES.includes(type));
        return filtered.length > 0 ? Array.from(new Set(filtered)) : DEFAULT_ALLOWED_TYPES;
    }

    function buildRepairHint({ count, attempt }) {
        return `\nPrevious response was invalid or incomplete (attempt ${attempt - 1}). Retry and output STRICT JSON with EXACTLY ${count} drill objects. No markdown, no prose, no comments.`;
    }

    // Skill-specific template libraries for common algorithms
    const DEFAULT_SKILL_TEMPLATES = {
        binary_search: [
            {
                type: 'fill-in-blank',
                content: 'def binary_search(arr, target):\n    left, right = 0, len(arr) - 1\n    while left <= right:\n        mid = (left + right) // 2\n        if arr[mid] == target:\n            return mid\n        elif arr[mid] < target:\n            left = ___\n        else:\n            right = mid - 1\n    return -1',
                answer: 'mid + 1',
                explanation: 'After checking mid, the target must be in the right half, so left = mid + 1.',
                difficulty: 'easy'
            },
            {
                type: 'spot-bug',
                content: 'def binary_search(arr, target):\n    left, right = 0, len(arr)\n    while left < right:\n        mid = (left + right) // 2\n        if arr[mid] == target:\n            return mid\n        elif arr[mid] < target:\n            left = mid + 1\n        else:\n            right = mid\n    return -1',
                answer: 'line 2',
                explanation: 'right should be len(arr) - 1 for inclusive bounds, or the while condition should be left < right for exclusive.',
                difficulty: 'medium'
            },
            {
                type: 'muscle-memory',
                content: 'Write a binary search function from memory that finds the index of a target in a sorted array. Handle the case where the target is not found.',
                answer: null,
                explanation: 'Key points: left/right bounds, while loop condition, mid calculation, and adjusting bounds correctly.',
                difficulty: 'medium'
            },
            {
                type: 'critique',
                content: 'def binary_search(arr, target):\n    left, right = 0, len(arr) - 1\n    while left <= right:\n        mid = (left + right) // 2\n        if arr[mid] < target:\n            left = mid + 1\n        elif arr[mid] > target:\n            right = mid - 1\n        else:\n            return mid\n    return -1',
                answer: null,
                explanation: 'Consider potential integer overflow in mid calculation for very large arrays: use left + (right - left) // 2 instead.',
                difficulty: 'medium'
            }
        ],
        bfs: [
            {
                type: 'fill-in-blank',
                content: 'from collections import deque\ndef bfs(graph, start):\n    visited = set([start])\n    queue = ___([start])\n    while queue:\n        node = queue.popleft()\n        for neighbor in graph[node]:\n            if neighbor not in visited:\n                visited.add(neighbor)\n                queue.append(neighbor)\n    return visited',
                answer: 'deque',
                explanation: 'BFS uses a deque (double-ended queue) for O(1) popleft operations.',
                difficulty: 'easy'
            },
            {
                type: 'spot-bug',
                content: 'from collections import deque\ndef bfs(graph, start):\n    visited = set()\n    queue = deque([start])\n    while queue:\n        node = queue.popleft()\n        for neighbor in graph[node]:\n            if neighbor not in visited:\n                visited.add(neighbor)\n                queue.append(neighbor)\n    return visited',
                answer: 'line 3',
                explanation: 'The start node is not added to visited before the loop, so it will be visited but not included in the visited set initially, causing potential revisits.',
                difficulty: 'medium'
            },
            {
                type: 'muscle-memory',
                content: 'Write a BFS function from memory that traverses a graph from a start node. Use a queue and visited set. Return the list of nodes in BFS order.',
                answer: null,
                explanation: 'Key: use deque for the queue, mark visited BEFORE enqueuing to avoid duplicates.',
                difficulty: 'medium'
            },
            {
                type: 'critique',
                content: 'def bfs(graph, start):\n    visited = []\n    queue = [start]\n    while queue:\n        node = queue.pop(0)\n        if node not in visited:\n            visited.append(node)\n            for neighbor in graph[node]:\n                queue.append(neighbor)\n    return visited',
                answer: null,
                explanation: 'Issues: list.pop(0) is O(n) — use deque.popleft(); checking visited via list is O(n) — use a set; neighbors should be filtered before enqueuing.',
                difficulty: 'medium'
            }
        ],
        dfs: [
            {
                type: 'fill-in-blank',
                content: 'def dfs(graph, start):\n    visited = set()\n    stack = [start]\n    result = []\n    while stack:\n        node = stack.___()\n        if node not in visited:\n            visited.add(node)\n            result.append(node)\n            for neighbor in graph[node]:\n                stack.append(neighbor)\n    return result',
                answer: 'pop',
                explanation: 'DFS uses a stack, and pop() removes the last element (LIFO order).',
                difficulty: 'easy'
            },
            {
                type: 'spot-bug',
                content: 'def dfs_recursive(graph, node, visited=None):\n    if visited is None:\n        visited = set()\n    visited.add(node)\n    for neighbor in graph[node]:\n        dfs_recursive(graph, neighbor, visited)\n    return visited',
                answer: 'line 6',
                explanation: 'Missing check: should only recurse if neighbor not in visited, otherwise infinite loop on cycles.',
                difficulty: 'medium'
            },
            {
                type: 'muscle-memory',
                content: 'Write both iterative and recursive DFS functions from memory. The graph is represented as an adjacency list. Handle cycles correctly.',
                answer: null,
                explanation: 'Key: visited set to avoid cycles, stack for iterative, recursion with base case for recursive.',
                difficulty: 'hard'
            },
            {
                type: 'critique',
                content: 'def dfs(graph, start):\n    visited = set()\n    def helper(node):\n        visited.add(node)\n        for neighbor in graph[node]:\n            if neighbor not in visited:\n                helper(neighbor)\n    helper(start)\n    return visited',
                answer: null,
                explanation: 'Consider recursion depth limit for large graphs. Python default recursion limit is ~1000. For large graphs, use iterative DFS with an explicit stack.',
                difficulty: 'medium'
            }
        ],
        two_pointers: [
            {
                type: 'fill-in-blank',
                content: 'def two_sum_sorted(nums, target):\n    left, right = 0, len(nums) - 1\n    while left < right:\n        current_sum = nums[left] + nums[right]\n        if current_sum == target:\n            return [left, right]\n        elif current_sum < target:\n            left += 1\n        else:\n            right ___ 1\n    return []',
                answer: '-=',
                explanation: 'When the sum is too large, decrease the right pointer to get a smaller value.',
                difficulty: 'easy'
            },
            {
                type: 'spot-bug',
                content: 'def remove_duplicates(nums):\n    if not nums:\n        return 0\n    write = 1\n    for read in range(len(nums)):\n        if nums[read] != nums[write - 1]:\n            nums[write] = nums[read]\n            write += 1\n    return write',
                answer: 'line 5',
                explanation: 'read should start from 1, not 0. Starting from 0 means comparing the first element with itself.',
                difficulty: 'medium'
            },
            {
                type: 'muscle-memory',
                content: 'Write a two-pointer function from memory that finds a pair in a sorted array summing to a target value. Return the pair of indices.',
                answer: null,
                explanation: 'Key: one pointer at start, one at end. Move left pointer right if sum too small, right pointer left if sum too large.',
                difficulty: 'easy'
            },
            {
                type: 'critique',
                content: 'def is_palindrome(s):\n    s = s.lower()\n    left = 0\n    right = len(s) - 1\n    while left < right:\n        if s[left] != s[right]:\n            return False\n        left += 1\n        right -= 1\n    return True',
                answer: null,
                explanation: 'Missing: should filter non-alphanumeric characters. As-is, spaces and punctuation cause false negatives.',
                difficulty: 'medium'
            }
        ],
        sliding_window: [
            {
                type: 'fill-in-blank',
                content: 'def max_sum_subarray(nums, k):\n    if len(nums) < k:\n        return 0\n    window_sum = sum(nums[:k])\n    max_sum = window_sum\n    for i in range(k, len(nums)):\n        window_sum += nums[i] - nums[i - ___]\n        max_sum = max(max_sum, window_sum)\n    return max_sum',
                answer: 'k',
                explanation: 'Subtract the element leaving the window (k positions back) to maintain the sliding window sum.',
                difficulty: 'easy'
            },
            {
                type: 'spot-bug',
                content: 'def longest_unique_substring(s):\n    seen = {}\n    left = 0\n    max_len = 0\n    for right in range(len(s)):\n        if s[right] in seen:\n            left = seen[s[right]] + 1\n        seen[s[right]] = right\n        max_len = max(max_len, right - left + 1)\n    return max_len',
                answer: 'line 7',
                explanation: 'left should be max(left, seen[s[right]] + 1) to avoid moving left backwards when a duplicate is found before the current window.',
                difficulty: 'hard'
            },
            {
                type: 'muscle-memory',
                content: 'Write a sliding window function from memory that finds the maximum sum of any contiguous subarray of size k.',
                answer: null,
                explanation: 'Key: initialize window with first k elements, then slide by adding next and removing first.',
                difficulty: 'easy'
            },
            {
                type: 'critique',
                content: 'def min_window_substring(s, t):\n    from collections import Counter\n    need = Counter(t)\n    have = {}\n    left = 0\n    result = ""\n    for right in range(len(s)):\n        have[s[right]] = have.get(s[right], 0) + 1\n        while all(have.get(c, 0) >= need[c] for c in need):\n            if not result or right - left + 1 < len(result):\n                result = s[left:right+1]\n            have[s[left]] -= 1\n            left += 1\n    return result',
                answer: null,
                explanation: 'The all() check inside the while loop is O(|t|) per iteration. Use a counter of matched characters for O(1) window validity check.',
                difficulty: 'hard'
            }
        ]
    };

    // Mutable state: initialized with defaults, expanded via storage
    let SKILL_TEMPLATES = { ...DEFAULT_SKILL_TEMPLATES };

    /**
     * Initialize DrillGenerator by loading custom skills from storage.
     * Should be called on startup.
     */
    async function init() {
        try {
            const result = await chrome.storage.local.get('custom_skills');
            const customSkills = result.custom_skills || {};
            
            // Merge custom skills into the template library
            // Custom skills override defaults if there's a collision (though we usually avoid collision)
            SKILL_TEMPLATES = {
                ...DEFAULT_SKILL_TEMPLATES,
                ...customSkills
            };
            
            // DebugLog.log(`[DrillGenerator] Initialized with ${Object.keys(SKILL_TEMPLATES).length} skills (${Object.keys(customSkills).length} custom).`);
        } catch (e) {
            console.error('[DrillGenerator] Failed to init custom skills:', e);
        }
    }

    /**
     * Get the list of currently valid/known skills.
     * @returns {string[]} Array of skill IDs
     */
    function getValidSkills() {
        return Object.keys(SKILL_TEMPLATES);
    }

    /**
     * Acquire a new skill by asking LLM to generate templates for it.
     * Validates and persists the new skill.
     * 
     * @param {string} skillId - The new skill ID (snake_case)
     * @param {string} insight - Context/description of the skill
     * @returns {Promise<boolean>} True if successful
     */
    async function acquireNewSkill(skillId, insight) {
        // Don't overwrite if already exists
        if (SKILL_TEMPLATES[skillId]) {
            return true;
        }

        try {
            const prompt = `You are a coding tutor. I need to create a drill set for a new skill: "${skillId}".
Context/Insight: "${insight}".

Generate 4 drill templates for this skill, one of each type:
1. fill-in-blank (focus on syntax/structure)
2. spot-bug (common error)
3. muscle-memory (write from scratch)
4. critique (identify bad practice)

Output JSON ONLY (array of 4 objects):
[
  {
    "type": "fill-in-blank",
    "content": "code with ___ placeholder",
    "answer": "missing part",
    "explanation": "why",
    "difficulty": "easy"
  },
  ...
]`;

            const response = await LLMGateway.analyzeSubmissions(prompt, {
                temperature: 0.5,
                maxOutputTokens: 1024,
                responseMimeType: 'application/json'
            });

            if (!response || response.error) {
                console.error('[DrillGenerator] LLM failed to acquire skill:', response?.error);
                return false;
            }

            const templates = response.templates || response.drills || (Array.isArray(response) ? response : null);

            if (!Array.isArray(templates) || templates.length === 0) {
                console.error('[DrillGenerator] Invalid template format received');
                return false;
            }

            // Basic validation
            const validTemplates = templates.filter(t => validateDrill(t));
            
            if (validTemplates.length === 0) {
                return false;
            }

            // Save to storage
            const result = await chrome.storage.local.get('custom_skills');
            const customSkills = result.custom_skills || {};
            customSkills[skillId] = validTemplates;
            
            await chrome.storage.local.set({ custom_skills: customSkills });

            // Update in-memory state
            SKILL_TEMPLATES[skillId] = validTemplates;
            
            return true;
        } catch (e) {
            console.error('[DrillGenerator] Exception during skill acquisition:', e);
            return false;
        }
    }

    // Language pitfall templates (Python-focused)
    const LANGUAGE_TEMPLATES = [
        {
            type: 'fill-in-blank',
            content: 'nums = [3, 1, 2]\nresult = nums.sort()\n# What is the value of result?\n# result = ___',
            answer: 'None',
            explanation: 'list.sort() sorts in-place and returns None. Use sorted() to get a new sorted list.',
            difficulty: 'easy'
        },
        {
            type: 'spot-bug',
            content: 'def append_to(element, to=[]):\n    to.append(element)\n    return to\nresult1 = append_to(1)\nresult2 = append_to(2)',
            answer: 'line 1',
            explanation: 'Mutable default argument: the default list [] is shared across all calls, so result2 will be [1, 2] instead of [2].',
            difficulty: 'medium'
        },
        {
            type: 'fill-in-blank',
            content: '# In Python 3, what does 7 // 2 evaluate to?\nanswer = ___',
            answer: '3',
            explanation: '// is integer (floor) division in Python. 7 // 2 = 3, while 7 / 2 = 3.5.',
            difficulty: 'easy'
        },
        {
            type: 'spot-bug',
            content: 'a = [1, 2, 3]\nb = a\nb.append(4)\nprint(len(a))',
            answer: 'line 2',
            explanation: 'b = a creates an alias, not a copy. Both a and b point to the same list, so appending to b also changes a. Use b = a[:] or b = list(a) for a copy.',
            difficulty: 'medium'
        }
    ];

    function buildTemplateDrills(weakSkills, neededCount = 0, options = {}) {
        const needed = toPositiveInt(neededCount, 0);
        if (needed <= 0 || !Array.isArray(weakSkills) || weakSkills.length === 0) {
            return [];
        }

        const category = (options && options.category) || 'algo';
        const drills = [];

        // Language category: use language pitfall templates
        if (category === 'language') {
            for (let i = 0; i < needed; i++) {
                const skill = weakSkills[i % weakSkills.length];
                const skillId = skill.skillId || 'general';
                const template = LANGUAGE_TEMPLATES[i % LANGUAGE_TEMPLATES.length];
                drills.push({
                    ...template,
                    skillId,
                    category: 'language'
                });
            }
            return drills;
        }

        // Algo category (default): existing behavior
        for (let i = 0; i < needed; i++) {
            const skill = weakSkills[i % weakSkills.length];
            const skillId = skill.skillId || 'general';
            const insight = skill.insight ? `Weakness: ${skill.insight}` : 'Weakness: recurring mistakes.';

            // Look for skill-specific templates
            const templates = SKILL_TEMPLATES[skillId];
            if (templates) {
                const template = templates[i % templates.length];
                drills.push({
                    ...template,
                    skillId
                });
            } else {
                // Generic fallback for unknown skills
                const variant = i % 4;
                if (variant === 0) {
                    drills.push({
                        type: 'fill-in-blank',
                        skillId,
                        content: `# Skill: ${skillId}\n# ${insight}\n# Complete the blank:\ndef solve(nums):\n    if not nums:\n        return ___\n    return len(nums)`,
                        answer: '0',
                        explanation: 'Return 0 for an empty list to avoid boundary bugs.',
                        difficulty: 'easy'
                    });
                } else if (variant === 1) {
                    drills.push({
                        type: 'spot-bug',
                        skillId,
                        content: `# Skill: ${skillId}\n# ${insight}\ndef solve(nums):\n    return nums[len(nums)]\n# identify the buggy line`,
                        answer: 'line 4',
                        explanation: 'Valid indices end at len(nums) - 1; line 4 accesses out of bounds.',
                        difficulty: 'easy'
                    });
                } else if (variant === 2) {
                    drills.push({
                        type: 'muscle-memory',
                        skillId,
                        content: `Skill: ${skillId}. ${insight} Write a minimal template for this skill from memory, including boundary checks.`,
                        answer: null,
                        explanation: 'Focus on a reusable skeleton and edge-case guard clauses.',
                        difficulty: 'medium'
                    });
                } else {
                    drills.push({
                        type: 'critique',
                        skillId,
                        content: `# Skill: ${skillId}\n# ${insight}\n# Critique this code and suggest one improvement:\ndef solve(nums):\n    out = []\n    for i in range(len(nums)):\n        out.append(nums[i])\n    return out`,
                        answer: null,
                        explanation: 'Look for unnecessary work and missing edge-case handling.',
                        difficulty: 'medium'
                    });
                }
            }
        }
        return drills;
    }

    // ======================================================================
    // Shared prompt fragments
    // ======================================================================
    function buildDrillTypeRules() {
        return `Type definitions and STRICT structural rules:

1. fill-in-blank:
   - The content MUST contain exactly one ___ (three underscores) placeholder
   - The answer field MUST contain the exact text that replaces ___
   - Example:
     {
       "type": "fill-in-blank",
       "content": "def binary_search(arr, target):\\n    left, right = 0, len(arr) - 1\\n    while ___:\\n        mid = (left + right) // 2",
       "answer": "left <= right",
       "explanation": "The loop continues while the search space is non-empty.",
       "difficulty": "easy"
     }

2. spot-bug:
   - The content must contain buggy code with numbered lines or clear line structure
   - The answer MUST be in the format "line N" where N is the 1-based line number
   - The bug must be a real, unambiguous error (not a style issue)
   - Example:
     {
       "type": "spot-bug",
       "content": "def solve(nums):\\n    return nums[len(nums)]",
       "answer": "line 2",
       "explanation": "Off-by-one: valid indices are 0 to len(nums)-1.",
       "difficulty": "easy"
     }

3. muscle-memory:
   - The content is a natural language prompt asking the user to write code from memory
   - The answer must be null

4. critique:
   - The content shows code that works but can be improved
   - The answer must be null`;
    }

    function buildOutputFormat(count) {
        return `Respond with JSON ONLY:
{
  "drills": [
    {
      "type": "fill-in-blank|spot-bug|critique|muscle-memory",
      "content": "The drill question or code snippet",
      "answer": "The correct answer (or null for critique/muscle-memory)",
      "test_cases": ["Optional test inputs"],
      "explanation": "Brief explanation of why the answer is correct",
      "difficulty": "easy|medium|hard"
    }
  ]
}

Rules:
- Return EXACTLY ${count} entries in drills array
- Do not include markdown code fences
- Do not include explanatory prose outside JSON
- Keep content concise (max 15 lines of code)
- All code MUST be syntactically valid (no syntax errors)
- The code MUST be self-contained
- fill-in-blank content MUST contain exactly one ___
- spot-bug answer MUST be "line N" format — count lines carefully from 1 and verify N points to the actual buggy line
- Content must be at least 20 characters long
- Focus on the identified weakness
- Make answers unambiguous for fill-in-blank and spot-bug`;
    }

    // ======================================================================
    // Category-specific prompt builders
    // ======================================================================

    function buildProblemPrompt(skillId, options) {
        const count = toPositiveInt(options.count, DEFAULT_DRILLS_PER_SKILL);
        const types = options.types || DRILL_TYPES;
        const insight = options.insight || '';
        const repairHint = options.repairHint || '';
        const userCode = options.userCode || '';

        const codeSection = userCode
            ? `\nThe user submitted this code for a problem involving "${skillId}":\n\`\`\`\n${userCode}\n\`\`\`\nGenerate drills that target the tricky parts, edge cases, or potential bugs in this specific submission.`
            : `\nGenerate drills targeting common pitfalls in "${skillId}" problems.`;

        // Explicitly include insight if present
        const insightSection = insight ? `\nUser's specific weakness: ${insight}` : '';

        return `You are a coding drill generator for a LeetCode study extension.

Generate EXACTLY ${count} micro-drill(s) based on this code and the skill: "${skillId}".
Every drill must be specific to this solution — test concepts the user actually struggled with.
${insight ? `\nUser's weakness: ${insight}` : ''}
${repairHint}
${codeSection}

Preferred drill types: ${types.join(', ')}

${buildDrillTypeRules()}

${buildOutputFormat(count)}`;
    }

    function buildLanguagePrompt(skillId, options) {
        const count = toPositiveInt(options.count, DEFAULT_DRILLS_PER_SKILL);
        const types = options.types || DRILL_TYPES;
        const insight = options.insight || '';
        const repairHint = options.repairHint || '';

        return `You are a coding drill generator for a LeetCode study extension.

Generate EXACTLY ${count} micro-drill(s) about Python language pitfalls and syntax traps.
The drills should be relevant to coding problems that use "${skillId}" but focus on LANGUAGE-LEVEL mistakes, not algorithm logic.
${insight ? `\nUser's weakness: ${insight}` : ''}
${repairHint}

Focus on these common Python pitfalls:
- Mutable default arguments (def f(lst=[]))
- list.sort() returns None vs sorted() returns new list
- Integer division // vs float division /
- 'is' vs '==' for value comparison
- Off-by-one errors with range(), slicing, indexing
- List aliasing (b = a vs b = a[:])
- Variable scoping in loops and comprehensions
- String immutability

Preferred drill types: ${types.join(', ')}

${buildDrillTypeRules()}

${buildOutputFormat(count)}`;
    }

    function buildAlgoPrompt(skillId, options) {
        const insight = options.insight || '';
        const count = toPositiveInt(options.count, DEFAULT_DRILLS_PER_SKILL);
        const types = options.types || DRILL_TYPES;
        const repairHint = options.repairHint || '';

        return `You are a coding drill generator for a LeetCode study extension.

Generate EXACTLY ${count} micro-drill(s) that are directly related and specific to the skill: "${skillId}".
Every drill must test concepts relevant to this skill — do not generate generic or unrelated drills.
${insight ? `\nUser's weakness: ${insight}` : ''}
${repairHint}

Preferred drill types: ${types.join(', ')}

${buildDrillTypeRules()}

${buildOutputFormat(count)}`;
    }

    /**
     * Build the drill generation prompt.
     * Branches on options.category: 'problem', 'language', or 'algo' (default).
     */
    function buildGenerationPrompt(skillId, options = {}) {
        const category = options.category || 'algo';

        if (category === 'problem') {
            return buildProblemPrompt(skillId, options);
        }
        if (category === 'language') {
            return buildLanguagePrompt(skillId, options);
        }
        return buildAlgoPrompt(skillId, options);
    }

    /**
     * Validate a drill has required fields and passes semantic checks.
     */
    function validateDrill(drill) {
        if (!drill) return false;
        if (!drill.type || !DRILL_TYPES.includes(drill.type)) return false;
        if (!drill.content) return false;

        // Minimum content length
        if (drill.content.length < MIN_CONTENT_LENGTH) return false;

        // fill-in-blank and spot-bug require an answer
        if ((drill.type === 'fill-in-blank' || drill.type === 'spot-bug')
            && (drill.answer === undefined || drill.answer === null || String(drill.answer).trim() === '')) {
            return false;
        }

        // Semantic: fill-in-blank must contain ___ in content
        if (drill.type === 'fill-in-blank' && !drill.content.includes('___')) {
            return false;
        }

        // Semantic: spot-bug answer must be "line N" and N must be within content line count
        if (drill.type === 'spot-bug') {
            const lineMatch = String(drill.answer).match(/line\s*(\d+)/i);
            if (!lineMatch) return false;
            const lineNum = parseInt(lineMatch[1], 10);
            const contentLinesList = drill.content.split('\n');
            if (lineNum < 1 || lineNum > contentLinesList.length) return false;

            // Cross-check: if answer has descriptive text after "line N",
            // the referenced line should contain at least one keyword from that text.
            const afterLineRef = String(drill.answer).replace(/line\s*\d+\s*:?\s*/i, '').trim();
            if (afterLineRef.length > 3) {
                const STOP_WORDS = new Set([
                    'the', 'a', 'an', 'is', 'are', 'was', 'be', 'been', 'being',
                    'should', 'must', 'will', 'would', 'could', 'can', 'may',
                    'to', 'of', 'in', 'for', 'on', 'at', 'by', 'with', 'from',
                    'not', 'no', 'or', 'and', 'but', 'if', 'so', 'as', 'it',
                    'this', 'that', 'these', 'those', 'has', 'have', 'had',
                    'do', 'does', 'did', 'removed', 'added', 'changed', 'fixed',
                    'statement', 'instead', 'here', 'there'
                ]);
                const keywords = afterLineRef
                    .replace(/[^a-zA-Z0-9_\s]/g, ' ')
                    .split(/\s+/)
                    .map(w => w.toLowerCase())
                    .filter(w => w.length > 2 && !STOP_WORDS.has(w));

                if (keywords.length > 0) {
                    const referencedLine = contentLinesList[lineNum - 1].toLowerCase();
                    const hasMatch = keywords.some(kw => referencedLine.includes(kw));
                    if (!hasMatch) return false;
                }
            }
        }

        return true;
    }

    function normalizeSignatureValue(value) {
        if (value === undefined || value === null) return '';
        return String(value)
            .trim()
            .replace(/\s+/g, ' ')
            .toLowerCase();
    }

    function buildDrillSignature(drill) {
        return [
            normalizeSignatureValue(drill?.type),
            normalizeSignatureValue(drill?.skillId),
            normalizeSignatureValue(drill?.content),
            normalizeSignatureValue(drill?.answer)
        ].join('::');
    }

    /**
     * Generate drills for a specific skill using the active model.
     */
    async function generateDrillsForSkill(skillId, options = {}) {
        if (!LLMGateway || typeof LLMGateway.analyzeSubmissions !== 'function') {
            console.error('[DrillGenerator] LLMGateway unavailable; cannot generate drills.');
            return [];
        }

        const count = toPositiveInt(options.count, DEFAULT_DRILLS_PER_SKILL);
        const maxAttempts = toPositiveInt(options.attempts, DEFAULT_SKILL_ATTEMPTS);
        const maxRetriesPerAttempt = toPositiveInt(options.maxRetriesPerAttempt, DEFAULT_MAX_RETRIES_PER_ATTEMPT);
        const maxOutputTokens = toPositiveInt(options.maxOutputTokens, DEFAULT_MAX_OUTPUT_TOKENS);
        const temperature = typeof options.temperature === 'number'
            ? options.temperature
            : DEFAULT_DRILL_TEMPERATURE;

        let bestDrills = [];
        let lastError = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            DebugLog.log('[DrillGenerator] Generating drills:', {
                skillId,
                count,
                attempt,
                maxAttempts,
                insight: options.insight || null
            });

            const prompt = buildGenerationPrompt(skillId, {
                ...options,
                count,
                repairHint: attempt > 1 ? buildRepairHint({ count, attempt }) : ''
            });

            try {
                const response = await LLMGateway.analyzeSubmissions(prompt, {
                    maxRetries: maxRetriesPerAttempt,
                    temperature,
                    maxOutputTokens,
                    responseMimeType: 'application/json'
                });

                if (!response || response.error || !response.drills) {
                    lastError = response?.error || 'Missing drills in response';
                    DebugLog.warn('[DrillGenerator] Generation attempt failed:', {
                        skillId,
                        attempt,
                        error: lastError
                    });
                    continue;
                }

                const category = options.category || 'algo';
                const rawDrills = Array.isArray(response.drills) ? response.drills : [];
                const validDrills = rawDrills
                    .filter(d => validateDrill(d))
                    .map(d => ({
                        ...d,
                        skillId,
                        category
                    }));

                const limited = validDrills.slice(0, count);
                const invalidCount = rawDrills.length - validDrills.length;
                DebugLog.log('[DrillGenerator] Response summary:', {
                    skillId,
                    attempt,
                    total: rawDrills.length,
                    valid: validDrills.length,
                    used: limited.length,
                    invalid: invalidCount
                });

                if (invalidCount > 0) {
                    const invalidSample = rawDrills
                        .filter(d => !validateDrill(d))
                        .slice(0, 2)
                        .map(d => ({
                            type: d?.type || null,
                            hasContent: Boolean(d?.content),
                            hasAnswer: d?.answer !== undefined && d?.answer !== null
                        }));
                    DebugLog.warn('[DrillGenerator] Invalid drill sample:', invalidSample);
                }

                if (limited.length > bestDrills.length) {
                    bestDrills = limited;
                }
                if (bestDrills.length >= count) {
                    break;
                }
            } catch (e) {
                lastError = e.message;
                DebugLog.warn('[DrillGenerator] Generation attempt threw:', {
                    skillId,
                    attempt,
                    error: e.message
                });
            }
        }

        if (bestDrills.length < count) {
            DebugLog.warn('[DrillGenerator] Returning partial drill set:', {
                skillId,
                requested: count,
                returned: bestDrills.length,
                error: lastError
            });
        }
        if (bestDrills.length === 0 && lastError) {
            console.error('[DrillGenerator] Generation failed:', lastError);
        }
        return bestDrills;
    }

    /**
     * Save generated drills to the store.
     */
    async function saveDrills(drills, options = {}) {
        DebugLog.log('[DrillGenerator] Saving drills:', {
            count: Array.isArray(drills) ? drills.length : 0,
            sample: (Array.isArray(drills) ? drills : []).slice(0, 3).map(d => ({
                type: d.type,
                skillId: d.skillId,
                difficulty: d.difficulty || 'medium'
            }))
        });

        if (!DrillStore || !DrillStore.DrillStore || typeof DrillStore.createDrill !== 'function') {
            console.error('[DrillGenerator] DrillStore unavailable; cannot persist drills.');
            return { saved: 0, error: 'DrillStore unavailable' };
        }

        const store = new DrillStore.DrillStore();
        await store.init();

        const allowedTypes = normalizeAllowedTypes(options.allowedTypes);
        const maxPerSkill = toPositiveInt(options.maxPerSkill, DEFAULT_MAX_PER_SKILL);
        const maxPerSkillType = toPositiveInt(options.maxPerSkillType, DEFAULT_MAX_PER_SKILL_TYPE);

        const existing = await store.getAll();
        const signatures = new Set(existing.map(buildDrillSignature));
        const pendingExisting = existing.filter(d => d.status === 'pending' && allowedTypes.includes(d.type));
        const skillCounts = new Map();
        const skillTypeCounts = new Map();

        for (const drill of pendingExisting) {
            const skillId = normalizeSignatureValue(drill.skillId) || 'general';
            const typeKey = `${skillId}::${drill.type}`;
            skillCounts.set(skillId, (skillCounts.get(skillId) || 0) + 1);
            skillTypeCounts.set(typeKey, (skillTypeCounts.get(typeKey) || 0) + 1);
        }

        let saved = 0;
        let skippedDuplicates = 0;
        let skippedByTypeFilter = 0;
        let skippedBySkillCap = 0;
        let skippedByTypeCap = 0;
        const savedDrills = [];

        for (const drill of drills) {
            if (!allowedTypes.includes(drill.type)) {
                skippedByTypeFilter++;
                continue;
            }

            const signature = buildDrillSignature(drill);
            if (signatures.has(signature)) {
                skippedDuplicates++;
                continue;
            }

            const skillId = normalizeSignatureValue(drill.skillId) || 'general';
            const typeKey = `${skillId}::${drill.type}`;
            const skillCount = skillCounts.get(skillId) || 0;
            const skillTypeCount = skillTypeCounts.get(typeKey) || 0;

            if (skillCount >= maxPerSkill) {
                skippedBySkillCap++;
                continue;
            }
            if (skillTypeCount >= maxPerSkillType) {
                skippedByTypeCap++;
                continue;
            }

            const entity = DrillStore.createDrill({
                type: drill.type,
                skillId: drill.skillId,
                content: drill.content,
                answer: drill.answer,
                explanation: drill.explanation,
                difficulty: drill.difficulty || 'medium'
            });
            await store.add(entity);
            signatures.add(signature);
            skillCounts.set(skillId, skillCount + 1);
            skillTypeCounts.set(typeKey, skillTypeCount + 1);
            savedDrills.push(drill);
            saved++;
        }

        DebugLog.log('[DrillGenerator] Save summary:', {
            saved,
            skippedDuplicates,
            skippedByTypeFilter,
            skippedBySkillCap,
            skippedByTypeCap,
            maxPerSkill,
            maxPerSkillType,
            allowedTypes
        });
        return {
            saved,
            skippedDuplicates,
            skippedByTypeFilter,
            skippedBySkillCap,
            skippedByTypeCap,
            savedDrills
        };
    }

    /**
     * Generate drills for multiple weak skills.
     * If weakSkills not provided, fetches from SkillMatrix storage.
     */
    async function generateFromWeakSkills(weakSkills, options = {}) {
        const drillsPerSkill = toPositiveInt(options.drillsPerSkill, DEFAULT_DRILLS_PER_SKILL);
        const skillAttempts = toPositiveInt(options.skillAttempts, DEFAULT_SKILL_ATTEMPTS);
        const maxRetriesPerAttempt = toPositiveInt(options.maxRetriesPerAttempt, DEFAULT_MAX_RETRIES_PER_ATTEMPT);
        const allowedTypes = normalizeAllowedTypes(options.allowedTypes);
        const maxPerSkill = toPositiveInt(options.maxPerSkill, DEFAULT_MAX_PER_SKILL);
        const maxPerSkillType = toPositiveInt(options.maxPerSkillType, DEFAULT_MAX_PER_SKILL_TYPE);
        const maxTotalCandidate = toPositiveInt(options.maxTotalDrills, 0);
        const maxTotalDrills = maxTotalCandidate > 0 ? maxTotalCandidate : null;
        const defaultMinTotalDrills = Math.max(
            drillsPerSkill,
            Math.min((Array.isArray(weakSkills) ? weakSkills.length : 2) * drillsPerSkill, DEFAULT_MIN_TOTAL_DRILLS)
        );
        const minTotalDrills = toPositiveInt(options.minTotalDrills, defaultMinTotalDrills);
        const targetTotalDrills = maxTotalDrills
            ? Math.min(minTotalDrills, maxTotalDrills)
            : minTotalDrills;
        let totalGenerated = 0;
        const allDrills = [];
        const generatedBySkill = {};

        DebugLog.log('[DrillGenerator] generateFromWeakSkills called:', {
            providedWeakSkills: Array.isArray(weakSkills) ? weakSkills.length : 0,
            drillsPerSkill,
            minTotalDrills: targetTotalDrills,
            maxTotalDrills,
            skillAttempts,
            allowedTypes,
            maxPerSkill,
            maxPerSkillType
        });

        // If no weakSkills provided, fetch from storage
        if (!weakSkills || !Array.isArray(weakSkills) || weakSkills.length === 0) {
            try {
                // Try to load from SkillMatrix storage
                const result = await chrome.storage.local.get({ skillDNA: null });

                if (result.skillDNA) {
                    // Combine Layer 1 (skills) and Layer 2 (patterns) weak areas
                    const skills = result.skillDNA.skills || {};
                    const patterns = result.skillDNA.patterns || {};

                    const weakLayer1 = Object.values(skills)
                        .filter(s => s.mistakes >= 1)
                        .sort((a, b) => a.score - b.score)
                        .slice(0, 3)
                        .map(s => ({ skillId: s.id, insight: `${s.mistakes} mistakes` }));

                    const weakLayer2 = Object.values(patterns)
                        .filter(p => p.mistakes >= 1)
                        .sort((a, b) => a.score - b.score)
                        .slice(0, 3)
                        .map(p => ({ skillId: p.patternId, insight: `${p.mistakes} ${p.patternId.replace(/-/g, ' ')} errors` }));

                    weakSkills = [...weakLayer1, ...weakLayer2];
                    DebugLog.log('[DrillGenerator] Loaded weak skills from storage:', {
                        skills: Object.keys(skills).length,
                        patterns: Object.keys(patterns).length,
                        weakLayer1: weakLayer1.length,
                        weakLayer2: weakLayer2.length,
                        totalWeakSkills: weakSkills.length,
                        sample: weakSkills.slice(0, 5)
                    });
                }
            } catch (e) {
                DebugLog.warn('[DrillGenerator] Could not load weak skills from storage:', e);
            }
        }

        // Still no skills? Return empty
        if (!weakSkills || weakSkills.length === 0) {
            DebugLog.log('[DrillGenerator] No weak skills to generate drills for');
            return [];
        }

        weakSkills = dedupeWeakSkills(weakSkills);
        if (weakSkills.length === 0) {
            DebugLog.log('[DrillGenerator] Weak skill list empty after dedupe');
            return [];
        }

        for (const skill of weakSkills) {
            if (maxTotalDrills && allDrills.length >= maxTotalDrills) {
                break;
            }

            const remainingBudget = maxTotalDrills
                ? Math.max(0, maxTotalDrills - allDrills.length)
                : drillsPerSkill;
            const requestedCount = Math.min(drillsPerSkill, remainingBudget);
            if (requestedCount <= 0) break;

            DebugLog.log('[DrillGenerator] Generating for skill:', {
                skillId: skill.skillId,
                insight: skill.insight || null
            });
            const drills = await generateDrillsForSkill(skill.skillId, {
                count: requestedCount,
                insight: skill.insight,
                attempts: skillAttempts,
                maxRetriesPerAttempt,
                types: allowedTypes
            });

            const cappedDrills = maxTotalDrills
                ? drills.slice(0, Math.max(0, maxTotalDrills - allDrills.length))
                : drills;

            if (cappedDrills.length > 0) {
                const persisted = await saveDrills(cappedDrills, {
                    allowedTypes,
                    maxPerSkill,
                    maxPerSkillType
                });
                const savedDrills = persisted.savedDrills || [];
                totalGenerated += savedDrills.length;
                allDrills.push(...savedDrills);
                generatedBySkill[skill.skillId] = (generatedBySkill[skill.skillId] || 0) + savedDrills.length;
                DebugLog.log('[DrillGenerator] Generated drills for skill:', {
                    skillId: skill.skillId,
                    requested: cappedDrills.length,
                    saved: savedDrills.length
                });
            } else {
                DebugLog.warn('[DrillGenerator] No drills generated for skill:', {
                    skillId: skill.skillId
                });
            }
        }

        let remaining = targetTotalDrills - allDrills.length;
        if (remaining > 0) {
            DebugLog.warn('[DrillGenerator] Total drills below target; running supplement pass:', {
                current: allDrills.length,
                target: targetTotalDrills,
                remaining
            });

            const prioritizedSkills = [...weakSkills]
                .sort((a, b) => (generatedBySkill[a.skillId] || 0) - (generatedBySkill[b.skillId] || 0));

            for (const skill of prioritizedSkills) {
                if (remaining <= 0) break;
                if (maxTotalDrills && allDrills.length >= maxTotalDrills) break;

                const remainingBudget = maxTotalDrills
                    ? Math.max(0, maxTotalDrills - allDrills.length)
                    : remaining;
                const supplementCount = Math.min(drillsPerSkill, remaining, remainingBudget);
                if (supplementCount <= 0) break;
                const supplemental = await generateDrillsForSkill(skill.skillId, {
                    count: supplementCount,
                    insight: skill.insight,
                    attempts: Math.max(1, skillAttempts - 1),
                    maxRetriesPerAttempt,
                    types: allowedTypes
                });

                const cappedSupplemental = maxTotalDrills
                    ? supplemental.slice(0, Math.max(0, maxTotalDrills - allDrills.length))
                    : supplemental;

                if (cappedSupplemental.length > 0) {
                    const persisted = await saveDrills(cappedSupplemental, {
                        allowedTypes,
                        maxPerSkill,
                        maxPerSkillType
                    });
                    const savedDrills = persisted.savedDrills || [];
                    totalGenerated += savedDrills.length;
                    allDrills.push(...savedDrills);
                    generatedBySkill[skill.skillId] = (generatedBySkill[skill.skillId] || 0) + savedDrills.length;
                    remaining -= savedDrills.length;
                }
            }
        }

        remaining = targetTotalDrills - allDrills.length;
        if (remaining > 0) {
            const templateDrills = buildTemplateDrills(weakSkills, remaining);
            if (templateDrills.length > 0) {
                const persisted = await saveDrills(templateDrills, {
                    allowedTypes,
                    maxPerSkill,
                    maxPerSkillType
                });
                const savedDrills = persisted.savedDrills || [];
                totalGenerated += savedDrills.length;
                allDrills.push(...savedDrills);
                DebugLog.warn('[DrillGenerator] Added template fallback drills to hit minimum target:', {
                    requested: templateDrills.length,
                    added: savedDrills.length,
                    target: targetTotalDrills,
                    final: allDrills.length
                });
            }
        }

        DebugLog.log(`[DrillGenerator] Generated ${totalGenerated} drills for ${weakSkills.length} skills.`);
        return allDrills;
    }

    return {
        generateDrillsForSkill,
        buildGenerationPrompt,
        validateDrill,
        saveDrills,
        generateFromWeakSkills,
        buildTemplateDrills,
        DRILL_TYPES,
        DRILL_CATEGORIES,
        init,
        getValidSkills,
        acquireNewSkill
    };
}));
