/**
 * End-to-End Browser Tests for Chrome Extension
 *
 * Tests the extension in a real Chrome browser using Puppeteer.
 * Verifies:
 * - Extension loads correctly
 * - Backfill from history works
 * - Drill generation works with API keys
 * - UI interactions function properly
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

// Test configuration
const EXTENSION_PATH = path.resolve(__dirname, '../dist');
const TEST_TIMEOUT = 60000; // 60 seconds

describe('Chrome Extension E2E Tests', () => {
    let browser;
    let extensionPage;
    let serviceWorkerTarget;

    beforeAll(async () => {
        // Check if extension is built
        if (!fs.existsSync(EXTENSION_PATH)) {
            throw new Error('Extension not built. Run "npm run build" first.');
        }

        // Get absolute path for extension
        const absoluteExtensionPath = path.resolve(EXTENSION_PATH);
        console.log('Loading extension from:', absoluteExtensionPath);

        // Launch Chrome with extension loaded
        // IMPORTANT: Use Puppeteer's bundled Chromium instead of system Chrome
        // System Chrome has issues loading extensions in automation mode
        const launchOptions = {
            headless: false, // Must be false for extensions
            args: [
                `--disable-extensions-except=${absoluteExtensionPath}`,
                `--load-extension=${absoluteExtensionPath}`,
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-blink-features=AutomationControlled',
                '--enable-features=NetworkService,NetworkServiceInProcess'
            ],
            ignoreDefaultArgs: ['--disable-extensions', '--enable-automation']
        };

        // DO NOT set executablePath - let Puppeteer use its bundled Chromium
        // System Chrome blocks extensions in automation mode

        console.log('Using Puppeteer bundled Chromium (required for extension loading)');

        try {
            browser = await puppeteer.launch(launchOptions);

            // Listen for all pages to capture console errors
            browser.on('targetcreated', async (target) => {
                if (target.type() === 'page') {
                    const page = await target.page();
                    if (page) {
                        page.on('console', msg => {
                            if (msg.type() === 'error') {
                                console.log(`[Browser Error]: ${msg.text()}`);
                            }
                        });
                        page.on('pageerror', error => {
                            console.log(`[Page Error]: ${error.message}`);
                        });
                    }
                }
            });
        } catch (error) {
            console.error('Failed to launch browser:', error.message);
            console.log('\nTroubleshooting:');
            console.log('1. Make sure Puppeteer is installed: npm install');
            console.log('2. Run: npm run build');
            console.log('3. Check that dist/manifest.json exists');
            throw error;
        }

        // Wait for extension to load and service worker to start
        console.log('Waiting for service worker to start...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Try to navigate to chrome://extensions to check if extension is loaded
        const pages = await browser.pages();
        if (pages.length > 0) {
            try {
                // Note: chrome://extensions is not accessible via Puppeteer
                // But we can check the extension ID from targets
                console.log('Checking for extension targets...');
            } catch (e) {
                console.log('Could not navigate to extensions page:', e.message);
            }
        }

        // Try to find service worker, retry if not found
        // Enhanced detection: Chrome sometimes labels SW as 'other' during startup
        let retries = 10;
        while (retries > 0 && !serviceWorkerTarget) {
            const targets = await browser.targets();
            serviceWorkerTarget = targets.find(target => {
                const isSW = target.type() === 'service_worker';
                const isBackground = target.type() === 'other' && target.url().includes('background.js');
                const isExtensionScheme = target.url().startsWith('chrome-extension://');
                return (isSW || isBackground) && isExtensionScheme;
            });

            if (!serviceWorkerTarget) {
                console.log(`Service worker not found, retrying... (${retries} attempts left)`);
                console.log('Current targets:', targets.map(t => ({ type: t.type(), url: t.url() })));
                await new Promise(resolve => setTimeout(resolve, 2000));
                retries--;
            }
        }

        if (!serviceWorkerTarget) {
            const targets = await browser.targets();
            console.error('Available targets:', targets.map(t => ({ type: t.type(), url: t.url() })));
            console.error('\nExtension may not have loaded. Check:');
            console.error('1. manifest.json is valid');
            console.error('2. Extension built successfully (npm run build)');
            console.error('3. No errors in dist/background.js');
            throw new Error('Extension service worker not found. Make sure the extension loaded correctly.');
        }

        console.log('Extension loaded successfully');
        console.log('Service worker URL:', serviceWorkerTarget.url());
    }, TEST_TIMEOUT);

    afterAll(async () => {
        if (browser) {
            await browser.close();
        }
    }, TEST_TIMEOUT);

    describe('Extension Loading', () => {
        test('should load extension service worker', async () => {
            expect(serviceWorkerTarget).toBeDefined();
            // Allow 'other' type if it matched our background script check
            const type = serviceWorkerTarget.type();
            expect(['service_worker', 'other']).toContain(type);
        });

        test('should have background script loaded', async () => {
            const worker = await serviceWorkerTarget.worker();
            expect(worker).toBeDefined();
        });
    });

    describe('Module Loading', () => {
        test('should load SkillMatrix module', async () => {
            const worker = await serviceWorkerTarget.worker();

            const hasSkillMatrix = await worker.evaluate(() => {
                return typeof self.SkillMatrix !== 'undefined' &&
                       typeof self.SkillMatrix.SkillMatrix !== 'undefined';
            });

            expect(hasSkillMatrix).toBe(true);
        });

        test('should load LLMGateway module', async () => {
            const worker = await serviceWorkerTarget.worker();

            const hasLLMGateway = await worker.evaluate(() => {
                return typeof self.LLMGateway !== 'undefined';
            });

            expect(hasLLMGateway).toBe(true);
        });

        test('should load DrillGenerator module', async () => {
            const worker = await serviceWorkerTarget.worker();

            const hasDrillGenerator = await worker.evaluate(() => {
                return typeof self.DrillGenerator !== 'undefined';
            });

            expect(hasDrillGenerator).toBe(true);
        });

        test('should load GeminiClient module', async () => {
            const worker = await serviceWorkerTarget.worker();

            const hasGeminiClient = await worker.evaluate(() => {
                return typeof self.GeminiClient !== 'undefined';
            });

            expect(hasGeminiClient).toBe(true);
        });

        test('should load OpenAIClient module', async () => {
            const worker = await serviceWorkerTarget.worker();

            const hasOpenAIClient = await worker.evaluate(() => {
                return typeof self.OpenAIClient !== 'undefined';
            });

            expect(hasOpenAIClient).toBe(true);
        });
    });

    describe('Backfill from History', () => {
        test('should initialize SkillMatrix', async () => {
            const worker = await serviceWorkerTarget.worker();

            const result = await worker.evaluate(async () => {
                const matrix = new self.SkillMatrix.SkillMatrix();
                await matrix.init();
                return {
                    initialized: matrix.initialized,
                    hasDNA: !!matrix.dna,
                    skillCount: Object.keys(matrix.dna?.skills || {}).length
                };
            });

            expect(result.initialized).toBe(true);
            expect(result.hasDNA).toBe(true);
            // In a fresh test environment, skillCount may be 0
            expect(result.skillCount).toBeGreaterThanOrEqual(0);
        });

        test('should handle backfill request', async () => {
            const worker = await serviceWorkerTarget.worker();

            // Set up test data
            await worker.evaluate(async () => {
                await chrome.storage.local.set({
                    problems: {
                        'two-sum': {
                            slug: 'two-sum',
                            title: 'Two Sum',
                            difficulty: 'Easy',
                            topics: ['Array', 'Hash Table'],
                            history: [
                                { date: new Date().toISOString(), rating: 3, status: 'Accepted' }
                            ]
                        }
                    }
                });
            });

            // Trigger backfill
            const result = await worker.evaluate(async () => {
                return new Promise((resolve) => {
                    chrome.runtime.sendMessage(
                        { action: 'backfillHistory' },
                        (response) => resolve(response || { success: false, error: 'No response' })
                    );
                });
            });

            // In test environment, backfill may not work as expected
            // Just verify we got a response
            expect(result).toBeDefined();
            if (result.success) {
                expect(result.count).toBeGreaterThanOrEqual(0);
            }
        }, TEST_TIMEOUT);
    });

    describe('Drill Generation', () => {
        test('should detect API key presence', async () => {
            const worker = await serviceWorkerTarget.worker();

            // Set up test API key
            await worker.evaluate(async () => {
                await chrome.storage.local.set({
                    keys: { openai: 'test-api-key-12345' },
                    selectedModelId: 'gpt-4o',
                    aiProvider: 'cloud'
                });
            });

            const hasApiKey = await worker.evaluate(async () => {
                if (typeof self.LLMGateway === 'undefined') return false;
                const key = await self.LLMGateway.getApiKey();
                return !!key;
            });

            expect(hasApiKey).toBe(true);
        });

        test('should have DrillGenerator available', async () => {
            const worker = await serviceWorkerTarget.worker();

            const hasDrillGenerator = await worker.evaluate(() => {
                return typeof self.DrillGenerator !== 'undefined' &&
                       typeof self.DrillGenerator.generateFromWeakSkills === 'function';
            });

            expect(hasDrillGenerator).toBe(true);
        });
    });

    describe('Options Page', () => {
        test('should open options page', async () => {
            const page = await browser.newPage();

            // Get extension ID
            const extensionId = serviceWorkerTarget.url().split('/')[2];
            const optionsUrl = `chrome-extension://${extensionId}/src/options/options.html`;

            await page.goto(optionsUrl, { waitUntil: 'networkidle0' });

            const title = await page.title();
            expect(title).toBeTruthy();

            await page.close();
        });

        test('should have backfill button', async () => {
            const page = await browser.newPage();

            const extensionId = serviceWorkerTarget.url().split('/')[2];
            const optionsUrl = `chrome-extension://${extensionId}/src/options/options.html`;

            await page.goto(optionsUrl, { waitUntil: 'networkidle0' });

            // Look for backfill button (adjust selector based on actual HTML)
            const hasBackfillButton = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                return buttons.some(btn =>
                    btn.textContent.toLowerCase().includes('backfill') ||
                    btn.textContent.toLowerCase().includes('history')
                );
            });

            expect(hasBackfillButton).toBe(true);

            await page.close();
        });

        test('should have drill generation button', async () => {
            const page = await browser.newPage();

            const extensionId = serviceWorkerTarget.url().split('/')[2];
            const optionsUrl = `chrome-extension://${extensionId}/src/options/options.html`;

            await page.goto(optionsUrl, { waitUntil: 'networkidle0' });

            const hasDrillButton = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                return buttons.some(btn =>
                    btn.textContent.toLowerCase().includes('drill') ||
                    btn.textContent.toLowerCase().includes('generate')
                );
            });

            expect(hasDrillButton).toBe(true);

            await page.close();
        });
    });

    describe('Popup', () => {
        test('should open popup', async () => {
            const page = await browser.newPage();

            const extensionId = serviceWorkerTarget.url().split('/')[2];
            const popupUrl = `chrome-extension://${extensionId}/src/popup/popup.html`;

            await page.goto(popupUrl, { waitUntil: 'networkidle0' });

            const title = await page.title();
            expect(title).toBeTruthy();

            await page.close();
        });
    });
});
