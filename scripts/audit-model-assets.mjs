#!/usr/bin/env node
/** Reproduce metadata/dtype/token-budget checks; never downloads model weight shards or runs inference.
 * Run: node scripts/audit-model-assets.mjs
 * Optional: KEV_AUDIT_CACHE=/path/to/cache for reusing the four verified audit assets.
 */
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
import {Tokenizer} from '@huggingface/tokenizers';
import {encode,toRecord} from '@ai-ecoverse/kev.js';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const lock=JSON.parse(await readFile(join(root,'src/runtime/model-lock.json'),'utf8'));
const cache=process.env.KEV_AUDIT_CACHE??await mkdtemp(join(tmpdir(),'kev-asset-audit-'));
await mkdir(cache,{recursive:true});await mkdir(join(root,'results'),{recursive:true});
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const assetAudits=[];
async function asset(path){
 const expected=lock.files[path]; if(!expected)throw new Error(`Unlisted asset ${path}`);
 const local=join(cache,path.replaceAll('/','_'));let bytes;
 try{bytes=await readFile(local);}catch{}
 if(!bytes||bytes.length!==expected.bytes||sha256(bytes)!==expected.sha256){
  const response=await fetch(`${lock.baseUrl}/${path}`,{signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw new Error(`${path}: HTTP ${response.status}`);
  bytes=Buffer.from(await response.arrayBuffer());
 }
 const digest=sha256(bytes);
 if(bytes.length!==expected.bytes||digest!==expected.sha256)throw new Error(`Integrity mismatch: ${path}`);
 await writeFile(local,bytes);
 assetAudits.push({path,source:`${lock.baseUrl}/${path}`,bytes:bytes.length,sha256:digest,status:'verified'});
 return bytes;
}
const manifest=JSON.parse(await asset('manifest.json'));
const tokenizerJson=JSON.parse(await asset(manifest.files.tokenizer));
const tokenizerConfig=JSON.parse(await asset(manifest.files.tokenizer_config));
const graphBytes=await asset(manifest.variants.q8.model);
const require=createRequire(import.meta.url);
const {onnx}=require(join(root,'node_modules/onnxruntime-web/lib/onnxjs/ort-schema/protobuf/onnx.js'));
const graph=onnx.ModelProto.decode(graphBytes).graph;
const dtype={1:'float32',2:'uint8',3:'int8',7:'int64',10:'float16'};
const counts=values=>Object.fromEntries([...new Set(values)].sort().map(value=>[value,values.filter(v=>v===value).length]));
const tensorInfo=v=>({name:v.name,elementType:dtype[v.type?.tensorType?.elemType]??v.type?.tensorType?.elemType});
const assetResult={status:'passed',measuredAt:new Date().toISOString(),bundleCommit:lock.bundleCommit,checkpoint:lock.checkpoint,runtimeVersion:lock.runtimeVersion,runtimeCommit:lock.runtimeCommit,ortVersion:lock.ortVersion,fullWeightShardsDownloaded:false,inferenceRun:false,assets:assetAudits,graph:{initializerDtypes:counts(graph.initializer.map(v=>dtype[v.dataType]??String(v.dataType))),operators:counts(graph.node.map(n=>n.opType)),inputs:graph.input.map(tensorInfo),outputs:graph.output.map(tensorInfo),largestInitializerElements:Math.max(...graph.initializer.map(t=>t.dims.reduce((n,d)=>n*Number(d),1)))}};
await writeFile(join(root,'results/graph-audit.json'),JSON.stringify(assetResult,null,2)+'\n');
const tokenizer=new Tokenizer(tokenizerJson,tokenizerConfig);
const server=await createServer({root,server:{middlewareMode:true},appType:'custom'});
try{
 const {buildQuestionRequest}=await server.ssrLoadModule('/src/app/request.ts');
 const {parseEvidenceBundle}=await server.ssrLoadModule('/src/evidence/index.ts');
 const {buildValidationInputs}=await server.ssrLoadModule('/tests/model-validation/variants.ts');
 const base={},fixtureDigests={};
 for(let n=1;n<=8;n++){const id=`case-${String(n).padStart(2,'0')}`;const bytes=await readFile(join(root,`public/cases/${id}.json`));fixtureDigests[id]=sha256(bytes);base[id]=parseEvidenceBundle(JSON.parse(bytes));}
 const inputs=buildValidationInputs(base);if(inputs.length!==34)throw new Error(`Expected34 inputs, got${inputs.length}`);
 const rows=[];
 for(const input of inputs)for(const question of ['probable_cause','next_check']){
  const request=buildQuestionRequest(input.bundle,input.bundle.evidence.map(e=>e.id),question);
  const record=toRecord(request).record;
  // Measure whole inputs first: generous limits here do NOT truncate. Enforce app budgets below.
  const enc=encode(tokenizer,record,manifest.special,{maxState:65536,maxBranch:73728,strict:true});
  const statePlusBranchTokens=Math.max(...enc.branches.map(b=>enc.state.length+b.ids.length));
  rows.push({id:input.id,baselineId:input.baselineId,transformation:input.transformation,question,stateTokens:enc.stateTokens,statePlusBranchTokens,totalTokens:enc.tokens,stateSha256:sha256(Buffer.from(record.state)),pass:enc.stateTokens<=1024&&statePlusBranchTokens<=1536&&!enc.stateTruncated});
 }
 const report={status:rows.every(r=>r.pass)?'passed':'failed',measuredAt:new Date().toISOString(),tokenizerSha256:lock.files[manifest.files.tokenizer].sha256,runtimeVersion:lock.runtimeVersion,runtimeCommit:lock.runtimeCommit,measurement:'Actual Kev encode(toRecord(productionRequest)), including special tokens. No inference; no truncation. Both production question types tested.',budgets:{state:1024,statePlusBranch:1536},fixtureDigests,inputCount:inputs.length,questionCount:rows.length,rows};
 await writeFile(join(root,'results/encoder-variant-budget-results.json'),JSON.stringify(report,null,2)+'\n');
 const baseRows=rows.filter(r=>r.transformation==='base-case'||r.transformation==='base-stage');
 await writeFile(join(root,'results/encoder-budget-results.json'),JSON.stringify({...report,status:baseRows.every(r=>r.pass)?'passed':'failed',inputCount:10,questionCount:baseRows.length,rows:baseRows},null,2)+'\n');
 console.log(JSON.stringify({assets:assetAudits.length,fullWeightShardsDownloaded:false,inputCount:inputs.length,questionCount:rows.length,status:report.status,maxState:Math.max(...rows.map(r=>r.stateTokens)),maxBranch:Math.max(...rows.map(r=>r.statePlusBranchTokens)),failures:rows.filter(r=>!r.pass)},null,2));
 if(report.status!=='passed')process.exitCode=1;
}finally{await server.close();}
