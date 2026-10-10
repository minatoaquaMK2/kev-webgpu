/** Demo-specific schema. This is not a Dell or VMware API schema. */
export const MAX_IMPORT_BYTES = 256 * 1024;
export const MAX_SELECTED_EVIDENCE = 12;
export const SOURCES = ['dpc', 'powerstore', 'esxi', 'network', 'operator'] as const;
export type EvidenceSource = typeof SOURCES[number];
export type TemporalState = 'current' | 'historical' | 'unknown';
export type EntityKind = 'workflow' | 'vcenter' | 'host' | 'host_group' | 'initiator' | 'vmkernel' | 'switch_port' | 'storage_port' | 'appliance' | 'volume' | 'datastore';
export interface FactsByKind {
  workflow_event: { phase: string; status: 'success' | 'failed' | 'timeout' | 'unknown'; hostId: string; volumeId: string };
  datastore_access: { hostId: string; volumeId: string; datastoreId: string; operation: 'read' | 'write' | 'read_write' | 'discover'; result: 'success' | 'failed' | 'timeout' | 'not_visible'; latencyMs?: number };
  iscsi_path_state: { hostId: string; applianceId: string; vmk: string; target: string; sessionState: 'established' | 'lost' | 'unknown'; pathState: 'active' | 'dead' | 'unknown' };
  vmkping_result: { hostId: string; applianceId: string; vmk: string; target: string; payloadBytes: number; df: boolean; success: boolean; attempts: number };
  mtu_config: { interfaceId: string; hostId: string; applianceId: string; configuredMtu: number; designMtu: number | null };
  volume_mapping: { hostId: string; hostGroupIds: string[]; initiator: string; volumeId: string; effectiveMappingExists: boolean; inventoryComplete: boolean; directMappingExists: boolean; groupMappings: { hostGroupId: string; volumeId: string; mapped: boolean }[] };
  array_alert: { code: string; identifier: string; status: 'active' | 'cleared' | 'unknown'; applianceId: string; volumeId: string | null; raisedAt: string; clearedAt: string | null; kbReference?: string };
  capacity_snapshot: { objectId: string; metric: 'appliance_physical_used_percent' | 'appliance_user_data_used_percent' | 'appliance_system_data_used_percent' | 'volume_logical_used_percent' | 'vmfs_used_percent' | 'appliance_physical_used_bytes'; value: number; unit: 'percent' | 'bytes'; sampledAt: string };
  link_state: { interfaceId: string; hostId: string; applianceId: string; state: 'up' | 'down' | 'unknown' };
  hardware_state: { applianceId: string; componentId: string; state: 'healthy' | 'faulted' | 'unknown' };
  health_snapshot: { entityIds: string[]; checks: ('service' | 'storage_path' | 'array_alerts' | 'hardware')[]; status: 'healthy' | 'degraded' | 'unknown'; collectionComplete: boolean };
  note: { text: string };
}
export type EvidenceKind = keyof FactsByKind;
export type EvidenceItem = { [K in EvidenceKind]: { id: string; source: EvidenceSource; entityId: string; relatedEntityIds?: string[]; pathId?: string; observedAt: string; temporalState: TemporalState; kind: K; facts: FactsByKind[K]; excerpt?: string } }[EvidenceKind];
export interface EvidenceBundle {
  schemaVersion: '1.0'; synthetic: boolean;
  incident: { id: string; symptom: string; startedAt: string };
  scope: { platform: 'Dell Private Cloud'; hypervisor: 'VMware vSphere'; storage: 'PowerStore'; protocol: 'iSCSI'; datastoreType: 'VMFS'; dpcVersion: string; powerstoreOSVersion: string };
  topology: { entities: { id: string; kind: EntityKind }[]; relations: { from: string; to: string; kind: string; pathId?: string }[] };
  coverage: { source: EvidenceSource; entityId: string; from: string; to: string; completeness: 'complete' | 'partial' | 'unknown' }[];
  evidence: EvidenceItem[];
  demoStages?: { id: string; label: string; evidenceIds: string[] }[];
}
export class EvidenceValidationError extends Error { constructor(message: string) { super(message); this.name = 'EvidenceValidationError'; } }
function fail(path: string, message: string): never { throw new EvidenceValidationError(`${path}: ${message}`); }
function object(v: unknown, p: string): Record<string, unknown> { if (!v || typeof v !== 'object' || Array.isArray(v)) fail(p, 'expected object'); return v as Record<string, unknown>; }
function str(v: unknown, p: string, max = 500): string { if (typeof v !== 'string' || !v.trim() || v.length > max) fail(p, `expected nonempty string ≤ ${max} characters`); return v; }
function bool(v: unknown, p: string): boolean { if (typeof v !== 'boolean') fail(p, 'expected boolean'); return v; }
function num(v: unknown, p: string, min: number, max: number, integer = false): number { if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (integer && !Number.isInteger(v))) fail(p, `expected ${integer ? 'integer' : 'number'} from ${min} to ${max}`); return v; }
function one<T extends string>(v: unknown, a: readonly T[], p: string): T { if (typeof v !== 'string' || !a.includes(v as T)) fail(p, `expected ${a.join(' | ')}`); return v as T; }
function arr(v: unknown, p: string, max = 200): unknown[] { if (!Array.isArray(v) || v.length > max) fail(p, `expected array ≤ ${max} items`); return v; }
function strings(v: unknown, p: string) { return arr(v, p).map((x, i) => str(x, `${p}[${i}]`)); }
function iso(v: unknown, p: string): string { const s = str(v, p); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(s) || !Number.isFinite(Date.parse(s))) fail(p, 'expected ISO 8601 timestamp including timezone'); const [y,m,d]=s.slice(0,10).split('-').map(Number); if(m<1||m>12||d<1||d>new Date(Date.UTC(y,m,0)).getUTCDate()) fail(p,'invalid calendar date'); return s; }
function ipv4(v: unknown, p: string) { const s = str(v, p); if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(s) || s.split('.').some(x => Number(x) > 255)) fail(p, 'expected IPv4 target'); return s; }
const keys: Record<EvidenceKind, string[]> = {
  workflow_event: ['phase','status','hostId','volumeId'],
  datastore_access: ['hostId','volumeId','datastoreId','operation','result','latencyMs'],
  iscsi_path_state: ['hostId','applianceId','vmk','target','sessionState','pathState'],
  vmkping_result: ['hostId','applianceId','vmk','target','payloadBytes','df','success','attempts'],
  mtu_config: ['interfaceId','hostId','applianceId','configuredMtu','designMtu'],
  volume_mapping: ['hostId','hostGroupIds','initiator','volumeId','effectiveMappingExists','inventoryComplete','directMappingExists','groupMappings'],
  array_alert: ['code','identifier','status','applianceId','volumeId','raisedAt','clearedAt','kbReference'],
  capacity_snapshot: ['objectId','metric','value','unit','sampledAt'],
  link_state: ['interfaceId','hostId','applianceId','state'], hardware_state: ['applianceId','componentId','state'],
  health_snapshot: ['entityIds','checks','status','collectionComplete'], note: ['text']
};
function parseFacts(kind: EvidenceKind, input: unknown, p: string): FactsByKind[EvidenceKind] {
  const f = object(input,p); for (const k of Object.keys(f)) if (!keys[kind].includes(k)) fail(`${p}.${k}`, 'unknown fact field');
  const s = (k:string) => str(f[k],`${p}.${k}`), b = (k:string) => bool(f[k],`${p}.${k}`);
  switch(kind) {
    case 'workflow_event': return {phase:s('phase'), status:one(f.status,['success','failed','timeout','unknown'],p+'.status'),hostId:s('hostId'),volumeId:s('volumeId')};
    case 'datastore_access': return {hostId:s('hostId'),volumeId:s('volumeId'),datastoreId:s('datastoreId'),operation:one(f.operation,['read','write','read_write','discover'],p+'.operation'),result:one(f.result,['success','failed','timeout','not_visible'],p+'.result'),...(f.latencyMs === undefined ? {} : {latencyMs:num(f.latencyMs,p+'.latencyMs',0,86400000)})};
    case 'iscsi_path_state': return {hostId:s('hostId'),applianceId:s('applianceId'),vmk:s('vmk'),target:ipv4(f.target,p+'.target'),sessionState:one(f.sessionState,['established','lost','unknown'],p+'.sessionState'),pathState:one(f.pathState,['active','dead','unknown'],p+'.pathState')};
    case 'vmkping_result': return {hostId:s('hostId'),applianceId:s('applianceId'),vmk:s('vmk'),target:ipv4(f.target,p+'.target'),payloadBytes:num(f.payloadBytes,p+'.payloadBytes',0,65507,true),df:b('df'),success:b('success'),attempts:num(f.attempts,p+'.attempts',1,10000,true)};
    case 'mtu_config': return {interfaceId:s('interfaceId'),hostId:s('hostId'),applianceId:s('applianceId'),configuredMtu:num(f.configuredMtu,p+'.configuredMtu',576,65535,true),designMtu:f.designMtu === null ? null : num(f.designMtu,p+'.designMtu',576,65535,true)};
    case 'volume_mapping': {
      const g = arr(f.groupMappings,p+'.groupMappings').map((x,i) => { const o=object(x,p+`.groupMappings[${i}]`); if(Object.keys(o).some(k=>!['hostGroupId','volumeId','mapped'].includes(k))) fail(p+'.groupMappings','unknown field'); return {hostGroupId:str(o.hostGroupId,p+'.hostGroupId'),volumeId:str(o.volumeId,p+'.volumeId'),mapped:bool(o.mapped,p+'.mapped')}; });
      const groups = strings(f.hostGroupIds,p+'.hostGroupIds');
      const direct = b('directMappingExists'), effective = b('effectiveMappingExists'), complete = b('inventoryComplete');
      const inherited = g.some(x => groups.includes(x.hostGroupId) && x.volumeId === f.volumeId && x.mapped);
      if ((direct || inherited) && !effective) fail(p, 'effectiveMappingExists conflicts with direct or inherited mapping');
      if (complete && effective && !direct && !inherited) fail(p, 'complete effective mapping must identify direct or inherited access');
      return {hostId:s('hostId'),hostGroupIds:groups,initiator:s('initiator'),volumeId:s('volumeId'),effectiveMappingExists:effective,inventoryComplete:complete,directMappingExists:direct,groupMappings:g};
    }
    case 'array_alert': {
      const status=one(f.status,['active','cleared','unknown'],p+'.status'); const raisedAt=iso(f.raisedAt,p+'.raisedAt'), clearedAt=f.clearedAt===null?null:iso(f.clearedAt,p+'.clearedAt');
      if(status==='cleared'&&!clearedAt) fail(p,'cleared alert needs clearedAt');
      if(status==='active'&&clearedAt) fail(p,'active alert cannot have clearedAt');
      if(clearedAt&&Date.parse(clearedAt)<Date.parse(raisedAt)) fail(p,'clearedAt precedes raisedAt');
      return {code:s('code'),identifier:s('identifier'),status,applianceId:s('applianceId'),volumeId:f.volumeId===null?null:s('volumeId'),raisedAt,clearedAt,...(f.kbReference===undefined?{}:{kbReference:s('kbReference')})};
    }
    case 'capacity_snapshot': {
      const metric=one(f.metric,['appliance_physical_used_percent','appliance_user_data_used_percent','appliance_system_data_used_percent','volume_logical_used_percent','vmfs_used_percent','appliance_physical_used_bytes'],p+'.metric');
      const unit=one(f.unit,['percent','bytes'],p+'.unit'); if(metric.endsWith('_percent') !== (unit==='percent')) fail(p,'capacity metric and unit disagree');
      return {objectId:s('objectId'),metric,value:num(f.value,p+'.value',0,unit==='percent'?100:Number.MAX_SAFE_INTEGER,unit==='bytes'),unit,sampledAt:iso(f.sampledAt,p+'.sampledAt')};
    }
    case 'link_state': return {interfaceId:s('interfaceId'),hostId:s('hostId'),applianceId:s('applianceId'),state:one(f.state,['up','down','unknown'],p+'.state')};
    case 'hardware_state': return {applianceId:s('applianceId'),componentId:s('componentId'),state:one(f.state,['healthy','faulted','unknown'],p+'.state')};
    case 'health_snapshot': return {entityIds:strings(f.entityIds,p+'.entityIds'),checks:arr(f.checks,p+'.checks').map(x=>one(x,['service','storage_path','array_alerts','hardware'],p+'.checks')),status:one(f.status,['healthy','degraded','unknown'],p+'.status'),collectionComplete:b('collectionComplete')};
    case 'note': return {text:str(f.text,p+'.text',2000)};
  }
}
export function parseEvidenceBundle(input: unknown): EvidenceBundle {
  const o=object(input,'bundle'), incident=object(o.incident,'incident'), scope=object(o.scope,'scope'), topology=object(o.topology,'topology');
  if(o.schemaVersion!=='1.0') fail('schemaVersion','only 1.0 is supported');
  const entities=arr(topology.entities,'topology.entities').map((x,i)=> { const e=object(x,`entities[${i}]`); return {id:str(e.id,'entity.id'),kind:one(e.kind,['workflow','vcenter','host','host_group','initiator','vmkernel','switch_port','storage_port','appliance','volume','datastore'],'entity.kind')}; });
  const entityMap=new Map(entities.map(e=>[e.id,e.kind])); if(entityMap.size!==entities.length) fail('entities','duplicate entity ID');
  const ref=(v:unknown,p:string,expected?:EntityKind[])=>{const s=str(v,p); if(!entityMap.has(s)) fail(p,'unknown entity ID'); if(expected&&!expected.includes(entityMap.get(s)!)) fail(p,'wrong entity kind'); return s;};
  const relations=arr(topology.relations,'topology.relations').map(x=>{const r=object(x,'relation');return{from:ref(r.from,'relation.from'),to:ref(r.to,'relation.to'),kind:str(r.kind,'relation.kind'),...(r.pathId===undefined?{}:{pathId:str(r.pathId,'relation.pathId')})};});
  const coverage=arr(o.coverage,'coverage').map(x=>{const c=object(x,'coverage');const from=iso(c.from,'coverage.from'),to=iso(c.to,'coverage.to');if(Date.parse(from)>Date.parse(to))fail('coverage','from is after to');return{source:one(c.source,SOURCES,'coverage.source'),entityId:ref(c.entityId,'coverage.entityId'),from,to,completeness:one(c.completeness,['complete','partial','unknown'],'coverage.completeness')};});
  const evidence=arr(o.evidence,'evidence',1000).map((x,i)=>{
    const p=`evidence[${i}]`,e=object(x,p),kind=one(e.kind,Object.keys(keys) as EvidenceKind[],p+'.kind');
    const facts=parseFacts(kind,e.facts,p+'.facts');
    const item={id:str(e.id,p+'.id',100),source:one(e.source,SOURCES,p+'.source'),entityId:ref(e.entityId,p+'.entityId'),observedAt:iso(e.observedAt,p+'.observedAt'),temporalState:one(e.temporalState,['current','historical','unknown'],p+'.temporalState'),kind,facts,...(e.relatedEntityIds===undefined?{}:{relatedEntityIds:arr(e.relatedEntityIds,p+'.relatedEntityIds').map(v=>ref(v,p+'.relatedEntityIds'))}),...(e.pathId===undefined?{}:{pathId:str(e.pathId,p+'.pathId')}),...(e.excerpt===undefined?{}:{excerpt:str(e.excerpt,p+'.excerpt',2000)})} as EvidenceItem;
    const f=facts as unknown as Record<string,unknown>;
    for(const [key, kinds] of Object.entries({hostId:['host'],volumeId:['volume'],datastoreId:['datastore'],applianceId:['appliance']})) if(f[key]!==undefined&&f[key]!==null) ref(f[key],p+'.facts.'+key,kinds as EntityKind[]);
    if(kind==='workflow_event') ref(item.entityId,p+'.entityId',['workflow']);
    if(kind==='datastore_access' && item.entityId!==f.hostId) fail(p,'datastore_access entityId must equal hostId');
    if(kind==='hardware_state' && item.entityId!==f.applianceId) fail(p,'hardware_state entityId must equal applianceId');
    if(kind==='mtu_config'||kind==='link_state') ref(item.entityId,p+'.entityId',['vmkernel','switch_port','storage_port']);
    if(kind==='vmkping_result'||kind==='iscsi_path_state') ref(item.entityId,p+'.entityId',['host','vmkernel']);
    if(kind==='health_snapshot') {const h=facts as FactsByKind['health_snapshot'];for(const id of h.entityIds) ref(id,p+'.facts.entityIds');if(!h.entityIds.includes(item.entityId))fail(p,'health snapshot entityId must be included in checked entityIds');if(!h.entityIds.length||!h.checks.length)fail(p,'health snapshot needs explicit objects and checks');}
    if(kind==='volume_mapping') {const m=facts as FactsByKind['volume_mapping'];
      const apOwns=entityMap.get(item.entityId)==='appliance'&&relations.some(r=>r.from===item.entityId&&r.to===m.volumeId&&r.kind==='hosts');
      if(item.entityId!==m.hostId&&item.entityId!==m.volumeId&&!apOwns)fail(p,'volume mapping subject must be its host, volume or hosting appliance');for(const id of m.hostGroupIds)ref(id,p+'.facts.hostGroupIds',['host_group']);for(const g of m.groupMappings){ref(g.hostGroupId,p+'.facts.groupMappings.hostGroupId',['host_group']);ref(g.volumeId,p+'.facts.groupMappings.volumeId',['volume']);}}
    if(kind==='capacity_snapshot'){const c=facts as FactsByKind['capacity_snapshot'];ref(c.objectId,p+'.facts.objectId',[c.metric.startsWith('appliance_')?'appliance':c.metric.startsWith('volume_')?'volume':'datastore']);if(c.objectId!==item.entityId)fail(p,'capacity objectId must equal entityId');if(Math.abs(Date.parse(c.sampledAt)-Date.parse(item.observedAt))>60000)fail(p,'capacity sample differs from observation by over 60 seconds');}
    if(kind==='vmkping_result'||kind==='mtu_config'||kind==='iscsi_path_state'||kind==='link_state') if(!item.pathId)fail(p+'.pathId','required for path observation (use an unknown path ID when not established)');
    if(kind==='mtu_config'||kind==='link_state') if(f.interfaceId!==item.entityId)fail(p,'interfaceId must equal entityId');
    if(kind==='array_alert'){const a=facts as FactsByKind['array_alert'];if(Date.parse(a.raisedAt)>Date.parse(item.observedAt)||(a.clearedAt&&Date.parse(a.clearedAt)>Date.parse(item.observedAt)))fail(p,'alert event occurs after observedAt');if(item.entityId!==a.applianceId&&item.entityId!==a.volumeId)fail(p,'alert entityId must match appliance or volume');}
    return item;
  });
  const evidenceIds=new Set(evidence.map(e=>e.id));if(evidenceIds.size!==evidence.length)fail('evidence','duplicate evidence ID');
  const demoStages=o.demoStages===undefined?undefined:arr(o.demoStages,'demoStages',10).map(x=>{const s=object(x,'stage'),ids=strings(s.evidenceIds,'stage.evidenceIds');if(ids.some(id=>!evidenceIds.has(id)))fail('stage','unknown evidence ID');return{id:str(s.id,'stage.id'),label:str(s.label,'stage.label'),evidenceIds:ids};});
  return {schemaVersion:'1.0',synthetic:bool(o.synthetic,'synthetic'),incident:{id:str(incident.id,'incident.id'),symptom:str(incident.symptom,'incident.symptom',2000),startedAt:iso(incident.startedAt,'incident.startedAt')},scope:{platform:one(scope.platform,['Dell Private Cloud'],'scope.platform'),hypervisor:one(scope.hypervisor,['VMware vSphere'],'scope.hypervisor'),storage:one(scope.storage,['PowerStore'],'scope.storage'),protocol:one(scope.protocol,['iSCSI'],'scope.protocol'),datastoreType:one(scope.datastoreType,['VMFS'],'scope.datastoreType'),dpcVersion:str(scope.dpcVersion,'scope.dpcVersion'),powerstoreOSVersion:str(scope.powerstoreOSVersion,'scope.powerstoreOSVersion')},topology:{entities,relations},coverage,evidence,...(demoStages?{demoStages}:{})};
}
export function parseEvidenceJson(text: string): EvidenceBundle {
  if(new TextEncoder().encode(text).byteLength>MAX_IMPORT_BYTES)fail('bundle','JSON exceeds 256 KiB import limit');
  let parsed:unknown;try{parsed=JSON.parse(text);}catch{fail('bundle','invalid JSON');}return parseEvidenceBundle(parsed);
}
