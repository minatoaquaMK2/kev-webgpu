import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildModelState, parseEvidenceBundle } from '../../src/evidence';
import { buildQuestionRequest } from '../../src/app/request';
import { buildValidationInputs } from './variants';
import { EXPECTED_LABELS } from './expected-labels';
const cases = Object.fromEntries(Array.from({ length: 8 }, (_, index) => {
  const id = `case-${String(index + 1).padStart(2, '0')}`;
  return [id, parseEvidenceBundle(JSON.parse(readFileSync(new URL(`../../public/cases/${id}.json`, import.meta.url), 'utf8')))];
}));
describe('model-validation fixture plumbing (no model execution)', () => {
  it('generates all ten base-stage inputs and 24 schema-valid variations', () => {
    const inputs = buildValidationInputs(cases);
    expect(inputs).toHaveLength(34);
    expect(inputs.filter(input => input.id.startsWith('variant-'))).toHaveLength(24);
    for (const input of inputs) {
      expect(() => parseEvidenceBundle(input.bundle)).not.toThrow();
      expect(EXPECTED_LABELS[input.labelKey]?.length).toBeGreaterThan(0);
      expect(input.bundle.evidence.length).toBeLessThanOrEqual(12);
    }
  });
  it('preserves exact state for order-only variants', () => {
    const inputs = buildValidationInputs(cases);
    for (const input of inputs.filter(value => value.transformation === 'reverse-evidence-order')) {
      const base = inputs.find(value => value.id === input.baselineId)!;
      expect(buildModelState(input.bundle).state).toBe(buildModelState(base.bundle).state);
    }
  });
  it('does not serialize test metadata and keeps production question contract', () => {
    for (const input of buildValidationInputs(cases)) {
      const state = buildModelState(input.bundle);
      const request = buildQuestionRequest(input.bundle, state.includedIds);
      expect(request.state).toBe(state.state);
      expect(Object.keys(request.questions)).toEqual(['probable_cause']);
      expect(state.state).not.toContain(input.id);
      expect(state.state).not.toContain('expectedLabel');
      expect(state.state).not.toContain(input.transformation);
    }
  });
});
