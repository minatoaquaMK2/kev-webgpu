import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { buildQuestionRequest } from '../../src/app/request';
import { parseEvidenceBundle } from '../../src/evidence';

const recorded = JSON.parse(readFileSync(new URL('../../public/query-example.json', import.meta.url), 'utf8'));

async function observeWithoutModel(page: Page) {
  const external: string[] = [], modelAssets: string[] = [], workers: string[] = [];
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    const remote = url.protocol !== 'data:' && url.origin !== 'http://127.0.0.1:4173';
    const model = /\.(?:onnx(?:_data)?|wasm|bin|data)(?:$|\/)/i.test(url.pathname) || /\/kev-0\.8b\//i.test(url.pathname);
    if (remote) external.push(url.origin + url.pathname);
    if (model) modelAssets.push(url.origin + url.pathname);
    // These UI tests must never download additional weights, even on regression.
    if (remote || model) await route.abort('blockedbyclient');
    else await route.continue();
  });
  page.on('worker', worker => workers.push(worker.url()));
  return { external, modelAssets, workers };
}

async function expectNoLivePrediction(page: Page) {
  await expect(page.locator('#freshness')).toHaveText('尚无预测');
  await expect(page.locator('#raw')).toHaveText('尚未运行推理。');
  await expect(page.locator('#prediction')).toContainText('等待一次真实查询');
  await expect(page.locator('#export')).toBeDisabled();
  await expect(page.locator('#next-check')).toBeDisabled();
  await expect(page.locator('#analyze')).toBeDisabled();
  await expect(page.locator('#live-cost')).toContainText('等待真实查询完成');
}

test('default historical story explains one query without starting the model', async ({ page }) => {
  const activity = await observeWithoutModel(page);
  await page.goto('/demo/');
  await expect(page.locator('#query-story')).toBeVisible();
  await expect(page.locator('#query-story')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#live-query')).toBeHidden();
  await expect(page.locator('.record-banner')).toContainText('真实历史回放');
  await expect(page.locator('.record-banner')).toContainText('回放不会触发新的推理');
  await expect(page.locator('#query-story .query-map a')).toHaveCount(4);
  await expect(page.locator('#example-observations .observation-summary')).toHaveCount(9);
  await expect(page.locator('#example-observations .observation-summary small')).toHaveText(recorded.selectedIDs);
  await expectNoLivePrediction(page);
  await page.waitForLoadState('networkidle');
  expect(activity).toEqual({ external: [], modelAssets: [], workers: [] });
});

test('historical request, probabilities and query costs match the saved real record', async ({ page }) => {
  const activity = await observeWithoutModel(page);
  await page.goto('/demo/');
  await expect(page.locator('#query-story')).toHaveAttribute('aria-busy', 'false');
  const request = JSON.parse(await page.locator('#example-request').textContent() || '{}');
  expect(request).toEqual(buildQuestionRequest(parseEvidenceBundle(recorded.inputSnapshot), recorded.selectedIDs));
  expect(Object.keys(request)).toEqual(['state', 'questions']);
  expect(Object.keys(request.questions)).toEqual(['probable_cause']);
  expect(request).not.toHaveProperty('expected');
  expect(request.state).not.toContain('post-hoc-evaluation-only');
  expect(request.state).not.toContain('case-01-C');
  const answer = recorded.response.answers.probable_cause;
  await expect(page.locator('#example-probabilities [data-option]')).toHaveCount(8);
  for (const [id, probability] of Object.entries(answer.probabilities) as [string, number][]) {
    const row = page.locator(`#example-probabilities [data-option="${id}"]`);
    await expect(row.locator('strong')).toHaveText(`${(probability * 100).toFixed(2)}%`);
    await expect(row.locator('progress')).toHaveJSProperty('value', probability);
  }
  await expect(page.locator('#example-probabilities .top')).toHaveAttribute('data-option', answer.choice);
  const response = JSON.parse(await page.locator('#example-response').textContent() || '{}');
  expect(response.response).toEqual(recorded.response);
  expect(response.gpuProof).toEqual(recorded.gpuProof);
  await expect(page.locator('#example-source')).toContainText(recorded.sourceCommit.slice(0, 7));
  await expect(page.locator('#example-source')).toContainText(recorded.timestamp);
  await expect(page.locator('#example-cost .cost-scope')).toContainText('历史实测');
  await expect(page.locator('#example-cost .cost-scope')).toContainText('不是你刚提交的新结果');
  await expect(page.locator('#example-cost .cost-metric strong')).toHaveText([
    `${(recorded.wallMs / 1000).toFixed(3)} 秒`, `${recorded.usage.totalTokens.toLocaleString('en-US')} tokens`, '0 次', '未测量',
  ]);
  const incremental = recorded.usage.branchTokens[0] - recorded.usage.stateTokens;
  await expect(page.locator('#example-cost .token-equation')).toContainText(`${recorded.usage.stateTokens} + 问题与候选 ${incremental} = ${recorded.usage.totalTokens} tokens`);
  await expect(page.locator('#example-cost')).toContainText('不能把总成本写成 0 元');
  await expect(page.locator('#example-cost .setup-cost')).toContainText('首次准备 ≠ 每次查询');
  await expect(page.locator('#example-cost .setup-cost')).toContainText('826,680,926');
  await expect(page.locator('#story-outcome')).toContainText('模型选错了');
  await expect(page.locator('#story-outcome')).toContainText('没有额外运行');
  await expectNoLivePrediction(page);
  expect(activity).toEqual({ external: [], modelAssets: [], workers: [] });
});

test('editing live evidence cannot turn historical output or cost into a new prediction', async ({ page }) => {
  const activity = await observeWithoutModel(page);
  await page.goto('/demo/');
  await expect(page.locator('#query-story')).toHaveAttribute('aria-busy', 'false');
  const historicalRequest = await page.locator('#example-request').textContent();
  const historicalOutput = await page.locator('#example-response').textContent();
  const historicalCost = await page.locator('#example-cost').textContent();
  await page.locator('#story-try-live').click();
  await expect(page.locator('#live-query')).toBeVisible();
  await expect(page.locator('#query-story')).toBeHidden();
  await expect(page.locator('#evidence-list article')).toHaveCount(3);
  await page.locator('#stages button').nth(2).click();
  await expect(page.locator('#evidence-list article')).toHaveCount(9);
  const edited = JSON.parse(await page.locator('#json-editor').inputValue());
  const marker = 'Edited input is not the historical query.';
  edited.incident.symptom += ` ${marker}`;
  await page.locator('details:has(#json-editor) > summary').click();
  await page.locator('#json-editor').fill(JSON.stringify(edited));
  await expectNoLivePrediction(page);
  await page.locator('#apply-json').click();
  await expect(page.locator('#state-preview')).toContainText(marker);
  await page.getByRole('checkbox', { name: 'Include ev-09', exact: true }).uncheck();
  await expect(page.locator('#state-preview')).not.toContainText('[ev-09]');
  await expectNoLivePrediction(page);
  await page.locator('#mode-story').click();
  await expect(page.locator('#query-story')).toBeVisible();
  expect(await page.locator('#example-request').textContent()).toBe(historicalRequest);
  expect(await page.locator('#example-response').textContent()).toBe(historicalOutput);
  expect(await page.locator('#example-cost').textContent()).toBe(historicalCost);
  await expect(page.locator('#example-request')).not.toContainText(marker);
  await expect(page.locator('.record-banner')).toContainText('真实历史回放');
  await page.locator('#mode-live').click();
  await expect(page.locator('#state-preview')).toContainText(marker);
  await expectNoLivePrediction(page);
  expect(activity).toEqual({ external: [], modelAssets: [], workers: [] });
});

test('live staged inputs render untrusted evidence as text without automatic downloads', async ({ page }) => {
  const activity = await observeWithoutModel(page);
  await page.goto('/demo/');
  await page.locator('#mode-live').click();
  await expect(page.locator('#evidence-list article')).toHaveCount(3);
  await page.locator('#stages button').nth(2).click();
  await expect(page.locator('#evidence-list article')).toHaveCount(9);
  const bundle = JSON.parse(await page.locator('#json-editor').inputValue());
  bundle.evidence[0].excerpt = '<img src=x onerror="alert(1)">';
  await page.locator('details:has(#json-editor) > summary').click();
  await page.locator('#json-editor').fill(JSON.stringify(bundle));
  await page.locator('#apply-json').click();
  await expect(page.locator('#evidence-list img')).toHaveCount(0);
  await expect(page.locator('#evidence-list')).toContainText('<img src=x');
  await expectNoLivePrediction(page);
  expect(activity).toEqual({ external: [], modelAssets: [], workers: [] });
});

test('historical story, cost and live input fit a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/demo/');
  await expect(page.locator('#query-story')).toHaveAttribute('aria-busy', 'false');
  for (const id of ['story-input', 'story-model', 'story-output', 'story-outcome', 'story-cost']) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), id).toBe(true);
  }
  await page.locator('#mode-live').click();
  await expect(page.locator('#case')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
