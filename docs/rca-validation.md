# RCA validation

## Current result

**RCA semantic validation is not verified.** No real-model inference was performed here. There are no measured model predictions, domain accuracy figures, parity results or latency percentiles to report. Ordinary unit tests use synthetic values to test accounting and rules; those are not model results.

A semantic failure on case-01 C, case-02 or case-03 must stay visible in this document and the README after a future run. Never substitute a rule answer, retune tolerances after observing results, switch precision/model, or silently delete a failed case.

## Dataset and label isolation

The production app contains eight synthetic incidents. The evaluation harness expands case-01 into A/B/C, giving ten base inputs, plus 24 test-only transformations:

- Eight consistent object-ID renamings
- Four reversed evidence orders
- Four symptom paraphrases
- Two consistent numeric MTU/probe perturbations
- Two removals of decisive evidence
- Two temporal-scope perturbations
- Two misleading log instructions treated as data

`tests/model-validation/variants.ts` creates inputs. `expected-labels.ts` contains the expected choices separately. Only the production evidence renderer creates model state. Variant IDs, filenames and grading labels are not fields in a model request. Domain labels reflect the written synthetic scenario and may be multiple acceptable abstentions where evidence conflicts.

These are development scenarios and hand-authored variants, not an independent held-out set. Reusing them after changing prompts or rules does not create independent validation. Their top-1 accuracy cannot establish production reliability or probability calibration.

## Manual real-model harness

1. On a physical GPU machine, install with `npm ci`, then run `npm run dev`
2. Open `http://localhost:5173/tests/model-validation/index.html` in a supported browser. Loopback is a development test only; it does not satisfy the real Pages-origin acceptance requirement
3. Enter exact OS/version, physical hardware, and `git rev-parse HEAD`
4. Click **Probe GPU**, then **Load pinned q8**. The initial uncached download is 826,680,926 bytes. Only the pinned q8 session is created
5. Optionally select a trusted reference fixture created independently for the same source checkpoint, bundle, encoder and temperature
6. Click **Run real validation**, then **Download raw JSON**. Review every failed or incomplete row
7. Reload from the application cache and repeat the load measurement if comparing cold and cached load times. Record both runs and whether each file came from cache
8. Click **Unload** when done

The actual pinned-tokenizer audit passed for all **34 inputs × two production questions = 68 checks**, including every variant (largest state 939; state plus branch 1,177), without executing the model. See [all 68 encoding measurements](../results/encoder-variant-budget-results.json) and [the 20 base-case requests](../results/encoder-budget-results.json). The budget test does not establish any diagnostic accuracy.

Reproduce graph/identity and exact-encoder audits with `node scripts/audit-model-assets.mjs`. It downloads and verifies only the pinned manifest, tokenizer, tokenizer config and 385 KB graph, not model weight shards, and never starts inference. `KEV_AUDIT_CACHE=/path/to/cache` can reuse those four verified files. The separate harness compilation smoke check is `node tests/model-validation/build-smoke.mjs`. Neither command is GPU validation.

The harness is development-only and is excluded from the normal production Pages build. It never runs on page open. The console API `window.kevValidation` exposes `probe`, `load`, `run`, `cancel`, `unload`, `setReference`, `getReport`, `serializeRequest` and `requestDigest`; calls explicitly start the same operations as the buttons.

The report preserves the full upstream response, its rounded probabilities and separate upstream confidence, the unrounded probability vectors intercepted in the same upstream call, exact encoded lengths, request/state hash, input text, provenance, GPU proof, every failed sample, per-run times and event logs. JavaScript numbers are serialized without additional rounding. Missing raw values never become invented values.

## Reference fixtures and parity

The default is `parity: not_verified` until a trustworthy external reference is supplied. There is no fabricated “golden” probability file. The harness requires at least 30 uniquely identified question-level checks and records all failures, max/mean absolute probability deviation and argmax flips.

Tolerances are fixed in `tests/model-validation/policy.json` before any local inference:

| Comparison | Maximum absolute error | Mean absolute error per check | Allowed argmax flips |
|---|---:|---:|---:|
| Same q8 graph, native ORT versus WebGPU | 0.01 | 0.005 | 0 |
| Original checkpoint versus q8 | 0.05 | 0.02 | 0 |

These are engineering acceptance thresholds, not a claim of validated domain safety. Report quantization comparison separately from same-graph browser parity. Tolerance changes require a new evaluation policy/version and must not rewrite prior results.

A reference file has `schemaVersion: "1.0"`, `provenance` and `checks`. Provenance must include `referenceKind` (one of the policy keys above), `sourceCheckpoint`, `browserBundleCommit`, `encoderRuntimeCommit`, `temperature`, `sourceArtifactSha256`, `referenceEngine`, `referenceEngineVersion`, `generatedAt`, and `generationCommand`. Each check contains `id`, `request` (one text choice question), `requestSha256` and full-precision `probabilities` keyed by criterion name.

Compute `requestSha256` over UTF-8 `JSON.stringify(request)` preserving insertion order. Do not alphabetize criterion keys: their order affects encoding. The browser console helper `await kevValidation.requestDigest(request)` computes the required value. Keep the original reference artifact, generation code and exact dependency versions. A syntactically valid fixture is not automatically trustworthy; a reviewer must establish that it came from the specified checkpoint and independently executed reference engine.

## Domain and performance accounting

The report separates top-1 results, insufficient/conflicting-case abstention, the three showcase checks, order/injection sensitivity, parity and performance. Evidence-rule correctness and reference integrity are independent unit-test outcomes, not model accuracy. A failed or cancelled inference is retained as an error and excluded from a completed-run accuracy denominator while the planned denominator remains visible.

Performance uses at least three warm-ups excluded from the measured summary and 30 recorded calls, alternating short, near-budget (at least 90% of 1,024 state tokens) and uniquely edited states. Actual production encoding is used to establish budgets; nothing is silently truncated. Report P50/P95 by the nearest-rank definition, per-category sample counts, every sample, load time and actual hardware. If a valid near-budget input cannot be formed, that performance section is explicitly not-run.

The runtime measures actual ORT session-creation wall time separately from total load time. Both fields and file/progress phase logs are retained. A download/cached-load comparison must preserve cache-hit records; neither timing is a GPU-memory measurement. No values are available until a real load succeeds. Peak VRAM and process RAM are unavailable without a separate reliable measurement. File bytes, RAM, buffers and VRAM must never be conflated.
