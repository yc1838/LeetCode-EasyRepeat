/**
 * LeetCode EasyRepeat - Review reset trigger (isolated content script)
 *
 * If this problem was opened from the popup's review queue, a marker exists in
 * chrome.storage.local. Consume it and ask the MAIN-world script
 * (editor_reset_main.js) to reset the editor to the default template.
 */
(function () {
    if (typeof window === 'undefined' || window.__easyRepeatReviewResetContent) return;
    window.__easyRepeatReviewResetContent = true;

    const RR = window.ReviewReset;
    if (!RR || !chrome?.storage?.local) return;

    let zh = location.hostname === 'leetcode.cn';
    const isZh = () => zh;

    function toast(text, isError) {
        const el = document.createElement('div');
        el.textContent = text;
        el.style.cssText = [
            'position:fixed', 'top:16px', 'left:50%', 'transform:translateX(-50%)', 'z-index:2147483647',
            'padding:8px 14px', 'border-radius:6px', 'font:13px/1.4 -apple-system,system-ui,sans-serif',
            `background:${isError ? '#4a1020' : '#102a1a'}`, `color:${isError ? '#ffb3c1' : '#9dffc4'}`,
            `border:1px solid ${isError ? '#ff2a6d' : '#00c853'}`, 'box-shadow:0 4px 14px rgba(0,0,0,.35)'
        ].join(';');
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 3500);
    }

    async function consumeMarker(slug) {
        const stored = await chrome.storage.local.get({ [RR.STORAGE_KEY]: {} });
        const { matched, markers } = RR.consume(stored[RR.STORAGE_KEY], slug, Date.now());
        if (matched) await chrome.storage.local.set({ [RR.STORAGE_KEY]: markers });
        return matched;
    }

    function requestReset(slug) {
        const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        let acked = false;
        let attempts = 0;

        const onMessage = (event) => {
            if (event.source !== window) return;
            const msg = event.data;
            if (!msg || msg.source !== 'easyrepeat-main' || msg.nonce !== nonce) return;
            if (msg.type === 'ER_RESET_ACK') acked = true;
            if (msg.type === 'ER_RESET_RESULT') {
                window.removeEventListener('message', onMessage);
                const r = msg.result || {};
                if (r.ok) {
                    if (!r.already) toast(isZh() ? '已重置为初始代码，开始复习吧（Ctrl/Cmd+Z 可恢复之前的代码）' : 'Editor reset for review (Ctrl/Cmd+Z restores your previous code)');
                } else {
                    console.warn('[LeetCode EasyRepeat] Review reset failed:', r);
                    toast(isZh() ? '自动重置失败，请手动点击重置按钮' : 'Auto reset failed — please reset the code manually', true);
                }
            }
        };
        window.addEventListener('message', onMessage);

        // The MAIN-world script may load after us; resend until it acknowledges.
        const send = () => {
            if (acked || attempts++ > 40) return;
            window.postMessage({ source: 'easyrepeat-isolated', type: 'ER_RESET_EDITOR', slug, nonce }, '*');
            setTimeout(send, 500);
        };
        send();
    }

    (async () => {
        try {
            const slug = RR.slugFromPath(location.pathname);
            if (!slug) return;
            if (await consumeMarker(slug)) {
                try {
                    const st = await chrome.storage.local.get({ uiLanguage: null });
                    if (st.uiLanguage) zh = String(st.uiLanguage).startsWith('zh');
                } catch (e) { /* keep host-based default */ }
                console.log(`[LeetCode EasyRepeat] Review tab for ${slug}: resetting editor.`);
                requestReset(slug);
            }
        } catch (e) {
            console.warn('[LeetCode EasyRepeat] Review reset check failed:', e);
        }
    })();
})();
