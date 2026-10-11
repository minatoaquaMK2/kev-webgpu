/** Capture the educational guide without loading the real model or a shared browser profile. */
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const url = process.env.KEV_LOCAL_URL || 'http://127.0.0.1:5173/';
const target = new URL(url);
const isPublished = target.href === 'https://minatoaquamk2.github.io/kev-webgpu/';
if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) && !isPublished) throw Error('Only loopback or the exact published Kev guide URL is supported');
const prefix = process.env.KEV_CAPTURE_PREFIX || (isPublished ? 'pages-guide' : 'local-guide');
if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(prefix)) throw Error('Capture prefix must be a simple filename prefix');
const browser = await chromium.launch({ channel: 'chrome', headless: true, chromiumSandbox: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
const page = await context.newPage();
const report = {
  startedAt: new Date().toISOString(), url, prefix, browser: browser.version(),
  scope: `${isPublished ? 'Published Pages' : 'Local'} educational guide screenshots and DOM verification; no live inference or model loading`,
  captures: [], externalRequests: [], blockedRequests: [], workers: [], errors: [], responseErrors: [],
  checks: {}, chapters: [], evidenceStages: [], historicalCases: [],
};
// Fail safely if the guide ever begins requesting model/runtime assets. This
// observation run never opens the real demo and cannot download extra weights.
await context.route('**/*', async route => {
  const requested = new URL(route.request().url());
  const isExternal = requested.protocol !== 'data:' && requested.origin !== target.origin;
  const isModelAsset = /\.(?:onnx(?:_data)?|wasm|bin|data)(?:$|\/)/i.test(requested.pathname) || /\/kev-0\.8b\//i.test(requested.pathname);
  if (isExternal || isModelAsset) {
    report.blockedRequests.push({ url: requested.origin + requested.pathname, reason: isExternal ? 'external origin' : 'model/runtime asset' });
    await route.abort('blockedbyclient');
  } else await route.continue();
});
page.on('request', request => {
  const requested = new URL(request.url());
  if (requested.protocol !== 'data:' && requested.origin !== target.origin) report.externalRequests.push(requested.origin + requested.pathname);
});
page.on('worker', worker => report.workers.push(worker.url()));
page.on('pageerror', error => report.errors.push(String(error)));
page.on('response', response => { if (response.status() >= 400) report.responseErrors.push({ url: response.url(), status: response.status() }); });
await mkdir('results', { recursive: true });

async function capture(name, position) {
  await page.evaluate(position => {
    if (position === 'chapter') document.querySelector('#learn').scrollIntoView({ behavior: 'instant', block: 'start' });
    else window.scrollTo({ top: 0, behavior: 'instant' });
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, position);
  const layout = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollY, horizontalOverflow: document.documentElement.scrollWidth > innerWidth }));
  if (layout.horizontalOverflow) throw Error(`Horizontal overflow in ${name}`);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: resolve('results', name) });
  report.captures.push({ name, position, ...layout });
}

try {
  await page.goto(url);
  await expect(page.locator('.guide-page')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#demo-frame')).toHaveCount(0);
  await capture(`${prefix}-desktop.png`, 'top');
  const chapters = ['decision', 'encoding', 'engine', 'loading', 'evidence', 'validation'];
  for (const id of chapters) {
    await page.locator(`[data-chapter="${id}"]`).click();
    await expect(page.locator('#chapter-title')).not.toBeEmpty();
    await expect(page.locator('#node-title')).not.toBeEmpty();
    await expect(page.locator('#experiment .loading-note')).toHaveCount(0);
    await expect(page.locator('#experiment')).not.toContainText('示例读取失败');
    report.chapters.push({ id, title: await page.locator('#chapter-title').innerText(), nodes: await page.locator('[data-node]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-node'))) });
  }
  if (new Set(report.chapters.map(chapter => chapter.title)).size !== 6 || new Set(report.chapters.map(chapter => chapter.nodes.join(','))).size !== 6) throw Error('Chapters failed to change content/diagram');
  report.checks.sixDistinctChapters = true;

  const source = await page.evaluate(async () => {
    const [bundle, history] = await Promise.all(['cases/case-01.json', 'guide-validation.json'].map(async path => {
      const response = await fetch(new URL(path, location.href));
      if (!response.ok) throw Error(`Guide data failed: ${path}`);
      return response.json();
    }));
    return { bundle, history };
  });
  await page.locator('[data-chapter="encoding"]').click();
  for (const stage of source.bundle.demoStages) {
    await page.locator('#evidence-stage').selectOption(stage.id);
    await expect(page.locator('#input-count')).toHaveText(`${stage.evidenceIds.length} 条证据`);
    const state = await page.locator('#input-preview').innerText();
    const ids = [...state.matchAll(/^\[([^\]]+)\]/gm)].map(match => match[1]);
    if (JSON.stringify(ids) !== JSON.stringify(stage.evidenceIds)) throw Error(`Actual input does not match stage ${stage.id}`);
    report.evidenceStages.push({ id: stage.id, includedIds: ids, stateCharacters: state.length });
  }
  await expect(page.locator('#input-preview')).toContainText('configured MTU=1500B');
  report.checks.actualEvidenceStages = true;

  await page.locator('[data-chapter="evidence"]').click();
  for (const id of ['case-01-C', 'case-02', 'case-03']) {
    const history = source.history.cases.find(item => item.id === id);
    if (!history) throw Error(`Missing historical source case ${id}`);
    const expected = Object.entries(history.probabilities).sort((a, b) => b[1] - a[1]).map(([, probability]) => `${(probability * 100).toFixed(2)}%`);
    await page.locator('#history-case').selectOption(id);
    await expect(page.locator('#history-results')).toContainText('历史实测记录');
    await expect(page.locator('#history-results .prob-row b')).toHaveText(expected);
    await expect(page.locator('#rule-results')).not.toBeEmpty();
    const firstEvidence = page.locator('[data-evidence-id]').first();
    if (await firstEvidence.count()) {
      const evidenceId = await firstEvidence.getAttribute('data-evidence-id');
      await firstEvidence.click();
      const fact = JSON.parse(await page.locator('#fact-detail').innerText());
      if (fact.id !== evidenceId) throw Error(`Wrong fact shown for ${id}/${evidenceId}`);
    }
    report.historicalCases.push({ id, selected: history.selected, displayedPercentages: expected, candidateCount: expected.length, label: '历史实测记录' });
  }
  report.checks.historyMatchesPublishedSource = true;
  await page.locator('[data-chapter="engine"]').click();
  await expect(page.locator('#device-probe')).toBeVisible();
  await capture(`${prefix}-engine.png`, 'chapter');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(`${prefix}-mobile.png`, 'top');
  await capture(`${prefix}-engine-mobile.png`, 'chapter');
  for (const id of chapters) {
    await page.locator(`[data-chapter="${id}"]`).click();
    await expect(page.locator('#chapter-title')).toBeVisible();
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error(`Mobile overflow in ${id}`);
  }
  await expect(page.locator('#demo-frame')).toHaveCount(0);
  report.checks.mobileChaptersFit = true;
  report.checks.realDemoRemainsUnopened = true;
  if (report.externalRequests.length || report.blockedRequests.length || report.workers.length || report.errors.length || report.responseErrors.length) throw Error('Guide unexpectedly started runtime activity or emitted errors');
  report.checks.noExternalRequestsOrWorkers = true;
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = String(error); process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(`results/${prefix}-capture.json`, JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
}
