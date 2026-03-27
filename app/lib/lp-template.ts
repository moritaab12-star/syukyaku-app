import {
  normalizeRawAnswers,
  extractLpFacts,
  buildSeoShell,
  buildCvrShell,
  type NormalizedRawAnswers,
  type ExtractedLpFacts,
} from './lp-seo';
import {
  normalizeCompanyInfo,
  type CompanyInfoDisplay,
} from './companyInfoFormatter';
import { detectSearchIntent, type SearchIntent } from './intent';
import { buildRandomBlockData, type BlockData } from './lp-block-randomizer';
import type { RelatedLink } from './related-links';
import { buildPillarSlugBase, buildPillarTitle } from './pillar';
import { deriveLpBlockSeed } from './lp-prng-seed';
import { applyLpTemplateTextVariations } from './lp-text-variation';

export type LpViewModel = {
  headline: string;
  subheadline: string;
  areaName: string;
  serviceName: string;
  /**
   * LP本文のバリエーション用に、raw_answers から抽出したブロック別テキスト。
   * 空配列の場合は 해당ブロックを表示しない。
   */
  blockData?: BlockData;
  /**
   * 内部リンク用の関連LP一覧（フッター直前に表示）。
   * 0件ならセクション自体を出さない。
   */
  relatedLinks?: RelatedLink[];
  /**
   * ピラー記事（area × service の親ページ）へのリンク。
   * まだピラー未投稿でも、将来の導線として表示できるようにする。
   */
  pillarLink?: { title: string; slug: string };
  ctaUrl: string;
  trustYears: string;
  trustCases: string;
  priceRows: { label: string; price: string; note: string }[];
  faqItems: { q: string; a: string }[];
  diagnosisMode: 'diagnosis' | 'consultation';
  /**
   * 診断/相談ブロックの見出し（未設定時は呼び出し側の diagnosisModeTitle を使用）。
   * バリエーションゾーン: seed 付きテンプレからのみ設定する。
   */
  diagnosisSectionTitleOverride?: string;
};

/**
 * LP表示用データを組み立てる際のオプション。
 *
 * - areaOverride: projects.area （ページ表示用の単一地域名）
 * - targetArea:  projects.target_area （SEO/LP量産のターゲット地域）
 * - areasList:   projects.areas （会社として対応可能なエリア一覧）
 *
 * 地域名は以下の優先順位で解決する:
 *   1. areaOverride
 *   2. targetArea
 *   3. areasList の先頭要素
 *   4. raw_answers から抽出した facts.region
 *   5. フォールバック文字列 "{{area_name}}"
 */
export type BuildLpViewModelOpts = {
  projectType: string | null;
  fallbackName?: string;
  companyInfoRaw?: unknown;
  /** projects.area - ページ表示用の単一地域名（最優先） */
  areaOverride?: string | null;
  /** projects.target_area - SEO/LP量産ターゲット地域 */
  targetArea?: string | null;
  /** projects.areas - 対応可能エリア一覧（会社情報用） */
  areasList?: string[] | null;
  /** プロジェクトの service カラム（優先して使用） */
  serviceOverride?: string | null;
  /** projects.keyword - 検索キーワード（intent 判定に使用） */
  keywordOverride?: string | null;
  /** ブロック生成 seed を直接指定（主にテスト用。未指定時は下記から決定） */
  blockSeed?: number;
  /** projects.variation_seed（edition）。同一 lp_group でも行ごとに変えるとバリエーションが変わる */
  variationSeed?: number;
  /** projects.id。seed 安定化に使用 */
  projectStableId?: string | null;
  /** projects.lp_group_id */
  lpGroupId?: string | null;
  /** 内部リンク用の関連LP一覧（外で取得して渡す） */
  relatedLinks?: RelatedLink[];
  /** ピラー記事へのリンクを表示するか（デフォルト: true） */
  includePillarLink?: boolean;
};

function resolveAreaName(
  factsRegion: string,
  opts: BuildLpViewModelOpts,
): string {
  const fromArea =
    typeof opts.areaOverride === 'string' ? opts.areaOverride.trim() : '';
  const fromTarget =
    typeof opts.targetArea === 'string' ? opts.targetArea.trim() : '';

  let fromAreasList = '';
  if (Array.isArray(opts.areasList)) {
    const firstNonEmpty = opts.areasList.find(
      (a) => typeof a === 'string' && a.trim().length > 0,
    );
    if (firstNonEmpty) {
      fromAreasList = firstNonEmpty.trim();
    }
  }

  const resolved =
    fromArea || fromTarget || fromAreasList || (factsRegion || '').trim();

  return resolved || '{{area_name}}';
}

export function buildLpViewModel(
  rawAnswers: unknown,
  opts: BuildLpViewModelOpts,
): {
  normalized: NormalizedRawAnswers;
  facts: ExtractedLpFacts;
  view: LpViewModel;
  company: CompanyInfoDisplay;
  /**
   * 提供サービス（カテゴリ用）。
   * LP表示上は `view.serviceName` と同義。
   */
  service: string;
  /**
   * LP表示用の地域名（カテゴリ用）。
   * 優先順位: projects.area → projects.target_area → projects.areas[0]
   */
  area: string;
  /**
   * 検索意図（カテゴリ用）。projects.keyword から自動判定。
   */
  intent: SearchIntent;
} {
  const normalized = normalizeRawAnswers(rawAnswers);
  const facts = extractLpFacts(normalized, {
    fallbackName: opts.fallbackName,
    projectTypeHint:
      opts.projectType === 'saas'
        ? 'saas'
        : opts.projectType === 'local'
        ? 'local'
        : undefined,
  });

  // 地域名は projects.area / target_area / areas / facts.region の優先順位で決定
  const areaName = resolveAreaName(facts.region, opts);

  const serviceName =
    (typeof opts.serviceOverride === 'string'
      ? opts.serviceOverride.trim()
      : '') || facts.industry || facts.businessName || '{{service_name}}';

  const intent = detectSearchIntent(opts.keywordOverride);

  // 固定ゾーン: facts / 会社・エリア・サービス名の実体（raw_answers・company_info 由来）
  // バリエーションゾーン: blockData の構成・語尾、定型 FAQ/ヒーロー補助コピー（下記 seed 駆動）
  // seed: lp_group_id + project id + variation_seed を hash した決定値（同一なら同一 LP）
  const blockSeed = deriveLpBlockSeed({
    blockSeed: opts.blockSeed,
    lpGroupId: opts.lpGroupId,
    projectStableId: opts.projectStableId,
    variationSeed: opts.variationSeed,
  });
  const blockData = buildRandomBlockData(normalized.items, {
    seed: blockSeed,
    perBlockMin: 2,
    perBlockMax: 3,
  });

  const seo = buildSeoShell(facts, {
    region: areaName,
    industry:
      (typeof opts.serviceOverride === 'string'
        ? opts.serviceOverride.trim()
        : '') || undefined,
  });
  const cvr = buildCvrShell(facts);

  const trustYears =
    facts.foundingYear?.trim() || '創業年数 非公開';
  const trustCases =
    (facts.achievementNumbers[0] &&
      `${facts.achievementNumbers[0]}件以上`) ||
    '累計実績 非公開';

  const priceRows =
    facts.achievementNumbers.length > 0
      ? [
          {
            label: 'スタンダードプラン',
            price: '¥{{price_basic}}',
            note: `${areaName}の一般的な${facts.industry || 'サービス'}向け`,
          },
          {
            label: '安心サポートプラン',
            price: '¥{{price_plus}}',
            note: 'アフターサポートや保証を重視したプラン',
          },
        ]
      : [
          {
            label: '目安料金',
            price: '¥{{price_basic}}',
            note: `${areaName}の${facts.industry || 'サービス'}の参考価格`,
          },
        ];

  const faqItems: { q: string; a: string }[] = [];
  if (facts.painKeywords[0]) {
    faqItems.push({
      q: `Q. ${facts.painKeywords[0]} という悩みにも対応できますか？`,
      a: `A. はい。${facts.solutions[0] || 'お客様の状況に合わせて最適なプランをご提案します。'}`,
    });
  }
  faqItems.push(
    {
      q: 'Q. 見積もりは無料ですか？',
      a: 'A. はい。現地調査・お見積もりまでは無料で対応いたします。',
    },
    {
      q: 'Q. 対応エリアを教えてください。',
      a: `A. 主に${areaName}周辺で対応しておりますが、詳しくはお問い合わせください。`,
    },
  );

  const company = normalizeCompanyInfo(opts.companyInfoRaw, {
    fallbackName: opts.fallbackName,
    fallbackArea: areaName,
  });

  const baseView: LpViewModel = {
    headline: seo.h1 || cvr.heroHeadline,
    subheadline: cvr.subHeadline,
    areaName,
    serviceName,
    blockData,
    relatedLinks: Array.isArray(opts.relatedLinks) ? opts.relatedLinks : undefined,
    pillarLink:
      opts.includePillarLink === false
        ? undefined
        : {
            title: buildPillarTitle(areaName, serviceName),
            slug: buildPillarSlugBase(areaName, serviceName),
          },
    ctaUrl: '#contact',
    trustYears,
    trustCases,
    priceRows,
    faqItems,
    diagnosisMode:
      opts.projectType === 'saas' ? 'consultation' : 'diagnosis',
  };

  const view = applyLpTemplateTextVariations(baseView, blockSeed);

  return { normalized, facts, view, company, service: serviceName, area: areaName, intent };
}

