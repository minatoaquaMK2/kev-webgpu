/** Pinned upstream-engine diagnostic. Uses the production Worker and real q8.
 * This does not define RCA ground truth or modify production candidate ordering.
 */
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const input = JSON.parse(await readFile('tests/fixtures/upstream/diagnostic-requests.json', 'utf8'));
const policy = JSON.parse(await readFile('tests/model-validation/policy.json', 'utf8'));
const base = process.env.KEV_LOCAL_URL || 'http://127.0.0.1:5173';
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname)) throw Error('Only loopback validation is allowed');
const context = await chromium.launchPersistentContext(resolve('.local-browser-profile'), {
  channel: 'chrome', headless: true, chromiumSandbox: true,
});
const report = { startedAt: new Date().toISOString(), source: { ...input, rows: undefined, orderRows: undefined },
  tolerance: policy.parity.originalCheckpointVsQ8, launch: { channel: 'chrome', chromiumSandbox: true, unsafeFlags: [] }, rows: [], orderRows: [] };
const page = context.pages()[0] || await context.newPage();
function compare(actual, expected) {
  if (actual.length !== expected.length || actual.some(p => !Number.isFinite(p))) throw Error('Invalid raw vector');
  const errors = actual.map((p, i) => Math.abs(p - expected[i]));
  const maxAbsoluteError = Math.max(...errors), meanAbsoluteError = errors.reduce((a, b) => a + b, 0) / errors.length;
  const argmax = values => values.indexOf(Math.max(...values));
  const argmaxFlipped = argmax(actual) !== argmax(expected);
  return { maxAbsoluteError, meanAbsoluteError, argmaxFlipped,
    passed: maxAbsoluteError <= report.tolerance.maxAbsoluteError && meanAbsoluteError <= report.tolerance.meanAbsoluteError && !argmaxFlipped };
}
try {
  await page.goto(`${base}/tests/model-validation/index.html`);
  await page.waitForFunction(() => !!window.kevValidation);
  report.device = await page.evaluate(() => window.kevValidation.probe());
  if (!report.device.available) throw Error('Supported physical WebGPU device unavailable');
  report.load = await page.evaluate(() => window.kevValidation.load());
  for (const row of input.rows) {
    const result = await page.evaluate(request => window.kevValidation.analyzeRequest(request), row.request);
    const actual = result.unroundedProbabilities[0];
    report.rows.push({ ...row, result, comparison: compare(actual, row.referenceAtServingTemperature) });
    if (report.rows.length % 10 === 0) console.log(`Upstream real q8: ${report.rows.length}/${input.rows.length}`);
  }
  for (const row of input.orderRows) {
    const result = await page.evaluate(request => window.kevValidation.analyzeRequest(request), row.request);
    const selected = result.response.answers.probable_cause.choice;
    const baseline = report.orderRows.find(r => r.caseId === row.caseId && r.kind === 'baseline');
    report.orderRows.push({ ...row, result, selected, baselineComparison: baseline ? {
      selectedChanged: selected !== baseline.selected,
      maximumOptionProbabilityShift: Math.max(...Object.entries(result.unroundedByOption).map(([key, p]) => Math.abs(p - baseline.result.unroundedByOption[key]))),
    } : null });
  }
  const allErrors = report.rows.flatMap(row => row.result.unroundedProbabilities[0].map((p, i) => Math.abs(p - row.referenceAtServingTemperature[i])));
  report.summary = { questionChecks: report.rows.length, optionChecks: allErrors.length,
    passedChecks: report.rows.filter(r => r.comparison.passed).length,
    maxAbsoluteError: Math.max(...allErrors), meanAbsoluteError: allErrors.reduce((a, b) => a + b, 0) / allErrors.length,
    argmaxFlips: report.rows.filter(r => r.comparison.argmaxFlipped).length,
    failedChecks: report.rows.filter(r => !r.comparison.passed).map(r => r.id),
    reorderedChecks: report.orderRows.filter(r => r.baselineComparison).length,
    reorderedTop1Changes: report.orderRows.filter(r => r.baselineComparison?.selectedChanged).length,
    formalParity: 'not_verified: upstream fixture does not record PyTorch version or generation timestamp; no independent native q8 reference executed',
  };
  report.status = 'completed';
} catch (error) { report.status = 'failed'; report.error = String(error); process.exitCode = 1; }
finally {
  await page.evaluate(() => window.kevValidation.unload()).catch(() => {});
  report.finishedAt = new Date().toISOString();
  await writeFile('results/upstream-model-diagnostics.json', JSON.stringify(report, null, 2) + '\n');
  await context.close();
  console.log(JSON.stringify({ status: report.status, summary: report.summary, error: report.error }, null, 2));
}
