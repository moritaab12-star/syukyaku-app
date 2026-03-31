import {
  lpIndustryToneDescriptionForPrompt,
  resolveLpIndustryTone,
} from '@/app/lib/lp-industry';

/**
 * 指示・q23 からターゲット層のヒント（デザイン用・ヒューリスティック）。
 * LLM の design_strategy.targetType との補助一致用。
 */
export function deriveTargetProfileHint(instruction: string, q23: string): string {
  const t = `${instruction}\n${q23}`.normalize('NFKC');
  const hints: string[] = [];
  if (/学生|大学生活|一人暮らし|就活|キャンパス|若年|大学(?:生)?/.test(t)) {
    hints.push('学生・若年層寄り: 明るさ・わかりやすさを優先しつつ、信頼要素も残す。');
  }
  if (/高齢|シニア|ご年配|ご高齢|後期高齢/.test(t)) {
    hints.push('シニア寄り: 可読性・安心感・落ち着いたコントラストを優先。');
  }
  if (/法人|事業者|オーナー|投資|法人契約|勤務先|タワマン管理/.test(t)) {
    hints.push('ビジネス・オーナー寄り: 情報の整理・簡潔さ・信頼感を優先。');
  }
  if (/家族|子育て|新婚|共働き/.test(t)) {
    hints.push('家庭層寄り: 親しみやすさと安心のバランス。');
  }
  if (hints.length === 0) {
    hints.push('ターゲット特定なし: 地域密着の一般向けバランス型。');
  }
  return hints.join('\n');
}

/** デザイン LLM 用・業種の短文説明（service / industry_key から） */
export function designIndustryContextBlock(
  industryKey: string | null | undefined,
  service: string,
): string {
  const tone = resolveLpIndustryTone(
    typeof industryKey === 'string' ? industryKey : null,
    typeof service === 'string' ? service : '',
  );
  const desc = lpIndustryToneDescriptionForPrompt(tone);
  return `resolved_tone: ${tone}\n業種の説明（コピーではなく見た目の雰囲気の参考。例: 不動産は誠実さ、植木屋は自然な温かさ）: ${desc}`;
}
