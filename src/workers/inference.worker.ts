/// <reference lib="webworker" />
import * as ort from 'onnxruntime-web/webgpu';
import wasm from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import mjs from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url';
import { loadKev, toRecord, validate, ContextOverflow, type Kev, type OrtModule } from '@ai-ecoverse/kev.js';
import type { InferenceSession } from 'onnxruntime-common';
import { inspectDevice } from '../runtime/device';
import { createVerifiedReader, clearModelCache, MODEL_LOCK as lock } from '../runtime/verified-reader';
import { RuntimeError, type WorkerCommand, type WorkerMessage, type RuntimeEvent, type RuntimeErrorCode, type TokenUsage, type AnalysisResult, type SystemOneRequest, type GpuProof } from '../runtime/protocol';

ort.env.wasm.wasmPaths = { wasm, mjs };
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.logLevel = 'warning';
let kev: Kev | undefined;
let active: Promise<unknown> | undefined;
let busy = false;
let controller: AbortController | undefined;
let generation = 0;
let unloading = false;
let deviceLost = false;
let gpuTensorOutputs = 0;
let kernelCount = 0;
const kernelTypes = new Set<string>();
let rawProbabilities: number[][] | undefined;
const post = (m: WorkerMessage) => self.postMessage(m);
const emit = (m: RuntimeEvent) => post(m);
const provenance = (): AnalysisResult['provenance'] => ({checkpoint:lock.checkpoint,bundleCommit:lock.bundleCommit,bundleRevision:lock.bundleRevision,variant:'q8',runtimeCommit:lock.runtimeCommit,runtimeVersion:lock.runtimeVersion,ortVersion:lock.ortVersion,temperature:kev?.temperature ?? lock.temperature});
const resetProof = () => { gpuTensorOutputs = 0; kernelCount = 0; kernelTypes.clear(); };
function proof(): GpuProof {
  const types = [...kernelTypes].sort();
  const largeComputeObserved = types.some(t => /matmul|gemm|attention/i.test(t));
  return {executionProviders:['webgpu'],gpuTensorOutputs,kernelCount,kernelTypes:types,largeComputeObserved,verification:largeComputeObserved ? 'gpu_backbone_observed' : gpuTensorOutputs > 0 ? 'gpu_outputs_observed_profiling_unavailable' : 'not_verified'};
}
function checkedRequest(input: unknown): SystemOneRequest {
  const req = validate(input);
  if (typeof req.state !== 'string' || req.image !== undefined) throw new RuntimeError('input_limit','Only a text state is allowed. Images are not supported.');
  if (Object.keys(req.questions).length !== 1) throw new RuntimeError('input_limit','Run exactly one question per user action.');
  const question = Object.values(req.questions)[0];
  if (question.type !== 'choice' || Object.keys(question.criteria).length > 8) throw new RuntimeError('input_limit','This demo accepts a choice question with no more than eight options.');
  // Explicit identity avoids upstream's generic default "kev-latest" in the response.
  return {...req,model:`jaredpalmer/kev-0.8b@${lock.checkpoint}:text:q8`};
}
function measure(input: unknown): TokenUsage {
  if (!kev) throw new RuntimeError('not_loaded','Load the model first to measure actual Kev tokens.');
  const req = checkedRequest(input);
  const enc = kev.encode(toRecord(req).record);
  return {stateTokens:enc.stateTokens,branchTokens:enc.branches.map(b => enc.state.length + b.ids.length),totalTokens:enc.tokens};
}
function errorResult(error: unknown): {code: RuntimeErrorCode;message:string} {
  if (error instanceof RuntimeError) return {code:error.code,message:error.message};
  if (error instanceof ContextOverflow) return {code:'input_limit',message:`Actual Kev encoding exceeds the 1,024 state / 1,536 state-plus-question token budget. ${error.message} Nothing was truncated.`};
  if (error instanceof DOMException && error.name === 'AbortError') return {code:'cancelled',message:'Download cancelled. Completed verified cache files can be reused.'};
  const message = error instanceof Error ? error.message : String(error);
  if (/out.of.memory|allocation|buffer.*size|memory access/i.test(message)) return {code:'gpu_allocation_failed',message:'GPU memory allocation failed. Unload, close other GPU-heavy tabs and retry on a suitable device.'};
  if (/device.*lost/i.test(message)) return {code:'device_lost',message:'GPU device was lost. Unload and reload the model.'};
  return {code:'inference_failed',message};
}
async function load() {
  if (kev) throw new RuntimeError('busy','The one permitted model session is already loaded. Unload it before loading again.');
  const epoch = generation;
  const {report,adapter} = await inspectDevice();
  if (epoch !== generation) throw new RuntimeError('cancelled','Loading was cancelled during the device capability check. No model files were requested.');
  if (!report.available || !adapter) throw new RuntimeError(report.code ?? 'webgpu_unavailable',report.message);
  if (ort.env.versions.web !== lock.ortVersion) throw new RuntimeError('model_unavailable',`ORT identity mismatch: expected ${lock.ortVersion}.`);
  ort.env.webgpu.adapter = adapter;
  ort.env.webgpu.profiling.mode = adapter.features.has('timestamp-query') ? 'default' : 'off';
  ort.env.webgpu.profiling.ondata = (data) => { kernelCount++; kernelTypes.add(data.kernelType); kernelTypes.add(data.programName); };
  if (!adapter.features.has('timestamp-query')) emit({type:'warning',code:'profiling_unavailable',message:'GPU timestamps are unavailable; execution-provider logs and GPU output checks will be recorded, but full GPU-kernel verification may remain incomplete.'});
  deviceLost = false;
  controller = new AbortController();
  const signal = controller.signal;
  const t0 = performance.now();
  emit({type:'status',status:'loading',message:'Loading only the pinned Kev-0.8B text q8 bundle.'});
  let sessionCreationMs = 0;
  const instrumentedOrt: OrtModule = {
    Tensor:ort.Tensor,
    InferenceSession:{create: async (model,options) => {
      signal.throwIfAborted();
      const sessionStarted = performance.now();
      const session = await ort.InferenceSession.create(model as Uint8Array<ArrayBuffer>,options);
      sessionCreationMs += performance.now() - sessionStarted;
      if (signal.aborted) { await session.release(); signal.throwIfAborted(); }
      // Instrument only output locations; never alter tensors, probabilities or provider assignment.
      return new Proxy(session,{get(target,key) {
        if (key === 'run') return async (...args: unknown[]) => {
          const outputs = await (target.run as (...args: unknown[]) => Promise<InferenceSession.ReturnType>).apply(target,args);
          for (const tensor of Object.values(outputs)) if (tensor.location === 'gpu-buffer') gpuTensorOutputs++;
          return outputs;
        };
        const value = Reflect.get(target,key,target); return typeof value === 'function' ? value.bind(target) : value;
      }});
    }},
  };
  let loaded: Kev | undefined;
  try {
    loaded = await loadKev(createVerifiedReader(signal,emit),{
      ort:instrumentedOrt,variant:'q8',vision:false,executionProviders:['webgpu'],
      stateCacheSize:0,maxState:1024,maxBranch:1536,truncateStates:false,dateFacts:false,concurrency:2,
      onPhase:phase => emit({type:'phase',phase}),
      sessionOptions:{logSeverityLevel:1,logVerbosityLevel:0},
    });
    if (epoch !== generation || signal.aborted) { await loaded.release(); loaded = undefined; throw new RuntimeError('cancelled','Loading was cancelled before the session became ready.'); }
    if (loaded.variant !== 'q8' || loaded.acceptsImages || loaded.manifest.revision !== lock.bundleRevision || loaded.manifest.run !== `${lock.model}@${lock.checkpoint}` || loaded.manifest.variants.q8.io_dtype !== 'float16') throw new RuntimeError('integrity_failed','Loaded model identity does not match the pinned q8-only lock.');
    kev = loaded;
    // Observe the public upstream primitive invoked by systemOne without running a second inference.
    const original = loaded.probsEncoded.bind(loaded);
    loaded.probsEncoded = async (...args: Parameters<Kev['probsEncoded']>) => {
      const probabilities = await original(...args);
      rawProbabilities = probabilities.map(row => [...row]);
      return probabilities;
    };
    const device = await ort.env.webgpu.device;
    if (device && typeof device === 'object' && 'lost' in device) {
      (device as {lost:Promise<{message?:string}>}).lost.then(info => {
        if (kev === loaded && !unloading) { deviceLost = true; generation++; emit({type:'deviceLost',message:info.message || 'GPU device lost. Unload and reload before analyzing again.'}); }
      });
    }
    emit({type:'status',status:'ready',message:'Model loaded. GPU backbone execution will be checked on the first real analysis.'});
    return {device:report,loadMs:performance.now()-t0,sessionCreationMs,provenance:provenance()};
  } catch(error) {
    controller?.abort();
    if (loaded) await loaded.release().catch(() => {});
    kev = undefined; throw error;
  } finally { controller = undefined; }
}
async function analyze(input: SystemOneRequest,evidenceHash:string): Promise<AnalysisResult> {
  if (!kev) throw new RuntimeError('not_loaded','Load the pinned q8 model first.');
  if (deviceLost) throw new RuntimeError('device_lost','GPU device lost. Unload and reload before analyzing again.');
  const req = checkedRequest(input);
  const usage = measure(req);
  const epoch = generation;
  resetProof(); rawProbabilities = undefined;
  emit({type:'status',status:'running',message:'Running one real Kev question locally.'});
  const start = performance.now();
  const response = await kev.systemOne(req);
  // Profiling mapAsync callbacks may lag session.run. Drain submitted work before
  // snapshotting kernel evidence; this does not submit another inference.
  const usedDevice = await ort.env.webgpu.device;
  if (usedDevice && typeof usedDevice === 'object' && 'queue' in usedDevice) {
    await (usedDevice as {queue:{onSubmittedWorkDone():Promise<void>}}).queue.onSubmittedWorkDone();
    await new Promise(resolve => setTimeout(resolve,0));
  }
  const wallMs = performance.now()-start;
  if (epoch !== generation) throw new RuntimeError('cancelled','The result was cancelled and discarded. A submitted GPU task may have completed before cancellation.');
  const gpuProof = proof();
  if (!gpuProof.largeComputeObserved && gpuProof.gpuTensorOutputs === 0)
    throw new RuntimeError('inference_failed','No GPU kernel or GPU-backed output was observed. The result is not presented as verified WebGPU inference.');
  emit({type:'status',status:'ready',message:'Analysis complete. Model probabilities are unchanged.'});
  return {response,evidenceHash,usage,wallMs,timing:{...kev.timing},provenance:provenance(),gpuProof,unroundedProbabilities:rawProbabilities ?? null};
}
async function run(command: WorkerCommand) {
  if (command.type === 'cancel') {
    generation++; controller?.abort();
    emit({type:'status',status:'cancelled',message:'Cancellation requested. Already submitted GPU work cannot be preempted; its result will be discarded.'});
    return;
  }
  if (command.type === 'unload') {
    if (unloading) throw new RuntimeError('busy','Model unload is already in progress.');
    unloading = true; generation++; controller?.abort();
    try { await active?.catch(() => {}); await kev?.release(); kev = undefined; emit({type:'status',status:'unloaded',message:'Session released and application references cleared; driver memory release timing is not guaranteed.'}); }
    finally { unloading = false; }
    return;
  }
  if (busy || unloading) throw new RuntimeError('busy','One operation is already running. Wait for it to finish or cancel it.');
  if (command.type === 'probe') return (await inspectDevice()).report;
  if (command.type === 'clearCache') { await clearModelCache(); return; }
  if (command.type === 'measure') return measure(command.request);
  busy = true;
  active = command.type === 'load' ? load() : analyze(command.request,command.evidenceHash);
  try { return await active; } finally { busy = false; active = undefined; }
}
self.onmessage = ({data}: MessageEvent<WorkerCommand>) => {
  void run(data).then(value => post({type:'reply',id:data.id,value}),error => post({type:'reply',id:data.id,error:errorResult(error)}));
};
