/**
 * Phase 6: サンプル LP HTML にガードを掛け、error なら exit 1。
 * CI: npm run guard:lp
 */

import { buildPhase5GuardSampleBodyInner } from '../lib/generate/phase5-structure-self-check';
import { runLpHtmlGuards } from '../lib/guard/lp-html-static-check';

const html = buildPhase5GuardSampleBodyInner();
if (!html.trim()) {
  console.error('[guard:lp] empty sample html (garden master missing?)');
  process.exit(1);
}

const selfRef =
  '<html><body><p>この参照は意図的に本文をずらしています。トライグラム警告の smoke 用。</p></body></html>';
const report = runLpHtmlGuards(html, {
  minCtaTouchpoints: 3,
  minSections: 5,
  referenceHtml: selfRef,
  trigramWarnThreshold: 0.99,
  longSubstringWarnMin: 200,
});

for (const f of report.findings) {
  console.log(`[${f.severity}] ${f.code}: ${f.message}`);
}
console.log('[guard:lp] metrics', report.metrics);

if (!report.ok) {
  console.error('[guard:lp] FAILED (errors present)');
  process.exit(1);
}
console.log('[guard:lp] OK');
