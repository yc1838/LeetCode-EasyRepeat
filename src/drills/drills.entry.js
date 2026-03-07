import '../shared/config.js';
import '../shared/storage.js';
// Dexie is loaded via script tag in HTML before this module
import '../background/drill_store.js';
import '../background/drill_types.js';
import '../background/gemini_client.js';
import '../background/drill_verifier.js';
import '../background/drill_tracker.js';
import '../background/code_generator_agent.js';
import '../background/hallucination_checker.js';
import '../background/async_notifier.js';
import '../background/sandbox_client.js';
import './drill_input_handler.js';
import './drill_page.js';
import './drill_init.js';
