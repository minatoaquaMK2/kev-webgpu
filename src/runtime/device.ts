import type { DeviceReport } from './protocol';
// Structural types keep this small probe usable without polyfilling WebGPU.
export interface AdapterLike {
  features: Set<string>;
  limits: Record<string, number>;
  info?: { vendor?: string; architecture?: string; device?: string; description?: string; isFallbackAdapter?: boolean };
  isFallbackAdapter?: boolean;
}
export async function inspectDevice(): Promise<{ report: DeviceReport; adapter?: AdapterLike }> {
  const base = { secureContext: globalThis.isSecureContext === true, crossOriginIsolated: globalThis.crossOriginIsolated === true };
  if (!base.secureContext) return { report: { ...base, available: false, code: 'webgpu_unavailable', message: 'WebGPU requires HTTPS (or localhost for development).' } };
  const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<AdapterLike | null> } }).gpu;
  if (!gpu) return { report: { ...base, available: false, code: 'webgpu_unavailable', message: 'This browser does not expose WebGPU. Use a supported browser on a real GPU device.' } };
  let adapter: AdapterLike | null;
  try { adapter = await gpu.requestAdapter(); } catch { adapter = null; }
  if (!adapter) return { report: { ...base, available: false, code: 'webgpu_unavailable', message: 'No WebGPU adapter is available. No model files were requested.' } };
  const i = adapter.info ?? {};
  const info = { vendor: i.vendor ?? '', architecture: i.architecture ?? '', device: i.device ?? '', description: i.description ?? '' };
  const features = Array.from(adapter.features);
  const limits = Object.fromEntries(['maxBufferSize', 'maxStorageBufferBindingSize', 'maxComputeWorkgroupStorageSize', 'maxStorageBuffersPerShaderStage', 'maxComputeInvocationsPerWorkgroup'].map(k => [k, Number(adapter!.limits[k])]));
  const report: DeviceReport = { ...base, adapter: info, features, limits, available: true, message: 'Hardware WebGPU adapter supports shader-f16. Model execution is not yet verified.' };
  if (adapter.isFallbackAdapter || i.isFallbackAdapter || /swiftshader|llvmpipe|software|lavapipe/i.test(Object.values(info).join(' ')))
    return { report: { ...report, available: false, code: 'software_adapter', message: 'A software/fallback GPU adapter was detected. This demo requires real GPU execution and will not download weights.' } };
  if (!adapter.features.has('shader-f16')) return { report: { ...report, available: false, code: 'q8_unsupported', message: 'Kev q8 needs shader-f16; this adapter does not provide it. No alternate model or CPU fallback will be loaded.' } };
  if (limits.maxBufferSize < 32 * 1024 * 1024 || limits.maxStorageBufferBindingSize < 32 * 1024 * 1024)
    return { report: { ...report, available: false, code: 'q8_unsupported', message: 'GPU storage-buffer limits are too small for the pinned q8 bundle.' } };
  return { report, adapter };
}
