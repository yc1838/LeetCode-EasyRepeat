# Privacy Policy for LeetCode EasyRepeat

**Last Updated:** February 6, 2026

## 1. Introduction
LeetCode EasyRepeat ("the Extension") is a Chrome extension designed to help users practice LeetCode problems using spaced repetition. We respect your privacy and are committed to protecting it. This Privacy Policy explains our practices regarding data collection, use, and disclosure.

## 2. Data Collection and Storage
**We do not collect, transmit, or store any of your personal data on our servers.**

*   **Local Storage**: All data related to your problem history, repetition schedules, notes, and settings is stored locally on your device using the Chrome Storage API (`chrome.storage.local`).
*   **No Remote Database**: We do not maintain a backend server or database. We do not have access to your data.
*   **Data Persistence**: Your data remains on your device and is not synced unless you manually export it or use Chrome's built-in syncing features (if applicable in future updates).

## 3. External Services and Permissions
The Extension interacts with the following external services directly from your browser:

*   **LeetCode (leetcode.com)**:
    *   The Extension requests permission to access `leetcode.com` to fetch problem details (title, difficulty, topic tags) and verify submission statuses.
    *   This communication happens directly between your browser and LeetCode. No data is routed through any third-party server.
    *   The Extension operates using your existing LeetCode session cookies. It does not store or transmit your LeetCode credentials.

## 4. AI and Machine Learning Features
*(If applicable)*
The Extension may offer features to analyze your code or mistakes using Artificial Intelligence (AI) models.
*   **Local Processing**: By default, or if configured, the Extension may use local processing capabilities (e.g., Chrome Built-in AI) where data does not leave your device.
*   **Bring Your Own Key (BYOK)**: If you choose to use third-party AI providers (e.g., Gemini, OpenAI) by providing your own API Key, the Extension will send code snippets specifically selected by you to that provider for analysis. This data is subject to the privacy policy of the respective AI provider. We do not have access to these keys or the data sent.

## 5. Changes to This Policy
We may update our Privacy Policy from time to time. We will notify you of any changes by posting the updated policy in this repository:
- https://github.com/yc1838/LeetCode-Spaced-Repetition-Chrome-Extension

## 6. Contact Us
If you have any questions about this Privacy Policy, please contact us at:
*   yc1838@nyu.edu
*   https://github.com/yc1838/LeetCode-Spaced-Repetition-Chrome-Extension/issues
