import type { Q33PriceSignal } from '@/app/lib/lp-design-layer/schema';

const PRICE_PATTERN =
  /料金|価格|費用|相場|見積|見積もり|安い|高い|コスト|プラン|明朗|追加.?料金|月額|無料/iu;

/**
 * q33 本文をルールベースでスコア。LLM は補助のみの前提。
 */
export function computeQ33PriceSignal(q33Text: string): Q33PriceSignal {
  const t = q33Text.normalize('NFKC').trim();
  if (t.length < 2) return 'medium';
  const hits = PRICE_PATTERN.test(t);
  if (!hits) return 'weak';
  // 短文でも価格ワードが複数なら strong 寄り
  const m = t.match(PRICE_PATTERN);
  const multi = (t.match(/料金|価格|費用|見積|明朗/giu) ?? []).length >= 2;
  if (multi || t.length > 80) return 'strong';
  return 'medium';
}
