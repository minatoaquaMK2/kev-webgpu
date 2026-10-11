import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { Tokenizer } from '@huggingface/tokenizers';
import { encode, toRecord } from '@ai-ecoverse/kev.js';
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const lock = await read('src/runtime/model-lock.json');
const cache = resolve(process.env.KEV_AUDIT_CACHE || '../.model-audit-cache');
const manifest = await read(`${cache}/manifest.json`);
const tok = new Tokenizer(await read(`${cache}/${manifest.files.tokenizer.replaceAll('/', '_')}`), await read(`${cache}/${manifest.files.tokenizer_config.replaceAll('/', '_')}`));
const bytes = await readFile('tests/fixtures/upstream/kev-0.8b.json');
const source = JSON.parse(bytes);
const canonical = value => JSON.stringify(value);
const rows = [], audits = [];
for (const fixture of source.fixtures) {
  const record = toRecord(fixture.request).record;
  const expectedRecord = { state: fixture.record.state, questions: fixture.record.questions.map(({ instr, options }) => ({ instr, options })) };
  const e = encode(tok, record, manifest.special, { strict: true });
  const flat = { ids: [...e.state], pos: e.state.map((_, i) => i), decide_idx: [], opt_idx: [], state_len: e.state.length };
  for (const b of e.branches) {
    const offset = flat.ids.length;
    flat.ids.push(...b.ids); flat.pos.push(...b.pos);
    flat.decide_idx.push(offset + b.decide); flat.opt_idx.push(b.opts.map(i => offset + i));
  }
  const encodingExact = Object.keys(flat).every(k => canonical(flat[k]) === canonical(fixture.encoding[k]));
  const renderingExact = canonical(record) === canonical(expectedRecord);
  audits.push({ name: fixture.name, renderingExact, encodingExact, stateTokens: e.state.length });
  if (!encodingExact || !renderingExact) throw Error(`Upstream encoding mismatch: ${fixture.name}`);
  for (const [i, q] of record.questions.entries()) {
    // Only test-only response keys change: empty descriptions reproduce the exact
    // original option strings for choice/noul/score. Assert bytes/tokens, don't assume.
    const req = { state: record.state, questions: { upstream_check: { type: 'choice', instructions: q.instr, criteria: Object.fromEntries(q.options.map(option => [option, ''])) } } };
    const normalized = toRecord(req).record;
    if (canonical(normalized.questions[0]) !== canonical(q)) throw Error('Option ordering/duplicates cannot be represented losslessly');
    const encoded = encode(tok, normalized, manifest.special, { strict: true, maxState: 1024, maxBranch: 1536 });
    if (canonical(encoded.branches[0]) !== canonical(e.branches[i])) throw Error('Single-question encoding drift');
    const unscaled = fixture.probs[i];
    // Upstream generation explicitly used temperature=1.0; apply the locked
    // serving temperature to the REFERENCE only. Actual model output is untouched.
    const powered = unscaled.map(p => p ** (1 / lock.temperature));
    const sum = powered.reduce((a, b) => a + b, 0);
    rows.push({ id: `${fixture.name}/${Object.keys(fixture.request.questions)[i]}`, request: req,
      referenceTemperature1: unscaled, referenceAtServingTemperature: powered.map(p => p / sum), sourceQuestionType: Object.values(fixture.request.questions)[i].type,
      encodingExact: true, stateTokens: encoded.stateTokens, branchTokens: encoded.state.length + encoded.branches[0].ids.length });
  }
}
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
const orderRows = [];
try {
  const { buildQuestionRequest } = await server.ssrLoadModule('/src/app/request.ts');
  const { parseEvidenceBundle, getCaseStage } = await server.ssrLoadModule('/src/evidence/index.ts');
  for (const id of ['case-01', 'case-02', 'case-03', 'case-06']) {
    const source = parseEvidenceBundle(await read(`public/cases/${id}.json`));
    const bundle = id === 'case-01' ? getCaseStage(source, 'C') : source;
    const req = buildQuestionRequest(bundle, bundle.evidence.map(e => e.id));
    const criteria = Object.entries(req.questions.probable_cause.criteria);
    for (const kind of ['baseline', 'reverse', 'rotate-one']) {
      const entries = kind === 'reverse' ? [...criteria].reverse() : kind === 'rotate-one' ? [...criteria.slice(1), criteria[0]] : criteria;
      orderRows.push({ id: `${id}/${kind}`, caseId: id, kind, request: { ...req, questions: { probable_cause: { ...req.questions.probable_cause, criteria: Object.fromEntries(entries) } } } });
    }
  }
} finally { await server.close(); }
const report = { sourceUrl: 'https://raw.githubusercontent.com/ai-ecoverse/kev.js/ca072e49e65b716af478db8f464e1fac8a0f4ad5/fixtures/kev-0.8b.json', sourceSha256: createHash('sha256').update(bytes).digest('hex'), sourceRun: source.run, sourceGenerator: 'export/kev_web_export/fixtures.py at ca072e49e65b716af478db8f464e1fac8a0f4ad5', referenceEngine: 'PyTorch CPU float32 merged checkpoint; upstream-provided', referenceEngineVersion: 'not_recorded_in_upstream_fixture', generatedAt: 'not_recorded_in_upstream_fixture', sourceTemperature: 1, servingTemperature: lock.temperature, note: 'Diagnostic comparison, not newly generated independent RCA ground truth. Record formal parity provenance limitations separately.', audits, rows, orderRows };
await writeFile('tests/fixtures/upstream/diagnostic-requests.json', JSON.stringify(report, null, 2) + '\n');
await writeFile('results/upstream-encoding-audit.json', JSON.stringify({ sourceUrl: report.sourceUrl, sourceSha256: report.sourceSha256, sourceRun: report.sourceRun, audits, recordCount: audits.length, questionChecks: rows.length, allExact: true }, null, 2) + '\n');
console.log(JSON.stringify({ records: audits.length, questions: rows.length, allRenderingAndEncodingExact: true, orderChecks: orderRows.length }));
