# Deployment and public data boundary

No repository push, remote publication, Pages deployment or accepted public URL was performed during implementation. `.github/workflows/pages.yml` is a manual `workflow_dispatch` workflow provided for an authorized repository owner to run. Configure the `github-pages` environment and approval protection first. A successful build alone is not a deployed-site acceptance result.

## Local static build

```sh
npm ci
npm test
PAGES_BASE=/your-repository/ npm run build
npm run preview
```

Vite's `PAGES_BASE` must match the deployment path, including a trailing slash. Use `/` for a root site, or `/your-repository/` for a project site. The normal build excludes the developer-only model validation page. The output is static HTML, JS, one Worker, matching ORT assets and synthetic cases; no inference server or API key is needed.

The workflow derives the base path from `actions/configure-pages`, rejects bundled ONNX/safetensors weights and checks the static artifact is below 1 GB. A CI subpath build checks asset URL generation; only opening the actual HTTPS Pages URL verifies final origin behavior. The workflow does not download or export model weights on each UI change.

## Required checks after an authorized publication

- Record the actual URL and exact deployed commit. Check every JS, Worker, MJS/WASM and case URL under the repository subpath
- Confirm secure context and ordinary Pages behavior with `crossOriginIsolated === false`; no custom COOP/COEP requirement or unsafe browser flags
- Load the immutable Hugging Face q8 files from that origin. Record HTTP/redirect failures, response CORS headers, digest results and all requested paths
- Verify only q8, tokenizer and small head files are requested. Other precisions and vision assets must not be requested
- Capture GPU kernel proof from a real analysis. A displayed WebGPU label is insufficient
- After a successful load, disable network without closing the tab, edit evidence into a new non-preset input, and run another analysis. Capture its new hash and response
- Audit network requests while editing, importing, analyzing and exporting evidence. Evidence must stay local; asset downloads still disclose ordinary network metadata
- Exercise cancellation, failed download, reload, clear-cache and unload. Verify controls recover and results cannot attach to changed evidence

Do not “fix” CORS with `no-cors`, embed an HF token, require localhost in production, or silently route inference to another provider. A failure is a failed or blocked acceptance check.

## Privacy and caching

Only synthetic cases and public source references belong in the public repository, screenshots and reports. Local imports are memory-only unless the user explicitly exports a file. Do not add analytics, crash reporting, external fonts, remote inference, live infrastructure access or customer documents.

A model loaded in an open tab is intended to support offline subsequent inference. Offline tab restart is outside P0: do not advertise it merely because some weights are cached. The manifest, app shell and all runtime assets also matter. Cache cleanup must target only this application's cache namespace.

## Official hosting references

- [GitHub Pages static hosting](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- [Configuring Pages publishing through a workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
