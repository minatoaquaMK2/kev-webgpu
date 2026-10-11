// Pure request/mathematical teaching tests. No tokenizer, model, GPU or inference.
import { describe, expect, it } from 'vitest';
import { choiceConfidence, toAnswers, toRecord, validate } from '@ai-ecoverse/kev.js';
import history from '../public/guide-validation.json';
import {
  inspectRequest,
  SCORE_DEMO_LABEL,
  scoreDemo,
  teachingRequest,
  thresholdSummary,
  type DecisionKind,
  type HistoricalCase,
} from '../src/decision/labs';

describe('real kev.js request rendering without a model', () => {
  const state = '同一笔月费被扣了两次。\n还能继续工作，功能没有受到影响。';

  it.each<DecisionKind>(['choice', 'noul', 'score'])('preserves state and removes question IDs from the %s decision record', kind => {
    const { request, record } = inspectRequest(kind, state);
    expect(validate(request)).toBe(request);
    expect(request.state).toBe(state);
    expect(record.state).toBe(state);
    expect(record).toEqual(toRecord(request).record);
    expect(record.questions).toHaveLength(1);
    expect(Object.keys(record.questions[0])).toEqual(['instr', 'options']);
    const question = Object.values(request.questions)[0];
    expect(question.type).toBe(kind);
    const renamed = { ...request, questions: { unrelated_question_identifier: question } };
    expect(toRecord(renamed).record).toEqual(record);
    expect(toRecord(renamed).meta[0].id).toBe('unrelated_question_identifier');
    expect(JSON.stringify(record)).not.toContain('unrelated_question_identifier');
  });

  it('choice exposes three category definitions in their real upstream option order', () => {
    const { request, record } = inspectRequest('choice', state);
    const question = request.questions.support_category;
    expect(question.type).toBe('choice');
    if (question.type !== 'choice') throw Error('Expected choice question');
    expect(Object.keys(question.criteria)).toEqual(['networking', 'billing', 'unknown']);
    expect(question.instructions).toContain('根据材料将支持请求分到哪类');
    expect(question.criteria.networking).toContain('访问权限');
    expect(question.criteria.billing).toContain('账单');
    expect(question.criteria.unknown).toContain('缺少信息');
    expect(record.questions[0].options).toEqual(Object.entries(question.criteria).map(([key, value]) => `${key}: ${value}`));
  });

  it('noul uses false/no then true/yes, and the upstream answer is p(true)', () => {
    const request = teachingRequest('noul', state);
    const question = request.questions.duplicate_charge;
    expect(question.type).toBe('noul');
    if (question.type !== 'noul') throw Error('Expected noul question');
    expect(question.instructions).toContain('是否明确提及');
    expect(question.criteria?.false).toContain('未明确提及重复扣费');
    expect(question.criteria?.true).toContain('重复扣取');
    const { record, meta } = toRecord(request);
    expect(meta[0].keys).toEqual(['false', 'true']);
    expect(record.questions[0].options).toEqual([`no: ${question.criteria?.false}`, `yes: ${question.criteria?.true}`]);
    // Synthetic probabilities exercise API semantics, not a model prediction.
    expect(toAnswers([[0.2, 0.8]], meta).duplicate_charge).toEqual({ type: 'noul', noul: 0.8 });
  });

  it('score orders functional impact levels and upstream score is an expected level', () => {
    const request = teachingRequest('score', state);
    const question = request.questions.work_impact;
    expect(question.type).toBe('score');
    if (question.type !== 'score') throw Error('Expected score question');
    expect(question.instructions).toContain('只评估当前问题对工作的影响程度');
    const levels = ['可以继续且无功能影响', '功能受限但有替代办法', '工作完全阻塞且无替代办法'];
    expect(question.criteria).toEqual(levels);
    const { record, meta } = toRecord(request);
    expect(record.questions[0].options).toEqual(levels);
    expect(meta[0].keys).toEqual(['0', '1', '2']);
    const answer = toAnswers([[0.1, 0.2, 0.7]], meta).work_impact;
    expect(answer.type).toBe('score');
    if (answer.type !== 'score') throw Error('Expected score answer');
    expect(answer.score).toBe(1.6);
    expect(answer.legend).toEqual({ '0': levels[0], '1': levels[1], '2': levels[2] });
    expect(answer.probabilities).toEqual({ '0': 0.1, '1': 0.2, '2': 0.7 });
  });

  it('builds independent requests without sharing mutable criteria', () => {
    const first = teachingRequest('score', state), second = teachingRequest('score', state);
    const question = first.questions.work_impact;
    if (question.type !== 'score') throw Error('Expected score question');
    question.criteria[0] = 'Edited teaching option';
    expect(second.questions.work_impact.criteria).toEqual(['可以继续且无功能影响', '功能受限但有替代办法', '工作完全阻塞且无替代办法']);
  });
});

describe('mathematical score demonstration, not model inference', () => {
  it('normalizes probabilities and uses the real upstream choice confidence', () => {
    const result = scoreDemo([2, 1, -1], 1);
    expect(result.probabilities.reduce((sum, p) => sum + p, 0)).toBeCloseTo(1, 14);
    expect(result.probabilities.every(p => p >= 0 && p <= 1)).toBe(true);
    expect(result.winner).toBe(0);
    expect(result.confidence).toBe(choiceConfidence(result.probabilities));
    expect(SCORE_DEMO_LABEL).toContain('数学教学分数');
    expect(SCORE_DEMO_LABEL).toContain('非模型调用');
  });

  it('is invariant to a common additive offset without changing its input', () => {
    const logits = Object.freeze([2, -1, 0]);
    const result = scoreDemo(logits as number[], 0.7);
    const shifted = scoreDemo(logits.map(value => value + 1000), 0.7);
    result.probabilities.forEach((p, index) => expect(shifted.probabilities[index]).toBeCloseTo(p, 14));
    expect(shifted.winner).toBe(result.winner);
    expect(logits).toEqual([2, -1, 0]);
  });

  it('temperature changes sharpness but not the winning option', () => {
    const cold = scoreDemo([1, 3, 0], 0.25), normal = scoreDemo([1, 3, 0], 1), hot = scoreDemo([1, 3, 0], 4);
    expect([cold.winner, normal.winner, hot.winner]).toEqual([1, 1, 1]);
    expect(cold.probabilities[1]).toBeGreaterThan(normal.probabilities[1]);
    expect(normal.probabilities[1]).toBeGreaterThan(hot.probabilities[1]);
    expect(cold.confidence).toBeGreaterThan(normal.confidence);
    expect(normal.confidence).toBeGreaterThan(hot.confidence);
  });

  it('handles ties, uniform scores and extreme finite numbers without NaN', () => {
    expect(scoreDemo([1000, 1000, 1000], 1)).toEqual({ probabilities: [1 / 3, 1 / 3, 1 / 3], winner: 0, confidence: 0 });
    expect(scoreDemo([2, 2, 1], 1).winner).toBe(0);
    const huge = scoreDemo([1e308, -1e308], 1e308);
    expect(huge.probabilities[0]).toBeCloseTo(1 / (1 + Math.exp(-2)), 14);
    expect(huge.probabilities[1]).toBeCloseTo(Math.exp(-2) / (1 + Math.exp(-2)), 14);
    expect(scoreDemo([1e308, 0, -1e308], Number.MIN_VALUE)).toEqual({ probabilities: [1, 0, 0], winner: 0, confidence: 1 });
  });

  it.each([[], [1], [0, NaN], [0, Infinity], [-Infinity, 1], new Array<number>(2)].map(logits => ({ logits })))('rejects invalid score vectors $logits', ({ logits }) => {
    expect(() => scoreDemo(logits, 1)).toThrow(RangeError);
  });
  it.each([0, -1, NaN, Infinity, -Infinity])('rejects invalid temperature %s', temperature => {
    expect(() => scoreDemo([1, 2], temperature)).toThrow(RangeError);
  });
});

describe('historical review threshold on the saved 34-case development set', () => {
  it.each([
    { threshold: 0, retained: 34, correct: 8 },
    { threshold: 0.3, retained: 21, correct: 8 },
    { threshold: 0.5, retained: 0, correct: 0 },
  ])('retains $retained records at threshold $threshold', ({ threshold, retained, correct }) => {
    const result = thresholdSummary(history.cases, threshold);
    expect(result.total).toBe(34);
    expect(result.retained).toBe(retained);
    expect(result.review).toBe(34 - retained);
    expect(result.correct).toBe(correct);
    expect(result.wrong).toBe(retained - correct);
    expect(result.accuracy).toBe(retained ? correct / retained : null);
    expect(result.rows).toHaveLength(34);
    for (const row of result.rows) {
      expect(row.p).toBe(row.probabilities[row.selected]);
      expect(row.retained).toBe(row.p >= threshold);
    }
  });

  it('preserves every historical case and returns independent row/probability objects', () => {
    const cases: HistoricalCase[] = history.cases.map(item => Object.freeze({ ...item, probabilities: Object.freeze({ ...item.probabilities }) }));
    Object.freeze(cases);
    const before = JSON.stringify(cases), result = thresholdSummary(cases, 0.3);
    expect(JSON.stringify(cases)).toBe(before);
    expect(result.rows.map(row => row.id)).toEqual(cases.map(row => row.id));
    for (const [index, row] of result.rows.entries()) {
      expect(row).not.toBe(cases[index]);
      expect(row.probabilities).not.toBe(cases[index].probabilities);
      expect(row.probabilities).toEqual(cases[index].probabilities);
      expect(row.selected).toBe(cases[index].selected);
    }
    result.rows[0].probabilities[result.rows[0].selected] = 0;
    expect(JSON.stringify(cases)).toBe(before);
  });

  it('uses the selected probability, retains boundary equality and counts only retained correctness', () => {
    const cases: HistoricalCase[] = [
      { id: 'selected-low', selected: 'a', probabilities: { a: 0.2, b: 0.8 }, correct: true },
      { id: 'at-boundary', selected: 'a', probabilities: { a: 0.3, b: 0.7 }, correct: false },
    ];
    const result = thresholdSummary(cases, 0.3);
    expect(result.rows.map(row => row.retained)).toEqual([false, true]);
    expect(result).toMatchObject({ total: 2, retained: 1, review: 1, correct: 0, wrong: 1, accuracy: 0 });
  });

  it('returns null accuracy when there are no records', () => {
    expect(thresholdSummary([], 1)).toEqual({ total: 0, retained: 0, review: 0, correct: 0, wrong: 0, accuracy: null, rows: [] });
  });
  it.each([-0.1, 1.1, NaN, Infinity])('rejects invalid threshold %s', threshold => {
    expect(() => thresholdSummary(history.cases, threshold)).toThrow(RangeError);
  });
  it('rejects a missing selected probability instead of silently inventing a score', () => {
    expect(() => thresholdSummary([{ id: 'missing', selected: 'a', probabilities: { b: 1 }, correct: false }], 0.3)).toThrow(RangeError);
  });
});
