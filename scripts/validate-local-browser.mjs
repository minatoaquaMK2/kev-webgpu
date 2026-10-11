/** Opt-in real Chrome/physical-GPU acceptance. Requires the loopback dev server.
 * No mocks, flags enabling unsafe WebGPU, software adapters or substituted models.
 * The dedicated local profile caches only this test's public model files.
 */
import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
const base = process.env.KEV_LOCAL_URL || 'http://127.0.0.1:5173';
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname)) throw Error('Only loopback validation is allowed');
const output = resolve('results');
await mkdir(output, { recursive: true });
const save = (name, value) => writeFile(resolve(output, name), JSON.stringify(value, null, 2) + '\n');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dirty = !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
const context = await chromium.launchPersistentContext(resolve('.local-browser-profile'), {
  channel: 'chrome', headless: true, chromiumSandbox: true, viewport: { width: 1440, height: 1100 },
  acceptDownloads: true,
});
let phase = 'initial', marker = '', activeWorkers = 0, peakWorkers = 0;
const requests = [], errors = [], workers = [], consoleLogs = [], memorySamples = [];
let consoleMessages = 0, droppedConsoleMessages = 0;
function sampleMemory() {
  try {
    const rows = execFileSync('ps', ['-axo', 'pid,ppid,rss,args'], { encoding: 'utf8' }).trim().split('\n').slice(1).map(line => {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
      return match && { pid: +match[1], ppid: +match[2], rssKiB: +match[3], args: match[4] };
    }).filter(Boolean);
    const pids = new Set(rows.filter(r => r.args.includes(`--user-data-dir=${resolve('.local-browser-profile')}`)).map(r => r.pid));
    for (let i = 0; i < 8; i++) for (const row of rows) if (pids.has(row.ppid)) pids.add(row.pid);
    if (pids.size) memorySamples.push({ at: new Date().toISOString(), phase, processCount: pids.size, sumRssMiB: rows.filter(r => pids.has(r.pid)).reduce((sum, r) => sum + r.rssKiB / 1024, 0) });
  } catch { /* Missing process counters remain unavailable. */ }
}
const memoryTimer = setInterval(sampleMemory, 1000);
context.on('request', request => {
  const url = new URL(request.url()), body = request.postData() || '';
  requests.push({ phase, at: new Date().toISOString(), method: request.method(), origin: url.origin, path: url.pathname,
    bodyBytes: Buffer.byteLength(body), containsEvidenceMarker: !!marker && (request.url().includes(marker) || body.includes(marker)) });
});
const page = context.pages()[0] || await context.newPage();
page.on('worker', worker => {
  activeWorkers++; peakWorkers = Math.max(peakWorkers, activeWorkers);
  workers.push({ event: 'created', phase, at: new Date().toISOString() });
  worker.on('close', () => { activeWorkers--; workers.push({ event: 'closed', phase, at: new Date().toISOString() }); });
});
page.on('pageerror', error => errors.push({ phase, message: String(error) }));
page.on('console', message => {
  consoleMessages++;
  // Native profiling is a separate diagnostic. Bound ordinary acceptance logs
  // so a verbose engine cannot retain an unbounded Node-side message array.
  if (consoleLogs.length < 2000) consoleLogs.push({ phase, type: message.type(), text: message.text() });
  else droppedConsoleMessages++;
});
const report = { startedAt: new Date().toISOString(), revision, dirty, launch: { channel: 'chrome', headless: true, chromiumSandbox: true, unsafeFlags: [] }, checks: {} };
const log = message => console.log(`${new Date().toISOString()} ${message}`);
async function uiResult() { return JSON.parse(await page.locator('#raw').textContent()); }
async function analyze() {
  await page.locator('#analyze').click();
  await expect(page.locator('#analyze')).toBeEnabled({ timeout: 120000 });
  const value = await uiResult();
  if (value.stale || !value.gpuProof.gpuTensorOutputs) throw Error('No current GPU-backed model result');
  return value;
}
try {
  await page.goto(`${base}/tests/model-validation/index.html`);
  await page.locator('#os').fill(execFileSync('sw_vers', [], { encoding: 'utf8' }).trim());
  await page.locator('#hardware').fill('MacBook Air Mac15,13; Apple M3 10-core GPU; 24 GB unified RAM');
  await page.locator('#commit').fill(revision + (dirty ? '-dirty; see local-code.patch and file hashes' : ''));
  await page.locator('#probe').click();
  await expect(page.locator('#probe')).toBeEnabled();
  report.device = JSON.parse(await page.locator('#output').textContent());
  if (!report.device.available) throw Error(`Real GPU unsupported: ${JSON.stringify(report.device)}`);
  report.checks.noAutomaticModelDownload = requests.every(r => r.origin === new URL(base).origin);
  log('Physical GPU probe passed; explicitly loading pinned q8');
  phase = 'harness-load';
  await page.locator('#load').click();
  await expect(page.locator('#status')).toContainText(/Model loaded|Operation failed/, { timeout: 240000 });
  await expect(page.locator('#status')).toContainText('Model loaded');
  report.coldOrCachedLoad = JSON.parse(await page.locator('#output').textContent());
  await save('local-automated-load.json', report.coldOrCachedLoad);
  phase = 'harness-inference';
  await page.locator('#run').click();
  await expect(page.locator('#status')).toContainText('Run ended', { timeout: 240000 });
  const modelReport = JSON.parse(await page.locator('#output').textContent());
  await save('local-real-model-final.json', modelReport);
  report.domain = { top1: modelReport.domain.top1, showcase: modelReport.domain.showcase, parity: modelReport.parity.status };
  report.performance = modelReport.performance.summary;
  report.checks.gpuBackboneObserved = modelReport.domain.rows.every(r => r.result?.gpuProof.largeComputeObserved);
  log(`Real domain run completed: ${modelReport.domain.top1.correct}/${modelReport.domain.top1.completed}; GPU backbone ${report.checks.gpuBackboneObserved}`);
  await page.locator('#unload').click();
  await expect(page.locator('#status')).toContainText('Session released');
  await expect.poll(() => activeWorkers).toBe(0);
  phase = 'cached-ui-load';
  await page.goto(`${base.replace(/\/$/, '')}/demo/`);
  await expect(page.locator('#stages button')).toHaveCount(3);
  await page.locator('#stages button').nth(2).click();
  const cacheStart = requests.length, started = Date.now();
  await page.locator('#load').click();
  await expect(page.locator('#analyze')).toBeEnabled({ timeout: 120000 });
  report.cachedUiLoad = { wallMs: Date.now() - started, externalRequests: requests.slice(cacheStart).filter(r => r.origin !== new URL(base).origin) };
  report.checks.cachedReloadNoExternalRequests = report.cachedUiLoad.externalRequests.length === 0;
  phase = 'online-ui-inference';
  report.onlinePrediction = await analyze();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: resolve(output, 'kev-rca-local-desktop.png'), fullPage: false });
  await page.screenshot({ path: resolve(output, 'local-ui-desktop.png') });
  phase = 'offline-edited-evidence';
  await context.setOffline(true);
  report.offlineTransportProbe = await page.evaluate(async () => {
    try { await fetch('/__offline_transport_probe__', { cache: 'no-store' }); return 'unexpectedly-online'; }
    catch { return 'network-request-rejected'; }
  });
  if (report.offlineTransportProbe !== 'network-request-rejected') throw Error('Offline transport was not enforced');
  marker = `synthetic-offline-${randomUUID()}`;
  const edited = JSON.parse(await page.locator('#json-editor').inputValue());
  edited.incident.symptom += ` Local operator note ${marker}.`;
  await page.getByText('Edit evidence JSON', { exact: true }).click();
  await page.locator('#json-editor').fill(JSON.stringify(edited));
  await expect(page.locator('#freshness')).toContainText('STALE');
  report.checks.editMarksStale = true;
  await page.locator('#apply-json').click();
  report.offlinePrediction = await analyze();
  report.checks.offlineNewEvidenceInference = report.offlinePrediction.evidenceHash !== report.onlinePrediction.evidenceHash && report.offlinePrediction.inputSnapshot.incident.symptom.includes(marker);
  await page.locator('#next-check').click();
  await expect(page.locator('#next-check')).toBeEnabled({ timeout: 120000 });
  await expect(page.locator('#next-result')).toContainText('Current input');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export').click();
  const download = await downloadPromise;
  await download.saveAs(resolve(output, 'local-offline-export.json'));
  const exported = JSON.parse(await readFile(resolve(output, 'local-offline-export.json'), 'utf8'));
  report.checks.offlineExportBindsCurrentEvidence = exported.currentEvidenceHash === exported.prediction.evidenceHash && exported.nextCheck.evidenceHash === exported.prediction.evidenceHash;
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: resolve(output, 'local-ui-offline.png') });
  phase = 'cancel';
  await page.locator('#analyze').click();
  await page.locator('#cancel').click();
  await expect(page.locator('#analyze')).toBeEnabled({ timeout: 120000 });
  report.cancelNotice = await page.locator('#notice').textContent();
  report.checks.cancelDiscardsResult = /cancel/i.test(report.cancelNotice) && (await uiResult()).wallMs === report.offlinePrediction.wallMs;
  phase = 'import';
  edited.incident.symptom += ' Imported synthetic observation.';
  await page.locator('#import').setInputFiles({ name: 'synthetic-local-import.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(edited)) });
  await expect(page.locator('#notice')).toContainText('JSON imported locally');
  await expect(page.locator('#freshness')).toContainText('STALE');
  report.importedPrediction = await analyze();
  report.checks.localImportWorksOffline = report.importedPrediction.evidenceHash !== report.offlinePrediction.evidenceHash;
  phase = 'unload';
  await page.locator('#unload').click();
  await expect(page.locator('#load')).toBeEnabled();
  await expect(page.locator('#analyze')).toBeDisabled();
  await expect.poll(() => activeWorkers).toBe(0);
  report.checks.unloadClosesWorker = true;
  await context.setOffline(false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: resolve(output, 'local-ui-mobile.png') });
  report.checks.noEvidenceMarkerEgress = requests.every(r => !r.containsEvidenceMarker);
  report.checks.noRequestBodies = requests.every(r => r.bodyBytes === 0);
  report.checks.atMostOneWorker = peakWorkers <= 1;
  report.status = 'completed';
  log('Offline new evidence, export, import, cancel, cache and unload checks completed');
} catch (error) {
  report.status = 'failed'; report.error = String(error);
  report.pageStatus = await page.locator('body').innerText().catch(() => 'page unavailable');
  await page.screenshot({ path: resolve(output, 'local-acceptance-failure.png'), fullPage: true }).catch(() => {});
  process.exitCode = 1; log(`Acceptance interrupted: ${error}`);
} finally {
  clearInterval(memoryTimer);
  sampleMemory();
  report.memory = { peakVram: 'unavailable', method: '1-second ps RSS samples of only the isolated browser and its descendants. Sum includes shared pages multiple times; not VRAM or private resident memory.', samples: memorySamples, repeatedInference: 'See actual harness completion status; a finite run alone does not establish bounded GPU memory' };
  report.consoleCapture = { consoleMessages, captured: consoleLogs.length, droppedConsoleMessages, limit: 2000 };
  report.finishedAt = new Date().toISOString(); report.requests = requests; report.errors = errors; report.workers = workers; report.peakWorkers = peakWorkers;
  await save('local-browser-acceptance.json', report);
  await save('local-browser-console.json', consoleLogs);
  await context.close();
  console.log(JSON.stringify({ status: report.status, checks: report.checks, domain: report.domain, error: report.error }, null, 2));
}
