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

const LP_UI_COPY_STRING_KEYS: (keyof LpUiCopy)[] = [
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

const LP_UI_COPY_ARRAY_KEYS: (keyof LpUiCopy)[] = [
  'problems_bullets',
  'diagnosis_check_items',
];

function lenientStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .filter((x) => typeof x === 'string' && x.trim().length > 0)
    .map((x) => String(x).trim());
  return out.length > 0 ? out : undefined;
}

/**
 * DB の lp_ui_copy 生値から上書き判定用に項目を取り出す。
 * 配列は 1 件以上あれば採用（parseLpUiCopy は 3 件必須のため、merge 専用）。
 */
function extractDbLpUiCopyOverlay(raw: unknown): Partial<LpUiCopy> {
  if (raw == null || !isObj(raw)) return {};
  const o = raw;
  const out: Partial<LpUiCopy> = {};

  for (const k of LP_UI_COPY_STRING_KEYS) {
    const s = asTrimString(o[k as string]);
    if (s) (out as Record<string, string>)[k as string] = s;
  }

  const bullets = lenientStringArray(o.problems_bullets);
  if (bullets) out.problems_bullets = bullets.slice(0, 3);

  const checks = lenientStringArray(o.diagnosis_check_items);
  if (checks) out.diagnosis_check_items = checks.slice(0, 3);

  return out;
}

/**
 * mode 用静的下地（modeBase）を土台にし、DB raw に存在する項目は DB を優先する。
 * 文字列: 非空なら DB、なければ modeBase。配列: DB に 1 件以上なら DB 全体、なければ modeBase。
 */
export function mergeLpUiCopyModeBaseWithDb(
  modeBase: Partial<LpUiCopy>,
  dbRaw: unknown,
): LpUiCopy | null {
  const db = extractDbLpUiCopyOverlay(dbRaw);
  const out: LpUiCopy = {};

  for (const k of LP_UI_COPY_STRING_KEYS) {
    const d = db[k];
    const b = modeBase[k];
    const fromDb = typeof d === 'string' && d.trim().length > 0;
    const fromBase = typeof b === 'string' && b.trim().length > 0;
    const v = fromDb ? d!.trim() : fromBase ? (b as string).trim() : undefined;
    if (v !== undefined) (out as Record<string, string>)[k as string] = v;
  }

  for (const k of LP_UI_COPY_ARRAY_KEYS) {
    const d = db[k];
    const b = modeBase[k];
    const dbArr = Array.isArray(d) && d.length > 0 ? d : undefined;
    const baseArr = Array.isArray(b) && b.length > 0 ? b : undefined;
    const pick = dbArr ?? baseArr;
    if (pick && pick.length > 0) {
      const cleaned = pick
        .filter((x) => typeof x === 'string' && x.trim().length > 0)
        .map((x) => String(x).trim())
        .slice(0, 3);
      if (cleaned.length > 0) (out as Record<string, string[]>)[k as string] = cleaned;
    }
  }

  return Object.keys(out).length > 0 ? out : null;
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
