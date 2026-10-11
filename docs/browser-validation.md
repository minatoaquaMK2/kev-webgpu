# Browser and engineering acceptance record

**Current local record:** the project was imported to an independent Mac folder on 2026-10-11. Real q8 inference, offline new-evidence inference and browser lifecycle checks now have recorded outcomes. RCA semantics failed (8/34 accepted labels). See [public verification summary](verification.md) for current results. The sections below preserve the historical cloud run; their not-run entries describe that environment only.

Recorded 2026-10-10. Status vocabulary: **passed** means the cited check actually ran; **failed** means an executed check did not meet its assertion; **not-run** means the required observation was unavailable or not attempted. `not_verified` is the numerical/model-report status when no trustworthy measurement exists. Static code or a unit test does not satisfy a hardware/browser requirement by itself.

## Environment and completed checks

- Cloud Linux implementation environment; no user computer was accessed
- Chromium launch failed before page creation with `process_singleton_posix.cc socket() Operation not permitted`, both normally and through an approved escalation. `/dev/dri` was absent. There was **no** completed WebGPU adapter request. [Raw evidence](../results/cloud-gpu-probe.json)
- TypeScript type checking: passed in the final subpath build
- Final unit checks: **106 passed, 0 failed**. This includes 7 evaluation-accounting/variant-plumbing tests; none are real-model runs. The full raw unit reports are retained with the original offline delivery.
- Production repository-subpath build: **passed**. The raw build log is retained with the original offline delivery.
- Dependency audit: **0 findings** after pinning Vite 6.4.4 / Vitest 5.0.3. This is a package-audit result, not a complete security assessment. [Raw npm audit](../results/npm-audit.json)
- Standalone browser test suite supplied, but **not-run** because Chromium cannot launch; DOM unit tests are not reported as browser execution
- All 20 production requests (ten incident stages/cases × probable cause/next check) pass the actual pinned-tokenizer budget audit: largest state 939 tokens, largest state-plus-question branch 1,177. No truncation or inference. [Raw encoding measurements](../results/encoder-budget-results.json)
- All **34 inputs / 68 questions**, including the 24 variants and both production question types, pass the same exact-encoder limits. Largest state/branch remain 939/1,177; no inference. [Full variant audit](../results/encoder-variant-budget-results.json)
- Fixed metadata/tokenizer/graph bytes and q8 graph types were audited reproducibly. [Raw graph/asset audit](../results/graph-audit.json)
- Development-only harness production compilation: passed; one Worker, matching ORT MJS/WASM, no model inference. Command: `node tests/model-validation/build-smoke.mjs`. The raw harness build log is retained with the original offline delivery.
- No real model predictions, cold/cached load measurements, GPU timings, peak memory results, reference comparisons or actual Pages URL exist from this environment

## Spec §12.2 acceptance rows

| # | Required acceptance | Result | Evidence / remaining requirement |
|---:|---|---|---|
| 1 | Release includes one logical Kev text q8 model; no other precision/vision requests | not-run | q8-only lock, explicit loader configuration and static/unit checks exist; live network capture is still required |
| 2 | Real Pages repository subpath works without backend, localhost, keys or unsafe flags | not-run | Subpath build/workflow supplied; no authorized Pages deployment or URL |
| 3 | Explicit-load behavior and verified real WebGPU backbone | not-run | User-triggered architecture and GPU instrumentation implemented; no browser process started |
| 4 | Synthetic RCA cases/stages/edit/import and evidence backlinks | not-run | Schema/domain and DOM behavior are unit-tested; interactive real-browser acceptance remains unavailable |
| 5 | Predictions come from Kev and are unmodified; no substitute inference | not-run | Production calls real kev.js and retains its response; real inference did not run |
| 6 | Evidence edits invalidate old results; labels/titles/IDs do not leak into state | passed | Evidence/app tests exercise stale binding and allowlisted rendering; variant tests verify test metadata isolation and order invariance |
| 7 | Evidence-rule cross-checks are separate from model output | passed | Independently evaluated candidate rules and response-preservation code covered by unit tests; no model accuracy conclusion follows |
| 8 | Missing/conflicting/history evidence is honest; no auto-execution threshold | passed | Rules/unit tests cover incomplete collection, historical alerts and conflicts; advice is a read-only allowlist |
| 9 | q8/features/download/integrity/device-loss/limit failures are understandable | not-run | Error paths and unit checks supplied; actual GPU/device-loss/CORS failure injection not executed |
| 10 | Loaded tab analyzes newly edited evidence after network is disabled | not-run | Requires one successful physical-GPU load, then offline new input and captured response/hash |
| 11 | Network audit shows no evidence egress; public artifact has no enterprise data | not-run | Bundled cases are synthetic and code has no analytics/upload path; real-browser request audit remains required |
| 12 | Memory/cache/cancel/unload controlled; no background inference or multiple models | not-run | Lifecycle/race/cache tests cover application logic; actual browser/driver memory and repeated-run behavior unmeasured |
| 13 | Parity, semantic behavior and performance have distinct measured/unverified records | passed | Records explicitly identify all three as unverified/unmeasured; opt-in harness retains raw evidence when run |
| 14 | README does not market synthetic/upstream results as production RCA | passed | README explicitly states unverified semantics and no production-calibration or upstream-score substitution |

Passing the documentation row for distinct unverified records does not mean parity, semantics or performance passed. The three mandatory semantic showcase checks remain:

| Synthetic showcase | Model outcome | Result |
|---|---|---|
| case-01 C: MTU versus alternatives | none observed | not-run |
| case-02: effective mapping gap | none observed | not-run |
| case-03: current array write protection | none observed | not-run |

## Real-browser completion protocol

Use a physical GPU device that the user has authorized for this work. Record exact OS, browser, adapter, app commit, runtime/bundle identity and domain version. Run the [manual harness](rca-validation.md), then perform the [actual Pages-origin, offline and privacy checks](deployment.md). Save raw outputs and network evidence before marking a row passed. Include every failure, no-result and unsupported-feature outcome.

For memory, compare repeated analyses, cancel/reload and unload using a documented observation method. If reliable peak VRAM is unavailable, report it unavailable. Do not treat the downloaded byte count or JavaScript heap as peak GPU memory. Profile sufficient large GPU operators; a successful adapter request or declared provider alone is not proof.

No publication, remote upload or operation on the user's Mac is authorized by this checklist itself.
