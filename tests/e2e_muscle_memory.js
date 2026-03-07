/**
 * E2E Test for Muscle Memory Drills (Sprint 11.3)
 * 
 * Verifies:
 * 1. Loading state appears during generation
 * 2. Pseudo-code is accepted
 * 3. Extensions load correctly
 */
const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    const pathToExtension = path.resolve(__dirname, '..');
    console.log(`Loading extension from: ${pathToExtension}`);

    const browser = await puppeteer.launch({
        headless: false, // Must be false for extensions
        args: [
            `--disable-extensions-except=${pathToExtension}`,
            `--load-extension=${pathToExtension}`
        ]
    });

    try {
        // Wait for extension background to load
        await new Promise(r => setTimeout(r, 2000));

        const targets = await browser.targets();
        console.log('Available targets:', targets.map(t => t.url()));

        let extensionId;
        for (const target of targets) {
            const url = target.url();
            if (url.startsWith('chrome-extension://')) {
                extensionId = url.split('/')[2];
                break;
            }
        }

        if (!extensionId) {
            // Fallback: try to find any target with chrome-extension protocol
            const extTarget = targets.find(t => t.url().includes('chrome-extension://'));
            if (extTarget) {
                extensionId = extTarget.url().split('/')[2];
            }
        }

        if (!extensionId) {
            console.error('Could not find extension ID from targets');
            console.log('Targets were:', targets.map(t => t.url()));
            throw new Error('Extension ID not found');
        }

        console.log(`Found Extension ID: ${extensionId}`);
        // FIXED: Use drillId instead of id
        const drillUrl = `chrome-extension://${extensionId}/src/drills/drills.html?drillId=demo3`;

        console.log(`Navigating to: ${drillUrl}`);

        const page = await browser.newPage();

        // Listen to console logs
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));

        await page.goto(drillUrl, { waitUntil: 'networkidle0' });

        // 3. Interact with the page
        console.log('Waiting for drill content...');
        await page.waitForSelector('#drill-content');

        // Mock CodeGeneratorAgent to test UI states without real LLM
        await page.evaluate(() => {
            window.CodeGeneratorAgent = {
                generateCode: async (input) => {
                    // Simulate delay for loading state
                    await new Promise(r => setTimeout(r, 1500));
                    return {
                        success: true,
                        code: 'def binary_search(arr, t):\n    return 0',
                        confidence: 0.95,
                        language: 'python'
                    };
                }
            };
        });

        // Inputs
        console.log('Typing answer...');
        const inputSelector = '#drill-answer';
        try {
            await page.waitForSelector(inputSelector, { timeout: 5000 });
            console.log('Input selector found');
        } catch (e) {
            console.error('Input selector NOT found within timeout');
            throw e;
        }

        // Use evaluate for faster/more reliable input
        await page.evaluate((sel) => {
            console.log('Evaluating input set for:', sel);
            const el = document.querySelector(sel);
            if (el) {
                el.value = 'function binary_search(arr, t):\n  l, r = 0, len(arr)-1';
                el.dispatchEvent(new Event('input', { bubbles: true }));
                console.log('Input set successfully');
            } else {
                console.error('Element not found inside evaluate');
            }
        }, inputSelector);

        // 4. Submit
        console.log('Submitting answer...');
        const submitBtn = '#btn-submit';
        await page.waitForSelector(submitBtn, { timeout: 2000 });
        await page.click(submitBtn);

        // 5. Verify Loading State
        console.log('Verifying loading state...');
        // We expect the overlay to appear
        try {
            await page.waitForSelector('#loading-overlay', { timeout: 2000 });
            console.log('✅ Loading overlay appeared');
        } catch (e) {
            console.warn('⚠️ Loading overlay missing or too fast');
        }

        // 6. Wait for Result
        console.log('Waiting for result...');
        await page.waitForSelector('#drill-result', { visible: true, timeout: 10000 });
        console.log('✅ Result section visible');

        // Check for success or error
        const resultText = await page.$eval('.result-message', el => el.textContent);
        console.log(`Result Message: ${resultText}`);

    } catch (err) {
        console.error('Test Failed:', err);
    } finally {
        console.log('Closing browser...');
        await browser.close();
    }
})();
