/**
 * NeetCode Content Script Simulation Probe
 *
 * Paste into DevTools console on a NeetCode problem page.
 * Validates the confirmed implementation approach before writing real code.
 *
 * Probes:
 *   1. Slug extraction from URL
 *   2. Title from document.title
 *   3. Difficulty from difficulty-pill selector
 *   4. DOM observer for "Accepted" — submit something within 30s
 */
(async function probe() {
  const results = [];

  function pass(name, detail) {
    results.push({ name, status: 'PASS', detail });
    console.log(`%c[PASS] ${name}`, 'color: green; font-weight: bold', detail);
  }
  function fail(name, detail) {
    results.push({ name, status: 'FAIL', detail });
    console.log(`%c[FAIL] ${name}`, 'color: red; font-weight: bold', detail);
  }

  // ── Probe 1: Slug ─────────────────────────────────────────────────────────

  const slugMatch = window.location.pathname.match(/\/problems\/([^\/]+)/);
  const slug = slugMatch ? slugMatch[1] : null;
  if (slug) {
    pass('Probe 1 — Slug', `slug="${slug}"`);
  } else {
    fail('Probe 1 — Slug', `pathname="${window.location.pathname}" — not on a problem page?`);
  }

  // ── Probe 2: Title ────────────────────────────────────────────────────────

  const rawTitle = document.title;
  const title = rawTitle.replace(/\s*[-|]\s*NeetCode\s*$/i, '').trim();
  if (title && title !== rawTitle) {
    pass('Probe 2 — Title', `title="${title}" (stripped from "${rawTitle}")`);
  } else if (title) {
    pass('Probe 2 — Title', `title="${title}" (no suffix to strip — may be on a non-standard page)`);
  } else {
    fail('Probe 2 — Title', `document.title="${rawTitle}" — could not parse title`);
  }

  // ── Probe 3: Difficulty ───────────────────────────────────────────────────

  const diffEl = document.querySelector('[class*="difficulty-pill"]');
  const difficulty = diffEl?.textContent?.trim();
  if (['Easy', 'Medium', 'Hard'].includes(difficulty)) {
    pass('Probe 3 — Difficulty', `difficulty="${difficulty}" class="${diffEl.className}"`);
  } else if (diffEl) {
    fail('Probe 3 — Difficulty', `[class*="difficulty-pill"] found but text="${difficulty}" is not Easy/Medium/Hard`);
  } else {
    fail('Probe 3 — Difficulty', '[class*="difficulty-pill"] not found in DOM');
  }

  // ── Summary so far ────────────────────────────────────────────────────────

  const fakeRecord = {
    slug,
    title,
    difficulty,
    topics: ['NeetCode'],
    source: 'neetcode'
  };
  console.log('%c[Simulated problem record]', 'color: purple; font-weight: bold', fakeRecord);

  // ── Probe 4: DOM observer for "Accepted" ──────────────────────────────────
  //
  // Watches for output-header containing "Accepted".
  // Also scans existing DOM in case result is already showing.
  // Submit a solution within 30s if not already showing.

  console.log('%c[NeetCode Probe] --- Probe 4: Submission detection ---', 'font-weight: bold');

  function extractResult(el) {
    const text = el.textContent || '';
    const cls = el.className || '';
    if (!cls.includes('output-header')) return null;
    if (text.includes('Accepted')) return { status: 'Accepted', text: text.trim().substring(0, 80), className: cls };
    if (text.includes('Wrong Answer')) return { status: 'Wrong Answer', text: text.trim().substring(0, 80), className: cls };
    if (text.includes('Time Limit Exceeded')) return { status: 'Time Limit Exceeded', text: text.trim().substring(0, 80), className: cls };
    if (text.includes('Runtime Error')) return { status: 'Runtime Error', text: text.trim().substring(0, 80), className: cls };
    return null;
  }

  // Check if result already visible
  let existingResult = null;
  for (const el of document.querySelectorAll('[class*="output-header"]')) {
    existingResult = extractResult(el);
    if (existingResult) break;
  }

  if (existingResult) {
    console.log('[NeetCode Probe] Found existing result in DOM.');
    pass('Probe 4 — Submission detection', `status="${existingResult.status}" text="${existingResult.text}" class="${existingResult.className}"`);
    printReport();
    return results;
  }

  console.log('%c[NeetCode Probe] No result visible yet. Submit a solution — waiting 30s...', 'color: orange');

  const probe4Result = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 30000);

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          // Check the node itself
          const r = extractResult(node);
          if (r) { observer.disconnect(); clearTimeout(timer); resolve(r); return; }
          // Check descendants
          for (const child of node.querySelectorAll('[class*="output-header"]')) {
            const rc = extractResult(child);
            if (rc) { observer.disconnect(); clearTimeout(timer); resolve(rc); return; }
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  });

  if (probe4Result) {
    pass('Probe 4 — Submission detection', `status="${probe4Result.status}" text="${probe4Result.text}" class="${probe4Result.className}"`);
  } else {
    fail('Probe 4 — Submission detection', 'Timed out — no submission result detected in 30s');
  }

  printReport();
  return results;

  function printReport() {
    console.log('\n%c=== NeetCode Probe Results ===', 'font-size: 14px; font-weight: bold');
    for (const r of results) {
      const style = r.status === 'PASS' ? 'color: green; font-weight: bold' : 'color: red; font-weight: bold';
      console.log(`%c[${r.status}]%c ${r.name}: ${r.detail}`, style, 'color: inherit');
    }
    const passed = results.filter(r => r.status === 'PASS').length;
    console.log(`\n%cScore: ${passed}/${results.length} passed`, 'font-size: 13px; font-weight: bold');
    if (passed === results.length) {
      console.log('%cAll checks pass — ready to implement NeetCode content script.', 'color: green; font-weight: bold');
    } else {
      console.log('%cSome checks failed — review above before implementing.', 'color: red');
    }
  }
})();
