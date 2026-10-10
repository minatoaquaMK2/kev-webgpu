# Kev local RCA demo

A bounded, synthetic Dell Private Cloud / VMware / PowerStore iSCSI + VMFS demonstration. It uses one pinned **Kev-0.8B text q8** model through a browser Worker and ONNX Runtime WebGPU. Model predictions, deterministic evidence cross-checks and suggested read-only verification are shown separately.

**Status: engineering implementation, not a validated RCA product.** The final unit suite passed 106 tests, all 68 exact-tokenizer checks passed, and the repository-subpath build passed, but real GPU inference, numerical parity, domain accuracy, performance, offline inference and actual Pages-origin acceptance have not been run in this environment. RCA semantic validation is **not verified**. The cloud Chromium process could not launch, and no GPU device path was available. No public deployment was made. See [the acceptance record](docs/browser-validation.md) and [raw GPU probe evidence](results/cloud-gpu-probe.json).

## Run

Requires Node 22.12+ (the supplied workflows use Node 24) and a supported physical GPU/browser for inference. The app can display synthetic cases without loading the model.

```sh
npm ci
npm test
npm run dev
```

Open the URL printed by Vite. Choose an incident and evidence stage, explicitly load the model, then click analysis. Edit/import only the documented evidence JSON format. Loading uncached model assets downloads **826,680,926 bytes** (about 826.7 MB decimal / 788.4 MiB). Model weights are hosted separately and are not part of the repository or Pages artifact.

```sh
PAGES_BASE=/your-repository/ npm run build
npm run preview
```

A production site needs HTTPS, WebGPU and the required q8 device features. No API key, backend, special unsafe flags, q8f32, FP16 model, vision package, larger model or whole-model CPU fallback is provided. Failures are visible; there are no prerecorded predictions or rule-generated substitute probabilities.

## What's included

- Eight synthetic incidents, including the three-stage expansion case, missing host-volume mapping, current capacity write protection, connectivity loss, cleared history, missing evidence, injected text and conflicting causes
- Typed validation of evidence facts, units, time, object references, inherited mappings and collection completeness
- Deterministic English model input, evidence-ID links, local JSON import/edit/export, explicit evidence selection, actual encoder budgets and stale-result handling
- Full upstream responses and unchanged probabilities; all eight candidates receive independent evidence-rule cross-checks
- One explicit-load q8 Worker/session, version/file integrity checks, two-file download concurrency, namespaced persistent cache, cancellation and actual release paths
- Opt-in real-model evaluation harness with 24 additional variants, independent grading labels, 30+ reference-check capacity and 3 warm-ups + 30 timed calls
- Static CI and a manual-only Pages publication workflow. Neither model execution nor deployment occurs automatically during a build

## Validation and provenance

- [Model identities, file provenance and graph inspection](docs/model-provenance.md)
- [Model evaluation, fixed tolerances and real-device run instructions](docs/rca-validation.md)
- [Engineering/browser acceptance checklist](docs/browser-validation.md)
- [Deployment, CORS, offline and privacy checks](docs/deployment.md)
- [Limitations and safe interpretation](docs/limitations.md)
- [Original v2.0 implementation specification](spec.md)

The development-only harness is at `/tests/model-validation/index.html` under the Vite dev server. No trusted reference probabilities are bundled; parity remains `not_verified` without an independently generated, correctly identified fixture. Its synthetic test accuracy must not be advertised as production accuracy or calibrated diagnosis confidence.

## Data and operational boundaries

All bundled observations are synthetic. Imported JSON stays in the browser unless the user explicitly exports it. Model downloads still produce ordinary network metadata; evidence-egress acceptance requires an actual browser audit. Company data still needs its organization's approval.

This demo does not connect to or modify any infrastructure. A model-selected next check maps only to reviewed text. No command, probe, rescan, configuration change or support request is executed. Human review is always required. This project is independent and is not an official or Dell-endorsed diagnostic product.
