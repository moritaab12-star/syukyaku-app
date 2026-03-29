import type { IndustryMaster, RecommendedSectionRole } from '@/types/industry';
import type {
  GeneratedCta,
  GeneratedLp,
  GeneratedSection,
  LpGenerationRule,
} from '@/types/lp';
import type { LpViewModel } from '@/app/lib/lp-template';
import { sectionPurposeForRole } from '@/lib/convert/section-purpose';
import { sectionHeadlinePlaceholder } from './section-headline-placeholder';

function blueprintFromRuleOrMaster(
  rule: LpGenerationRule | null,
  master: IndustryMaster,
): { template_id: string; role: RecommendedSectionRole; purpose: string }[] {
  if (rule?.sections?.length) {
    return rule.sections.map((s) => ({
      template_id: s.template_id,
      role: s.role,
      purpose: s.purpose,
    }));
  }
  return master.recommended_structure.map((role) => ({
    template_id: `sec_${role}`,
    role,
    purpose: sectionPurposeForRole(role),
  }));
}

function ctasFromRule(rule: LpGenerationRule | null): GeneratedCta[] {
  if (!rule) {
    return [
      { text: '', role: 'primary', channel: 'tel' },
      { text: '', role: 'secondary', channel: 'form' },
    ];
  }
  return rule.cta_policy.channel_priority.slice(0, 6).map((ch, i) => ({
    text: '',
    role: (i === 0 ? 'primary' : i === 1 ? 'secondary' : 'tertiary') as
      | 'primary'
      | 'secondary'
      | 'tertiary',
    channel: ch,
  }));
}

/**
 * 50問由来の view + IndustryMaster + 任意ルールから GeneratedLp を決定的に組み立てる（具体文は最小限）
 */
export function buildGeneratedLp(opts: {
  view: LpViewModel;
  master: IndustryMaster;
  rule: LpGenerationRule | null;
  projectId?: string;
}): GeneratedLp {
  const { view, master, rule } = opts;
  const now = new Date().toISOString();
  const bp = blueprintFromRuleOrMaster(rule, master);

  const sections: GeneratedSection[] = bp.map((b) => ({
    id: b.template_id,
    role: b.role,
    headline: sectionHeadlinePlaceholder(b.role, view),
    lead: b.purpose,
    bullets: undefined,
  }));

  return {
    meta: {
      industry_master_id: master.id,
      project_id: opts.projectId,
      rule_id: rule?.id,
      generated_at: now,
    },
    title: view.headline,
    subtitle: view.subheadline,
    sections,
    faq: view.faqItems.map((f) => ({ q: f.q, a: f.a })),
    trust: {
      headline: '信頼・実績',
      items: master.important_elements.slice(),
    },
    ctas: ctasFromRule(rule),
  };
}
