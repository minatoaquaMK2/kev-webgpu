/** Viewport screenshots avoid Chrome's observed full-page tiling artifact. */
import { chromium, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const context = await chromium.launchPersistentContext(resolve('.local-browser-profile'), {
  channel: 'chrome', headless: true, chromiumSandbox: true, viewport: { width: 1440, height: 1100 },
});
const page = context.pages()[0] || await context.newPage();
const report = { startedAt: new Date().toISOString(), scope: 'local dev server screenshots; actual q8 output', fullPageCaptureIssue: 'Chrome long screenshot repeated viewport tiles; replaced with actual viewport captures', captures: [] };
async function capture(name, position = 'top') {
  await page.evaluate(position => {
    if (position === 'assessment') document.querySelector('.results-panel').scrollIntoView({ block: 'start', behavior: 'instant' });
    else window.scrollTo({ top: 0, behavior: 'instant' });
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, position);
  const layout = await page.evaluate(() => ({ h1Count: document.querySelectorAll('h1').length, overflow: document.documentElement.scrollWidth > innerWidth, width: innerWidth, height: innerHeight, scrollY }));
  if (layout.h1Count !== 1 || layout.overflow || (position === 'top' && layout.scrollY !== 0)) throw Error('Unexpected DOM duplication, overflow or scroll position');
  await page.screenshot({ path: resolve(`results/${name}`) });
  report.captures.push({ name, position, ...layout });
}
try {
  await page.goto('http://127.0.0.1:5173/demo/');
  await page.locator('#stages button').nth(2).click();
  await page.locator('#load').click();
  await expect(page.locator('#analyze')).toBeEnabled({ timeout: 240000 });
  await page.locator('#analyze').click();
  await expect(page.locator('#analyze')).toBeEnabled({ timeout: 120000 });
  report.prediction = JSON.parse(await page.locator('#raw').textContent());
  if (!report.prediction.gpuProof.commands.dispatches) throw Error('Real GPU execution absent');
  await capture('local-ui-desktop.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture('local-ui-mobile.png');
  await capture('local-ui-mobile-assessment.png', 'assessment');
  await page.setViewportSize({ width: 1440, height: 1100 });
  await context.setOffline(true);
  const editor = page.locator('#json-editor');
  const value = JSON.parse(await editor.inputValue());
  value.incident.symptom += ' Synthetic offline screenshot verification.';
  await page.getByText('Edit evidence JSON', { exact: true }).click();
  await editor.fill(JSON.stringify(value));
  await page.locator('#apply-json').click();
  await page.locator('#analyze').click();
  await expect(page.locator('#analyze')).toBeEnabled({ timeout: 120000 });
  report.offlinePrediction = JSON.parse(await page.locator('#raw').textContent());
  await capture('local-ui-offline.png');
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = String(error); process.exitCode = 1; }
finally {
  await page.locator('#unload').click().catch(() => {});
  report.finishedAt = new Date().toISOString();
  await writeFile('results/local-screenshot-qa.json', JSON.stringify(report, null, 2) + '\n');
  await context.close();
  console.log(JSON.stringify({ status: report.status, captures: report.captures, error: report.error }, null, 2));
}
