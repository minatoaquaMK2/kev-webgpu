/** Build the dev-only harness in a temporary folder. This never runs the model or deploys. */
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'vite';
const outDir = await mkdtemp(join(tmpdir(), 'kev-model-validation-'));
await build({
  configFile: resolve('vite.config.ts'),
  build: { outDir, emptyOutDir: true, rollupOptions: { input: resolve('tests/model-validation/index.html') } },
});
console.log(JSON.stringify({ status: 'build_passed', output: outDir, modelExecution: 'not_run', publication: 'not_run' }));
