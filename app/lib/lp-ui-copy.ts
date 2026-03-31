/**
 * projects.lp_ui_copy（JSONB）の型とパース。
 * buildLpHtmlMarkup で参照し、未設定時は従来の定型文を使う。
 */

export type LpUiServiceCard = { title: string; text: string };
export type LpUiPriceRow = { label: string; price: string; note: string };
export type LpUiFlowStep = { title: string; text: string };
export type LpUiFaqItem = { q: string; a: string };

export type LpUiCopy = {
  headline?: string;
  subheadline?: string;
  hero_badge_label?: string;
  /** ヒーロー「対応エリア：…」相当の1行全文（任意・生成優先） */
  hero_meta_line_1?: string;
  /** ヒーロー「運営：…」相当の1行全文（任意） */
  hero_meta_line_2?: string;
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
  /** 解決セクション見出し（本文のサービス名は別途差し込み可） */
  solution_section_title?: string;
  solution_lead_body?: string;
  solution_bullets?: string[];
  services_section_title?: string;
  service_cards?: LpUiServiceCard[];
  price_section_title?: string;
  price_section_lead?: string;
  price_table_footer_note?: string;
  price_rows?: LpUiPriceRow[];
  flow_section_title?: string;
  flow_steps?: LpUiFlowStep[];
  narrative_trust_items?: string[];
  narrative_local_items?: string[];
  narrative_pain_items?: string[];
  narrative_strength_items?: string[];
  narrative_story_items?: string[];
  faq_items?: LpUiFaqItem[];
  trust_review_1_text?: string;
  trust_review_1_meta?: string;
  trust_review_2_text?: string;
  trust_review_2_meta?: string;
  trust_metric_years_label?: string;
  trust_metric_cases_label?: string;
  trust_metric_area_label?: string;
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

function parseServiceCards(v: unknown): LpUiServiceCard[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: LpUiServiceCard[] = [];
  for (const x of v) {
    if (!isObj(x)) continue;
    const title = asTrimString(x.title);
    const text = asTrimString(x.text);
    if (title && text) out.push({ title, text });
  }
  return out.length > 0 ? out.slice(0, 3) : undefined;
}

function parsePriceRows(v: unknown): LpUiPriceRow[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: LpUiPriceRow[] = [];
  for (const x of v) {
    if (!isObj(x)) continue;
    const label = asTrimString(x.label);
    const price = asTrimString(x.price);
    const note = asTrimString(x.note);
    if (label && price && note) out.push({ label, price, note });
  }
  return out.length > 0 ? out.slice(0, 4) : undefined;
}

function parseFlowSteps(v: unknown): LpUiFlowStep[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: LpUiFlowStep[] = [];
  for (const x of v) {
    if (!isObj(x)) continue;
    const title = asTrimString(x.title);
    const text = asTrimString(x.text);
    if (title && text) out.push({ title, text });
  }
  return out.length > 0 ? out.slice(0, 5) : undefined;
}

function parseFaqItems(v: unknown): LpUiFaqItem[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: LpUiFaqItem[] = [];
  for (const x of v) {
    if (!isObj(x)) continue;
    const q = asTrimString(x.q ?? x.question);
    const a = asTrimString(x.a ?? x.answer);
    if (q && a) out.push({ q, a });
  }
  return out.length >= 2 ? out.slice(0, 10) : undefined;
}

function parseLenientStringList(v: unknown, max: number): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .filter((x) => typeof x === 'string' && x.trim().length > 0)
    .map((x) => String(x).trim());
  return out.length > 0 ? out.slice(0, max) : undefined;
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
    | 'problems_bullets'
    | 'diagnosis_check_items'
    | 'solution_bullets'
    | 'service_cards'
    | 'price_rows'
    | 'flow_steps'
    | 'faq_items'
    | 'narrative_trust_items'
    | 'narrative_local_items'
    | 'narrative_pain_items'
    | 'narrative_strength_items'
    | 'narrative_story_items'
  >;
  const set = <K extends LpUiCopyStringKey>(k: K, key: string) => {
    const s = asTrimString(o[key]);
    if (s) copy[k] = s as LpUiCopy[K];
  };

  set('headline', 'headline');
  set('subheadline', 'subheadline');
  set('hero_badge_label', 'hero_badge_label');
  set('hero_meta_line_1', 'hero_meta_line_1');
  set('hero_meta_line_2', 'hero_meta_line_2');
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
  set('solution_section_title', 'solution_section_title');
  set('solution_lead_body', 'solution_lead_body');
  set('services_section_title', 'services_section_title');
  set('price_section_title', 'price_section_title');
  set('price_section_lead', 'price_section_lead');
  set('price_table_footer_note', 'price_table_footer_note');
  set('flow_section_title', 'flow_section_title');
  set('trust_review_1_text', 'trust_review_1_text');
  set('trust_review_1_meta', 'trust_review_1_meta');
  set('trust_review_2_text', 'trust_review_2_text');
  set('trust_review_2_meta', 'trust_review_2_meta');
  set('trust_metric_years_label', 'trust_metric_years_label');
  set('trust_metric_cases_label', 'trust_metric_cases_label');
  set('trust_metric_area_label', 'trust_metric_area_label');

  if (bullets) copy.problems_bullets = bullets;
  if (checks) copy.diagnosis_check_items = checks;

  const solBullets = parseLenientStringList(o.solution_bullets, 5);
  if (solBullets) copy.solution_bullets = solBullets;

  const cards = parseServiceCards(o.service_cards);
  if (cards) copy.service_cards = cards;

  const pr = parsePriceRows(o.price_rows);
  if (pr) copy.price_rows = pr;

  const fs = parseFlowSteps(o.flow_steps);
  if (fs) copy.flow_steps = fs;

  const fq = parseFaqItems(o.faq_items);
  if (fq) copy.faq_items = fq;

  const nt = parseLenientStringList(o.narrative_trust_items, 8);
  if (nt) copy.narrative_trust_items = nt;
  const nl = parseLenientStringList(o.narrative_local_items, 8);
  if (nl) copy.narrative_local_items = nl;
  const np = parseLenientStringList(o.narrative_pain_items, 8);
  if (np) copy.narrative_pain_items = np;
  const nst = parseLenientStringList(o.narrative_strength_items, 8);
  if (nst) copy.narrative_strength_items = nst;
  const nst2 = parseLenientStringList(o.narrative_story_items, 8);
  if (nst2) copy.narrative_story_items = nst2;

  return Object.keys(copy).length > 0 ? copy : null;
}

/**
 * mode 用静的下地（modeBase）を土台にし、DB raw に存在する項目は DB を優先する（浅いマージ・DB が上書き）。
 */
export function mergeLpUiCopyModeBaseWithDb(
  modeBase: Partial<LpUiCopy>,
  dbRaw: unknown,
): LpUiCopy | null {
  const db = parseLpUiCopy(dbRaw);
  const merged: LpUiCopy = {
    ...(modeBase as LpUiCopy),
    ...(db ?? {}),
  };
  const pruned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(merged)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && !v.trim()) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    pruned[k] = v;
  }
  return Object.keys(pruned).length > 0 ? (pruned as LpUiCopy) : null;
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
