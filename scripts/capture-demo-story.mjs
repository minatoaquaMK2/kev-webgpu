/** UI-only screenshots of the saved query story. No live model or shared profile. */
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const url = process.env.KEV_LOCAL_URL || 'http://127.0.0.1:5173/demo/';
const target = new URL(url);
const published = target.href === 'https://minatoaquamk2.github.io/kev-webgpu/demo/';
if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) && !published) throw Error('Only loopback or the exact published demo URL is allowed');
const prefix = process.env.KEV_CAPTURE_PREFIX || (published ? 'pages-demo-query' : 'demo-query');
if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(prefix)) throw Error('Invalid output prefix');
const browser = await chromium.launch({ channel: 'chrome', headless: true, chromiumSandbox: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
const page = await context.newPage();
const report = { startedAt: new Date().toISOString(), url, browser: browser.version(), scope: 'Saved historical query UI; no live model validation', captures: [], blockedRequests: [], workers: [], errors: [], responseErrors: [] };
await context.route('**/*', async route => {
  const requested = new URL(route.request().url());
  const external = requested.protocol !== 'data:' && requested.origin !== target.origin;
  const model = /\.(?:onnx(?:_data)?|wasm|bin|data)(?:$|\/)/i.test(requested.pathname) || /\/kev-0\.8b\//i.test(requested.pathname);
  if (external || model) { report.blockedRequests.push(requested.origin + requested.pathname); await route.abort('blockedbyclient'); }
  else await route.continue();
});
page.on('worker', worker => report.workers.push(worker.url()));
page.on('pageerror', error => report.errors.push(String(error)));
page.on('response', response => { if (response.status() >= 400) report.responseErrors.push({ url: response.url(), status: response.status() }); });
await mkdir('results', { recursive: true });

async function capture(suffix, selector) {
  await page.evaluate(selector => {
    if (selector) document.querySelector(selector).scrollIntoView({ block: 'start', behavior: 'instant' });
    else window.scrollTo({ top: 0, behavior: 'instant' });
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, selector);
  await page.mouse.move(0, 0);
  const layout = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollY, horizontalOverflow: document.documentElement.scrollWidth > innerWidth }));
  if (layout.horizontalOverflow) throw Error(`Horizontal overflow in ${suffix}`);
  const name = `${prefix}-${suffix}.png`;
  await page.screenshot({ path: resolve('results', name) });
  report.captures.push({ name, selector, ...layout });
}
try {
  await page.goto(url);
  await expect(page.locator('#query-story')).toBeVisible();
  await expect(page.locator('#query-story')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#example-probabilities [data-option]')).toHaveCount(8);
  await capture('desktop', null);
  await capture('output', '#story-output');
  await capture('cost', '#story-cost');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture('mobile', null);
  await capture('cost-mobile', '#story-cost');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('#mode-live').click();
  await expect(page.locator('#live-query')).toBeVisible();
  await expect(page.locator('#analyze')).toBeDisabled();
  await capture('live', '#runtime-controls');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture('live-mobile', '#runtime-controls');
  if (report.blockedRequests.length || report.workers.length || report.errors.length || report.responseErrors.length) throw Error('Unexpected runtime/network activity or errors');
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = String(error); process.exitCode = 1; }
finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(`results/${prefix}-capture.json`, JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
}
