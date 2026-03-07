// ============================================================================
// ⚠️ CRITICAL: Dexie Import - DO NOT CHANGE ⚠️
// ============================================================================
// Import Dexie from npm package (has proper ES module support)
// DO NOT change this back to: import '../assets/libs/dexie.min.js'
//
// WHY: The dexie.min.js file is a UMD module that doesn't work correctly with
// Vite's ES module bundling. Using the npm package ensures proper bundling.
//
// BREAKING THIS WILL CAUSE:
// - "Dexie not found" errors
// - IndexedDB operations to fail
// - Shadow logger to break
//
// This has been fixed multiple times. DO NOT REVERT.
// ============================================================================
import Dexie from 'dexie';

// Make Dexie available globally for modules that expect it
if (typeof self !== 'undefined') {
    self.Dexie = Dexie;
}

import '../content/shadow_logger.js';

import './skill_matrix.js';
import './error_pattern_detector.js';
import './backfill_agent.js';
import './gemini_client.js';
import './openai_client.js';
import './anthropic_client.js';
import './local_client.js';
import './llm_gateway.js';
import './day_log_harvester.js';
import './digest_orchestrator.js';
import './insight_compressor.js';
import './insight_deduplicator.js';
import './insights_store.js';
import './drill_store.js';
import './drill_generator.js';
import './drill_verifier.js';
import './drill_tracker.js';
import './drill_types.js';
import './digest_scheduler.js';
import './retention_policy.js';
import './agent_loader.js';
import './async_notifier.js';

import '../background.js';
