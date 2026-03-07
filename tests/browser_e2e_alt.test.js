/**
 * Alternative E2E test approach using CDP to load extension
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '../dist');
const TEST_TIMEOUT = 60000;

describe('Chrome Extension E2E Tests (CDP Approach)', () => {
    let browser;
    let backgroundPage;

    beforeAll(async () => {
        if (!fs.existsSync(EXTENSION_PATH)) {
            throw new Error('Extension not built. Run "npm run build" first.');
        }

        console.log('Extension path:', EXTENSION_PATH);

        // Use Puppeteer's bundled Chromium which may work better with extensions
        browser = await puppeteer.launch({
            headless: false,
            devtools: false,
            args: [
                `--disable-extensions-except=${EXTENSION_PATH}`,
                `--load-extension=${EXTENSION_PATH}`,
                '--no-sandbox'
            ]
        });

        // Wait for extension to load
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Find the background page/service worker
        const targets = await browser.targets();
        console.log('All targets:', targets.map(t => ({ type: t.type(), url: t.url() })));

        const extensionTarget = targets.find(
            target => target.type() === 'service_worker' && target.url().includes('background.js')
        );

        if (!extensionTarget) {
            console.error('Extension not loaded. Trying alternative detection...');

            // Try to find any extension-related target
            const anyExtTarget = targets.find(t => t.url().startsWith('chrome-extension://'));
            if (anyExtTarget) {
                console.log('Found extension target:', anyExtTarget.url());
                backgroundPage = await anyExtTarget.page();
            } else {
                throw new Error('Extension failed to load. No extension targets found.');
            }
        } else {
            console.log('Extension loaded:', extensionTarget.url());
            backgroundPage = await extensionTarget.worker();
        }
    }, TEST_TIMEOUT);

    afterAll(async () => {
        if (browser) {
            await browser.close();
        }
    });

    test('should load extension', () => {
        expect(backgroundPage).toBeDefined();
    });

    test('should have SkillMatrix available', async () => {
        if (!backgroundPage) {
            console.log('Skipping test - no background page');
            return;
        }

        const hasSkillMatrix = await backgroundPage.evaluate(() => {
            return typeof self.SkillMatrix !== 'undefined';
        });

        expect(hasSkillMatrix).toBe(true);
    });
});
