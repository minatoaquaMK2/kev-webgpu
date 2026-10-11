import { expect, test, type Page } from '@playwright/test';

const chapters = ['decision', 'encoding', 'engine', 'loading', 'evidence', 'validation'] as const;

function observeLazyRuntime(page: Page) {
  const external: string[] = [];
  const workers: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.protocol !== 'data:' && url.origin !== 'http://127.0.0.1:4173') external.push(request.url());
  });
  page.on('worker', worker => workers.push(worker.url()));
  return { external, workers };
}

test('guide chapters change the diagram and explanation without starting the model', async ({ page }) => {
  const activity = observeLazyRuntime(page);
  await page.goto('/');
  await expect(page.locator('.guide-page')).toBeVisible();
  await expect(page.locator('#demo-frame')).toHaveCount(0);
  const chapterTitles: string[] = [], nodeSets: string[] = [];
  for (const chapter of chapters) {
    await page.locator(`[data-chapter="${chapter}"]`).click();
    await expect(page.locator('#chapter-title')).not.toBeEmpty();
    await expect(page.locator('#node-title')).not.toBeEmpty();
    await expect(page.locator('#experiment')).toBeVisible();
    chapterTitles.push(await page.locator('#chapter-title').innerText());
    nodeSets.push(await page.locator('[data-node]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-node')).join(',')));
  }
  expect(new Set(chapterTitles).size).toBe(chapters.length);
  expect(new Set(nodeSets).size).toBe(chapters.length);
  expect(nodeSets.every(nodes => nodes.length > 0)).toBe(true);
  await page.waitForLoadState('networkidle');
  expect(activity.external).toEqual([]);
  expect(activity.workers).toEqual([]);
});

test('evidence stages show the actual selected input and historical results stay labeled', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-chapter="encoding"]').click();
  await page.locator('#evidence-stage').selectOption('A');
  await expect(page.locator('#input-count')).toContainText('3');
  await expect(page.locator('#input-preview')).toContainText('[ev-01]');
  await expect(page.locator('#input-preview')).toContainText('[ev-03]');
  await expect(page.locator('#input-preview')).not.toContainText('[ev-09]');
  const stageA = await page.locator('#input-preview').innerText();
  await page.locator('#evidence-stage').selectOption('C');
  await expect(page.locator('#input-count')).toContainText('9');
  await expect(page.locator('#input-preview')).toContainText('[ev-09]');
  await expect(page.locator('#input-preview')).toContainText('configured MTU=1500B');
  expect(await page.locator('#input-preview').innerText()).not.toBe(stageA);
  await page.locator('[data-chapter="evidence"]').click();
  const histories: string[] = [];
  for (const caseId of ['case-01-C', 'case-02', 'case-03']) {
    await page.locator('#history-case').selectOption(caseId);
    await expect(page.locator('#history-results')).toContainText('历史实测记录');
    if (histories.length) await expect(page.locator('#history-results')).not.toHaveText(histories.at(-1)!);
    await expect(page.locator('#history-results .prob-row')).toHaveCount(8);
    await expect(page.locator('#rule-results')).not.toBeEmpty();
    histories.push(await page.locator('#history-results').innerText());
  }
  expect(new Set(histories).size).toBe(3);
});

test('cache controls are an explicit conceptual demonstration', async ({ page }) => {
  const activity = observeLazyRuntime(page);
  await page.goto('/');
  await page.locator('[data-chapter="loading"]').click();
  await expect(page.locator('#experiment')).toContainText('概念演示');
  const explanations: string[] = [];
  for (const mode of ['first', 'cached', 'offline']) {
    await page.locator(`[data-cache-mode="${mode}"]`).click();
    await expect(page.locator('#cache-explanation')).not.toBeEmpty();
    explanations.push(await page.locator('#cache-explanation').innerText());
  }
  expect(new Set(explanations).size).toBe(3);
  expect(activity.external).toEqual([]);
  expect(activity.workers).toEqual([]);
});

test('real demo is mounted only after the explicit open action', async ({ page }) => {
  const activity = observeLazyRuntime(page);
  await page.goto('/');
  await expect(page.locator('#demo-frame')).toHaveCount(0);
  await page.locator('#open-demo').click();
  const frame = page.locator('#demo-frame');
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute('src', /(?:^|\/)demo\/$/);
  await expect(page.frameLocator('#demo-frame').locator('#query-story')).toBeVisible();
  await page.frameLocator('#demo-frame').locator('#mode-live').click();
  await expect(page.frameLocator('#demo-frame').locator('#stages button')).toHaveCount(3);
  await expect(page.frameLocator('#demo-frame').locator('#analyze')).toBeDisabled();
  expect(activity.external).toEqual([]);
  expect(activity.workers).toEqual([]);
});

test('chapter and diagram controls work from the keyboard', async ({ page }) => {
  await page.goto('/');
  const originalTitle = await page.locator('#chapter-title').innerText();
  const chapter = page.locator('[data-chapter="engine"]');
  await chapter.focus();
  await expect(chapter).toBeFocused();
  await chapter.press('Enter');
  await expect(page.locator('#chapter-title')).not.toHaveText(originalTitle);
  const originalNode = await page.locator('#node-title').innerText();
  const node = page.locator('[data-node]').last();
  await node.focus();
  await expect(node).toBeFocused();
  await node.press('Enter');
  await expect(page.locator('#node-title')).not.toHaveText(originalNode);
});

test('device probe reports capability without loading weights or creating a Worker', async ({ page }) => {
  const activity = observeLazyRuntime(page);
  await page.goto('/');
  await page.locator('[data-chapter="engine"]').click();
  const before = await page.locator('#device-result').innerText();
  await page.locator('#device-probe').click();
  await expect(page.locator('#device-probe')).toBeEnabled();
  await expect(page.locator('#device-result')).not.toHaveText(before);
  await expect(page.locator('#device-result')).not.toBeEmpty();
  expect(activity.external).toEqual([]);
  expect(activity.workers).toEqual([]);
});

test('guide remains within a mobile viewport in every chapter', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  for (const chapter of chapters) {
    await page.locator(`[data-chapter="${chapter}"]`).click();
    await expect(page.locator('#chapter-title')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), chapter).toBe(true);
  }
});
