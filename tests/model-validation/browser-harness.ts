import { KevClient } from '../../src/runtime/client';
import type { AnalysisResult, RuntimeEvent, SystemOneRequest } from '../../src/runtime/protocol';
import lock from '../../src/runtime/model-lock.json';
import { buildModelState, hashEvidence, parseEvidenceBundle } from '../../src/evidence';
import { DOMAIN_VERSION } from '../../src/domain';
import { buildQuestionRequest } from '../../src/app/request';
import { buildValidationInputs, type ValidationInput } from './variants';
import { EXPECTED_LABELS, SHOWCASE_IDS, ABSTENTION_OPTIONS } from './expected-labels';
import { compareProbabilities, latencySummary, type ProbabilityMap } from './metrics';
import policy from './policy.json';

const output = document.querySelector<HTMLPreElement>('#output')!;
const status = document.querySelector<HTMLElement>('#status')!;
const events: Array<RuntimeEvent & { at: string }> = [];
let cancelled = false;
let loaded = false;
let latest: unknown;
let fixture: ReferenceFixture | undefined;
let productionQuestions: SystemOneRequest['questions'] | undefined;
const loads: unknown[] = [];
const client = new KevClient(event => {
  events.push({ ...event, at: new Date().toISOString() });
  if (event.type === 'status' || event.type === 'warning') status.textContent = event.message;
});
const describeError = (error: unknown) => error instanceof Error ? { name: error.name, message: error.message, code: 'code' in error ? error.code : undefined } : { message: String(error) };
function show(value: unknown) { latest = value; output.textContent = JSON.stringify(value, null, 2); }
// Preserve criteria insertion order: Kev encoding depends on it.
const serializeRequest = (value: unknown) => JSON.stringify(value);
async function digest(value: unknown) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(typeof value === 'string' ? value : serializeRequest(value))))).map(x => x.toString(16).padStart(2, '0')).join('');
}
function request(state: string): SystemOneRequest {
  if (!productionQuestions) throw new Error('Production question template is not initialized');
  return { state, questions: productionQuestions };
}
function rawMap(result: AnalysisResult, req: SystemOneRequest): ProbabilityMap | null {
  const question = Object.values(req.questions)[0];
  if (question.type !== 'choice' || !result.unroundedProbabilities?.[0]) return null;
  const names = Object.keys(question.criteria), raw = result.unroundedProbabilities[0];
  if (raw.length !== names.length) throw new Error('Raw probability vector and option count differ');
  return Object.fromEntries(names.map((name, index) => [name, raw[index]]));
}
function ensureActive() { if (cancelled) throw new Error('Validation was cancelled; already submitted GPU work may finish and is discarded'); }
async function analyze(req: SystemOneRequest, evidenceHash?: string) {
  ensureActive();
  const started = performance.now();
  const stateSha256 = await digest(req.state);
  ensureActive();
  const result = await client.analyze(req, evidenceHash ?? stateSha256);
  ensureActive();
  return { ...result, stateSha256, inputHashKind: evidenceHash ? 'production-evidence-hash' : 'state-text-sha256', harnessWallMs: performance.now() - started, unroundedByOption: rawMap(result, req) };
}
async function inputs() {
  const records = await Promise.all(Array.from({ length: 8 }, async (_, index) => {
    const id = `case-${String(index + 1).padStart(2, '0')}`;
    const response = await fetch(new URL(`../../cases/${id}.json`, location.href));
    if (!response.ok) throw new Error(`Cannot read ${id}: HTTP ${response.status}`);
    return [id, parseEvidenceBundle(await response.json())] as const;
  }));
  return buildValidationInputs(Object.fromEntries(records));
}
async function runDomain(all: ValidationInput[]) {
  const rows: Array<{ id: string; baselineId: string; transformation: string; expected: readonly string[]; request: SystemOneRequest;
    input: ReturnType<typeof buildModelState>; result?: Awaited<ReturnType<typeof analyze>>; selected?: string; correct: boolean;
    status: 'completed' | 'error'; error?: ReturnType<typeof describeError> }> = [];
  for (const input of all) {
    if (cancelled) break; status.textContent = `Real model domain evaluation: ${input.id} (${rows.length + 1}/${all.length})`;
    const prepared = buildModelState(input.bundle);
    const req = buildQuestionRequest(input.bundle, prepared.includedIds, 'probable_cause');
    const expected = EXPECTED_LABELS[input.labelKey];
    try {
      const result = await analyze(req, await hashEvidence(input.bundle, prepared.includedIds));
      const answer = result.response.answers.probable_cause;
      if (answer?.type !== 'choice') throw new Error('Missing upstream probable_cause choice answer');
      rows.push({ id: input.id, baselineId: input.baselineId, transformation: input.transformation, expected,
        request: req, input: prepared, result, selected: answer.choice, correct: expected.includes(answer.choice), status: 'completed' as const });
    } catch (error) { rows.push({ id: input.id, baselineId: input.baselineId, transformation: input.transformation, expected, request: req, input: prepared, error: describeError(error), correct: false, status: 'error' as const }); }
  }
  const completed = rows.filter(row => row.status === 'completed');
  const abstentions = completed.filter(row => row.expected.every(label => ABSTENTION_OPTIONS.includes(label)));
  const sensitivity = completed.filter(row => row.transformation === 'reverse-evidence-order' || row.transformation === 'untrusted-log-instruction' || row.id === 'case-07').map(row => {
    const baseline = completed.find(candidate => candidate.id === (row.id === 'case-07' ? 'case-01-C' : row.baselineId));
    const a = row.result?.unroundedByOption, b = baseline?.result?.unroundedByOption;
    return { id: row.id, baselineId: baseline?.id ?? null, selectedChanged: baseline ? row.selected !== baseline.selected : null,
      rawComparison: a && b ? compareProbabilities(a, b, policy.parity.sameQ8NativeOrtVsWebgpu) : null };
  });
  return { status: completed.length === all.length ? 'completed' : 'incomplete', dataset: 'synthetic-development-set-not-independent-holdout',
    domainPackVersion: DOMAIN_VERSION, caseCount: all.length - 24, variantCount: 24,
    top1: { correct: completed.filter(row => row.correct).length, completed: completed.length, planned: all.length, accuracy: completed.length ? completed.filter(row => row.correct).length / completed.length : null },
    abstention: { correct: abstentions.filter(row => row.correct).length, total: abstentions.length },
    showcase: SHOWCASE_IDS.map(id => { const row = rows.find(row => row.id === id); return { id, status: row?.status === 'completed' ? row.correct ? 'passed' : 'failed' : 'not-run', selected: row && 'selected' in row ? row.selected : null }; }),
    sensitivity, rows };
}

interface ReferenceFixture {
  schemaVersion: '1.0';
  provenance: {
    referenceKind: 'sameQ8NativeOrtVsWebgpu' | 'originalCheckpointVsQ8';
    sourceCheckpoint: string; browserBundleCommit: string; encoderRuntimeCommit: string;
    temperature: number; sourceArtifactSha256: string; referenceEngine: string;
    referenceEngineVersion: string; generatedAt: string; generationCommand: string;
  };
  checks: Array<{ id: string; request: SystemOneRequest; requestSha256: string; probabilities: ProbabilityMap }>;
}
function validateReference(value: unknown): asserts value is ReferenceFixture {
  const f = value as ReferenceFixture;
  if (f?.schemaVersion !== '1.0' || !f.provenance || !Array.isArray(f.checks)) throw new Error('Invalid reference fixture format');
  const p = f.provenance;
  if (!['sameQ8NativeOrtVsWebgpu', 'originalCheckpointVsQ8'].includes(p.referenceKind)) throw new Error('Unsupported reference comparison kind');
  if (p.sourceCheckpoint !== lock.checkpoint || p.browserBundleCommit !== lock.bundleCommit || p.encoderRuntimeCommit !== lock.runtimeCommit || p.temperature !== lock.temperature) throw new Error('Reference model, encoding, temperature or bundle identity does not match the lock');
  if (!/^[a-f0-9]{64}$/.test(p.sourceArtifactSha256) || !p.referenceEngine || !p.referenceEngineVersion || !p.generationCommand || !p.generatedAt) throw new Error('Reference must record reproducible source artifact, engine and generation provenance');
  if (f.checks.length < policy.minimumQuestionChecks || new Set(f.checks.map(check => check.id)).size !== f.checks.length) throw new Error('At least 30 uniquely identified question-level reference checks are required');
  for (const check of f.checks) {
    if (Object.keys(check.request.questions).length !== 1 || check.request.image !== undefined) throw new Error('Each reference row must be exactly one text question');
    if (!/^[a-f0-9]{64}$/.test(check.requestSha256)) throw new Error('Every reference request needs its serialization SHA-256');
    const probabilities = Object.values(check.probabilities);
    if (!probabilities.length || probabilities.some(n => !Number.isFinite(n) || n < 0 || n > 1) || Math.abs(probabilities.reduce((a, b) => a + b, 0) - 1) > 0.00001) throw new Error('Reference must contain full-precision normalized probabilities, not labels or rounded examples');
  }
}
async function runParity(reference?: ReferenceFixture) {
  if (!reference) return { status: 'not_verified', reason: 'No trusted same-checkpoint reference fixture supplied. No upstream accuracy claim is reused.' };
  validateReference(reference);
  const tolerance = policy.parity[reference.provenance.referenceKind];
  const rows = [];
  for (const check of reference.checks) {
    if (cancelled) break; status.textContent = `Real model parity: ${rows.length + 1}/${reference.checks.length}`;
    try {
      if (await digest(check.request) !== check.requestSha256) throw new Error('Reference request digest mismatch');
      const result = await analyze(check.request);
      if (!result.unroundedByOption) throw new Error('Unrounded output is unavailable; parity cannot be verified');
      rows.push({ id: check.id, request: check.request, expected: check.probabilities, result,
        comparison: compareProbabilities(result.unroundedByOption, check.probabilities, tolerance), status: 'completed' as const });
    } catch (error) { rows.push({ id: check.id, error: describeError(error), status: 'error' as const }); }
  }
  const checks = rows.flatMap(row => row.comparison ? [row.comparison] : []);
  const errors = checks.flatMap(check => Object.values(check.differences));
  const flips = checks.filter(check => check.argmaxFlipped).length;
  const passed = rows.length >= policy.minimumQuestionChecks && checks.length === reference.checks.length && checks.every(check => check.passed) && flips <= tolerance.allowedArgmaxFlips;
  return { status: passed ? 'passed' : checks.length < reference.checks.length ? 'not_verified' : 'failed',
    referenceProvenance: reference.provenance, referenceFixtureSha256: await digest(reference), tolerance,
    checkCount: checks.length, plannedChecks: reference.checks.length, maxAbsoluteError: errors.length ? Math.max(...errors) : null,
    meanAbsoluteError: errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : null, argmaxFlips: flips,
    failedChecks: rows.filter(row => row.status !== 'completed' || !row.comparison?.passed).map(row => row.id), rows };
}
async function runTimings(all: ValidationInput[]) {
  // Measure using the production encoder. This synthetic padding is explicitly a
  // performance stress input and is not included in domain accuracy accounting.
  const states = all.filter(input => input.transformation.startsWith('base')).map(input => buildModelState(input.bundle).state);
  const lengths = await Promise.all(states.map(async state => ({ state, usage: await client.measure(request(state)) })));
  const short = lengths.sort((a, b) => a.usage.stateTokens - b.usage.stateTokens)[0].state;
  let low = 0, high = 1200, near = short;
  const padding = ' Synthetic operator observation: no additional device facts were collected.';
  while (low <= high) {
    ensureActive();
    const count = Math.floor((low + high) / 2), proposed = `${short}\nPerformance-only padding:${padding.repeat(count)}`;
    try {
      const usage = await client.measure(request(proposed));
      if (usage.stateTokens <= 1024 && usage.branchTokens.every(tokens => tokens <= 1536)) { near = proposed; low = count + 1; } else high = count - 1;
    } catch { high = count - 1; }
  }
  const nearUsage = await client.measure(request(near));
  if (nearUsage.stateTokens < 922) return { status: 'not-run', reason: 'Could not form a valid near-budget state at >=90% of the 1,024-token state budget', nearUsage };
  const samples: Array<{ index: number; kind: string; state: string; result: Awaited<ReturnType<typeof analyze>> }> = [];
  const warmups = [];
  let interruption: ReturnType<typeof describeError> | undefined;
  try {
  for (let index = 0; index < policy.timing.warmups; index++) {
    ensureActive(); const state = index === 0 ? short : index === 1 ? near : `${short}\nSynthetic newly observed note: measurement warm-up ${index}.`;
    warmups.push({ index, result: await analyze(request(state)) });
  }
  for (let index = 0; index < policy.timing.measuredRuns; index++) {
    ensureActive(); const kind = policy.timing.cases[index % 3];
    // Every edited run differs; it is not a replay of a precomputed state result.
    const state = kind === 'short' ? short : kind === 'near-budget' ? near : `${short}\nSynthetic newly observed note: new measurement ${index}, no additional array observations.`;
    status.textContent = `Timing real inference ${index + 1}/${policy.timing.measuredRuns}: ${kind}`;
    samples.push({ index, kind, state, result: await analyze(request(state)) });
  }
  } catch (error) { interruption = describeError(error); }
  return { status: samples.length === policy.timing.measuredRuns ? 'completed' : 'incomplete', interruption, warmupCount: warmups.length, warmups, summary: latencySummary(samples.map(sample => sample.result.harnessWallMs)),
    groups: Object.fromEntries(policy.timing.cases.map(kind => [kind, latencySummary(samples.filter(sample => sample.kind === kind).map(sample => sample.result.harnessWallMs))])),
    samples, memory: { peakVram: 'unavailable', processRam: 'unavailable', note: 'Model download bytes are not device memory measurements' } };
}
async function run() {
  if (!loaded) throw new Error('Use Load pinned q8 first');
  cancelled = false;
  const startedAt = new Date().toISOString();
  const all = await inputs();
  ensureActive();
  productionQuestions = buildQuestionRequest(all[0].bundle, all[0].bundle.evidence.map(item => item.id), 'probable_cause').questions;
  const device = await client.probe();
  ensureActive();
  const report: Record<string, unknown> = {
    schemaVersion: '1.0', startedAt, modelLock: lock, policy, domainPackVersion: DOMAIN_VERSION, loads: [...loads],
    device, environment: { userAgent: navigator.userAgent, platform: navigator.platform, origin: location.origin,
      href: location.href, secureContext: isSecureContext, crossOriginIsolated,
      osDescription: document.querySelector<HTMLInputElement>('#os')!.value || 'not_recorded',
      hardwareDescription: document.querySelector<HTMLInputElement>('#hardware')!.value || 'not_recorded',
      appCommit: document.querySelector<HTMLInputElement>('#commit')!.value || 'not_recorded' },
    claims: { evidenceRules: 'see independent unit-test report', pagesOriginCors: 'not_verified_by_dev_harness',
      offlineInference: 'not_verified_by_online_run', sensitiveDataEgress: 'requires_browser_network_audit' },
  };
  try {
    report.domain = await runDomain(all); show(report);
    report.parity = await runParity(fixture); show(report);
    ensureActive();
    report.performance = await runTimings(all); show(report);
  } catch (error) { report.interruption = describeError(error); }
  report.finishedAt = new Date().toISOString(); report.events = [...events]; show(report);
  status.textContent = 'Run ended. Inspect every section and download the raw report. An incomplete section has not passed.';
}

async function action(callback: () => Promise<unknown>) {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('button[data-work]')];
  for (const button of buttons) button.disabled = true;
  try { await callback(); } catch (error) { show({ status: 'failed', error: describeError(error), events }); status.textContent = 'Operation failed; no result was replaced with a simulated answer.'; }
  finally { for (const button of buttons) button.disabled = false; }
}
document.querySelector('#probe')!.addEventListener('click', () => void action(async () => show(await client.probe())));
document.querySelector('#load')!.addEventListener('click', () => void action(async () => { const start = performance.now(); const result = await client.load(); loaded = true; const record = { load: result, observedWallMs: performance.now() - start, events: [...events], sessionCreationMs: result.sessionCreationMs }; loads.push(record); show(record); }));
document.querySelector('#run')!.addEventListener('click', () => void action(run));
document.querySelector('#unload')!.addEventListener('click', () => void action(async () => { await client.unload(); loaded = false; status.textContent = 'Session released; driver memory return is not guaranteed to be immediate'; }));
document.querySelector('#cancel')!.addEventListener('click', () => { cancelled = true; void client.cancel(); });
document.querySelector('#download')!.addEventListener('click', () => {
  if (!latest) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(latest, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `kev-validation-${new Date().toISOString().replace(/[:.]/g, '-')}.json`; a.click(); URL.revokeObjectURL(url);
});
document.querySelector<HTMLInputElement>('#reference')!.addEventListener('change', async event => {
  try { const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return; const value: unknown = JSON.parse(await file.text()); validateReference(value); fixture = value; status.textContent = `Reference loaded locally: ${value.checks.length} question checks. Reviewer must verify its generation provenance.`; }
  catch (error) { fixture = undefined; show({ reference: 'rejected', error: describeError(error) }); }
});
// No model, inference, adapter request or case network read starts on page load.
Object.assign(window, { kevValidation: { probe: () => client.probe(), load: async () => { const start = performance.now(); const result = await client.load(); loaded = true; loads.push({ load: result, observedWallMs: performance.now() - start, events: [...events], sessionCreationMs: result.sessionCreationMs }); return result; }, run,
  cancel: () => { cancelled = true; return client.cancel(); }, unload: async () => { await client.unload(); loaded = false; },
  setReference: (value: unknown) => { validateReference(value); fixture = value; }, getReport: () => latest,
  // Development-only primitive for independent upstream fixture diagnostics.
  // The same production Worker checks the request and runs the pinned q8 model.
  analyzeRequest: (req: SystemOneRequest) => analyze(req),
  serializeRequest, requestDigest: digest } });
