import { describe, expect, it } from 'vitest';
import { argmax, compareProbabilities, latencySummary, percentile } from './metrics';
const tolerance = { maxAbsoluteError: 0.01, meanAbsoluteError: 0.005, allowedArgmaxFlips: 0 };
describe('real-model validation accounting (not model execution)', () => {
  it('keeps full JavaScript precision and every option error', () => {
    const result = compareProbabilities({ a: 0.6000123456789, b: 0.3999876543211 }, { a: 0.6, b: 0.4 }, tolerance);
    expect(result.passed).toBe(true);
    expect(result.maxAbsoluteError).toBeCloseTo(0.0000123456789, 14);
    expect(result.differences.a).not.toBe(0);
  });
  it('fails argmax flips and fails changed option sets', () => {
    expect(compareProbabilities({ a: 0.499, b: 0.501 }, { a: 0.501, b: 0.499 }, tolerance).passed).toBe(false);
    expect(() => compareProbabilities({ a: 1 }, { b: 1 }, tolerance)).toThrow('names differ');
  });
  it('rejects malformed output rather than substituting probabilities', () => {
    expect(() => argmax({ a: NaN })).toThrow();
    expect(() => argmax({ a: 2 })).toThrow();
    expect(() => argmax({})).toThrow();
  });
  it('uses the fixed nearest-rank P50/P95 without mutating raw samples', () => {
    const samples = Array.from({ length: 30 }, (_, i) => 30 - i);
    expect(latencySummary(samples)).toMatchObject({ sampleCount: 30, p50Ms: 15, p95Ms: 29 });
    expect(samples[0]).toBe(30);
    expect(percentile([], 0.5)).toBeNull();
  });
});
