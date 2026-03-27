import type { LpViewModel } from './lp-template';
import type { LpIndustryTone } from './lp-industry';
import { deriveTemplateLayerSeed, mulberry32, pickFrom } from './lp-prng-seed';

/**
 * バリエーションゾーン（seed でブロック単位に選択）:
 * - ヒーロー直下の補助コピー、定型 FAQ の言い回し、診断セクション見出しの言い換え
 *
 * 固定ゾーン（ここでは触らない）:
 * - 会社情報・連絡先、エリア名・サービス名の実体、company_info、raw_answers 由来の core 事実、
 *   facts ベースで組んだ見出し本体や Q に埋め込んだ悩みキーワードなど
 */

const SUBHEADLINE_GENERAL = (area: string, service: string) =>
  [
    `${area}の${service}でお困りの方へ。経験に基づくご提案で、安心してお任せいただけます。`,
    `${area}エリアの${service}。丁寧なヒアリングから、ご希望に沿った内容をご案内します。`,
    `${area}で選ばれる${service}。分かりやすい説明とスムーズな対応を心がけています。`,
    `${area}にお住まいの方、${service}のご相談はお気軽に。初回のご相談からしっかりサポートします。`,
    `${area}の${service}なら、現場の実情に合わせたご提案が可能です。まずはご連絡ください。`,
    `${area}周辺の${service}。お客様の状況に合わせ、無理のないご提案をいたします。`,
  ] as const;

const SUBHEADLINE_GARDEN = (area: string, service: string) =>
  [
    `${area}の${service}。剪定やお手入れのタイミングも含め、ご相談に応じます。`,
    `${area}エリアの庭木・植え込み。樹種に合わせたお手入れをご提案します。`,
    `${area}でお庭のお悩みなら。現地を見ながら優先順位を一緒に決めます。`,
    `${area}の${service}なら、近隣や安全の配慮も含めてご説明します。`,
    `${area}にお住まいの方へ。伸びすぎ・枯れ・倒木の不安もお気軽にご相談ください。`,
    `${area}周辺の${service}。季節に合わせた剪定のご提案が可能です。`,
  ] as const;

const SUBHEADLINE_BUILD = (area: string, service: string) =>
  [
    `${area}の${service}。現地調査のうえ、工事内容とお見積もりをご提示します。`,
    `${area}エリアの施工。範囲・材質に合わせて、分かりやすくご説明します。`,
    `${area}でリフォーム・修繕をお考えの方へ。無理のない工程でご提案します。`,
    `${area}の${service}なら、雨風や劣化の傾向も踏まえてご相談に応じます。`,
    `${area}にお住まいの方、まずは現状のお悩みからお聞かせください。`,
    `${area}周辺の${service}。お見積もり・ご相談から丁寧に対応します。`,
  ] as const;

function subheadlinesForTone(
  area: string,
  service: string,
  tone: LpIndustryTone,
): readonly string[] {
  switch (tone) {
    case 'garden':
      return SUBHEADLINE_GARDEN(area, service);
    case 'reform':
    case 'roof':
    case 'exterior':
      return SUBHEADLINE_BUILD(area, service);
    default:
      return SUBHEADLINE_GENERAL(area, service);
  }
}

const ESTIMATE_FAQ = [
  {
    q: 'Q. 見積もりは無料ですか？',
    a: 'A. はい。現地調査・お見積もりまでは無料で対応いたします。',
  },
  {
    q: 'Q. お見積もりに費用はかかりますか？',
    a: 'A. いいえ。調査からお見積もりまでは無料ですので、お気軽にお問い合わせください。',
  },
  {
    q: 'Q. 初回の見積もりは無料でしょうか？',
    a: 'A. はい。現地確認とお見積もりは無料で承っております。',
  },
] as const;

const AREA_FAQ = (areaName: string) =>
  [
    {
      q: 'Q. 対応エリアを教えてください。',
      a: `A. 主に${areaName}周辺で対応しておりますが、詳しくはお問い合わせください。`,
    },
    {
      q: 'Q. どの地域まで対応していますか？',
      a: `A. 中心は${areaName}周辺です。案件により異なる場合がありますので、一度ご相談ください。`,
    },
    {
      q: 'Q. 出張対応の範囲はどこまでですか？',
      a: `A. 基本は${areaName}エリアを想定しています。詳細はお問い合わせ時にご案内します。`,
    },
  ] as const;

const DIAGNOSIS_TITLES = [
  '3つ当てはまったら早めの診断をおすすめします',
  '該当が複数ある場合は、早めのご相談がおすすめです',
  'いくつ当てはまりましたか？気になる場合は専門家にご相談ください',
] as const;

const CONSULTATION_TITLES = [
  'まずは無料相談からはじめませんか？',
  'お悩みの段階でも大丈夫です。無料でご相談を承ります',
  '状況を伺ったうえで、最適な進め方をご提案します',
] as const;

/**
 * buildLpViewModel 後の view に対し、テンプレート層だけを seed 付きで差し替える。
 * 同一 templateSeed なら同一結果（再現性）。
 */
export function applyLpTemplateTextVariations(
  view: LpViewModel,
  blockSeed: number,
): LpViewModel {
  const tplSeed = deriveTemplateLayerSeed(blockSeed);
  const rng = mulberry32(tplSeed);

  const subs = subheadlinesForTone(
    view.areaName,
    view.serviceName,
    view.industryTone,
  );
  const subheadline = pickFrom(subs, rng) ?? view.subheadline;

  const faq = view.faqItems.slice();
  const n = faq.length;
  if (n >= 2) {
    const est = pickFrom(ESTIMATE_FAQ, rng);
    const areaF = pickFrom(AREA_FAQ(view.areaName), rng);
    if (est) faq[n - 2] = { q: est.q, a: est.a };
    if (areaF) faq[n - 1] = { q: areaF.q, a: areaF.a };
  }

  const diagPool =
    view.diagnosisMode === 'diagnosis' ? DIAGNOSIS_TITLES : CONSULTATION_TITLES;
  const diagnosisSectionTitleOverride = pickFrom(diagPool, rng);

  return {
    ...view,
    subheadline,
    faqItems: faq,
    diagnosisSectionTitleOverride,
  };
}
