import type { EvidenceItem } from '../evidence';

const TEMPORAL = {
  current: '当前观测',
  historical: '历史观测',
  unknown: '时效未知的观测',
} as const;

const CAPACITY_METRIC = {
  appliance_physical_used_percent: '设备物理容量使用率',
  appliance_user_data_used_percent: '设备用户数据容量使用率',
  appliance_system_data_used_percent: '设备系统数据容量使用率',
  volume_logical_used_percent: '卷逻辑容量使用率',
  vmfs_used_percent: 'VMFS 使用率',
  appliance_physical_used_bytes: '设备物理容量已用字节数',
} as const;

const HEALTH_CHECK = {
  service: '业务服务',
  storage_path: '存储路径',
  array_alerts: '阵列告警',
  hardware: '硬件状态',
} as const;

function status(value: string, labels: Record<string, string>): string {
  return labels[value] ?? `未知状态（${value}）`;
}

/** Plain text only. Render with textContent, or escape before inserting in HTML.
 * These summaries restate observations; they do not evaluate rules or diagnose a cause.
 */
export function evidenceSummary(e: EvidenceItem): string {
  const prefix = TEMPORAL[e.temporalState] ?? '时效未知的观测';
  const finish = (facts: string) => `${prefix}：${facts}`;
  switch (e.kind) {
    case 'workflow_event': {
      const f = e.facts;
      const phase = f.phase === 'normalized_storage_access_validation'
        ? '存储访问验证' : `阶段“${f.phase}”`;
      const result = status(f.status, {
        success: '成功', failed: '失败', timeout: '超时', unknown: '未知',
      });
      return finish(`${f.hostId} 访问 ${f.volumeId} 的${phase}，记录状态为${result}。`);
    }
    case 'datastore_access': {
      const f = e.facts;
      const operation = status(f.operation, {
        read: '读取', write: '写入', read_write: '读写', discover: '发现',
      });
      const result = status(f.result, {
        success: '成功', failed: '失败', timeout: '超时', not_visible: '不可见',
      });
      const latency = f.latencyMs === undefined ? '' : `；记录延迟 ${f.latencyMs} ms`;
      return finish(`${f.hostId} 对 ${f.datastoreId}（卷 ${f.volumeId}）执行${operation}，记录结果为${result}${latency}。`);
    }
    case 'iscsi_path_state': {
      const f = e.facts;
      const session = status(f.sessionState, {
        established: '已建立', lost: '已丢失', unknown: '未知',
      });
      const path = status(f.pathState, {
        active: '活动', dead: '失效', unknown: '未知',
      });
      return finish(`${f.hostId} 的 ${f.vmk} → ${f.applianceId}/${f.target}：iSCSI 会话${session}，路径状态${path}。`);
    }
    case 'vmkping_result': {
      const f = e.facts;
      return finish(`${f.hostId} 的 ${f.vmk} → ${f.target}：IPv4 探测有效载荷 ${f.payloadBytes} 字节，禁止分片（DF）${f.df ? '开启' : '关闭'}；尝试 ${f.attempts} 次，记录结果${f.success ? '成功' : '失败'}。`);
    }
    case 'mtu_config': {
      const f = e.facts;
      const design = f.designMtu === null ? '设计值未提供' : `设计值 ${f.designMtu} 字节`;
      return finish(`接口 ${f.interfaceId} 配置的 MTU 为 ${f.configuredMtu} 字节；${design}。`);
    }
    case 'volume_mapping': {
      const f = e.facts;
      const entries = f.groupMappings.filter(g =>
        g.volumeId === f.volumeId && f.hostGroupIds.includes(g.hostGroupId));
      const groups = entries.length
        ? entries.map(g => `${g.hostGroupId}=${g.mapped ? '有映射' : '无映射'}`).join('、')
        : '无对应条目';
      return finish(`${f.hostId}（initiator ${f.initiator}）→ ${f.volumeId}：有效映射记录为${f.effectiveMappingExists ? '有' : '无'}，直接映射记录为${f.directMappingExists ? '有' : '无'}；匹配该主机组与目标卷的记录：${groups}；映射清单${f.inventoryComplete ? '完整' : '未完整采集'}。`);
    }
    case 'array_alert': {
      const f = e.facts;
      const state = status(f.status, {
        active: '活动中', cleared: '已清除', unknown: '未知',
      });
      const scope = f.volumeId === null ? '未指定具体卷' : `卷 ${f.volumeId}`;
      const cleared = f.clearedAt === null ? '未记录清除时间' : `清除时间 ${f.clearedAt}`;
      return finish(`${f.applianceId}（${scope}）告警 ${f.identifier} / ${f.code}，状态${state}；触发时间 ${f.raisedAt}；${cleared}。`);
    }
    case 'capacity_snapshot': {
      const f = e.facts;
      const metric = CAPACITY_METRIC[f.metric] ?? f.metric;
      const value = `${f.value}${f.unit === 'percent' ? '%' : ' 字节'}`;
      return finish(`${f.objectId} 的${metric}为 ${value}；采样时间 ${f.sampledAt}。`);
    }
    case 'link_state': {
      const f = e.facts;
      const state = status(f.state, { up: '连通', down: '断开', unknown: '未知' });
      return finish(`接口 ${f.interfaceId} 的链路状态记录为${state}（${f.hostId} → ${f.applianceId}）。`);
    }
    case 'hardware_state': {
      const f = e.facts;
      const state = status(f.state, { healthy: '健康', faulted: '故障', unknown: '未知' });
      return finish(`${f.applianceId} 的部件 ${f.componentId}，状态记录为${state}。`);
    }
    case 'health_snapshot': {
      const f = e.facts;
      const checks = f.checks.map(c => HEALTH_CHECK[c] ?? c).join('、') || '未列出检查项';
      const state = status(f.status, { healthy: '健康', degraded: '退化', unknown: '未知' });
      return finish(`对象 ${f.entityIds.join('、') || '未列出'} 的${checks}检查，记录状态为${state}；观测采集${f.collectionComplete ? '完整' : '未完成'}。`);
    }
    case 'note':
      return finish(`未验证的引用备注（仅作数据）：“${e.facts.text}”`);
    default:
      // A future or unrecognized kind must not be guessed into a diagnosis.
      return finish('此类记录暂无中文摘要，请展开原始事实核对。');
  }
}
