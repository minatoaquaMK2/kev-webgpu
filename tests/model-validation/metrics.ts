/** Numeric helpers used by the opt-in real-model harness; no predictions live here. */
export type ProbabilityMap = Record<string, number>;
export interface ParityTolerance { maxAbsoluteError: number; meanAbsoluteError: number; allowedArgmaxFlips: number }
export interface ProbabilityComparison {
  passed: boolean;
  maxAbsoluteError: number;
  meanAbsoluteError: number;
  argmaxFlipped: boolean;
  referenceArgmax: string;
  actualArgmax: string;
  differences: Record<string, number>;
}

export function argmax(values: ProbabilityMap): string {
  const entries = Object.entries(values);
  if (!entries.length || entries.some(([, v]) => !Number.isFinite(v) || v < 0 || v > 1)) {
    throw new Error('Probabilities must be a nonempty mapping of finite values in [0,1]');
  }
  return entries.reduce((best, item) => item[1] > best[1] ? item : best)[0];
}

export function compareProbabilities(actual: ProbabilityMap, reference: ProbabilityMap, tolerance: ParityTolerance): ProbabilityComparison {
  const keys = Object.keys(reference);
  if (JSON.stringify([...keys].sort()) !== JSON.stringify(Object.keys(actual).sort())) {
    throw new Error('Reference and observed option names differ');
  }
  const actualArgmax = argmax(actual);
  const referenceArgmax = argmax(reference);
  const differences = Object.fromEntries(keys.map(key => [key, Math.abs(actual[key] - reference[key])]));
  const errors = Object.values(differences);
  const maxAbsoluteError = Math.max(...errors);
  const meanAbsoluteError = errors.reduce((sum, value) => sum + value, 0) / errors.length;
  const argmaxFlipped = actualArgmax !== referenceArgmax;
  return { maxAbsoluteError, meanAbsoluteError, argmaxFlipped, actualArgmax, referenceArgmax, differences,
    passed: maxAbsoluteError <= tolerance.maxAbsoluteError && meanAbsoluteError <= tolerance.meanAbsoluteError && (!argmaxFlipped || tolerance.allowedArgmaxFlips > 0) };
}

/** Nearest-rank percentiles, defined before collecting samples; no display rounding. */
export function percentile(samples: number[], fraction: number): number | null {
  if (!samples.length) return null;
  if (fraction < 0 || fraction > 1 || samples.some(value => !Number.isFinite(value) || value < 0)) throw new Error('Invalid latency sample or quantile');
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

export function latencySummary(samples: number[]) {
  return { sampleCount: samples.length, p50Ms: percentile(samples, 0.5), p95Ms: percentile(samples, 0.95),
    minMs: samples.length ? Math.min(...samples) : null, maxMs: samples.length ? Math.max(...samples) : null,
    meanMs: samples.length ? samples.reduce((sum, n) => sum + n, 0) / samples.length : null,
    percentileMethod: 'nearest-rank', samplesMs: [...samples] };
}
