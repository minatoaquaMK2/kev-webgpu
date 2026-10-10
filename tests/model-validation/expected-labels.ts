/** Ground truth belongs to evaluation only. Never import this module in src/. */
export const EXPECTED_LABELS: Record<string, readonly string[]> = {
  'case-01-A': ['insufficient_evidence'],
  'case-01-B': ['storage_network_mtu_mismatch'],
  'case-01-C': ['storage_network_mtu_mismatch'],
  'case-02': ['host_volume_mapping_gap'],
  'case-03': ['powerstore_capacity_write_protect'],
  'case-04': ['storage_network_connectivity_loss'],
  'case-05': ['no_active_incident'],
  'case-06': ['insufficient_evidence'],
  'case-07': ['storage_network_mtu_mismatch'],
  'case-08': ['other_or_multiple_causes', 'insufficient_evidence'],
};
export const SHOWCASE_IDS = ['case-01-C', 'case-02', 'case-03'] as const;
export const ABSTENTION_OPTIONS = ['insufficient_evidence', 'other_or_multiple_causes'];
