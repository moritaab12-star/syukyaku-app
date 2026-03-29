import type { RecommendedSectionRole } from '@/types/industry';

/**
 * 各 role の抽象的な目的のみ（具体見出し・文例は書かない）。
 */
const PURPOSE: Record<RecommendedSectionRole, string> = {
  hero: 'ファーストビューで価値命題と対象ユーザーを要約する',
  problems: '典型的な不安・課題を列挙し共感の土台を作る',
  solution: '課題に対する解決アプローチを提示する',
  services: '提供サービスや範囲を整理して示す',
  price: '料金の考え方や目安を透明にする',
  trust: '会社・体制・資格など信頼の根拠を示す',
  social_proof: '第三者評価や事例の存在を示す',
  flow: '利用・工事・相談の手順を順序立てて示す',
  faq: 'よくある疑問への回答で離脱を減らす',
  cta_mid: '中盤で次アクションへ誘導する',
  diagnosis: '自己チェックでニーズを言語化させる',
  consultation: '問い合わせ・予約・連絡手段へ集約する',
  related: '関連トピックへ送客する',
  footer: '運営情報と補助導線を置く',
  custom: '上記に当てはまらない補助ブロックを置く',
};

export function sectionPurposeForRole(role: RecommendedSectionRole): string {
  return PURPOSE[role] ?? PURPOSE.custom;
}
