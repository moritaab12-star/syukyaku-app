/**
 * 調査 → 抽出 → ルール化 → LP 生成 のデータ形（Phase 1）。
 * 実装は後続フェーズ。型だけでパイプライン全体を表現する。
 */

import type { IndustryMasterId, RecommendedSectionRole } from '@/types/industry';

/** HTML / LP 上で検出する CV の種類（構造メタのみ） */
export type CtaKind =
  | 'form'
  | 'tel'
  | 'line'
  | 'email'
  | 'generic_link'
  | 'chat';

/** 余白・リズムの抽象ラベル（具体 px は入れない） */
export type SpacingRhythm = 'compact' | 'comfortable' | 'airy';

// --- Research layer ---

export type ReferenceCandidateStatus =
  | 'pending'
  | 'accepted'
  | 'rejected_industry'
  | 'rejected_not_lp'
  | 'rejected_no_cv'
  | 'rejected_fetch';

export type ReferenceCandidate = {
  url: string;
  status: ReferenceCandidateStatus;
  /** 0–1 任意。未判定なら undefined */
  industry_fit_score?: number;
  /** 0–1 任意。LP/CV 判定 */
  lp_likelihood_score?: number;
  fetched_at?: string;
  rejection_code?: string;
  rejection_detail?: string;
  /** 判定に使ったシグナル（ラベルのみ・本文保存しない） */
  signals?: string[];
};

export type ResearchRunMeta = {
  id: string;
  industry_master_id: IndustryMasterId;
  started_at: string;
  completed_at?: string;
  query_variants_used: string[];
  candidates: ReferenceCandidate[];
};

/** Phase 2: reference research 失敗理由（API・クライアントで分岐可能） */
export type ReferenceResearchFailureCode =
  | 'PERPLEXITY_UNAVAILABLE'
  | 'PERPLEXITY_ERROR'
  | 'PERPLEXITY_PARSE_EMPTY'
  | 'INSUFFICIENT_CANDIDATES';

export type ReferenceResearchSuccess = {
  ok: true;
  urls: string[];
  run_id: string;
  industry_master_id: IndustryMasterId;
  query_variants_used: string[];
  candidates: ReferenceCandidate[];
};

export type ReferenceResearchFailure = {
  ok: false;
  code: ReferenceResearchFailureCode;
  detail?: string;
  run_id?: string;
  industry_master_id?: IndustryMasterId;
  query_variants_used: string[];
  candidates?: ReferenceCandidate[];
};

export type ReferenceResearchResult =
  | ReferenceResearchSuccess
  | ReferenceResearchFailure;

// --- Extract layer（1 URL あたりの構造メタ）---

export type ExtractedPattern = {
  source_url: string;
  extracted_at: string;
  /** ページ内で推定したセクション役割の順序（抽象） */
  section_sequence: RecommendedSectionRole[];
  /** 検出した CTA 種別（重複可） */
  cta_kinds_found: CtaKind[];
  /** 信頼系ブロックの種類ラベル（実績年数、数字、ロゴ列、など抽象） */
  trust_block_kinds: string[];
  /** ベネフィット列挙ブロックの個数（0 許容） */
  benefit_block_count: number;
  /** 見出しとして解釈した最大レベル（1–6） */
  heading_max_level: number;
  rhythm_label?: SpacingRhythm;
};

/** 2 件以上の URL で合意したパターン（抽出層の合流結果） */
export type PatternConsensus = {
  /** 少なくとも 2 URL で一致または順序が多様投票で採用された序列 */
  section_sequence: RecommendedSectionRole[];
  supporting_url_count: number;
  cta_kinds_common: CtaKind[];
  trust_block_kinds_common: string[];
  /** 各 URL のユニーク CTA 種別数の中央値（再実行時の「段数」安定化指標） */
  typical_cta_kind_count?: number;
  /** 合意に使った抽出 IDs や URL（デバッグ用） */
  evidence_urls?: string[];
};

// --- Convert layer ---

/** セクション単位のテンプレID＋目的（具体コピーは禁止。コンポーザが業種・地域非依存で参照） */
export type LpSectionBlueprint = {
  /** 安定 ID（例: sec_trust_01）。コンポーザ・ログで参照 */
  template_id: string;
  role: RecommendedSectionRole;
  /** そのブロックが担う役割の抽象説明のみ */
  purpose: string;
  /** true ならコンテンツ欠落時にスキップ可 */
  optional?: boolean;
};

/** CTA の構造ルール（文言テンプレは含めない） */
export type LpCtaPolicy = {
  /** ページ内で明示すべき CV 接触回数の下限（プレースホルダー・種類ベース） */
  min_page_cta_touchpoints: number;
  /** 優先チャネル順（先頭ほど生成・配置で優先） */
  channel_priority: CtaKind[];
  /** これらのセクション直後に二次 CTA を置く推奨 */
  reinforce_after_roles: RecommendedSectionRole[];
};

export type LpGenerationRule = {
  id: string;
  industry_master_id: IndustryMasterId;
  version: number;
  /** 調査ベース。sections と同順を維持 */
  section_order: RecommendedSectionRole[];
  /** セクションテンプレと目的（section_order と 1:1 対応させる） */
  sections: LpSectionBlueprint[];
  /** CTA 構造ポリシー */
  cta_policy: LpCtaPolicy;
  min_primary_ctas: number;
  /** 二次 CTA を置く推奨スロット（cta_policy.reinforce_after_roles と同期） */
  secondary_cta_after_sections: RecommendedSectionRole[];
  /** 信頼要素のスロット ID（生成時に埋める枠・抽象キー） */
  trust_element_slots: string[];
  benefit_emphasis_level: 'low' | 'medium' | 'high';
  /** 文体・トーンの抽象ガイド（ルールのみ、具体文は持たない） */
  voice_guidelines: string[];
  layout_abstraction: {
    container: 'max-w-6xl';
    section_vertical_spacing: 'generous';
  };
  /** 生成時の禁止事項ラベル */
  exclusions: string[];
  /** どの合意に基づくか（トレース用） */
  derived_from_consensus?: PatternConsensus;
};

// --- Generate layer（出力契約。既存 View / uiCopy へマップする前提）---

export type GeneratedSection = {
  id: string;
  role: RecommendedSectionRole;
  headline: string;
  lead?: string;
  bullets?: string[];
};

export type GeneratedTrust = {
  headline?: string;
  items?: string[];
};

export type GeneratedCta = {
  text: string;
  role: 'primary' | 'secondary' | 'tertiary';
  channel: CtaKind;
};

export type GeneratedLp = {
  meta: {
    industry_master_id: IndustryMasterId;
    project_id?: string;
    rule_id?: string;
    generated_at: string;
  };
  title: string;
  subtitle: string;
  sections: GeneratedSection[];
  faq: { q: string; a: string }[];
  trust: GeneratedTrust;
  ctas: GeneratedCta[];
};
