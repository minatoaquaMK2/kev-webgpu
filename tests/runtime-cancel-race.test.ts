import {it,expect,vi,afterEach} from 'vitest';
const controls=vi.hoisted(()=>({resolveProbe:undefined as undefined|((value:unknown)=>void),load:vi.fn()}));
vi.mock('../src/runtime/device',()=>({inspectDevice:()=>new Promise(resolve=>{controls.resolveProbe=resolve;})}));
vi.mock('onnxruntime-web/webgpu',()=>({env:{wasm:{},webgpu:{profiling:{}},versions:{web:'1.30.0'}},InferenceSession:{create:vi.fn()},Tensor:class{}}));
vi.mock('@ai-ecoverse/kev.js',async(importOriginal)=>({...await importOriginal<object>(),loadKev:controls.load}));
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();controls.load.mockClear();});
it('cancel while requestAdapter is pending prevents any model load',async()=>{
  const worker:{onmessage?: (event:{data:unknown})=>void;postMessage:ReturnType<typeof vi.fn>}={postMessage:vi.fn()};
  vi.stubGlobal('self',worker);
  await import('../src/workers/inference.worker');
  worker.onmessage!({data:{type:'load',id:1}});
  expect(controls.resolveProbe).toBeTypeOf('function');
  worker.onmessage!({data:{type:'cancel',id:2}});
  controls.resolveProbe!({report:{available:true},adapter:{features:new Set(['shader-f16'])}});
  await vi.waitFor(()=>expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({type:'reply',id:1,error:expect.objectContaining({code:'cancelled'})})));
  expect(controls.load).not.toHaveBeenCalled();
});
