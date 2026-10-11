import { it, expect, vi } from 'vitest';
import { observeGpuCommands } from '../src/runtime/gpu-observer';
it('records dispatched pipeline labels and submits while forwarding original arguments', () => {
  const dispatch = vi.fn(), submit = vi.fn(), set = vi.fn();
  const pass = { setPipeline: set, dispatchWorkgroups: dispatch, dispatchWorkgroupsIndirect: vi.fn() };
  const queue = { submit };
  const observer = observeGpuCommands({ GPUComputePassEncoder: { prototype: pass }, GPUQueue: { prototype: queue } });
  pass.setPipeline({ label: 'MatMulNBits' });
  expect(observer.snapshot().dispatches).toBe(0);
  pass.dispatchWorkgroups(8, 2, 1); queue.submit(['command-buffer']);
  expect(dispatch).toHaveBeenCalledWith(8, 2, 1);
  expect(submit).toHaveBeenCalledWith(['command-buffer']);
  expect(observer.snapshot()).toMatchObject({ available: true, dispatches: 1, submissions: 1, pipelineLabels: ['MatMulNBits'] });
  observer.reset();
  expect(observer.snapshot()).toMatchObject({ dispatches: 0, submissions: 0, pipelineLabels: [] });
});
it('records unavailable APIs without inventing dispatch evidence', () => {
  expect(observeGpuCommands({}).snapshot()).toMatchObject({ available: false, dispatches: 0, pipelineLabels: [] });
});
