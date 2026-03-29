import { getIndustryMasterById } from '@/lib/industry/load-masters';
import { buildLpGenerationRule } from '@/lib/convert/build-rule';
import type { PatternConsensus } from '@/types/lp';
import type { LpViewModel } from '@/app/lib/lp-template';
import type { CompanyInfoDisplay } from '@/app/lib/companyInfoFormatter';
import { buildPhase5LpHtmlMarkup } from './build-phase5-markup';

function minimalView(): LpViewModel {
  return {
    headline: 'テスト LP 見出し',
    subheadline: 'サブ見出しです。',
    areaName: '横浜市',
    serviceName: '剪定・造園',
    ctaUrl: '#contact',
    trustYears: '15年',
    trustCases: '1,200件',
    priceRows: [
      { label: '草刈り', price: '〇〇円〜', note: '目安' },
      { label: '剪定', price: '〇〇円〜', note: '木により異なります' },
    ],
    faqItems: [
      { q: 'Q. 見積もりは無料ですか', a: 'A. はい、無料です。' },
    ],
    diagnosisMode: 'diagnosis',
    industryTone: 'garden',
  };
}

function minimalCompany(): CompanyInfoDisplay {
  return {
    name: 'テスト造園',
    intro: '地域に根ざした造園サービスです。',
    hasPhone: true,
    phone: '03-0000-0000',
    phoneHref: 'tel:0300000000',
    hasLine: false,
    hasEmail: false,
    areaSummary: '横浜市全域',
  };
}

/**
 * ルール OFF（cv テンプレ既定＝ price → trust）と ON（合意で trust → price）で HTML 順序が変わることを検証
 */
export function runPhase5StructureSelfCheck(): {
  ok: boolean;
  priceBeforeTrust_whenRuleOff: boolean;
  priceBeforeTrust_whenRuleOn: boolean;
  detail: string;
} {
  const master = getIndustryMasterById('garden');
  if (!master) {
    return {
      ok: false,
      priceBeforeTrust_whenRuleOff: false,
      priceBeforeTrust_whenRuleOn: false,
      detail: 'master garden not found',
    };
  }

  const view = minimalView();
  const company = minimalCompany();
  const base = {
    view,
    company,
    projectType: 'local' as const,
    diagnosisModeTitle: '3つ当てはまったら早めの診断をおすすめします',
    template: 'cv' as const,
    master,
  };

  const htmlRuleOff = buildPhase5LpHtmlMarkup({
    ...base,
    rule: null,
    withGeneratedLp: false,
    template: 'cv',
  }).bodyInner;

  /** cv テンプレは price → trust。ここでは trust → price にし、ルール ON で順序が反転することを検証 */
  const consensusTrustBeforePrice: PatternConsensus = {
    section_sequence: [
      'hero',
      'problems',
      'solution',
      'services',
      'trust',
      'price',
      'flow',
      'faq',
      'cta_mid',
      'diagnosis',
      'consultation',
      'footer',
    ],
    supporting_url_count: 2,
    cta_kinds_common: ['form', 'tel'],
    trust_block_kinds_common: ['cases'],
    typical_cta_kind_count: 3,
    evidence_urls: ['https://a.example', 'https://b.example'],
  };

  const ruleOn = buildLpGenerationRule({
    master,
    consensus: consensusTrustBeforePrice,
  });

  const htmlRuleOn = buildPhase5LpHtmlMarkup({
    ...base,
    rule: ruleOn,
    withGeneratedLp: true,
    template: 'cv',
  }).bodyInner;

  const pos = (html: string, needle: string) => {
    const i = html.indexOf(needle);
    return i < 0 ? Number.POSITIVE_INFINITY : i;
  };

  const offPriceBeforeTrust =
    pos(htmlRuleOff, 'id="price"') < pos(htmlRuleOff, 'id="trust"');
  const onPriceBeforeTrust =
    pos(htmlRuleOn, 'id="price"') < pos(htmlRuleOn, 'id="trust"');

  const differs = offPriceBeforeTrust !== onPriceBeforeTrust;

  return {
    ok: differs,
    priceBeforeTrust_whenRuleOff: offPriceBeforeTrust,
    priceBeforeTrust_whenRuleOn: onPriceBeforeTrust,
    detail: differs
      ? 'rule toggles price/trust order as expected'
      : `unexpected: off=${offPriceBeforeTrust} on=${onPriceBeforeTrust}`,
  };
}

/** CI / lp-html-guard 用サンプル（cv・ルールオフ） */
export function buildPhase5GuardSampleBodyInner(): string {
  const master = getIndustryMasterById('garden');
  if (!master) return '';
  return buildPhase5LpHtmlMarkup({
    view: minimalView(),
    company: minimalCompany(),
    projectType: 'local',
    diagnosisModeTitle: '3つ当てはまったら早めの診断をおすすめします',
    template: 'cv',
    master,
    rule: null,
    withGeneratedLp: false,
  }).bodyInner;
}
