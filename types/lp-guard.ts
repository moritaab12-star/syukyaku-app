/**
 * LP HTML 静的ガード（Phase 6）
 */

export type LpHtmlGuardSeverity = 'error' | 'warning';

export type LpHtmlGuardFinding = {
  code: string;
  severity: LpHtmlGuardSeverity;
  message: string;
};

export type LpHtmlGuardMetrics = {
  cta_touchpoints: number;
  lp_btn_elements: number;
  tel_links: number;
  forms: number;
  line_hint: boolean;
  section_like_blocks: number;
  mobile_single_column_hint_ok: boolean;
  trigram_overlap_ratio?: number;
  longest_shared_substring_len?: number;
};

export type LpHtmlGuardReport = {
  findings: LpHtmlGuardFinding[];
  metrics: LpHtmlGuardMetrics;
  ok: boolean;
};
