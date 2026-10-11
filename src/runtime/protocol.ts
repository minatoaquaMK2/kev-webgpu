import type { SystemOneRequest, SystemOneResponse } from '@ai-ecoverse/kev.js';
export type { SystemOneRequest, SystemOneResponse };
export type RuntimeErrorCode = 'webgpu_unavailable' | 'q8_unsupported' | 'software_adapter' | 'download_failed' | 'integrity_failed' | 'model_unavailable' | 'gpu_allocation_failed' | 'device_lost' | 'input_limit' | 'not_loaded' | 'busy' | 'cancelled' | 'inference_failed';
export interface DeviceReport {
  available: boolean; code?: RuntimeErrorCode; message: string;
  secureContext: boolean; crossOriginIsolated: boolean;
  adapter?: { vendor: string; architecture: string; device: string; description: string };
  features?: string[]; limits?: Record<string, number>;
}
export interface TokenUsage { stateTokens: number; branchTokens: number[]; totalTokens: number }
export interface GpuProof { executionProviders: ['webgpu']; gpuTensorOutputs: number; kernelCount: number; kernelTypes: string[]; commands?: { available: boolean; dispatches: number; submissions: number; pipelineLabels: string[]; method: 'public-WebGPU-command-observation' }; largeComputeObserved: boolean; verification: 'gpu_backbone_observed' | 'gpu_outputs_observed_profiling_unavailable' | 'not_verified' }
export interface AnalysisResult {
  response: SystemOneResponse; evidenceHash: string; usage: TokenUsage; wallMs: number;
  timing: { preprocess: number; vision: number; state: number; branches: number; cached: boolean; imageTokens: number };
  provenance: { checkpoint: string; bundleCommit: string; bundleRevision: string; variant: 'q8'; runtimeCommit: string; runtimeVersion: string; ortVersion: string; temperature: number };
  gpuProof: GpuProof;
  unroundedProbabilities: number[][] | null;
}
export type RuntimeEvent =
  | { type: 'phase'; phase: string }
  | { type: 'progress'; file: string; loaded: number; total: number; aggregateLoaded: number; aggregateTotal: number; cached: boolean }
  | { type: 'status'; status: 'loading' | 'ready' | 'running' | 'unloaded' | 'cancelled'; message: string }
  | { type: 'warning'; code: string; message: string }
  | { type: 'deviceLost'; message: string };
export type WorkerCommand =
  | { id: number; type: 'probe' }
  | { id: number; type: 'load' }
  | { id: number; type: 'unload' }
  | { id: number; type: 'clearCache' }
  | { id: number; type: 'measure'; request: SystemOneRequest }
  | { id: number; type: 'analyze'; request: SystemOneRequest; evidenceHash: string }
  | { id: number; type: 'cancel' };
export type WorkerMessage = { type: 'reply'; id: number; value?: unknown; error?: { code: RuntimeErrorCode; message: string } } | RuntimeEvent;
export class RuntimeError extends Error {
  constructor(public readonly code: RuntimeErrorCode, message: string) { super(message); this.name = 'RuntimeError'; }
}
