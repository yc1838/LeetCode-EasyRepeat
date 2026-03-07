/**
 * Drill Verifier
 * 
 * Verifies drill answers and grades AI-based responses.
 */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.DrillVerifier = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    let DrillTypes, LLMGateway;

    if (typeof require !== 'undefined') {
        DrillTypes = require('./drill_types');
        LLMGateway = require('./llm_gateway');
    } else if (typeof window !== 'undefined') {
        DrillTypes = window.DrillTypes;
        LLMGateway = window.LLMGateway;
    }

    /**
     * Verify a drill answer.
     */
    async function verifyAnswer(drill, userAnswer) {
        const type = drill.type;

        // Deterministic types: fill-in-blank, spot-bug
        if (type === 'fill-in-blank') {
            const correct = DrillTypes.verifyFillInBlank(drill, userAnswer);
            let feedback = correct ? 'Correct! Well done.' : `Incorrect. The answer was: ${drill.answer}`;

            if (!correct && drill.explanation) {
                feedback += `\n\nExplanation: ${drill.explanation}`;
            }

            return {
                correct,
                feedback
            };
        }

        if (type === 'spot-bug') {
            const correct = DrillTypes.verifySpotBug(drill, userAnswer);
            let feedback = correct ? 'Correct! You found the bug.' : `Incorrect. The bug was on ${drill.answer}`;

            if (!correct && drill.explanation) {
                feedback += `\n\nExplanation: ${drill.explanation}`;
            }

            return {
                correct,
                feedback
            };
        }

        // AI-graded types: critique, muscle-memory
        if (type === 'critique' || type === 'muscle-memory') {
            return await gradeWithAI(drill, userAnswer);
        }

        return { correct: null, feedback: 'Unknown drill type' };
    }

    /**
     * Grade a response using the active user-selected model.
     */
    async function gradeWithAI(drill, userResponse) {
        let gradingData;

        if (drill.type === 'critique') {
            gradingData = DrillTypes.prepareCritiqueForGrading(drill, userResponse);
        } else if (drill.type === 'muscle-memory') {
            gradingData = DrillTypes.prepareMuscleMemoryForGrading(drill, userResponse);
        }

        const prompt = buildGradingPrompt(drill.type, gradingData);

        try {
            if (!LLMGateway || typeof LLMGateway.analyzeSubmissions !== 'function') {
                return { correct: null, error: 'LLM gateway unavailable' };
            }

            const response = await LLMGateway.analyzeSubmissions(prompt, {
                temperature: 0.4,
                maxRetries: 2,
                responseMimeType: 'application/json'
            });

            if (response.error) {
                console.error('[DrillVerifier] AI grading failed:', response.error);
                return { correct: null, error: response.error };
            }

            return {
                correct: response.correct || false,
                score: response.score || 0,
                feedback: response.feedback || 'No feedback provided'
            };
        } catch (e) {
            console.error('[DrillVerifier] Error:', e);
            return { correct: null, error: e.message };
        }
    }

    /**
     * Build the grading prompt for model-based grading.
     */
    function buildGradingPrompt(type, data) {
        if (type === 'critique') {
            return `Grade this code critique response.

Original Code:
\`\`\`
${data.original}
\`\`\`

User's Critique:
"${data.response}"

Evaluate:
1. Did the user identify any valid issues?
2. Are the suggestions actionable?

Respond with JSON:
{
  "score": 0.0-1.0,
  "correct": true/false (true if score >= 0.5),
  "feedback": "Brief feedback on their critique"
}`;
        }

        if (type === 'muscle-memory') {
            return `Grade this code written from memory.

Prompt Given: "${data.prompt}"

User's Submission:
\`\`\`
${data.submission}
\`\`\`

Evaluate:
1. Is the logic correct?
2. Does it solve the problem?
3. Is the syntax valid?

Respond with JSON:
{
  "score": 0.0-1.0,
  "correct": true/false (true if score >= 0.7),
  "feedback": "Brief feedback on their code"
}`;
        }

        return '';
    }

    return {
        verifyAnswer,
        gradeWithAI,
        buildGradingPrompt
    };
}));
