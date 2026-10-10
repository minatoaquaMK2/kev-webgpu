import {describe,it,expect,vi,afterEach} from 'vitest';
import {MODEL_LOCK,verifyFile,createVerifiedReader,clearModelCache,CACHE_NAME} from '../src/runtime/verified-reader';
import {inspectDevice} from '../src/runtime/device';

afterEach(() => vi.unstubAllGlobals());
describe('immutable q8-only model lock',() => {
  it('pins identities and all33 files with SHA256 and total bytes',() => {
    expect(MODEL_LOCK.variant).toBe('q8'); expect(MODEL_LOCK.vision).toBe(false);
    expect(MODEL_LOCK.bundleCommit).toMatch(/^[a-f0-9]{40}$/);
    expect(MODEL_LOCK.runtimeCommit).toBe('ca072e49e65b716af478db8f464e1fac8a0f4ad5');
    expect(MODEL_LOCK.ortVersion).toBe('1.30.0');
    expect(Object.keys(MODEL_LOCK.files)).toHaveLength(33);
    expect(Object.keys(MODEL_LOCK.files).some(p=>/q8f32|vision|4b|9b/.test(p))).toBe(false);
    expect(Object.values(MODEL_LOCK.files).every(f=>f.bytes>0 && /^[a-f0-9]{64}$/.test(f.sha256))).toBe(true);
    expect(Object.values(MODEL_LOCK.files).reduce((sum,f)=>sum+f.bytes,0)).toBe(826680926);
    expect(MODEL_LOCK.totalBytes).toBe(826680926);
  });
  it('rejects an unlisted precision before network access',async() => {
    const fetch=vi.fn(); vi.stubGlobal('fetch',fetch);
    const read=createVerifiedReader(new AbortController().signal,()=>{});
    await expect(read('r-9a45d25/q8f32/model.onnx')).rejects.toMatchObject({code:'integrity_failed'});
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects incorrect byte lengths and equal-size corrupt bytes',async() => {
    await expect(verifyFile('manifest.json',new Uint8Array(2))).rejects.toMatchObject({code:'integrity_failed'});
    await expect(verifyFile('r-9a45d25/tokenizer_config.json',new Uint8Array(1128))).rejects.toMatchObject({code:'integrity_failed'});
  });
  it('honors cancellation before any read',async() => {
    const fetch=vi.fn(); vi.stubGlobal('fetch',fetch);
    const controller=new AbortController();controller.abort();
    await expect(createVerifiedReader(controller.signal,()=>{})('manifest.json')).rejects.toMatchObject({name:'AbortError'});
    expect(fetch).not.toHaveBeenCalled();
  });
  it('clears only this application model cache',async() => {
    const remove=vi.fn().mockResolvedValue(true);
    vi.stubGlobal('caches',{keys:async()=>[CACHE_NAME,'kev-web-v1','unrelated-app'],delete:remove});
    await clearModelCache();expect(remove.mock.calls).toEqual([[CACHE_NAME]]);
  });
});
function device(features:string[],info:Record<string,string>={},limits:Record<string,number>={maxBufferSize:268435456,maxStorageBufferBindingSize:134217728}) {
  vi.stubGlobal('isSecureContext',true);vi.stubGlobal('crossOriginIsolated',false);
  vi.stubGlobal('navigator',{gpu:{requestAdapter:async()=>({features:new Set(features),info,limits})}});
}
describe('pre-download hardware capability checks',() => {
  it('requires secure context',async()=>{vi.stubGlobal('isSecureContext',false);expect((await inspectDevice()).report.code).toBe('webgpu_unavailable');});
  it('requires a WebGPU adapter',async()=>{vi.stubGlobal('isSecureContext',true);vi.stubGlobal('navigator',{});expect((await inspectDevice()).report.available).toBe(false);});
  it('rejects software rendering despite shader-f16',async()=>{device(['shader-f16'],{description:'SwiftShader Device'});expect((await inspectDevice()).report.code).toBe('software_adapter');});
  it('rejects missing shader-f16 without offering another model',async()=>{device([]);expect((await inspectDevice()).report.code).toBe('q8_unsupported');});
  it('rejects insufficient limits',async()=>{device(['shader-f16'],{},{maxBufferSize:8,maxStorageBufferBindingSize:8});expect((await inspectDevice()).report.code).toBe('q8_unsupported');});
  it('accepts hardware f16 without requiring isolation, but does not claim inference',async()=>{device(['shader-f16'],{vendor:'Test hardware'});const {report}=await inspectDevice();expect(report.available).toBe(true);expect(report.crossOriginIsolated).toBe(false);expect(report.message).toContain('not yet verified');});
});

import {KevClient} from '../src/runtime/client';
class ControlledWorker {
  static instances:ControlledWorker[]=[];
  onmessage?: (event:{data:unknown})=>void;
  onerror?: ()=>void;
  commands:Record<string,unknown>[]=[];
  terminated=false;
  constructor(..._args:unknown[]){ControlledWorker.instances.push(this);}
  postMessage(command:Record<string,unknown>){this.commands.push(command);}
  terminate(){this.terminated=true;}
  reply(value?:unknown){const command=this.commands.at(-1)!;this.onmessage?.({data:{type:'reply',id:command.id,value}});}
}
describe('client lifecycle without model simulation',()=>{
  it('creates one Worker and deduplicates concurrent unload requests',async()=>{
    ControlledWorker.instances=[];vi.stubGlobal('Worker',ControlledWorker);
    const client=new KevClient();const pending=client.probe();const worker=ControlledWorker.instances[0];worker.reply({available:false});await pending;
    const a=client.unload(),b=client.unload();expect(a).toBe(b);expect(worker.commands.filter(c=>c.type==='unload')).toHaveLength(1);
    worker.reply();await a;expect(worker.terminated).toBe(true);expect(ControlledWorker.instances).toHaveLength(1);
  });
  it('rejects pending work and publishes unloaded when Worker crashes',async()=>{
    ControlledWorker.instances=[];vi.stubGlobal('Worker',ControlledWorker);const events:unknown[]=[];
    const client=new KevClient(e=>events.push(e));const pending=client.probe();const rejection=expect(pending).rejects.toMatchObject({code:'inference_failed'});
    ControlledWorker.instances[0].onerror?.();await rejection;expect(events).toContainEqual(expect.objectContaining({type:'status',status:'unloaded'}));
    const next=client.probe();expect(ControlledWorker.instances).toHaveLength(2);ControlledWorker.instances[1].reply({available:false});await next;
  });
  it('requests cancellation without terminating a submitted GPU operation',async()=>{
    ControlledWorker.instances=[];vi.stubGlobal('Worker',ControlledWorker);const client=new KevClient();const pending=client.cancel();const worker=ControlledWorker.instances[0];
    expect(worker.commands[0].type).toBe('cancel');expect(worker.terminated).toBe(false);worker.reply();await pending;
  });
});
it('ignores callbacks from an old terminated Worker',async()=>{
  ControlledWorker.instances=[];vi.stubGlobal('Worker',ControlledWorker);const events:unknown[]=[];const client=new KevClient(e=>events.push(e));
  const first=client.probe();const old=ControlledWorker.instances[0];old.reply({available:false});await first;
  const unload=client.unload();old.reply();await unload;
  const next=client.probe();const current=ControlledWorker.instances[1];const before=events.length;
  old.onerror?.();old.onmessage?.({data:{type:'status',status:'unloaded',message:'stale'}});
  expect(events).toHaveLength(before);expect(current.terminated).toBe(false);current.reply({available:false});await next;
});
