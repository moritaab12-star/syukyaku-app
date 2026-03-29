import type { AgentAppealMode } from '@/app/lib/agent/types';
import type { ParsedInstruction } from '@/app/lib/agent/types';

const PRICE =
  /費用|料金|相場|見積|価格|コスト|安い|リーズナブル|明朗|明示|坪単価|無料見積/;
const TRUST =
  /信頼|実績|工事件数|創業|保証|許可|認定|顧客満足|口コミ|選ばれる|安心/;
const EMPATHY = /不安|悩み|困っ|心配|共感|お困り|ひとり|親身|寄り添/;
const URGENCY = /危険|放置|劣化|雨漏り|急ぎ|今すぐ|早めに|損|ショート/;
const LOCAL = /地域|地元|市内|区内|エリア密着|訪問|近所|採用/;

export type SelectModeInput = {
  themeTitle: string;
  keyword: string;
  parsed: ParsedInstruction;
};

/**
 * 訴求モード（ルールベース）。HTML テンプレ cv/trust とは別概念。
 */
export function selectMode(input: SelectModeInput): { mode: AgentAppealMode } {
  const blob = [
    input.themeTitle,
    input.keyword,
    input.parsed.target,
    input.parsed.appeal,
    input.parsed.area,
  ]
    .filter(Boolean)
    .join(' ');

  if (PRICE.test(blob)) return { mode: 'price' };
  if (URGENCY.test(blob)) return { mode: 'urgency' };
  if (EMPATHY.test(blob)) return { mode: 'empathy' };
  if (TRUST.test(blob)) return { mode: 'trust' };
  if (LOCAL.test(blob) || (input.parsed.area && input.parsed.area !== '地域'))
    return { mode: 'local' };

  return { mode: 'trust' };
}
