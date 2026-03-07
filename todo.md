# Future Roadmap

## 1. Upgrade to FSRS Algorithm (Priority: High)
**Goal:** Replace the rigid SM-2 (1 day -> 6 days) logic with the modern **Free Spaced Repetition Scheduler (FSRS)**. This will make scheduling dynamic based on how difficult a specific problem is for the user.

### Action Items:
- [x] **Dependency**: Research and include `ts-fsrs` (or similar JS/TS library) into the project.
    - *Implemented simplified FSRS v4.5 logic in `fsrs_logic.js` (No external dependency needed for now).*
- [ ] **Data Migration**: 
    - Convert existing `Interval / Repetition / Ease` fields to FSRS `Difficulty (D) / Stability (S) / Retrievability (R)`.
    - *Strategy*: Use default parameters for existing items until they are reviewed again.
- [ ] **Logic Update**:
    - Replace `calculateNextReview` in `srs_logic.js`.
    - Map user ratings to FSRS inputs:
        - `Again` (Fail) -> Score 1
        - `Hard` -> Score 2
        - `Good` -> Score 3
        - `Easy` -> Score 4
    - *(Note: We currently only have Hard/Med/Easy buttons, may need to add "Forgot" or map "Med" to "Good")*

## 2. "Optimize" Feature (Machine Learning)
**Goal:** Add a button that analyzes the user's past review history to "train" the algorithm, generating personalized parameters that match the user's memory utilization.

### Technical Implementation (Local / WASM):
*How it works without an external API:*
The FSRS optimizer typically uses Gradient Descent to find the best weights. We likely **do not** need an external API (like Gemini/OpenAI) because this is a numerical optimization problem, not an LLM task.

- [ ] **WebAssembly (WASM)**: 
    - The most robust FSRS optimizer is written in Rust (`fsrs-optimizer`).
    - We can compile this Rust code to **WASM** and run it fundamentally **client-side** (inside the Chrome Extension).
    - This ensures user data stays local and privacy-first.
- [ ] **Review History Storage**:
    - Ensure `chrome.storage` is capturing a granular history log: `Review Date`, `Rating (1-4)`, `Time Elapsed`, `State (Learning/Review)`.
    - The optimizer requires at least ~500-1000 reviews to work effectively.

### User Flow:
1. User clicks "Optimize FSRS Parameters" in the Popup/Settings.
2. Extension reads all `history` logs from storage.
3. Extension passes logs to the WASM Optimizer.
4. ~10-30 seconds later, the Optimizer returns a new array of **Weights** (e.g., `[0.4, 0.6, 2.4, ...]`).
5. Extension saves these "Personalized Weights", which are then used for all future scheduling.

## 3. UI/UX Improvements
- [ ] **Retention Graph**: Visualize the "Forgetting Curve" using the computed `Retrievability` stat.
- [ ] **True Retention Display**: Show the user their *actual* retention rate (e.g., "You remember 88% of 'Medium' problems") vs the Target (90%).
