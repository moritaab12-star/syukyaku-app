/**
 * projects.lp_ui_copy（JSONB）の型とパース。
 * buildLpHtmlMarkup で参照し、未設定時は従来の定型文を使う。
 */

export type LpUiCopy = {
  headline?: string;
  subheadline?: string;
  hero_badge_label?: string;
  hero_cta_primary_phone?: string;
  hero_cta_primary_web?: string;
  hero_cta_note?: string;
  line_cta_label?: string;
  cta_second_primary_phone?: string;
  cta_second_primary_web?: string;
  cta_second_title?: string;
  cta_second_lead?: string;
  cta_second_note?: string;
  problems_title?: string;
  problems_lead?: string;
  problems_bullets?: string[];
  diagnosis_lead?: string;
  diagnosis_check_items?: string[];
  diagnosis_cta_phone?: string;
  diagnosis_cta_web?: string;
  consultation_lead?: string;
  consultation_form_cta?: string;
  consultation_note?: string;
  trust_inline_title?: string;
  trust_inline_lead?: string;
  benefit_inline_title?: string;
  benefit_inline_lead?: string;
};

function isObj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function asTrimString(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

function asStringArray(v: unknown, len: number): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .filter((x) => typeof x === 'string' && x.trim().length > 0)
    .map((x) => String(x).trim());
  if (out.length < len) return undefined;
  return out.slice(0, len);
}

export function parseLpUiCopy(raw: unknown): LpUiCopy | null {
  if (raw == null) return null;
  if (!isObj(raw)) return null;
  const o = raw;
  const bullets = asStringArray(o.problems_bullets, 3);
  const checks = asStringArray(o.diagnosis_check_items, 3);

  const copy: LpUiCopy = {};
  type LpUiCopyStringKey = Exclude<
    keyof LpUiCopy,
    'problems_bullets' | 'diagnosis_check_items'
  >;
  const set = <K extends LpUiCopyStringKey>(k: K, key: string) => {
    const s = asTrimString(o[key]);
    if (s) copy[k] = s as LpUiCopy[K];
  };

  set('headline', 'headline');
  set('subheadline', 'subheadline');
  set('hero_badge_label', 'hero_badge_label');
  set('hero_cta_primary_phone', 'hero_cta_primary_phone');
  set('hero_cta_primary_web', 'hero_cta_primary_web');
  set('hero_cta_note', 'hero_cta_note');
  set('line_cta_label', 'line_cta_label');
  set('cta_second_primary_phone', 'cta_second_primary_phone');
  set('cta_second_primary_web', 'cta_second_primary_web');
  set('cta_second_title', 'cta_second_title');
  set('cta_second_lead', 'cta_second_lead');
  set('cta_second_note', 'cta_second_note');
  set('problems_title', 'problems_title');
  set('problems_lead', 'problems_lead');
  set('diagnosis_lead', 'diagnosis_lead');
  set('diagnosis_cta_phone', 'diagnosis_cta_phone');
  set('diagnosis_cta_web', 'diagnosis_cta_web');
  set('consultation_lead', 'consultation_lead');
  set('consultation_form_cta', 'consultation_form_cta');
  set('consultation_note', 'consultation_note');
  set('trust_inline_title', 'trust_inline_title');
  set('trust_inline_lead', 'trust_inline_lead');
  set('benefit_inline_title', 'benefit_inline_title');
  set('benefit_inline_lead', 'benefit_inline_lead');

  if (bullets) copy.problems_bullets = bullets;
  if (checks) copy.diagnosis_check_items = checks;

  return Object.keys(copy).length > 0 ? copy : null;
}

/** 兄弟行の差別化用: headline のみ抽出 */
export function lpUiCopyHeadlineFromRow(row: {
  fv_catch_headline?: string | null;
  lp_ui_copy?: unknown;
}): string {
  const u = parseLpUiCopy(row.lp_ui_copy);
  const h = u?.headline?.trim();
  if (h) return h;
  const f = row.fv_catch_headline?.trim();
  return f ?? '';
}
