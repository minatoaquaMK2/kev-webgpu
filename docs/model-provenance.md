# Model provenance and verification boundary

Recorded 2026-10-10. The source of truth is [`src/runtime/model-lock.json`](../src/runtime/model-lock.json), not a moving model name. `package-lock.json` fixes the installed JavaScript dependency tree. No model weights are committed or included in the Pages build.

Local update, 2026-10-11: all 33 pinned files were downloaded, byte-counted and SHA-256 verified by the production reader on the Mac. Real inference results are recorded in [the public verification summary](verification.md). The earlier cloud-only verification boundary below is retained as history.

| Component | Fixed identity |
|---|---|
| Source model | `jaredpalmer/kev-0.8b` |
| Source checkpoint | `9a45d25eb2ab761841196625383fa1dff0e56c1e` |
| Base-model attribution | `Qwen/Qwen3.5-0.8B-Base`, as stated by the source model card |
| Browser bundle repository | `ai-ecoverse/kev.js` on Hugging Face |
| Browser repository commit | `6ae610faac5669a69d4c633d44fe1d7fa56dbb58` |
| Internal manifest revision | `a4c2a04e456b9f7b` |
| Package / npm version | `@ai-ecoverse/kev.js@1.0.0` |
| Installed package gitHead | `ca072e49e65b716af478db8f464e1fac8a0f4ad5` |
| ONNX Runtime Web | `1.30.0` |
| Tokenizers | `@huggingface/tokenizers@0.2.0` |
| Variant / vision | `q8` / `false` |
| Manifest-reported temperature | `2.3510958125672174` |
| Locked bundle total | 826,680,926 bytes across 33 files, including manifest, tokenizer and head |
| Domain pack | `dpc-powerstore-iscsi-1.0.0` |
| Application commit | Source import `a008e3d6d70fd5dbbe95f4546cf56ae5808ba52d`; the public [verification summary](verification.md) preserves historical dirty status and source-report digests; complete local patch/hashes remain in the offline records |

The npm package's gitHead differs from the upstream GitHub `main` commit observed during research (`57a0f246efc42dfcd3e0acca294312f36af41b07`). The runtime identity uses the installed package, not that moving branch. The browser repository commit, internal bundle revision and original source checkpoint are three distinct identities.

## Evidence actually obtained

- The manifest bytes were fetched and SHA-256 hashed locally: `5ec4abcb0c567adb516d5ca2529b1a518de62f3c1ff8de4eda4f66e439f0526d`
- The q8 graph was fetched and independently hashed: `bb15a69610c16cc572ae63cbe34e6d9f15c3611b0006ab448e61b7d9c6e18080`
- Graph inspection found 150 `MatMulNBits`, 36 `MatMul`, 18 `LinearAttention` and 6 `GroupQueryAttention` nodes. Initializer types include float16 (302), float32 (38), uint8 (150), int8 (8) and int64 (1)
- The manifest identifies the q8 IO path as float16. This is not a claim that every graph operation uses FP16
- Other file SHA-256 values and sizes were obtained from immutable Hugging Face Git LFS metadata. Full weight bytes were not downloaded or independently hashed in the implementation environment
- The production reader verifies each file's bytes before using it. This is a runtime integrity check implemented in code, not evidence that a full model load succeeded here

The raw asset and graph observations are saved in [`results/graph-audit.json`](../results/graph-audit.json). Reproduce them with `node scripts/audit-model-assets.mjs`; it also encodes all 34 synthetic base/variant inputs for both production questions, without downloading weight shards or running inference. See [the 68-check encoder report](../results/encoder-variant-budget-results.json).

## Not verified

There was no real browser adapter probe, model inference, full-weight load, numerical parity run, actual Pages-origin CORS test, device-memory measurement or offline inference test in this cloud environment. The Chromium process could not launch, and `/dev/dri` was absent. See [`results/cloud-gpu-probe.json`](../results/cloud-gpu-probe.json).

The explicit `webgpu` execution provider and shader-f16 preflight are necessary checks. They do not alone prove that the main computation ran on a physical GPU. Runtime reports separately record GPU-backed outputs, observed kernel types and whether substantial GPU kernels were observed. Timestamp instrumentation unavailable on a device remains a disclosed limit.

## Upstream references and licensing

- [Pinned browser bundle files and manifest](https://huggingface.co/ai-ecoverse/kev.js/tree/6ae610faac5669a69d4c633d44fe1d7fa56dbb58/kev-0.8b)
- [Source model card](https://huggingface.co/jaredpalmer/kev-0.8b/tree/9a45d25eb2ab761841196625383fa1dff0e56c1e)
- [Installed runtime source revision](https://github.com/ai-ecoverse/kev.js/tree/ca072e49e65b716af478db8f464e1fac8a0f4ad5)
- [ONNX Runtime Web environment configuration](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html)

The installed kev.js package declares Apache-2.0. Model and underlying model licensing must be reviewed at the linked upstream sources before redistribution; the demo references remote weights and does not assert that runtime licensing alone covers them. This is an independent synthetic demonstration, not a Dell-endorsed diagnostic product.
