/**
 * Skill Animations
 *
 * CSS animations for skill nodes: pulsing, sparkle, confidence changes.
 */

(function (root, factory) {
    var exported = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = exported;
    } else {
        root.SkillAnimations = exported;
    }
    // Also set on window for bundled contexts
    if (typeof window !== 'undefined') {
        window.SkillAnimations = exported;
    }
}(typeof self !== 'undefined' ? self : this, function () {

    /**
     * Add pulsing effect to a declining skill node.
     */
    function addPulsingEffect(node) {
        if (!node.classList.contains('pulsing')) {
            node.classList.add('pulsing');
        }
    }

    /**
     * Add sparkle effect to a mastered skill node.
     */
    function addSparkleEffect(node) {
        if (!node.classList.contains('sparkle')) {
            node.classList.add('sparkle');
        }
    }

    /**
     * Remove all animation classes.
     */
    function removeAnimations(node) {
        node.classList.remove('pulsing', 'sparkle', 'confidence-increase', 'confidence-decrease');
    }

    /**
     * Animate confidence change.
     */
    function animateConfidenceChange(node, oldConfidence, newConfidence) {
        if (newConfidence < oldConfidence) {
            node.classList.add('confidence-decrease');
        } else if (newConfidence > oldConfidence) {
            node.classList.add('confidence-increase');
        }
    }

    /**
     * Get CSS for animations.
     */
    function getCSS() {
        return `
            /* Pulsing animation for declining skills */
            @keyframes pulse {
                0% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.15); opacity: 0.8; }
                100% { transform: scale(1); opacity: 1; }
            }
            
            .skill-node.pulsing circle {
                animation: pulse 2s infinite ease-in-out;
                filter: drop-shadow(0 0 6px #ef4444);
            }
            
            /* Sparkle animation for mastered skills */
            @keyframes sparkle {
                0%, 100% { filter: drop-shadow(0 0 2px #22c55e); }
                50% { filter: drop-shadow(0 0 10px #22c55e) drop-shadow(0 0 20px #86efac); }
            }
            
            .skill-node.sparkle circle {
                animation: sparkle 3s infinite ease-in-out;
            }
            
            /* Confidence increase animation */
            @keyframes confidenceUp {
                0% { transform: scale(1); }
                50% { transform: scale(1.2); filter: brightness(1.3); }
                100% { transform: scale(1); }
            }
            
            .skill-node.confidence-increase circle {
                animation: confidenceUp 0.5s ease-out;
                fill: #22c55e;
            }
            
            /* Confidence decrease animation */
            @keyframes confidenceDown {
                0% { transform: scale(1); }
                25% { transform: translateX(-3px); }
                50% { transform: translateX(3px); }
                75% { transform: translateX(-3px); }
                100% { transform: scale(1); }
            }
            
            .skill-node.confidence-decrease circle {
                animation: confidenceDown 0.4s ease-out;
                fill: #ef4444;
            }
            
            /* Hover effect */
            .skill-node:hover circle {
                transform: scale(1.1);
                cursor: pointer;
            }
            
            /* Transition for smooth changes */
            .skill-node circle {
                transition: fill 0.3s ease, transform 0.2s ease;
            }
        `;
    }

    /**
     * Inject animation styles into document head.
     */
    function injectStyles() {
        // Don't duplicate
        if (document.querySelector('style[data-skill-animations]')) {
            return;
        }

        const style = document.createElement('style');
        style.setAttribute('data-skill-animations', 'true');
        style.textContent = getCSS();
        document.head.appendChild(style);
    }

    /**
     * Apply animations to a skill graph based on skill data.
     */
    function applyAnimations(container, skillData) {
        const nodes = container.querySelectorAll('.skill-node');

        nodes.forEach(node => {
            const skillId = node.dataset.skillId;
            const skill = skillData[skillId];

            if (!skill) return;

            removeAnimations(node);

            // Declining skill: pulse
            if (skill.confidence < 0.4 && skill.trend === 'declining') {
                addPulsingEffect(node);
            }
            // Mastered skill: sparkle
            else if (skill.confidence >= 0.9) {
                addSparkleEffect(node);
            }
        });
    }

    return {
        addPulsingEffect,
        addSparkleEffect,
        removeAnimations,
        animateConfidenceChange,
        getCSS,
        injectStyles,
        applyAnimations
    };
}));
