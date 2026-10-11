/** Capture the educational guide without loading the real model or a shared browser profile. */
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const url = process.env.KEV_LOCAL_URL || 'http://127.0.0.1:5173/';
const target = new URL(url);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)) throw Error('Only loopback screenshots are supported');
const browser = await chromium.launch({ channel: 'chrome', headless: true, chromiumSandbox: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const report = {
  startedAt: new Date().toISOString(), url, browser: browser.version(),
  scope: 'Educational guide screenshots; no live inference or model loading',
  captures: [], externalRequests: [], workers: [], errors: [],
};
page.on('request', request => {
  const requested = new URL(request.url());
  if (requested.protocol !== 'data:' && requested.origin !== target.origin) report.externalRequests.push(requested.origin + requested.pathname);
});
page.on('worker', worker => report.workers.push(worker.url()));
page.on('pageerror', error => report.errors.push(String(error)));
await mkdir('results', { recursive: true });

async function capture(name, position) {
  await page.evaluate(position => {
    if (position === 'chapter') document.querySelector('#learn').scrollIntoView({ behavior: 'instant', block: 'start' });
    else window.scrollTo({ top: 0, behavior: 'instant' });
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, position);
  const layout = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollY, horizontalOverflow: document.documentElement.scrollWidth > innerWidth }));
  if (layout.horizontalOverflow) throw Error(`Horizontal overflow in ${name}`);
  await page.screenshot({ path: resolve('results', name) });
  report.captures.push({ name, position, ...layout });
}

try {
  await page.goto(url);
  await expect(page.locator('.guide-page')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await capture('local-guide-desktop.png', 'top');
  await page.locator('[data-chapter="engine"]').click();
  await expect(page.locator('#device-probe')).toBeVisible();
  await capture('local-guide-engine.png', 'chapter');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture('local-guide-mobile.png', 'top');
  await capture('local-guide-engine-mobile.png', 'chapter');
  if (report.externalRequests.length || report.workers.length || report.errors.length) throw Error('Guide unexpectedly started runtime activity or emitted errors');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = String(error); process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile('results/local-guide-capture.json', JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
}
