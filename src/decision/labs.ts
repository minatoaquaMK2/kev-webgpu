import {
  choiceConfidence,
  toRecord,
  validate,
  type DecisionRecord,
  type Question,
  type SystemOneRequest,
} from '@ai-ecoverse/kev.js';

export type DecisionKind = 'choice' | 'noul' | 'score';

/** Request construction and inspection only: no tokenizer or model is loaded. */
export function teachingRequest(kind: DecisionKind, state: string): SystemOneRequest {
  if (typeof state !== 'string') throw new TypeError('背景材料必须是文本。');
  let id: string, question: Question;
  switch (kind) {
    case 'choice':
      id = 'support_category';
      question = {
        type: 'choice',
        instructions: '根据材料将支持请求分到哪类？只选择一项；材料不足以判断时选择 unknown。',
        criteria: {
          networking: '网络连通或访问权限类问题。',
          billing: '费用、账单或扣费问题。',
          unknown: '材料缺少信息，无法判断支持请求属于网络/权限还是费用/账单问题。',
        },
      };
      break;
    case 'noul':
      id = 'duplicate_charge';
      question = {
        type: 'noul',
        instructions: '材料是否明确提及同一笔费用被重复扣费？只判断材料是否有明确描述。',
        criteria: {
          false: '材料未明确提及重复扣费，包括未提及扣费、仅有一般账单问题或信息不足。',
          true: '材料明确说明同一笔费用被重复扣取。',
        },
      };
      break;
    case 'score':
      id = 'work_impact';
      question = {
        type: 'score',
        instructions: '根据材料，只评估当前问题对工作的影响程度，并选择最匹配的等级。',
        criteria: [
          '可以继续且无功能影响',
          '功能受限但有替代办法',
          '工作完全阻塞且无替代办法',
        ],
      };
      break;
    default:
      throw new RangeError('未知决策题型。');
  }
  return validate({ state, questions: { [id]: question } });
}

export function inspectRequest(kind: DecisionKind, state: string): {
  request: SystemOneRequest;
  record: DecisionRecord;
} {
  const request = teachingRequest(kind, state);
  return { request, record: toRecord(request).record };
}

export const SCORE_DEMO_LABEL = '数学教学分数（非模型调用）';

/** Softmax teaching aid, not a Kev inference or measured model output. */
export function scoreDemo(logits: number[], temperature: number): {
  probabilities: number[];
  winner: number;
  confidence: number;
} {
  if (!Array.isArray(logits) || logits.length < 2) {
    throw new RangeError('数学演示至少需要两个有限分数。');
  }
  for (const value of logits) {
    if (!Number.isFinite(value)) throw new RangeError('所有教学分数都必须是有限数。');
  }
  if (!Number.isFinite(temperature) || temperature <= 0) {
    throw new RangeError('温度必须是大于 0 的有限数。');
  }
  // A positive temperature preserves the logits' ordering. Use the first raw
  // maximum so floating-point ties at extreme temperatures cannot change it.
  const winner = logits.reduce((best, value, index) => value > logits[best] ? index : best, 0);
  const maximum = logits[winner];
  const weights = logits.map(value => {
    const difference = value - maximum;
    // Opposite, very large finite inputs can overflow during subtraction.
    // Dividing first is safe in that case and retains the correct scaled gap.
    const scaled = Number.isFinite(difference)
      ? difference / temperature
      : value / temperature - maximum / temperature;
    return Math.exp(scaled);
  });
  const total = weights.reduce((sum, value) => sum + value, 0);
  const probabilities = weights.map(value => value / total);
  return { probabilities, winner, confidence: choiceConfidence(probabilities) };
}

export interface HistoricalCase {
  id: string;
  selected: string;
  probabilities: Record<string, number>;
  correct: boolean;
}

/** Retrospective review threshold; it never changes a saved model prediction. */
export function thresholdSummary(cases: HistoricalCase[], threshold: number): {
  total: number;
  retained: number;
  review: number;
  correct: number;
  wrong: number;
  accuracy: number | null;
  rows: Array<HistoricalCase & { p: number; retained: boolean }>;
} {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new RangeError('复核阈值必须位于 0 到 1 之间。');
  }
  const rows = cases.map(item => {
    const p = item.probabilities[item.selected];
    if (!Number.isFinite(p) || p < 0 || p > 1) {
      throw new RangeError(`历史记录 ${item.id} 缺少有效的选中项概率。`);
    }
    return { ...item, probabilities: { ...item.probabilities }, p, retained: p >= threshold };
  });
  const retained = rows.filter(row => row.retained).length;
  const correct = rows.filter(row => row.retained && row.correct).length;
  return {
    total: rows.length,
    retained,
    review: rows.length - retained,
    correct,
    wrong: retained - correct,
    accuracy: retained ? correct / retained : null,
    rows,
  };
}
