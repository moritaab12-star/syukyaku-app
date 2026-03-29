import { randomUUID } from 'crypto';
import type { IndustryMaster, RecommendedSectionRole } from '@/types/industry';
import type {
  CtaKind,
  ExtractedPattern,
  LpCtaPolicy,
  LpGenerationRule,
  LpSectionBlueprint,
  PatternConsensus,
} from '@/types/lp';
import { sectionPurposeForRole } from './section-purpose';
import type { RunPatternExtractionResult } from '@/lib/extract/run-extraction';

const DEFAULT_EXCLUSIONS = [
  'no_verbatim_competitor_copy',
  'no_layout_pixel_clone',
  'no_scraped_long_body_storage',
  'no_brand_asset_imitation',
] as const;

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
}

function benefitLevelFromPatterns(
  patterns: ExtractedPattern[] | undefined,
): 'low' | 'medium' | 'high' {
  if (!patterns || patterns.length === 0) return 'medium';
  const counts = patterns.map((p) => p.benefit_block_count).sort((a, b) => a - b);
  const mid = median(counts);
  if (mid <= 0) return 'low';
  if (mid === 1) return 'medium';
  return 'high';
}

function trustSlotsFromMasterElements(master: IndustryMaster): string[] {
  return master.important_elements
    .map((e) =>
      e
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_ぁ-んァ-ン一-龯]/g, '')
        .slice(0, 48),
    )
    .filter(Boolean);
}

function trustSlots(
  consensus: PatternConsensus | null | undefined,
  master: IndustryMaster,
): string[] {
  const fromConsensus = consensus?.trust_block_kinds_common ?? [];
  if (fromConsensus.length) return [...new Set(fromConsensus)];
  return trustSlotsFromMasterElements(master);
}

function defaultChannelPriority(common: CtaKind[]): CtaKind[] {
  const preferred: CtaKind[] = [
    'tel',
    'form',
    'line',
    'generic_link',
    'email',
    'chat',
  ];
  const out: CtaKind[] = [];
  for (const c of common) {
    if (!out.includes(c)) out.push(c);
  }
  for (const c of preferred) {
    if (!out.includes(c)) out.push(c);
  }
  return out;
}

function pickReinforceAfter(
  order: RecommendedSectionRole[],
): RecommendedSectionRole[] {
  const want = new Set<RecommendedSectionRole>([
    'trust',
    'social_proof',
    'price',
    'faq',
    'solution',
  ]);
  return order.filter((r) => want.has(r));
}

function buildBlueprints(order: RecommendedSectionRole[]): LpSectionBlueprint[] {
  const countByRole = new Map<RecommendedSectionRole, number>();
  return order.map((role, i) => {
    const n = (countByRole.get(role) ?? 0) + 1;
    countByRole.set(role, n);
    const template_id =
      n > 1 ? `sec_${role}_${String(i).padStart(2, '0')}` : `sec_${role}`;
    return {
      template_id,
      role,
      purpose: sectionPurposeForRole(role),
      optional:
        role === 'related' || role === 'custom' || role === 'social_proof',
    };
  });
}

export type BuildLpGenerationRuleInput = {
  master: IndustryMaster;
  consensus: PatternConsensus | null | undefined;
  patterns?: ExtractedPattern[];
  ruleId?: string;
  version?: number;
};

/**
 * PatternConsensus + IndustryMaster（+ 任意 patterns）から LpGenerationRule を組み立てる。
 * 具体文・見本コピーは含めない。
 */
export function buildLpGenerationRule(
  input: BuildLpGenerationRuleInput,
): LpGenerationRule {
  const { master, consensus } = input;

  const order: RecommendedSectionRole[] =
    consensus && consensus.section_sequence.length > 0
      ? consensus.section_sequence.slice()
      : master.recommended_structure.slice();

  const sections = buildBlueprints(order);
  const channel_priority = defaultChannelPriority(
    consensus?.cta_kinds_common ?? [],
  );

  const typical = consensus?.typical_cta_kind_count ?? 3;
  const min_page_cta_touchpoints = Math.max(3, Math.min(6, typical));

  const reinforce_after_roles = pickReinforceAfter(order);

  const cta_policy: LpCtaPolicy = {
    min_page_cta_touchpoints,
    channel_priority,
    reinforce_after_roles,
  };

  const voice_guidelines = [
    `tone_label:${master.tone}`,
    `cta_emphasis_label:${master.cta_type}`,
    'register:desu_masu',
    'avoid_hard_sell',
  ];

  return {
    id: input.ruleId ?? randomUUID(),
    industry_master_id: master.id,
    version: input.version ?? 1,
    section_order: order,
    sections,
    cta_policy,
    min_primary_ctas: min_page_cta_touchpoints,
    secondary_cta_after_sections: reinforce_after_roles.slice(),
    trust_element_slots: trustSlots(consensus, master),
    benefit_emphasis_level: benefitLevelFromPatterns(input.patterns),
    voice_guidelines,
    layout_abstraction: {
      container: 'max-w-6xl',
      section_vertical_spacing: 'generous',
    },
    exclusions: [...DEFAULT_EXCLUSIONS],
    derived_from_consensus: consensus ?? undefined,
  };
}

/** `runPatternExtraction` の結果から一発でルール化 */
export function buildLpGenerationRuleFromExtraction(
  master: IndustryMaster,
  extraction: RunPatternExtractionResult,
  opts?: { ruleId?: string; version?: number },
): LpGenerationRule {
  return buildLpGenerationRule({
    master,
    consensus: extraction.consensus,
    patterns: extraction.patterns,
    ruleId: opts?.ruleId,
    version: opts?.version,
  });
}
