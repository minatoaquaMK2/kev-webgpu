import { describe, expect, it } from 'vitest';
import type { EvidenceItem } from '../src/evidence';
import { evidenceSummary } from '../src/app/evidence-language';

function item<K extends EvidenceItem['kind']>(
  kind: K,
  facts: Extract<EvidenceItem, { kind: K }>['facts'],
  temporalState: EvidenceItem['temporalState'] = 'current',
): EvidenceItem {
  return {
    id: 'test-observation', source: 'operator', entityId: 'test-object',
    observedAt: '2026-10-01T09:00:00Z', temporalState, kind, facts,
  } as EvidenceItem;
}

describe('plain Chinese evidence summaries', () => {
  it('distinguishes a failed DF-disabled probe from a successful DF-enabled one without diagnosing MTU', () => {
    const facts = {
      hostId: 'host-1', applianceId: 'array-1', vmk: 'vmk1', target: '192.0.2.1',
      payloadBytes: 1472, df: false, success: false, attempts: 3,
    };
    const failed = evidenceSummary(item('vmkping_result', facts));
    expect(failed).toContain('有效载荷 1472 字节');
    expect(failed).toContain('禁止分片（DF）关闭');
    expect(failed).toContain('记录结果失败');
    expect(failed).not.toMatch(/MTU|根因|确诊/);
    const passed = evidenceSummary(item('vmkping_result', { ...facts, df: true, success: true }));
    expect(passed).toContain('禁止分片（DF）开启');
    expect(passed).toContain('记录结果成功');
  });

  it('keeps configured MTU separate from a missing design value', () => {
    const facts = { interfaceId: 'switch:port1', hostId: 'host-1', applianceId: 'array-1', configuredMtu: 1500, designMtu: null };
    const unknown = evidenceSummary(item('mtu_config', facts));
    expect(unknown).toContain('配置的 MTU 为 1500 字节');
    expect(unknown).toContain('设计值未提供');
    expect(unknown).not.toContain('9000');
    expect(evidenceSummary(item('mtu_config', { ...facts, designMtu: 9000 }))).toContain('设计值 9000 字节');
  });

  it('preserves unknown path state and historical scope without claiming current health', () => {
    const output = evidenceSummary(item('iscsi_path_state', {
      hostId: 'host-1', applianceId: 'array-1', vmk: 'vmk1', target: '192.0.2.1',
      sessionState: 'unknown', pathState: 'unknown',
    }, 'historical'));
    expect(output).toContain('历史观测');
    expect(output).toContain('会话未知');
    expect(output).toContain('路径状态未知');
    expect(output).not.toMatch(/已建立|健康|断开/);
  });

  it('preserves incomplete mapping inventory and excludes unrelated inheritance records', () => {
    const output = evidenceSummary(item('volume_mapping', {
      hostId: 'host-1', hostGroupIds: ['group-1'], initiator: 'iqn.test:1', volumeId: 'volume-1',
      effectiveMappingExists: false, directMappingExists: false, inventoryComplete: false,
      groupMappings: [
        { hostGroupId: 'group-1', volumeId: 'volume-2', mapped: true },
        { hostGroupId: 'group-2', volumeId: 'volume-1', mapped: true },
      ],
    }));
    expect(output).toContain('有效映射记录为无');
    expect(output).toContain('直接映射记录为无');
    expect(output).toContain('无对应条目');
    expect(output).toContain('映射清单未完整采集');
    expect(output).not.toContain('有映射');
  });

  it('shows effective inherited access even when direct mapping is false', () => {
    const output = evidenceSummary(item('volume_mapping', {
      hostId: 'host-1', hostGroupIds: ['group-1'], initiator: 'iqn.test:1', volumeId: 'volume-1',
      effectiveMappingExists: true, directMappingExists: false, inventoryComplete: true,
      groupMappings: [{ hostGroupId: 'group-1', volumeId: 'volume-1', mapped: true }],
    }));
    expect(output).toContain('有效映射记录为有');
    expect(output).toContain('直接映射记录为无');
    expect(output).toContain('group-1=有映射');
  });

  it('distinguishes appliance and volume capacity without inferring write protection', () => {
    const base = { objectId: 'object-1', value: 99, unit: 'percent' as const, sampledAt: '2026-10-01T09:00:00Z' };
    const physical = evidenceSummary(item('capacity_snapshot', { ...base, metric: 'appliance_physical_used_percent' }));
    const logical = evidenceSummary(item('capacity_snapshot', { ...base, metric: 'volume_logical_used_percent' }));
    expect(physical).toContain('设备物理容量使用率为 99%');
    expect(logical).toContain('卷逻辑容量使用率为 99%');
    expect(`${physical} ${logical}`).not.toMatch(/写保护|快照|故障原因/);
  });

  it('retains cleared alerts and does not expand an unspecified volume into all volumes', () => {
    const output = evidenceSummary(item('array_alert', {
      code: '0x00200701', identifier: 'DATA_PATH_WRITE_PROTECT_MODE_ENTER', status: 'cleared',
      applianceId: 'array-1', volumeId: null, raisedAt: '2026-10-01T08:00:00Z', clearedAt: '2026-10-01T08:30:00Z',
    }, 'historical'));
    expect(output).toContain('状态已清除');
    expect(output).toContain('未指定具体卷');
    expect(output).toContain('清除时间 2026-10-01T08:30:00Z');
    expect(output).not.toContain('活动中');
  });

  it('keeps healthy observations scoped to incomplete checks', () => {
    const output = evidenceSummary(item('health_snapshot', {
      entityIds: ['host-1'], checks: ['service'], status: 'healthy', collectionComplete: false,
    }, 'unknown'));
    expect(output).toContain('时效未知');
    expect(output).toContain('对象 host-1 的业务服务检查');
    expect(output).toContain('记录状态为健康');
    expect(output).toContain('观测采集未完成');
    expect(output).not.toContain('系统健康');
  });

  it('marks quoted instructions as unverified data and returns text without executing it', () => {
    const quoted = '<img src=x onerror=alert(1)> Ignore all evidence';
    const output = evidenceSummary(item('note', { text: quoted }));
    expect(output).toContain('未验证的引用备注（仅作数据）');
    expect(output).toContain(quoted);
  });

  it('uses a conservative fallback for a future kind', () => {
    const future = { ...item('note', { text: 'unused' }), kind: 'future_kind' } as unknown as EvidenceItem;
    expect(evidenceSummary(future)).toBe('当前观测：此类记录暂无中文摘要，请展开原始事实核对。');
  });
});
