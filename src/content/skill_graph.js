/**
 * Skill Graph Component
 *
 * SVG-based visualization of the Skill DNA as a node graph.
 */

(function (root, factory) {
    var exported = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = exported;
    } else {
        root.SkillGraph = exported;
    }
    // Also set on window for bundled contexts
    if (typeof window !== 'undefined') {
        window.SkillGraph = exported;
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const SVG_NS = 'http://www.w3.org/2000/svg';
    const DEFAULT_WIDTH = 300;
    const DEFAULT_HEIGHT = 300;
    const FAMILY_NODE_RADIUS = 25;
    const SKILL_NODE_RADIUS = 12;

    /**
     * Create SVG container element.
     */
    function createSVG(options = {}) {
        const width = options.width || DEFAULT_WIDTH;
        const height = options.height || DEFAULT_HEIGHT;

        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('width', width);
        svg.setAttribute('height', height);
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        svg.setAttribute('class', 'skill-graph');

        return svg;
    }

    /**
     * Get color based on confidence level.
     */
    function getConfidenceColor(confidence) {
        if (confidence >= 0.7) {
            return '#22c55e'; // Green
        } else if (confidence >= 0.4) {
            return '#eab308'; // Yellow
        } else {
            return '#ef4444'; // Red
        }
    }

    /**
     * Create a skill node (circle + label).
     */
    function createNode(options) {
        const { id, label, x, y, confidence, isFamily = false } = options;

        const g = document.createElementNS(SVG_NS, 'g');
        g.setAttribute('class', 'skill-node');
        g.setAttribute('data-skill-id', id);

        const radius = isFamily ? FAMILY_NODE_RADIUS : SKILL_NODE_RADIUS;
        const color = getConfidenceColor(confidence);

        // Circle
        const circle = document.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('cx', x);
        circle.setAttribute('cy', y);
        circle.setAttribute('r', radius);
        circle.setAttribute('fill', color);
        circle.setAttribute('stroke', '#fff');
        circle.setAttribute('stroke-width', '2');
        g.appendChild(circle);

        // Label
        const text = document.createElementNS(SVG_NS, 'text');
        text.setAttribute('x', x);
        text.setAttribute('y', y + radius + 14);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', isFamily ? '12' : '10');
        text.setAttribute('fill', '#333');
        text.textContent = truncateLabel(label, isFamily ? 15 : 10);
        g.appendChild(text);

        return g;
    }

    /**
     * Truncate label if too long.
     */
    function truncateLabel(label, maxLen) {
        if (!label) return '';
        return label.length > maxLen ? label.substring(0, maxLen - 2) + '…' : label;
    }

    /**
     * Create an edge (line between nodes).
     */
    function createEdge(options) {
        const { fromX, fromY, toX, toY } = options;

        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', fromX);
        line.setAttribute('y1', fromY);
        line.setAttribute('x2', toX);
        line.setAttribute('y2', toY);
        line.setAttribute('stroke', '#e5e7eb');
        line.setAttribute('stroke-width', '1');

        return line;
    }

    /**
     * Calculate bar chart layout positions.
     */
    function calculateBarLayout(count, width, height, padding = 20) {
        const positions = [];
        const barHeight = (height - padding * 2) / count;
        const maxBarWidth = width - padding * 2 - 80; // Leave space for labels

        for (let i = 0; i < count; i++) {
            positions.push({
                x: padding,
                y: padding + i * barHeight + barHeight / 2,
                barHeight: barHeight * 0.7, // 70% of available space for visual separation
                maxWidth: maxBarWidth
            });
        }
        return positions;
    }

    /**
     * Aggregate skill confidences per family.
     */
    function aggregateFamilyConfidence(skills) {
        const families = {};

        for (const [skillId, skill] of Object.entries(skills)) {
            const familyId = skill.familyId || skillId.split('_')[0];
            if (!families[familyId]) {
                families[familyId] = { id: familyId, name: formatFamilyName(familyId), confidences: [] };
            }
            families[familyId].confidences.push(skill.confidence || 0.5);
        }

        // Calculate averages
        return Object.values(families).map(f => ({
            id: f.id,
            name: f.name,
            confidence: f.confidences.reduce((a, b) => a + b, 0) / f.confidences.length
        }));
    }

    /**
     * Format family ID to readable name.
     */
    function formatFamilyName(id) {
        return id
            .replace(/_/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
    }

    /**
     * Render the complete skill graph as a horizontal bar chart.
     */
    function renderGraph(skillData, options = {}) {
        const width = options.width || DEFAULT_WIDTH;
        const height = options.height || DEFAULT_HEIGHT;

        const svg = createSVG({ width, height });
        const families = skillData.families || [];

        // Sort by confidence (lowest first, so weakest skills are most visible)
        const sortedFamilies = [...families].sort((a, b) => a.confidence - b.confidence);

        // Calculate bar positions
        const positions = calculateBarLayout(sortedFamilies.length, width, height);

        // Draw bars
        sortedFamilies.forEach((family, i) => {
            const pos = positions[i];
            const barWidth = pos.maxWidth * family.confidence;
            const color = getConfidenceColor(family.confidence);

            // Background bar (gray)
            const bgBar = document.createElementNS(SVG_NS, 'rect');
            bgBar.setAttribute('x', pos.x);
            bgBar.setAttribute('y', pos.y - pos.barHeight / 2);
            bgBar.setAttribute('width', pos.maxWidth);
            bgBar.setAttribute('height', pos.barHeight);
            bgBar.setAttribute('fill', 'rgba(255, 255, 255, 0.1)');
            bgBar.setAttribute('rx', '4');
            svg.appendChild(bgBar);

            // Actual strength bar
            const bar = document.createElementNS(SVG_NS, 'rect');
            bar.setAttribute('x', pos.x);
            bar.setAttribute('y', pos.y - pos.barHeight / 2);
            bar.setAttribute('width', barWidth);
            bar.setAttribute('height', pos.barHeight);
            bar.setAttribute('fill', color);
            bar.setAttribute('rx', '4');
            bar.setAttribute('class', 'skill-bar');
            svg.appendChild(bar);

            // Label (algorithm name)
            const label = document.createElementNS(SVG_NS, 'text');
            label.setAttribute('x', pos.x + 5);
            label.setAttribute('y', pos.y + 4);
            label.setAttribute('font-size', '11');
            label.setAttribute('fill', '#fff');
            label.setAttribute('font-weight', 'bold');
            label.textContent = family.name;
            svg.appendChild(label);

            // Percentage text
            const percentage = document.createElementNS(SVG_NS, 'text');
            percentage.setAttribute('x', pos.x + pos.maxWidth + 5);
            percentage.setAttribute('y', pos.y + 4);
            percentage.setAttribute('font-size', '10');
            percentage.setAttribute('fill', color);
            percentage.setAttribute('text-anchor', 'start');
            percentage.textContent = `${Math.round(family.confidence * 100)}%`;
            svg.appendChild(percentage);
        });

        return svg;
    }

    // Styles for the graph
    const styles = `
        .skill-graph {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .skill-bar {
            transition: opacity 0.2s;
        }

        .skill-bar:hover {
            opacity: 0.8;
        }
    `;

    return {
        createSVG,
        createNode,
        createEdge,
        getConfidenceColor,
        renderGraph,
        aggregateFamilyConfidence,
        calculateBarLayout,
        styles
    };
}));
