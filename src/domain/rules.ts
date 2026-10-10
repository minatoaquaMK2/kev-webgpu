import { type EvidenceBundle, type EvidenceItem, type EvidenceKind, normalizeBundle, selectEvidence } from '../evidence';
import { CANDIDATES, type CandidateId } from './pack';
export const CORRELATION_WINDOW_MS = 5 * 60 * 1000;
export type ReviewStatus = 'candidate_supported' | 'needs_more_evidence' | 'conflicting_evidence' | 'no_active_incident';
export interface CandidateEvidence {
  candidateId: CandidateId;
  supportingIds: string[];
  contradictingIds: string[];
  missingObservations: string[];
  findings: string[];
}
export interface EvidenceReport {
  candidates: CandidateEvidence[];
  conflicts: string[];
  humanReviewRequired: true;
  associationWindowMinutes: number;
  review: (selectedId: string) => ReviewStatus;
}
type Of<K extends EvidenceKind> = Extract<EvidenceItem,{kind:K}>;
function ids(items: EvidenceItem[]) {return [...new Set(items.map(x=>x.id))];}
function near(a: EvidenceItem,b: EvidenceItem) { return Math.abs(Date.parse(a.observedAt)-Date.parse(b.observedAt))<=CORRELATION_WINDOW_MS; }
export function evaluateEvidence(bundle: EvidenceBundle, selectedIds?: readonly string[]): EvidenceReport {
  const b=normalizeBundle(bundle), all=selectEvidence(b,selectedIds);
  const current=all.filter(e=>e.temporalState==='current'&&Date.parse(e.observedAt)>=Date.parse(b.incident.startedAt)-CORRELATION_WINDOW_MS);
  const kind=<K extends EvidenceKind>(k:K)=>current.filter((e):e is Of<K>=>e.kind===k);
  const result=Object.fromEntries(CANDIDATES.map(c=>[c.id,{candidateId:c.id,supportingIds:[],contradictingIds:[],missingObservations:[],findings:[]} ])) as unknown as Record<CandidateId,CandidateEvidence>;
  const add=(id:CandidateId,type:'supportingIds'|'contradictingIds',ev:EvidenceItem[])=> { result[id][type]=[...new Set([...result[id][type],...ids(ev)])]; };
  const failures=kind('datastore_access').filter(e=>e.facts.result!=='success');
  const workflows=kind('workflow_event').filter(e=>e.facts.status==='failed'||e.facts.status==='timeout');
  const affected=[...failures,...workflows].map(e=>({host:e.facts.hostId,volume:e.facts.volumeId,e}));
  const hostsVolume=(appliance:string,volume:string)=>b.topology.relations.some(r=>r.from===appliance&&r.to===volume&&r.kind==='hosts');
  const relevant=(host:string,appliance:string,e:EvidenceItem)=>affected.some(a=>a.host===host&&hostsVolume(appliance,a.volume)&&near(a.e,e));
  const mappedTarget=(host:string,volume:string,e:EvidenceItem)=>affected.some(a=>a.host===host&&a.volume===volume&&near(a.e,e));
  const complete=(e:EvidenceItem)=>b.coverage.some(c=>c.source===e.source&&c.entityId===e.entityId&&c.completeness==='complete'&&Date.parse(c.from)<=Date.parse(e.observedAt)&&Date.parse(c.to)>=Date.parse(e.observedAt));
  const knownPath=(e:EvidenceItem,host:string,appliance:string)=>{
    if(!e.pathId)return false;const edges=b.topology.relations.filter(r=>r.pathId===e.pathId);if(!edges.some(r=>r.from===e.entityId||r.to===e.entityId))return false;
    const seen=new Set([host]);let change=true;while(change){change=false;for(const r of edges)if(seen.has(r.from)||seen.has(r.to)){for(const id of [r.from,r.to])if(!seen.has(id)){seen.add(id);change=true;}}}
    return seen.has(appliance)&&seen.has(e.entityId);
  };
  const pathFacts=(e:Of<'vmkping_result'>|Of<'mtu_config'>|Of<'link_state'>|Of<'iscsi_path_state'>)=>knownPath(e,e.facts.hostId,e.facts.applianceId)&&relevant(e.facts.hostId,e.facts.applianceId,e)&&((e.kind!=='vmkping_result'&&e.kind!=='iscsi_path_state')||e.entityId===e.facts.hostId||b.topology.relations.some(r=>r.from===e.facts.hostId&&r.to===e.entityId&&r.kind==='uses'));
  const pings=kind('vmkping_result'), mtus=kind('mtu_config');
  const sameProbe=(a:Of<'vmkping_result'>,c:Of<'vmkping_result'>)=>a.pathId===c.pathId&&a.facts.hostId===c.facts.hostId&&a.facts.applianceId===c.facts.applianceId&&a.facts.vmk===c.facts.vmk&&a.facts.target===c.facts.target&&near(a,c);
  const failedJumbo=pings.filter(e=>e.facts.df&&!e.facts.success&&e.facts.payloadBytes>1472);
  for(const jumbo of failedJumbo){
    const small=pings.find(e=>e.facts.success&&e.facts.df&&e.facts.payloadBytes<=1472&&sameProbe(e,jumbo));
    if(small&&pathFacts(jumbo)&&pathFacts(small)){add('storage_network_mtu_mismatch','supportingIds',[small,jumbo]);result.storage_network_mtu_mismatch.findings.push('Matched small DF probe passed and jumbo DF probe failed. This supports path-MTU verification, not identification of a particular hop.');}
  }
  const mismatches=mtus.filter(e=>e.facts.designMtu!==null&&e.facts.configuredMtu<e.facts.designMtu&&pathFacts(e));
  for(const m of mismatches){
    const peer=mtus.find(e=>e.id!==m.id&&e.pathId===m.pathId&&e.facts.hostId===m.facts.hostId&&e.facts.applianceId===m.facts.applianceId&&e.facts.designMtu===m.facts.designMtu&&e.facts.configuredMtu===e.facts.designMtu&&near(e,m)&&pathFacts(e));
    if(peer){add('storage_network_mtu_mismatch','supportingIds',[m,peer]);result.storage_network_mtu_mismatch.findings.push(`Actual-path interface ${m.facts.interfaceId} is configured below the shared design MTU. Manual verification is still required.`);}
  }
  for(const e of pings.filter(e=>e.facts.success&&e.facts.df&&e.facts.payloadBytes>=8972&&pathFacts(e)))add('storage_network_mtu_mismatch','contradictingIds',[e]);
  if(!result.storage_network_mtu_mismatch.supportingIds.length)result.storage_network_mtu_mismatch.missingObservations.push('Matched small/jumbo DF probes on the affected source, target, vmkernel, actual path and five-minute window');
  if(!mismatches.length)result.storage_network_mtu_mismatch.missingObservations.push('Actual-path interface configuration and shared design MTU to locate the mismatch');
  if(failedJumbo.some(e=>!knownPath(e,e.facts.hostId,e.facts.applianceId)))result.storage_network_mtu_mismatch.missingObservations.push('Verified topology linking the tested source and target through the stated path');

  for(const e of kind('link_state'))if(pathFacts(e))add('storage_network_connectivity_loss',e.facts.state==='down'?'supportingIds':'contradictingIds',e.facts.state==='unknown'?[]:[e]);
  for(const e of kind('iscsi_path_state'))if(pathFacts(e)){
    if(e.facts.sessionState==='lost'||e.facts.pathState==='dead')add('storage_network_connectivity_loss','supportingIds',[e]);
    else if(e.facts.sessionState==='established'&&e.facts.pathState==='active')add('storage_network_connectivity_loss','contradictingIds',[e]);
  }
  if(!result.storage_network_connectivity_loss.supportingIds.length)result.storage_network_connectivity_loss.missingObservations.push('Current failed link/session observation on the affected actual path');
  result.storage_network_connectivity_loss.findings.push('An established iSCSI session alone does not establish usable volume mapping. A failed path does not identify VLAN, ACL or transceiver cause.');

  for(const e of kind('volume_mapping')){
    const f=e.facts;if(!mappedTarget(f.hostId,f.volumeId,e))continue;
    const initiatorKnown=b.topology.relations.some(r=>r.from===f.hostId&&r.to===f.initiator&&r.kind==='initiator');
    const topologyGroups=b.topology.relations.filter(r=>r.from===f.hostId&&r.kind==='member_of').map(r=>r.to);
    const groupKnown=f.hostGroupIds.every(g=>topologyGroups.includes(g))&&(!f.inventoryComplete||topologyGroups.every(g=>f.hostGroupIds.includes(g)));
    if(!initiatorKnown||!groupKnown){result.host_volume_mapping_gap.missingObservations.push('Verified actual initiator and host-group membership');continue;}
    if(f.effectiveMappingExists)add('host_volume_mapping_gap','contradictingIds',[e]);
    else if(f.inventoryComplete&&complete(e))add('host_volume_mapping_gap','supportingIds',[e]);
    else result.host_volume_mapping_gap.missingObservations.push('Complete effective mapping inventory and collection coverage; absence in a partial list is inconclusive');
  }
  if(!result.host_volume_mapping_gap.supportingIds.length&&!result.host_volume_mapping_gap.contradictingIds.length)result.host_volume_mapping_gap.missingObservations.push('Current effective target-volume mapping, actual initiator, direct mapping and inherited host-group access');

  const activeWriteProtect=kind('array_alert').filter(e=>e.facts.status==='active'&&(e.facts.identifier==='DATA_PATH_WRITE_PROTECT_MODE_ENTER'||e.facts.code==='0x00200701'));
  for(const alert of activeWriteProtect){
    const writes=failures.filter(e=>(e.facts.operation==='write'||e.facts.operation==='read_write')&&near(e,alert)&&(alert.facts.volumeId===null||alert.facts.volumeId===e.facts.volumeId)&&hostsVolume(alert.facts.applianceId,e.facts.volumeId));
    if(writes.length){add('powerstore_capacity_write_protect','supportingIds',[alert,...writes]);result.powerstore_capacity_write_protect.findings.push('Current scoped write-protect event matches failed writes. This is an immediate cause, not evidence of why capacity was consumed.');}
  }
  const writeProtect=result.powerstore_capacity_write_protect;
  if(!writeProtect.supportingIds.length)writeProtect.missingObservations.push('Current active write-protection event matched to appliance/volume and failed writes');
  const capacities=kind('capacity_snapshot').filter(e=>e.facts.metric.startsWith('appliance_')&&e.facts.metric.endsWith('_percent')&&activeWriteProtect.some(a=>a.facts.applianceId===e.facts.objectId&&near(a,e)));
  if(!capacities.length)writeProtect.missingObservations.push('Time-aligned appliance physical/user/system-data capacity metric; volume logical and VMFS usage are not substitutes');
  else if(writeProtect.supportingIds.length)add('powerstore_capacity_write_protect','supportingIds',capacities);
  for(const e of kind('datastore_access').filter(e=>(e.facts.operation==='write'||e.facts.operation==='read_write')&&e.facts.result==='success')){
    if(activeWriteProtect.some(a=>near(a,e)&&(a.facts.volumeId===e.facts.volumeId||(a.facts.volumeId===null&&hostsVolume(a.facts.applianceId,e.facts.volumeId)))))add('powerstore_capacity_write_protect','contradictingIds',[e]);
  }
  for(const e of kind('hardware_state'))if(affected.some(a=>hostsVolume(e.facts.applianceId,a.volume)&&near(a.e,e))){
    if(e.facts.state==='faulted')add('powerstore_node_or_component_fault','supportingIds',[e]);
    if(e.facts.state==='healthy')add('powerstore_node_or_component_fault','contradictingIds',[e]);
  }
  if(!result.powerstore_node_or_component_fault.supportingIds.length)result.powerstore_node_or_component_fault.missingObservations.push('Current object-matched PowerStore component fault, rather than a generic timeout or broad health summary');

  // A genuine healthy-current conclusion requires explicit service + path checks and complete scoped collection.
  const targetEntities=new Set(all.filter(e=>e.kind==='workflow_event'||e.kind==='datastore_access').flatMap(e=>[e.facts.hostId,e.facts.volumeId]));
  const healthy=kind('health_snapshot').filter(e=>e.facts.status==='healthy'&&e.facts.collectionComplete&&complete(e)&&e.facts.checks.includes('service')&&e.facts.checks.includes('storage_path')&&[...targetEntities].every(id=>e.facts.entityIds.includes(id)));
  const successes=kind('datastore_access').filter(e=>e.facts.result==='success'&&e.facts.operation==='read_write');
  const healthyPairs=healthy.flatMap(h=>successes.filter(s=>near(h,s)&&h.facts.entityIds.includes(s.facts.hostId)&&h.facts.entityIds.includes(s.facts.volumeId)).map(s=>({h,s})));
  const targetAppliance=(appliance:string)=>[...targetEntities].some(id=>hostsVolume(appliance,id));
  const explicitUnhealthy:EvidenceItem[]=[
    ...kind('array_alert').filter(e=>e.facts.status==='active'&&targetAppliance(e.facts.applianceId)),
    ...kind('hardware_state').filter(e=>e.facts.state==='faulted'&&targetAppliance(e.facts.applianceId)),
    ...kind('link_state').filter(e=>e.facts.state==='down'&&targetEntities.has(e.facts.hostId)),
    ...kind('iscsi_path_state').filter(e=>(e.facts.sessionState==='lost'||e.facts.pathState==='dead')&&targetEntities.has(e.facts.hostId)),
    ...kind('health_snapshot').filter(e=>e.facts.status==='degraded'&&e.facts.entityIds.some(id=>targetEntities.has(id)))
  ];
  const healthyNow=healthyPairs.length>0&&failures.length===0&&workflows.length===0&&explicitUnhealthy.length===0;
  if(healthyNow)add('no_active_incident','supportingIds',healthyPairs.flatMap(x=>[x.h,x.s]));
  else result.no_active_incident.missingObservations.push('Explicit current read/write service and storage-path health across relevant objects with complete sampling coverage');
  add('no_active_incident','contradictingIds',[...failures,...workflows,...explicitUnhealthy]);
  if(all.some(e=>e.kind==='array_alert'&&e.facts.status==='cleared'))result.no_active_incident.findings.push('Cleared alerts are historical observations and are never treated as an active root cause.');

  const conflicts:string[]=[];
  if(healthyPairs.some(pair=>explicitUnhealthy.some(e=>near(pair.h,e))))conflicts.push('Complete healthy snapshot conflicts with current matched fault/path observations');
  const symptomKey=(e:Of<'datastore_access'>)=>`${e.facts.hostId}/${e.facts.volumeId}/${e.facts.operation}`;
  const access=kind('datastore_access');for(let i=0;i<access.length;i++)for(let j=i+1;j<access.length;j++)if(symptomKey(access[i])===symptomKey(access[j])&&near(access[i],access[j])&&access[i].facts.result!==access[j].facts.result)conflicts.push(`Conflicting current access observations: ${access[i].id}, ${access[j].id}`);
  for(let i=0;i<pings.length;i++)for(let j=i+1;j<pings.length;j++)if(sameProbe(pings[i],pings[j])&&pings[i].facts.payloadBytes===pings[j].facts.payloadBytes&&pings[i].facts.df===pings[j].facts.df&&pings[i].facts.success!==pings[j].facts.success)conflicts.push(`Conflicting matched probes: ${pings[i].id}, ${pings[j].id}`);
  for(let i=0;i<mtus.length;i++)for(let j=i+1;j<mtus.length;j++)if(mtus[i].facts.interfaceId===mtus[j].facts.interfaceId&&mtus[i].pathId===mtus[j].pathId&&near(mtus[i],mtus[j])&&mtus[i].facts.configuredMtu!==mtus[j].facts.configuredMtu)conflicts.push(`Conflicting MTU observations: ${mtus[i].id}, ${mtus[j].id}`);
  const physical=CANDIDATES.slice(0,5).map(c=>result[c.id]);
  const supported=physical.filter(c=>c.supportingIds.length>0);
  if(supported.length>1){conflicts.push(`Evidence supports multiple cause categories: ${supported.map(c=>c.candidateId).join(', ')}`);add('other_or_multiple_causes','supportingIds',all.filter(e=>supported.some(c=>c.supportingIds.includes(e.id))));}
  if(conflicts.length){add('other_or_multiple_causes','supportingIds',current.filter(e=>e.kind!=='note'));result.other_or_multiple_causes.findings.push(...conflicts);}
  else result.other_or_multiple_causes.missingObservations.push('Distinct concurrent causes or reproducible same-object/same-time contradictions');
  // A healthy control path or different host/component is not a contradiction of a scoped fault.
  const byId=new Map(all.map(e=>[e.id,e]));
  for(const c of physical)if(c.supportingIds.length&&c.contradictingIds.length){
    c.contradictingIds=c.contradictingIds.filter(id=>{
      const contra=byId.get(id)!;
      return c.supportingIds.some(sid=>{const sup=byId.get(sid)!;if(!near(sup,contra))return false;
        if(c.candidateId==='storage_network_mtu_mismatch'||c.candidateId==='storage_network_connectivity_loss')return sup.pathId===contra.pathId;
        if(sup.kind==='volume_mapping'&&contra.kind==='volume_mapping')return sup.facts.hostId===contra.facts.hostId&&sup.facts.volumeId===contra.facts.volumeId;
        if(sup.kind==='hardware_state'&&contra.kind==='hardware_state')return sup.facts.applianceId===contra.facts.applianceId&&sup.facts.componentId===contra.facts.componentId;
        return c.candidateId==='powerstore_capacity_write_protect';
      });
    });
    if(c.contradictingIds.length)conflicts.push(`Supporting and contradicting observations coexist for ${c.candidateId}; verify the matched object/path/time scope`);
  }
  if(!supported.length&&!healthyNow){add('insufficient_evidence','supportingIds',[...failures,...workflows]);result.insufficient_evidence.findings.push('Available current evidence does not establish any specific candidate cause. Missing observations remain unknown.');}
  else add('insufficient_evidence','contradictingIds',all.filter(e=>supported.some(c=>c.supportingIds.includes(e.id))||result.no_active_incident.supportingIds.includes(e.id)));
  if(conflicts.length){add('other_or_multiple_causes','supportingIds',current.filter(e=>e.kind!=='note'));result.other_or_multiple_causes.findings.push(...conflicts);result.other_or_multiple_causes.missingObservations=[];}
  if(conflicts.length)result.insufficient_evidence.missingObservations.push('Resolve the listed conflicting or concurrent observations before a single-cause conclusion');
  for(const c of Object.values(result)){c.missingObservations=[...new Set(c.missingObservations)];c.findings=[...new Set(c.findings)];}
  const report:EvidenceReport={candidates:CANDIDATES.map(c=>result[c.id]),conflicts:[...new Set(conflicts)],humanReviewRequired:true,associationWindowMinutes:5,review:(id:string)=>getReviewStatus(report,id)};
  return report;
}
export function getReviewStatus(report: EvidenceReport, selectedId: string): ReviewStatus {
  if(report.conflicts.length)return 'conflicting_evidence';
  const c=report.candidates.find(c=>c.candidateId===selectedId);
  if(!c)return 'needs_more_evidence';
  if(selectedId==='insufficient_evidence'||!c.supportingIds.length)return 'needs_more_evidence';
  if(c.contradictingIds.length)return 'conflicting_evidence';
  return selectedId==='no_active_incident'?'no_active_incident':'candidate_supported';
}
