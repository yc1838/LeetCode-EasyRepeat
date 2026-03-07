/**
 * Drill Queue Widget
 *
 * Displays pending drills in the popup with start buttons.
 */

(function (root, factory) {
    var exported = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = exported;
    } else {
        root.DrillQueue = exported;
    }
    // Also set on window for bundled contexts
    if (typeof window !== 'undefined') {
        window.DrillQueue = exported;
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const DRILL_ICONS = {
        'fill-in-blank': '✍️',
        'spot-bug': '🐛',
        'critique': '💬',
        'muscle-memory': '💪'
    };

    /**
     * Get icon for drill type.
     */
    function getDrillTypeIcon(type) {
        return DRILL_ICONS[type] || '📝';
    }

    /**
     * Format skill ID to readable name.
     */
    function formatSkillName(skillId) {
        return skillId
            .replace(/_/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
    }

    /**
     * Render the queue header.
     */
    function renderHeader(count) {
        const header = document.createElement('div');
        header.className = 'drill-queue-header';
        header.innerHTML = `
            <h3>🧠 ${count} Drill${count !== 1 ? 's' : ''} Ready</h3>
        `;
        return header;
    }

    /**
     * Render a single drill item.
     */
    function renderDrillItem(drill) {
        const item = document.createElement('div');
        item.className = 'drill-item';
        item.dataset.drillId = drill.id;

        const icon = getDrillTypeIcon(drill.type);
        const skillName = formatSkillName(drill.skillId);

        item.innerHTML = `
            <div class="drill-info">
                <span class="drill-icon">${icon}</span>
                <div class="drill-details">
                    <span class="drill-type">${drill.type}</span>
                    <span class="drill-skill">${skillName}</span>
                </div>
            </div>
            <button class="start-drill-btn">Start</button>
        `;

        return item;
    }

    /**
     * Attach start handler to drill item.
     */
    function attachStartHandler(item, drill, callback) {
        const btn = item.querySelector('.start-drill-btn');
        if (btn) {
            btn.addEventListener('click', () => callback(drill));
        }
    }

    /**
     * Render the complete drill queue.
     */
    function renderQueue(drills, options = {}) {
        const container = document.createElement('div');
        container.className = 'drill-queue neural-agent-ui';

        if (!drills || drills.length === 0) {
            container.innerHTML = `
                <div class="empty-queue">
                    <p>No drills pending!</p>
                    <p class="subtext">Complete some problems to generate personalized drills.</p>
                </div>
            `;
            return container;
        }

        // Header
        container.appendChild(renderHeader(drills.length));

        // Drill list
        const list = document.createElement('div');
        list.className = 'drill-list';

        drills.forEach(drill => {
            const item = renderDrillItem(drill);
            if (options.onStart) {
                attachStartHandler(item, drill, options.onStart);
            }
            list.appendChild(item);
        });

        container.appendChild(list);

        return container;
    }

    // Styles for the queue
    const styles = `
        .drill-queue {
            background: white;
            border-radius: 8px;
            padding: 12px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        .drill-queue-header h3 {
            margin: 0 0 12px 0;
            font-size: 14px;
            color: #333;
        }
        
        .drill-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        
        .drill-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 12px;
            background: #f9fafb;
            border-radius: 6px;
            border: 1px solid #e5e7eb;
        }
        
        .drill-info {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .drill-icon {
            font-size: 20px;
        }
        
        .drill-details {
            display: flex;
            flex-direction: column;
        }
        
        .drill-type {
            font-size: 11px;
            color: #6b7280;
            text-transform: uppercase;
        }
        
        .drill-skill {
            font-size: 13px;
            font-weight: 500;
            color: #111827;
        }
        
        .start-drill-btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        
        .start-drill-btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(102, 126, 234, 0.4);
        }
        
        .empty-queue {
            text-align: center;
            padding: 20px;
            color: #6b7280;
        }
        
        .empty-queue p {
            margin: 4px 0;
        }
        
        .empty-queue .subtext {
            font-size: 12px;
        }
    `;

    return {
        renderQueue,
        renderDrillItem,
        renderHeader,
        getDrillTypeIcon,
        formatSkillName,
        attachStartHandler,
        styles
    };
}));
