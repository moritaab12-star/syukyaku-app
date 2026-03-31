import type { ServicePersonaCreateBody } from '@/app/lib/service-persona/schema';
import {
  formatZodPersonaJsonError,
  servicePersonaPersonaJsonSchema,
  type ServicePersonaPersonaJsonValidated,
} from '@/app/lib/service-persona/persona-json-schema';
import type { ServicePersonaParsed } from '@/app/lib/service-persona/parse-db-row';

export function mergeUniqueStringLists(...lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const s of list) {
      const t = s.normalize('NFKC').trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/** hero_angles を section_structure 用にプレフィックス付きで結合（プロンプトで区別しやすく） */
function heroAnglesToSectionLines(hero: string[]): string[] {
  return hero.map((h) =>
    /^ヒーロー角度:/.test(h) ? h : `ヒーロー角度: ${h}`,
  );
}

/**
 * Zod 通過後の JSON を DB 列 + 保存用 persona_json オブジェクトに変換。
 * 単一ソース・マージしない（配列キーは JSON 内で別名があればここで縦に結合するだけ）。
 */
export function personaJsonValidatedToDbPayload(
  data: ServicePersonaPersonaJsonValidated,
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
  persona_json: Record<string, unknown>;
} {
  const cta_labels = mergeUniqueStringLists(
    data.cta_patterns,
    data.cta_labels,
  );
  const pain_points = mergeUniqueStringLists(
    data.pain_point_patterns,
    data.pain_points,
  );
  const faq_topics = mergeUniqueStringLists(data.faq_topics);
  const forbidden_words = mergeUniqueStringLists(data.forbidden_words);
  const hero = mergeUniqueStringLists(data.hero_angles);
  const sectionRaw = mergeUniqueStringLists(data.section_structure);
  const section_structure = mergeUniqueStringLists(
    heroAnglesToSectionLines(hero),
    sectionRaw,
  );

  const service_key = data.service_key.trim();
  const service_name =
    (data.service_name?.trim() || service_key).slice(0, 200);
  const tone =
    typeof data.tone === 'string' && data.tone.trim().length > 0
      ? data.tone.trim()
      : null;
  const is_active = data.is_active !== false;

  const persona_json: Record<string, unknown> = {
    ...(data as Record<string, unknown>),
  };
  persona_json.service_key = service_key;
  persona_json.service_name = service_name;
  persona_json.tone = tone;
  persona_json.cta_patterns = data.cta_patterns;
  persona_json.cta_labels = data.cta_labels;
  persona_json.pain_point_patterns = data.pain_point_patterns;
  persona_json.pain_points = data.pain_points;
  persona_json.hero_angles = data.hero_angles;
  persona_json.faq_topics = data.faq_topics;
  persona_json.forbidden_words = data.forbidden_words;
  persona_json.section_structure = data.section_structure;
  persona_json.is_active = is_active;

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
    persona_json,
  };
}

export type PersonaJsonParseResult =
  | { _result: 'valid'; data: ServicePersonaPersonaJsonValidated }
  | { _result: 'invalid'; error: string };

/**
 * persona JSON テキストを検証する。
 * 判別子は `_result`（Zod passthrough 由来のキーと衝突しにくい）。
 */
export function parsePersonaJsonText(text: string): PersonaJsonParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    return {
      _result: 'invalid',
      error: 'JSON の構文が不正です（括弧・カンマ・引用符を確認してください）',
    };
  }
  const parsed = servicePersonaPersonaJsonSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      _result: 'invalid',
      error: formatZodPersonaJsonError(parsed.error),
    };
  }
  return { _result: 'valid', data: parsed.data };
}

/**
 * フォーム保存時・「フォームからJSON生成」用:
 * セクション内の「ヒーロー角度:」行を hero_angles と section_structure に分割する。
 */
export function canonicalPersonaJsonFromFormBody(
  body: ServicePersonaCreateBody,
): Record<string, unknown> {
  const hero_angles = extractHeroAnglesFromSection(body.section_structure);
  const section_structure = stripHeroPrefixedLines(body.section_structure);
  return {
    service_key: body.service_key,
    service_name: body.service_name,
    tone: body.tone ?? null,
    cta_patterns: [...body.cta_labels],
    cta_labels: [...body.cta_labels],
    pain_point_patterns: [...body.pain_points],
    pain_points: [...body.pain_points],
    hero_angles,
    faq_topics: [...body.faq_topics],
    forbidden_words: [...body.forbidden_words],
    section_structure,
    is_active: body.is_active,
  };
}

export function canonicalPersonaJsonFromParsedRow(
  row: ServicePersonaParsed,
): Record<string, unknown> {
  return {
    service_key: row.service_key,
    service_name: row.service_name,
    tone: row.tone,
    cta_patterns: [...row.cta_labels],
    cta_labels: [...row.cta_labels],
    pain_point_patterns: [...row.pain_points],
    pain_points: [...row.pain_points],
    hero_angles: extractHeroAnglesFromSection(row.section_structure),
    faq_topics: [...row.faq_topics],
    forbidden_words: [...row.forbidden_words],
    section_structure: stripHeroPrefixedLines(row.section_structure),
    is_active: row.is_active,
  };
}

function extractHeroAnglesFromSection(section: string[]): string[] {
  const out: string[] = [];
  for (const line of section) {
    const t = line.trim();
    if (t.startsWith('ヒーロー角度:')) {
      out.push(t.replace(/^ヒーロー角度:\s*/, '').trim());
    }
  }
  return out;
}

function stripHeroPrefixedLines(section: string[]): string[] {
  return section.filter((line) => !line.trim().startsWith('ヒーロー角度:'));
}
