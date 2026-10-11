// ORT 1.30's native WebGPU backend does not emit the older JSEP profiling
// callback. Observe the actual public command-encoding APIs in this Worker.
// Forward every call unchanged; this is dispatch evidence, not GPU timing or VRAM.
type Pipeline = { label?: string };
type Pass = { setPipeline(pipeline: Pipeline): void; dispatchWorkgroups(...args: number[]): void; dispatchWorkgroupsIndirect(...args: unknown[]): void };
type Queue = { submit(...args: unknown[]): void };
type Surface = { GPUComputePassEncoder?: { prototype: Pass }; GPUQueue?: { prototype: Queue } };
export function observeGpuCommands(surface: Surface = globalThis as unknown as Surface) {
  let dispatches = 0, submissions = 0;
  const labels = new Set<string>();
  const pipelines = new WeakMap<object, Pipeline>();
  const pass = surface.GPUComputePassEncoder?.prototype, queue = surface.GPUQueue?.prototype;
  const available = !!pass && !!queue;
  if (pass && queue) {
    const setPipeline = pass.setPipeline;
    pass.setPipeline = function(pipeline) { setPipeline.call(this, pipeline); pipelines.set(this, pipeline); };
    for (const key of ['dispatchWorkgroups', 'dispatchWorkgroupsIndirect'] as const) {
      const original = pass[key];
      pass[key] = function(...args: unknown[]) {
        (original as (...values: unknown[]) => void).apply(this, args);
        dispatches++;
        const label = pipelines.get(this)?.label;
        if (label) labels.add(label);
      };
    }
    const submit = queue.submit;
    queue.submit = function(...args) { submit.apply(this, args); submissions++; };
  }
  return {
    reset() { dispatches = 0; submissions = 0; labels.clear(); },
    snapshot() { return { available, dispatches, submissions, pipelineLabels: [...labels].sort(), method: 'public-WebGPU-command-observation' as const }; },
  };
}
