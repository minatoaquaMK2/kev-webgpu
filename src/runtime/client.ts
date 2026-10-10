import { RuntimeError, type RuntimeEvent, type WorkerCommand, type WorkerMessage, type DeviceReport, type SystemOneRequest, type TokenUsage, type AnalysisResult } from './protocol';
export class KevClient {
  private worker?: Worker;
  private nextId = 0;
  private unloading?: Promise<void>;
  private pending = new Map<number, {resolve(value: unknown): void; reject(reason: unknown): void}>();
  constructor(private readonly onEvent: (event: RuntimeEvent) => void = () => {}) {}
  private ensureWorker() {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('../workers/inference.worker.ts', import.meta.url), {type:'module',name:'kev-0.8b-q8'});
    worker.onmessage = ({data}: MessageEvent<WorkerMessage>) => {
      if (this.worker !== worker) return;
      if (data.type !== 'reply') { this.onEvent(data); return; }
      const p = this.pending.get(data.id); if (!p) return;
      this.pending.delete(data.id);
      if (data.error) p.reject(new RuntimeError(data.error.code,data.error.message)); else p.resolve(data.value);
    };
    worker.onerror = () => {
      if (this.worker !== worker) return;
      for (const p of this.pending.values()) p.reject(new RuntimeError('inference_failed','The inference Worker stopped. Unload and reload to recover.'));
      this.pending.clear(); worker.terminate(); this.worker = undefined;
      this.onEvent({type:'status',status:'unloaded',message:'The inference Worker stopped. Reload the model to recover.'});
    };
    return this.worker = worker;
  }
  private call<T>(command: Omit<WorkerCommand,'id'>): Promise<T> {
    const id = ++this.nextId;
    return new Promise((resolve,reject) => {
      this.pending.set(id,{resolve: v => resolve(v as T),reject});
      try { this.ensureWorker().postMessage({...command,id}); } catch (error) { this.pending.delete(id); reject(error); }
    });
  }
  probe() { return this.call<DeviceReport>({type:'probe'}); }
  load() { return this.call<{device:DeviceReport; loadMs:number; sessionCreationMs:number; provenance:AnalysisResult['provenance']}>({type:'load'}); }
  measure(request: SystemOneRequest) { return this.call<TokenUsage>({type:'measure',request} as Omit<WorkerCommand,'id'>); }
  analyze(request: SystemOneRequest,evidenceHash:string) { return this.call<AnalysisResult>({type:'analyze',request,evidenceHash} as Omit<WorkerCommand,'id'>); }
  cancel() { return this.call<void>({type:'cancel'}); }
  unload(): Promise<void> {
    if (this.unloading) return this.unloading;
    if (!this.worker) return Promise.resolve();
    const worker = this.worker;
    this.unloading = (async () => {
      try { await this.call<void>({type:'unload'}); } finally {
        worker.terminate();
        if (this.worker === worker) {
          this.worker = undefined;
          for (const p of this.pending.values()) p.reject(new RuntimeError('cancelled','Model unloaded.'));
          this.pending.clear();
        }
      }
    })().finally(() => { this.unloading = undefined; });
    return this.unloading;
  }
  clearModelCache() { return this.call<void>({type:'clearCache'}); }
}
