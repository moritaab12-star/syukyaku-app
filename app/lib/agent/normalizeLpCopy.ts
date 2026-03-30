import type { LpUiCopy } from '@/app/lib/lp-ui-copy';

/** 生成・マージ後の文面を自然な敬体に整える（テンプレ骨格は変えない） */
export type NormalizeLpContext = {
  area?: string | null;
  service?: string | null;
  /** テーマ / 検索キーワード想定 */
  keyword?: string | null;
};

const LP_UI_STRING_KEYS: (keyof LpUiCopy)[] = [
  'headline',
  'subheadline',
  'hero_badge_label',
  'hero_cta_primary_phone',
  'hero_cta_primary_web',
  'hero_cta_note',
  'line_cta_label',
  'cta_second_primary_phone',
  'cta_second_primary_web',
  'cta_second_title',
  'cta_second_lead',
  'cta_second_note',
  'problems_title',
  'problems_lead',
  'diagnosis_lead',
  'diagnosis_cta_phone',
  'diagnosis_cta_web',
  'consultation_lead',
  'consultation_form_cta',
  'consultation_note',
  'trust_inline_title',
  'trust_inline_lead',
  'benefit_inline_title',
  'benefit_inline_lead',
];

const LP_UI_ARRAY_KEYS: (keyof LpUiCopy)[] = [
  'problems_bullets',
  'diagnosis_check_items',
];

function cleanArea(area: string): string {
  return area.replace(/^地域$/, '').trim();
}

function cleanService(service: string): string {
  return service.replace(/^地域密着サービス$/, '').trim();
}

/**
 * 指示文のキーワード列貼り付け風（「◯◯ 価格訴求になります」「1LP」等）を読みやすい一文へ。
 */
export function softenInstructionPaste(
  text: string,
  ctx: NormalizeLpContext,
): string {
  const t = text.trim();
  if (t.length < 6) return text;

  const looksLikePaste =
    /になります[。]?$/u.test(t) &&
    (/価格訴求|信頼訴求|問い合わせ|相談訴求/u.test(t) ||
      /\d+\s*LP/u.test(t) ||
      (t.includes(' ') && /訴求/u.test(t)));

  if (!looksLikePaste) return text;

  const area = cleanArea((ctx.area ?? '').trim());
  const svc = cleanService((ctx.service ?? '').trim());
  const head = area ? `${area}で` : '';
  const mid = svc || 'ご相談';
  return `${head}${mid}をお考えの方へ。内容に合わせて分かりやすくご案内いたします。`;
}

/** 連続空白・全角スペースの冗長を軽く整理（意味は変えない） */
function tightenWhitespace(s: string): string {
  return s
    .replace(/[\u3000]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeCopyString(
  raw: string,
  ctx: NormalizeLpContext,
): string {
  let s = typeof raw === 'string' ? raw : '';
  if (!s.trim()) return raw;
  s = softenInstructionPaste(s, ctx);
  s = tightenWhitespace(s);
  return s;
}

/** Gemini / 静的パッチの Partial<LpUiCopy> 向け */
export function normalizeLpUiCopyPatch(
  patch: Partial<LpUiCopy>,
  ctx: NormalizeLpContext,
): Partial<LpUiCopy> {
  const out: Partial<LpUiCopy> = { ...patch };

  for (const k of LP_UI_STRING_KEYS) {
    const v = patch[k];
    if (typeof v === 'string') {
      const n = normalizeCopyString(v, ctx);
      if (n !== v) (out as Record<string, string>)[k] = n;
    }
  }

  for (const k of LP_UI_ARRAY_KEYS) {
    const v = patch[k];
    if (!Array.isArray(v)) continue;
    const next = v.map((item) =>
      typeof item === 'string' ? normalizeCopyString(item, ctx) : item,
    );
    (out as Record<string, string[]>)[k] = next;
  }

  return out;
}

type LpUiRecord = Record<string, unknown>;

/** insert 用の lp_ui_copy レコード（JSON）に対して文字列ノードのみ補正 */
export function normalizeLpUiCopyRecord(
  record: LpUiRecord,
  ctx: NormalizeLpContext,
): LpUiRecord {
  const out: LpUiRecord = { ...record };

  for (const k of LP_UI_STRING_KEYS) {
    const key = k as string;
    const v = out[key];
    if (typeof v === 'string') {
      const n = normalizeCopyString(v, ctx);
      if (n !== v) out[key] = n;
    }
  }

  for (const k of LP_UI_ARRAY_KEYS) {
    const key = k as string;
    const v = out[key];
    if (!Array.isArray(v)) continue;
    out[key] = v.map((item) =>
      typeof item === 'string' ? normalizeCopyString(item, ctx) : item,
    );
  }

  return out;
}
