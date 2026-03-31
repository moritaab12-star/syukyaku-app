import type { ServicePersonaCreateBody } from '@/app/lib/service-persona/schema';
import type { ServicePersonaParsed } from '@/app/lib/service-persona/parse-db-row';
import {
  formatServiceMasterJsonError,
  serviceMasterJsonSchema,
} from '@/app/lib/service-persona/master-json-schema';
import {
  extractHeroAnglesFromSection,
  heroAnglesToSectionLines,
  mergeUniqueStringLists,
  stripHeroPrefixedLines,
} from '@/app/lib/service-persona/persona-json-mapper';

export type MasterJsonParseResult =
  | { _result: 'valid'; data: Record<string, unknown> }
  | { _result: 'invalid'; error: string };

/**
 * master_json テキスト: JSON.parse + ルートがオブジェクト + service_key 必須。
 */
export function parseMasterJsonText(text: string): MasterJsonParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    return {
      _result: 'invalid',
      error:
        'JSON の構文が不正です（括弧・カンマ・引用符を確認してください）',
    };
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      _result: 'invalid',
      error: 'ルートは JSON オブジェクトである必要があります（配列は不可）',
    };
  }
  const parsed = serviceMasterJsonSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      _result: 'invalid',
      error: formatServiceMasterJsonError(parsed.error),
    };
  }
  return { _result: 'valid', data: parsed.data as Record<string, unknown> };
}

function asStr(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

function strList(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== 'string') continue;
    const t = x.normalize('NFKC').trim();
    if (t) out.push(t.slice(0, 2000));
    if (out.length >= max) break;
  }
  return out;
}

function asSub(
  obj: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const v = obj[key];
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

/**
 * master_json（任意ネスト）から既存フラット列への投影（LP 後方互換・検索用）。
 */
export function flatColumnsFromMasterJson(
  master: Record<string, unknown>,
): {
  service_key: string;
  service_name: string;
  tone: string | null;
  cta_labels: string[];
  pain_points: string[];
  faq_topics: string[];
  forbidden_words: string[];
  section_structure: string[];
  is_active: boolean;
} {
  const basic = asSub(master, 'basic');
  const lr = asSub(master, 'language_rules');
  const cr = asSub(master, 'content_rules');
  const ctaR = asSub(master, 'cta_rules');
  const sr = asSub(master, 'structure_rules');

  const service_key = (asStr(master.service_key) ?? '').trim();
  const service_name = (
    asStr(basic?.service_name) ??
    asStr(master.service_name) ??
    service_key
  ).slice(0, 200);
  const toneRaw = asStr(basic?.tone) ?? asStr(master.tone);
  const tone = toneRaw ?? null;

  const cta_labels = mergeUniqueStringLists(
    strList(ctaR?.patterns, 200),
    strList(master.cta_patterns, 200),
    strList(master.cta_labels, 200),
  );
  const pain_points = mergeUniqueStringLists(
    strList(cr?.pain_points, 200),
    strList(master.pain_point_patterns, 200),
    strList(master.pain_points, 200),
  );
  const faq_topics = mergeUniqueStringLists(
    strList(cr?.faq_topics, 200),
    strList(master.faq_topics, 200),
  );
  const forbidden_words = mergeUniqueStringLists(
    strList(lr?.forbidden_words, 200),
    strList(master.forbidden_words, 200),
  );
  const hero = mergeUniqueStringLists(
    strList(cr?.hero_angles, 200),
    strList(master.hero_angles, 200),
  );
  const sectionOrder = mergeUniqueStringLists(
    strList(sr?.section_order, 200),
    strList(sr?.required_sections, 200),
    strList(master.section_structure, 200),
  );
  const section_structure = mergeUniqueStringLists(
    heroAnglesToSectionLines(hero),
    sectionOrder,
  );
  const is_active = master.is_active !== false;

  return {
    service_key,
    service_name,
    tone,
    cta_labels,
    pain_points,
    faq_topics,
    forbidden_words,
    section_structure,
    is_active,
  };
}

/** フォーム → ネストした master_json（拡張用の空オブジェクト/配列を含む） */
export function canonicalNestedMasterFromFormBody(
  body: ServicePersonaCreateBody,
): Record<string, unknown> {
  const hero_angles = extractHeroAnglesFromSection(body.section_structure);
  const section_order = stripHeroPrefixedLines(body.section_structure);
  return {
    service_key: body.service_key,
    basic: {
      service_name: body.service_name,
      tone: body.tone ?? null,
    },
    language_rules: {
      preferred_words: [] as string[],
      forbidden_words: [...body.forbidden_words],
      worldview_keywords: [] as string[],
    },
    cta_rules: {
      patterns: [...body.cta_labels],
      allowed_types: [] as string[],
      placement: [] as string[],
    },
    content_rules: {
      pain_points: [...body.pain_points],
      faq_topics: [...body.faq_topics],
      hero_angles,
      proof_elements: [] as string[],
    },
    structure_rules: {
      section_order: [...section_order],
      required_sections: [] as string[],
    },
    design_rules: {
      cta_color: '',
      cta_shape: '',
      layout_patterns: [] as string[],
    },
    writing_rules: [] as string[],
    compliance_rules: [] as string[],
    is_active: body.is_active,
  };
}

/** DB 行同期用: フラット列からネスト master を再構築 */
export function canonicalNestedMasterFromParsedRow(
  row: ServicePersonaParsed,
): Record<string, unknown> {
  const hero_angles = extractHeroAnglesFromSection(row.section_structure);
  const section_order = stripHeroPrefixedLines(row.section_structure);
  return {
    service_key: row.service_key,
    basic: {
      service_name: row.service_name,
      tone: row.tone,
    },
    language_rules: {
      preferred_words: [] as string[],
      forbidden_words: [...row.forbidden_words],
      worldview_keywords: [] as string[],
    },
    cta_rules: {
      patterns: [...row.cta_labels],
      allowed_types: [] as string[],
      placement: [] as string[],
    },
    content_rules: {
      pain_points: [...row.pain_points],
      faq_topics: [...row.faq_topics],
      hero_angles,
      proof_elements: [] as string[],
    },
    structure_rules: {
      section_order: [...section_order],
      required_sections: [] as string[],
    },
    design_rules: {
      cta_color: '',
      cta_shape: '',
      layout_patterns: [] as string[],
    },
    writing_rules: [] as string[],
    compliance_rules: [] as string[],
    is_active: row.is_active,
  };
}

/** master_json → フォーム反映用（フラット投影＋ヒーロー角度をセクションに戻す） */
export function formStateFromMasterJson(master: Record<string, unknown>): {
  serviceKey: string;
  serviceName: string;
  tone: string;
  ctaLines: string;
  painLines: string;
  faqLines: string;
  forbiddenLines: string;
  sectionLines: string;
  isActive: boolean;
} {
  const f = flatColumnsFromMasterJson(master);
  const hero = extractHeroAnglesFromSection(f.section_structure);
  const sectionOnly = stripHeroPrefixedLines(f.section_structure);
  const sectionLines = [
    ...hero.map((h) => `ヒーロー角度: ${h}`),
    ...sectionOnly,
  ].join('\n');

  return {
    serviceKey: f.service_key,
    serviceName: f.service_name,
    tone: f.tone ?? '',
    ctaLines: f.cta_labels.join('\n'),
    painLines: f.pain_points.join('\n'),
    faqLines: f.faq_topics.join('\n'),
    forbiddenLines: f.forbidden_words.join('\n'),
    sectionLines,
    isActive: f.is_active,
  };
}
