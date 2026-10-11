/** Real local smoke test of the production repository-subpath artifact. */
import { chromium, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const base = process.env.KEV_LOCAL_URL || 'http://127.0.0.1:5173/kev-webgpu/';
const demo = `${base.replace(/\/$/, '')}/demo/`;
const target = new URL(base);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || target.pathname === '/') throw Error('A loopback repository subpath is required');
const context = await chromium.launchPersistentContext(resolve('.local-browser-profile'), {
  channel: 'chrome', headless: true, chromiumSandbox: true, viewport: { width: 1440, height: 1100 },
});
const page = context.pages()[0] || await context.newPage();
const report = { startedAt: new Date().toISOString(), url: base, demoUrl: demo, scope: 'local production subpath, not a published Pages origin', requests: [], responseErrors: [], pageErrors: [] };
context.on('request', request => { const u = new URL(request.url()); report.requests.push({ origin: u.origin, path: u.pathname }); });
context.on('response', response => { if (response.status() >= 400) report.responseErrors.push({ url: response.url(), status: response.status() }); });
page.on('pageerror', error => report.pageErrors.push(String(error)));
try {
  await page.goto(demo);
  await expect(page.locator('#stages button')).toHaveCount(3);
  report.noAutomaticModelDownload = report.requests.every(r => r.origin === target.origin);
  await page.locator('#stages button').nth(2).click();
  // The production Load action probes capability before fetching model files.
  await page.locator('#load').click();
  await expect(page.locator('#analyze')).toBeEnabled({ timeout: 240000 });
  await page.locator('#analyze').click();
  await expect(page.locator('#analyze')).toBeEnabled({ timeout: 120000 });
  report.prediction = JSON.parse(await page.locator('#raw').textContent());
  if (!report.prediction.gpuProof.gpuTensorOutputs || !report.prediction.gpuProof.commands?.dispatches) throw Error('Real GPU execution absent');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: resolve('results/kev-rca-local-desktop.png') });
  await page.screenshot({ path: resolve('results/local-ui-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve('results/local-ui-mobile.png') });
  report.horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  report.subpathAssets = report.requests.filter(r => r.origin === target.origin && r.path.includes('/assets/'));
  report.wasmLoadedFromSubpath = report.subpathAssets.some(r => r.path.endsWith('.wasm') && r.path.startsWith(target.pathname));
  if (!report.wasmLoadedFromSubpath || report.horizontalOverflow || report.pageErrors.length || report.responseErrors.length) throw Error('Production browser acceptance failed');
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = String(error); process.exitCode = 1; }
finally {
  await page.locator('#unload').click().catch(() => {});
  report.finishedAt = new Date().toISOString();
  await writeFile('results/local-production-subpath.json', JSON.stringify(report, null, 2) + '\n');
  await context.close();
  console.log(JSON.stringify({ status: report.status, error: report.error, wasmLoadedFromSubpath: report.wasmLoadedFromSubpath, horizontalOverflow: report.horizontalOverflow }, null, 2));
}
