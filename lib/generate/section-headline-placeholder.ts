import type { RecommendedSectionRole } from '@/types/industry';
import type { LpViewModel } from '@/app/lib/lp-template';

/**
 * GeneratedLp 用の見出しプレースホルダ（コピー生成は後続フェーズ。構造 E2E 用の短い固定形式）
 */
export function sectionHeadlinePlaceholder(
  role: RecommendedSectionRole,
  view: LpViewModel,
): string {
  const s = view.serviceName || 'サービス';
  const a = view.areaName || '地域';
  const map: Partial<Record<RecommendedSectionRole, string>> = {
    hero: view.headline,
    problems: `${a}のお客様によくあるお悩み`,
    solution: `そのお悩み、${s}が解決します`,
    services: `${s}の内容`,
    price: '料金の目安',
    trust: '信頼・実績',
    social_proof: 'お客様の声',
    flow: 'ご利用の流れ',
    faq: 'よくあるご質問',
    cta_mid: 'お問い合わせ',
    diagnosis: 'かんたん診断',
    consultation: '無料相談',
    related: '関連ページ',
    footer: '運営情報',
    custom: 'その他',
  };
  return map[role] ?? 'セクション';
}
