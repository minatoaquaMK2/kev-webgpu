/** Visual QA for the teaching page; model/runtime requests are blocked. */
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const url = process.env.KEV_LOCAL_URL || 'http://127.0.0.1:5173/decision-models/';
const target = new URL(url);
const isPublished = target.href === 'https://minatoaquamk2.github.io/kev-webgpu/decision-models/';
if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) && !isPublished) throw Error('Only loopback or the exact published teaching page is supported');
const prefix = process.env.KEV_CAPTURE_PREFIX || (isPublished ? 'pages-decision' : 'local-decision');
if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(prefix)) throw Error('Invalid filename prefix');
const browser = await chromium.launch({ channel: 'chrome', headless: true, chromiumSandbox: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, serviceWorkers: 'block' });
const page = await context.newPage();
const report = { url, browser: browser.version(), startedAt: new Date().toISOString(), scope: 'Teaching-page visual QA, no model inference', captures: [], chapters: [], blocked: [], errors: [], workers: [], checks: {} };
await context.route('**/*', async route => {
  const asset = new URL(route.request().url());
  if (asset.protocol !== 'data:' && (asset.origin !== target.origin || /\.(onnx(?:_data)?|wasm|bin|data)$/i.test(asset.pathname))) {
    report.blocked.push(asset.origin + asset.pathname); await route.abort();
  } else await route.continue();
});
page.on('pageerror', error => report.errors.push(String(error)));
page.on('response', response => { if (response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`); });
page.on('worker', worker => report.workers.push(worker.url()));
await mkdir('results', { recursive: true });
async function capture(name, selector) {
  if (selector) await page.locator(selector).scrollIntoViewIfNeeded();
  else await page.evaluate(() => scrollTo(0, 0));
  await page.mouse.move(0, 0);
  const size = await page.evaluate(() => ({ width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth }));
  if (size.overflow) throw Error(`Page overflow: ${name}`);
  const path = resolve('results', `${prefix}-${name}.png`);
  await page.screenshot({ path });
  report.captures.push({ name, ...size });
}
try {
  await page.goto(url);
  await expect(page.locator('.dm-page')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await capture('desktop');
  for (const chapter of ['contract', 'family', 'scoring', 'execution', 'review']) {
    await page.locator(`[data-lesson="${chapter}"]`).click();
    await expect(page.locator(`[data-lesson="${chapter}"]`)).toHaveAttribute('aria-current', 'step');
    await expect(page.locator('#dm-chapter-title')).not.toBeEmpty();
    if (chapter === 'review') await expect(page.locator('#retained-count')).toHaveText('21 / 34');
    const svg = await page.locator('.dm-diagram').evaluate(svg => {
      const bounds = svg.viewBox.baseVal;
      const outside = [...svg.querySelectorAll('text')].filter(text => {
        const rect = text.getBBox();
        return rect.x < 0 || rect.y < 0 || rect.x + rect.width > bounds.width || rect.y + rect.height > bounds.height;
      }).map(text => text.textContent);
      return { title: svg.querySelector('title').textContent, outside, nodes: [...svg.querySelectorAll('[data-scene-node]')].map(node => node.dataset.sceneNode) };
    });
    if (svg.outside.length) throw Error(`SVG labels outside viewBox: ${chapter}`);
    report.chapters.push({ id: chapter, ...svg });
    await capture(chapter, '#dm-lesson');
    if (['scoring', 'review'].includes(chapter)) await capture(`${chapter}-lab`, '#dm-lab');
  }
  for (const width of [1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    for (const chapter of ['contract', 'family', 'scoring', 'execution', 'review']) {
      await page.locator(`[data-lesson="${chapter}"]`).click();
    await expect(page.locator(`[data-lesson="${chapter}"]`)).toHaveAttribute('aria-current', 'step');
      if (chapter === 'review') await expect(page.locator('#retained-count')).toHaveText('21 / 34');
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error(`Overflow: ${width}/${chapter}`);
    }
    await capture(`review-${width}`, '#dm-lab');
    if (width === 390) { await capture('mobile'); await page.locator('[data-lesson="scoring"]').click(); await expect(page.locator('[data-lesson="scoring"]')).toHaveAttribute('aria-current', 'step'); await capture('scoring-mobile', '#dm-lab'); }
  }
  if (report.blocked.length || report.errors.length || report.workers.length) throw Error('Unexpected request, worker or page error');
  if (new Set(report.chapters.map(c => c.title)).size !== 5) throw Error('Chapters did not change all five diagrams');
  report.checks = { fiveDistinctDiagrams: new Set(report.chapters.map(c => c.title)).size === 5, responsiveWidths: [1440,1024,768,390,320], noModelOrExternalRequests: true, noWorkers: true, thresholdDefaultMatchesHistory: true };
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = String(error); process.exitCode = 1; }
finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(`results/${prefix}-capture.json`, JSON.stringify(report, null, 2) + '\n');
  await browser.close(); console.log(JSON.stringify(report, null, 2));
}
