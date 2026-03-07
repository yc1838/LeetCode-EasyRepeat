/**
 * Debug script to launch Chrome with extension and keep it open
 * This helps diagnose why the extension isn't loading in tests
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '../dist');

async function debugExtension() {
    console.log('Extension path:', EXTENSION_PATH);

    if (!fs.existsSync(EXTENSION_PATH)) {
        console.error('❌ Extension not built. Run "npm run build" first.');
        process.exit(1);
    }

    console.log('✓ Extension dist folder exists');

    // Check manifest
    const manifestPath = path.join(EXTENSION_PATH, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
        console.error('❌ manifest.json not found in dist/');
        process.exit(1);
    }

    console.log('✓ manifest.json exists');

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    console.log('Extension name:', manifest.name);
    console.log('Version:', manifest.version);

    console.log('\n🚀 Launching Chrome with extension...');
    console.log('Chrome will stay open. Check chrome://extensions for errors.');
    console.log('Press Ctrl+C to exit.\n');

    const browser = await puppeteer.launch({
        headless: false,
        devtools: true,
        userDataDir: path.resolve(__dirname, '../.test-profile'),
        args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ]
    });

    // Wait a bit for extension to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    const targets = await browser.targets();
    console.log('\n📋 Available targets:');
    targets.forEach(target => {
        console.log(`  - ${target.type()}: ${target.url()}`);
    });

    const extensionTarget = targets.find(t =>
        (t.type() === 'service_worker' || t.type() === 'other') &&
        t.url().startsWith('chrome-extension://')
    );

    if (extensionTarget) {
        console.log('\n✅ Extension loaded successfully!');
        console.log('Extension URL:', extensionTarget.url());

        // Try to get the worker and check for errors
        try {
            const worker = await extensionTarget.worker();
            console.log('✓ Service worker accessible');

            // Listen for console messages
            worker.on('console', msg => {
                console.log(`[SW Console ${msg.type()}]:`, msg.text());
            });
        } catch (error) {
            console.log('⚠️  Could not access service worker:', error.message);
        }
    } else {
        console.log('\n❌ Extension NOT loaded!');
        console.log('\nTo debug:');
        console.log('1. Open chrome://extensions in the browser window');
        console.log('2. Check for error messages');
        console.log('3. Click "Errors" button if present');
    }

    // Open a new page to chrome://extensions
    const page = await browser.newPage();
    await page.goto('chrome://extensions');

    console.log('\n💡 Opened chrome://extensions - check for errors there');
    console.log('Press Ctrl+C when done debugging...\n');

    // Keep process alive
    await new Promise(() => {});
}

debugExtension().catch(console.error);
