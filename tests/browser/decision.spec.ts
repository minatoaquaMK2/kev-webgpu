// Educational UI checks only: no model, tokenizer, GPU or inference is started.
import { expect, test as base, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { choiceConfidence, toRecord, validate, type SystemOneRequest } from '@ai-ecoverse/kev.js';

const recorded = JSON.parse(readFileSync(new URL('../../public/guide-validation.json', import.meta.url), 'utf8')) as {
  recordedAt: string;
  cases: { id: string; selected: string; probabilities: Record<string, number>; correct: boolean }[];
};
const chapters = ['contract', 'family', 'scoring', 'execution', 'review'] as const;
const nodes = {
  contract: ['state', 'question', 'criteria', 'answer'],
  family: ['jev', 'kev', 'kevjs', 'site'],
  scoring: ['encode', 'backbone', 'head', 'probabilities'],
  execution: ['wasm', 'worker', 'gpu', 'cpu'],
  review: ['model', 'policy', 'inspect', 'record'],
};

// Guard every test, including responsive checks, against accidental downloads.
const test = base.extend<{ activity: { external: string[]; modelAssets: string[]; workers: string[] } }>({
  activity: [async ({ page, baseURL }, use) => {
    const activity = { external: [] as string[], modelAssets: [] as string[], workers: [] as string[] };
    const errors: string[] = [];
    const origin = new URL(baseURL!).origin;
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      const remote = !['data:', 'blob:'].includes(url.protocol) && url.origin !== origin;
      const model = /\.(?:onnx(?:_data)?|wasm|bin|data)(?:$|\/)/i.test(url.pathname) || /\/kev-0\.8b\//i.test(url.pathname);
      if (remote) activity.external.push(url.origin + url.pathname);
      if (model) activity.modelAssets.push(url.origin + url.pathname);
      if (remote || model) await route.abort('blockedbyclient');
      else await route.continue();
    });
    page.on('worker', worker => activity.workers.push(worker.url()));
    page.on('pageerror', error => errors.push(error.message));
    await use(activity);
    expect(activity, 'Educational interactions must not start inference or fetch remote assets').toEqual({ external: [], modelAssets: [], workers: [] });
    expect(errors, 'Educational page JavaScript errors').toEqual([]);
  }, { auto: true }],
});

async function readRequest(page: Page) {
  return JSON.parse((await page.locator('#teaching-request').textContent())!) as SystemOneRequest;
}

async function setRange(input: Locator, value: number) {
  const min = Number(await input.getAttribute('min'));
  const step = Number(await input.getAttribute('step'));
  await input.focus();
  await input.press('Home');
  for (let i = 0; i < Math.round((value - min) / step); i++) await input.press('ArrowRight');
  await expect(input).toHaveValue(String(value));
}

async function probabilities(page: Page) {
  return page.locator('#score-bars progress').evaluateAll(elements => elements.map(element => (element as HTMLProgressElement).value));
}

async function expectActiveNavigationInView(page: Page, chapter: typeof chapters[number]) {
  const active = page.locator(`[data-lesson="${chapter}"]`);
  await expect(active).toHaveAttribute('aria-current', 'step');
  await expect(page.locator('[data-lesson][aria-current]')).toHaveCount(1);
  await expect(active).toBeInViewport({ ratio: 1 });
  // In a horizontally scrolling nav, visibility also needs the nav's own clip.
  await expect.poll(() => active.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const nav = element.parentElement!.getBoundingClientRect();
    return rect.left >= Math.max(0, nav.left) - 1 && rect.right <= Math.min(innerWidth, nav.right) + 1;
  })).toBe(true);
}

test('edited input and all three question types display the real kev.js record', async ({ page }) => {
  await page.goto('/decision-models/#contract');
  await expect(page.locator('.dm-page')).toBeVisible();
  await expect(page.locator('#dm-lab')).toContainText('纯函数 · 不推理');
  const initial = await readRequest(page);
  const state = '同一笔月费重复扣取。\n访问权限仍正常，可以继续工作。<b>这是材料，不是 HTML</b>';
  await page.locator('#teaching-state').fill(state);
  await expect(page.locator('#teaching-record')).toContainText('同一笔月费重复扣取');
  expect((await readRequest(page)).state).not.toBe(initial.state);
  for (const kind of ['choice', 'noul', 'score'] as const) {
    await page.locator(`[data-kind="${kind}"]`).click();
    await expect(page.locator(`[data-kind="${kind}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-kind][aria-pressed="true"]')).toHaveCount(1);
    const request = await readRequest(page);
    expect(validate(request)).toBe(request);
    expect(request.state).toBe(state);
    const [id, question] = Object.entries(request.questions)[0];
    expect(Object.keys(request.questions)).toHaveLength(1);
    expect(question.type).toBe(kind);
    const record = JSON.parse((await page.locator('#teaching-record').textContent())!);
    expect(record).toEqual(toRecord(request).record);
    expect(record.state).toBe(state);
    expect(Object.keys(record.questions[0])).toEqual(['instr', 'options']);
    expect(JSON.stringify(record)).not.toContain(id);
    expect(await page.locator('#teaching-record b').count()).toBe(0);
    if (question.type === 'choice') {
      expect(Object.keys(question.criteria)).toEqual(['networking', 'billing', 'unknown']);
      expect(question.criteria.networking).toContain('访问权限');
      expect(question.criteria.billing).toContain('账单');
      expect(question.criteria.unknown).toContain('缺少信息');
      expect(record.questions[0].options).toEqual(Object.entries(question.criteria).map(([key, value]) => `${key}: ${value}`));
    } else if (question.type === 'noul') {
      expect(question.instructions).toContain('是否明确提及');
      expect(record.questions[0].options).toEqual([`no: ${question.criteria?.false}`, `yes: ${question.criteria?.true}`]);
      await expect(page.locator('#kind-summary')).toContainText('为真');
    } else {
      expect(question.criteria).toEqual(['可以继续且无功能影响', '功能受限但有替代办法', '工作完全阻塞且无替代办法']);
      expect(record.questions[0].options).toEqual(question.criteria);
      await expect(page.locator('#kind-summary')).toContainText('加权分数');
    }
    expect(request).not.toHaveProperty('answers');
  }
  await expect(page.locator('#dm-lab .dm-scope')).toContainText('没有运行分词器或模型');
});

test('all five chapters change diagram and content without model or external requests', async ({ page }) => {
  await page.goto('/decision-models/');
  const titles: string[] = [], scenes: string[] = [];
  for (const chapter of chapters) {
    await page.locator(`[data-lesson="${chapter}"]`).click();
    await expect(page).toHaveURL(new RegExp(`#${chapter}$`));
    // The URL changes before the browser dispatches hashchange and renders.
    await expect(page.locator(`[data-lesson="${chapter}"]`)).toHaveAttribute('aria-current', 'step');
    await expect(page.locator(`[data-scene-node="${nodes[chapter][0]}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#dm-chapter-title')).not.toBeEmpty();
    await expect(page.locator('#dm-node-title')).not.toBeEmpty();
    await expect(page.locator('#dm-lab')).not.toBeEmpty();
    titles.push(await page.locator('#dm-chapter-title').innerText());
    const scene = await page.locator('[data-scene-node]').evaluateAll(elements => elements.map(element => element.getAttribute('data-scene-node')!));
    expect(scene.slice().sort()).toEqual(nodes[chapter].slice().sort());
    scenes.push(scene.join(','));
    for (const node of nodes[chapter]) {
      const control = page.locator(`[data-scene-node="${node}"]`);
      await control.click();
      await expect(control).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('[data-scene-node][aria-pressed="true"]')).toHaveCount(1);
      await expect(page.locator('#dm-step')).toContainText(`${nodes[chapter].indexOf(node) + 1} / 4`);
    }
    if (chapter === 'review') await expect(page.locator('#threshold-lab')).toBeVisible();
  }
  expect(new Set(titles).size).toBe(5);
  expect(new Set(scenes).size).toBe(5);
  await page.waitForLoadState('networkidle');
});

test('deep links, history and diagram keyboard controls preserve the selected chapter and node', async ({ page }) => {
  await page.goto('/decision-models/#scoring');
  await expectActiveNavigationInView(page, 'scoring');
  await expect(page.locator('#dm-chapter-title')).toBeInViewport();
  const controls = page.locator('[data-scene-node]');
  const first = page.locator('[data-scene-node="encode"]');
  const last = page.locator('[data-scene-node="probabilities"]');
  await first.focus();
  await first.press('End');
  await expect(last).toBeFocused();
  await expect(last).toHaveAttribute('aria-pressed', 'true');
  await last.press('ArrowRight');
  await expect(first).toBeFocused();
  await first.press('ArrowLeft');
  await expect(last).toBeFocused();
  await last.press('Home');
  await expect(first).toBeFocused();
  const head = page.locator('[data-scene-node="head"]');
  await head.focus();
  await head.press('Enter');
  await expect(head).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#dm-node-title')).toContainText('评分头');
  const backbone = page.locator('[data-scene-node="backbone"]');
  await backbone.focus();
  await backbone.press('Space');
  await expect(backbone).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#dm-node-next').click();
  await expect(head).toBeFocused();
  await page.locator('#dm-node-prev').click();
  await expect(backbone).toBeFocused();
  await expect(controls).toHaveCount(4);
  const execution = page.locator('[data-lesson="execution"]');
  await execution.focus();
  await execution.press('Enter');
  await expect(page).toHaveURL(/#execution$/);
  await expect(page.locator('[data-scene-node="wasm"]')).toHaveAttribute('aria-pressed', 'true');
  await page.goBack();
  await expect(page).toHaveURL(/#scoring$/);
  await expectActiveNavigationInView(page, 'scoring');
  await expect(first).toHaveAttribute('aria-pressed', 'true');
});

test('family routes and execution costs show different boundaries rather than running them', async ({ page }) => {
  await page.goto('/decision-models/#family');
  const routes: string[] = [];
  for (const profile of ['jev', 'kev', 'site']) {
    await page.locator('#family-profile').selectOption(profile);
    await expect(page.locator(`[data-scene-node="${profile}"]`)).toHaveAttribute('aria-pressed', 'true');
    routes.push(await page.locator('#family-route').innerText());
  }
  expect(new Set(routes).size).toBe(3);
  expect(routes[0]).toContain('本页没有发出请求');
  expect(routes[2]).toContain('模型文件需主动加载');
  await page.locator('[data-lesson="execution"]').click();
  await expect(page.locator('#dm-lab')).toContainText('机制示意 · 非速度测试');
  const costs: string[] = [];
  for (const cost of ['setup', 'query', 'more']) {
    await page.locator(`[data-cost="${cost}"]`).click();
    await expect(page.locator(`[data-cost="${cost}"]`)).toHaveAttribute('aria-pressed', 'true');
    costs.push(await page.locator('#execution-cost').innerText());
  }
  expect(new Set(costs).size).toBe(3);
  expect(costs[0]).toContain('827 MB');
  expect(costs[1]).toContain('总货币成本尚未测量');
  expect(costs[2]).toContain('另发一次查询并单独计时');
});

test('manual scores and temperature change mathematical probabilities and reset exactly', async ({ page }) => {
  await page.goto('/decision-models/#scoring');
  await expect(page.locator('#dm-lab')).toContainText('人工分数 · 数学演示');
  await expect(page.locator('#dm-lab .dm-scope')).toContainText('这不是模型测试');
  const initial = await probabilities(page);
  const total = Math.exp(2) + Math.exp(1) + 1;
  [Math.exp(2), Math.exp(1), 1].forEach((value, i) => expect(initial[i]).toBeCloseTo(value / total, 14));
  await expect(page.locator('#score-winner')).toHaveText('候选 A');
  await setRange(page.locator('#logit-0'), -1);
  await setRange(page.locator('#logit-1'), 0);
  await setRange(page.locator('#logit-2'), 3);
  const cold = await probabilities(page);
  await expect(page.locator('#score-winner')).toHaveText('候选 C');
  await expect(page.locator('#score-confidence')).toHaveText(choiceConfidence(cold).toFixed(4));
  await setRange(page.locator('#temperature'), 4);
  const hot = await probabilities(page);
  expect(hot[2]).toBeLessThan(cold[2]);
  expect(hot[0]).toBeGreaterThan(cold[0]);
  expect(hot.reduce((sum, p) => sum + p, 0)).toBeCloseTo(1, 14);
  await expect(page.locator('#score-winner')).toHaveText('候选 C');
  await expect(page.locator('#score-confidence')).toHaveText(choiceConfidence(hot).toFixed(4));
  await expect(page.locator('#score-max')).toHaveText(`${(hot[2] * 100).toFixed(2)}%`);
  await expect(page.locator('#temperature-value')).toHaveText('4.00');
  await page.locator('#reset-scores').click();
  for (const [i, value] of ['2', '1', '0'].entries()) await expect(page.locator(`#logit-${i}`)).toHaveValue(value);
  await expect(page.locator('#temperature')).toHaveValue('1');
  expect(await probabilities(page)).toEqual(initial);
  await expect(page.locator('#score-winner')).toHaveText('候选 A');
});

test('thresholds filter all 34 historical predictions without changing their saved choices or probabilities', async ({ page }) => {
  await page.goto('/decision-models/#review');
  await expect(page.locator('#threshold-lab')).toBeVisible();
  await expect(page.locator('#dm-lab')).toContainText('历史结果 · 真实后处理');
  await expect(page.locator('#history-source')).toContainText(recorded.recordedAt);
  await expect(page.locator('#history-source')).toContainText('不是独立测试集或访问者设备的实测');
  await expect(page.locator('#dm-lab .dm-scope')).toContainText('门槛使用选中项概率，不是 confidence');
  await page.locator('details:has(#history-rows) > summary').click();
  for (const { threshold, retained, correct, wrong } of [
    { threshold: 0, retained: 34, correct: 8, wrong: 26 },
    { threshold: 30, retained: 21, correct: 8, wrong: 13 },
    { threshold: 50, retained: 0, correct: 0, wrong: 0 },
  ]) {
    await setRange(page.locator('#decision-threshold'), threshold);
    await expect(page.locator('#threshold-value')).toHaveText(`${threshold}%`);
    await expect(page.locator('#retained-count')).toHaveText(`${retained} / 34`);
    await expect(page.locator('#wrong-count')).toHaveText(String(wrong));
    await expect(page.locator('#review-count')).toHaveText(String(34 - retained));
    await expect(page.locator('#history-dots circle')).toHaveCount(34);
    const rows = await page.locator('#history-rows tr').evaluateAll(elements => elements.map(element => [...element.children].map(cell => cell.textContent)));
    expect(rows).toEqual(recorded.cases.map(item => [
      item.id, item.selected, `${(item.probabilities[item.selected] * 100).toFixed(2)}%`,
      item.correct ? '符合' : '不符合', item.probabilities[item.selected] >= threshold / 100 ? '保留建议' : '转交复核',
    ]));
    expect(rows.filter(row => row[4] === '保留建议' && row[3] === '符合')).toHaveLength(correct);
    expect(rows.filter(row => row[4] === '保留建议' && row[3] === '不符合')).toHaveLength(wrong);
    if (retained) await expect(page.locator('#threshold-observation')).toContainText(`${correct} 条符合开发标签，${wrong} 条仍然错误`);
    else await expect(page.locator('#threshold-observation')).toContainText('零条建议不等于 100% 准确');
  }
});

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`all chapters fit width ${width} with the active navigation visible`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    // Last-chapter deep links must reveal the current item in the mobile nav.
    await page.goto('/decision-models/#review');
    await expect(page.locator('#threshold-lab')).toBeVisible();
    await expectActiveNavigationInView(page, 'review');
    for (const chapter of chapters) {
      await page.locator(`[data-lesson="${chapter}"]`).click();
      await expect(page).toHaveURL(new RegExp(`#${chapter}$`));
      await expectActiveNavigationInView(page, chapter);
      await expect(page.locator('#dm-chapter-title')).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px ${chapter} global width`).toBe(true);
      await page.locator('#dm-lab').scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px ${chapter} experiment width`).toBe(true);
    }
  });
}
