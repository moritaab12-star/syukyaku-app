import type { RelatedLink } from '@/app/lib/related-links';
import { buildLpViewModel } from '@/app/lib/lp-template';
import { parseLpUiCopy } from '@/app/lib/lp-ui-copy';
import type { AgentAppealMode } from '@/app/lib/agent/types';
import { validateRequiredLocalFieldworkAnswers } from '@/app/lib/agent/validateRequiredRawAnswers';

const PLACEHOLDER_RE = /\{\{[^{}]+\}\}/;

const GENERIC_COMPANY_NAMES = new Set([
  '新規プロジェクト（実店舗）',
  '新規プロジェクト',
]);

const AGENT_MODES: AgentAppealMode[] = [
  'price',
  'trust',
  'empathy',
  'urgency',
  'local',
];

export type LpQualityProjectInput = {
  project_type: string | null;
  company_name: string | null;
  service: string | null;
  area: string | null;
  target_area: string | null;
  areas?: string[] | null;
  keyword: string | null;
  raw_answers: unknown;
  company_info: unknown;
  lp_ui_copy: unknown;
  fv_catch_headline?: string | null;
  fv_catch_subheadline?: string | null;
  mode?: string | null;
  industry_key?: string | null;
};

export type LpQualityResult = {
  canPublish: boolean;
  errors: string[];
  warnings: string[];
};

function parseAgentModeLocal(
  m: string | null | undefined,
): AgentAppealMode | null {
  const s = (m ?? '').trim();
  return AGENT_MODES.includes(s as AgentAppealMode) ? (s as AgentAppealMode) : null;
}

function isGenericCompanyName(name: string | null | undefined): boolean {
  const t = (name ?? '').trim();
  if (!t) return true;
  return GENERIC_COMPANY_NAMES.has(t);
}

function extractCompanyPhone(companyInfo: unknown): string {
  if (!companyInfo || typeof companyInfo !== 'object') return '';
  const o = companyInfo as Record<string, unknown>;
  const p = o.phone;
  return typeof p === 'string' ? p.trim() : '';
}

function collectStringsFromUnknown(v: unknown, out: string[], depth: number) {
  if (depth > 8) return;
  if (typeof v === 'string') {
    if (v.trim()) out.push(v);
    return;
  }
  if (!v || typeof v !== 'object') return;
  if (Array.isArray(v)) {
    for (const x of v) collectStringsFromUnknown(x, out, depth + 1);
    return;
  }
  for (const x of Object.values(v)) collectStringsFromUnknown(x, out, depth + 1);
}

function hasPlaceholderInText(s: string): boolean {
  return PLACEHOLDER_RE.test(s);
}

/**
 * 公開前の LP 品質チェック（テンプレ HTML は生成しない。buildLpViewModel で本文モデルを検査）
 */
export function validateLpQuality(
  row: LpQualityProjectInput,
  opts: {
    relatedLinks: RelatedLink[];
    variationSeed: number;
    projectStableId: string;
    lpGroupId?: string | null;
  },
): LpQualityResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (isGenericCompanyName(row.company_name)) {
    errors.push('会社名が仮文言のままです（設定画面で正式名称を入力してください）');
  }

  for (const msg of validateRequiredLocalFieldworkAnswers({
    project_type: row.project_type,
    industry_key: row.industry_key ?? null,
    service: row.service ?? null,
    raw_answers: row.raw_answers,
  })) {
    if (!errors.includes(msg)) errors.push(msg);
  }

  const areaRaw = (row.area ?? row.target_area ?? '').trim();
  const isLocal = (row.project_type ?? '').trim() === 'local';
  if (isLocal && (!areaRaw || areaRaw === '地域')) {
    errors.push(
      'エリアが未設定、またはプレースホルダ「地域」のままです（市区町村などを設定してください）',
    );
  }

  const svc = (row.service ?? '').trim();
  if (!svc) {
    errors.push('サービス名が空です');
  } else if (svc === '地域密着サービス') {
    warnings.push(
      'サービス名が汎用表記のままです（可能なら業種に即した名称に更新してください）',
    );
  }

  const lpUi = parseLpUiCopy(row.lp_ui_copy);
  const uiStrings: string[] = [];
  collectStringsFromUnknown(row.lp_ui_copy, uiStrings, 0);
  const uiBlob = uiStrings.join('\n');
  if (hasPlaceholderInText(uiBlob)) {
    errors.push('lp_ui_copy にプレースホルダ（{{...}} 形式）が残っています');
  }

  const kw = (row.keyword ?? '').trim();
  if (
    kw.length > 0 &&
    (/になります[。]?$/u.test(kw) || /\d+\s*LP/u.test(kw))
  ) {
    warnings.push(
      '検索キーワードが指示文に近い形式です（必要に応じて一覧で自然な語に修正してください）',
    );
  }

  const { view, company } = buildLpViewModel(row.raw_answers, {
    projectType: row.project_type,
    fallbackName: row.company_name ?? undefined,
    companyInfoRaw: row.company_info,
    areaOverride: row.area ?? undefined,
    targetArea: row.target_area ?? undefined,
    areasList: Array.isArray(row.areas) ? row.areas : undefined,
    serviceOverride: row.service ?? undefined,
    keywordOverride: row.keyword ?? undefined,
    industryKey: row.industry_key ?? null,
    relatedLinks: opts.relatedLinks,
    projectStableId: opts.projectStableId,
    lpGroupId: opts.lpGroupId ?? undefined,
    variationSeed: opts.variationSeed,
    fvCatchHeadline: row.fv_catch_headline ?? null,
    fvCatchSubheadline: row.fv_catch_subheadline ?? null,
    lpUiCopy: lpUi,
    agentMode: parseAgentModeLocal(row.mode),
  });

  if (hasPlaceholderInText(view.areaName)) {
    errors.push(
      '地域名にプレースホルダが残っています（projects.area / target_area を設定してください）',
    );
  }
  if (hasPlaceholderInText(view.serviceName)) {
    errors.push(
      'サービス名にプレースホルダが残っています（projects.service を設定してください）',
    );
  }

  const viewTextParts = [
    view.headline,
    view.subheadline,
    view.trustYears,
    view.trustCases,
    view.diagnosisSectionTitleOverride ?? '',
  ];
  for (const fq of view.faqItems ?? []) {
    viewTextParts.push(fq.q, fq.a);
  }
  if (hasPlaceholderInText(viewTextParts.join('\n'))) {
    errors.push('見出し・FAQ などにプレースホルダが残っています');
  }

  const companyBlob = [company.name, company.intro].join('\n');
  if (hasPlaceholderInText(companyBlob)) {
    errors.push('会社名・紹介文にプレースホルダが残っています');
  }

  for (const pr of view.priceRows ?? []) {
    const cell = `${pr.label ?? ''} ${pr.price ?? ''} ${pr.note ?? ''}`;
    if (hasPlaceholderInText(cell)) {
      errors.push('料金・目安欄にプレースホルダが残っています');
      break;
    }
  }

  const heroHead = (view.headline ?? '').trim();
  if (
    heroHead &&
    (heroHead.includes('新規プロジェクト') || heroHead.includes('（実店舗）'))
  ) {
    errors.push('主要見出しが仮プロジェクト名のままです（FVキャッチ等を設定してください）');
  }

  if (lpUi?.problems_lead && lpUi.problems_lead.trim().length < 12) {
    warnings.push('問題提起のリード文が短すぎる可能性があります');
  }
  if (lpUi?.problems_bullets && lpUi.problems_bullets.length > 0) {
    const shortBullet = lpUi.problems_bullets.some((b) => b.trim().length < 6);
    if (shortBullet) {
      warnings.push('箇条書きの一部が極端に短いです');
    }
  }

  const phoneCompany = extractCompanyPhone(row.company_info);
  const web =
    (lpUi?.hero_cta_primary_web ?? '').trim() ||
    (lpUi?.cta_second_primary_web ?? '').trim() ||
    (lpUi?.diagnosis_cta_web ?? '').trim();
  const tel =
    (lpUi?.hero_cta_primary_phone ?? '').trim() ||
    (lpUi?.cta_second_primary_phone ?? '').trim() ||
    (lpUi?.diagnosis_cta_phone ?? '').trim();
  if (!web && !tel && !phoneCompany) {
    errors.push(
      'お問い合わせ導線が未設定です（電話・フォームURLのいずれかを lp_ui_copy または会社情報に設定してください）',
    );
  }

  return {
    canPublish: errors.length === 0,
    errors,
    warnings,
  };
}
