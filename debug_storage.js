// Debug script to check Chrome storage
// Run this in the extension's background service worker console

(async () => {
    const storage = await chrome.storage.local.get(null);
    console.log('=== FULL STORAGE DUMP ===');
    console.log(JSON.stringify(storage, null, 2));

    console.log('\n=== API KEY CHECK ===');
    console.log('geminiApiKey (legacy):', storage.geminiApiKey ? '✓ Present' : '✗ Missing');
    console.log('keys.google:', storage.keys?.google ? '✓ Present' : '✗ Missing');
    console.log('keys.openai:', storage.keys?.openai ? '✓ Present' : '✗ Missing');
    console.log('keys.anthropic:', storage.keys?.anthropic ? '✓ Present' : '✗ Missing');

    console.log('\n=== PROVIDER SETTINGS ===');
    console.log('aiProvider:', storage.aiProvider || 'not set');
    console.log('selectedModelId:', storage.selectedModelId || 'not set');
    console.log('localEndpoint:', storage.localEndpoint || 'not set');

    if (storage.keys?.google) {
        const key = storage.keys.google;
        console.log('\n=== GOOGLE API KEY INFO ===');
        console.log('Length:', key.length);
        console.log('First 10 chars:', key.substring(0, 10));
        console.log('Has dots:', key.includes('.'));
        console.log('Starts with AIza:', key.startsWith('AIza'));
    }
})();
