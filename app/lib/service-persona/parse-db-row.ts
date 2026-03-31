import { sanitizeStringList } from '@/app/lib/service-persona/normalize';

/** DB / API 応答から安全にパースした業種人格（生成・検証用） */
export type ServicePersonaParsed = {
  id: string;
  service_key: string;
  service_name: string;
  tone: string | null;
  cta_labels: string[];
  pain_points: string[];
  faq_topics: string[];
  forbidden_words: string[];
  section_structure: string[];
  is_active: boolean;
  raw_json: Record<string, unknown> | null;
  /** 構造化ソース（直接JSON投入時はそのまま。フォーム保存時は列からの正規化コピー） */
  persona_json: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

export function parseServicePersonaRow(
  row: Record<string, unknown> | null | undefined,
): ServicePersonaParsed | null {
  if (!row || typeof row !== 'object') return null;
  const id = typeof row.id === 'string' ? row.id.trim() : '';
  const service_key =
    typeof row.service_key === 'string' ? row.service_key.trim() : '';
  const service_name =
    typeof row.service_name === 'string' ? row.service_name.trim() : '';
  if (!id || !service_key || !service_name) return null;

  const toneRaw = row.tone;
  const tone =
    typeof toneRaw === 'string' && toneRaw.trim().length > 0
      ? toneRaw.trim()
      : null;

  const created_at =
    typeof row.created_at === 'string' ? row.created_at : null;
  const updated_at =
    typeof row.updated_at === 'string' ? row.updated_at : null;

  return {
    id,
    service_key,
    service_name,
    tone,
    cta_labels: sanitizeStringList(row.cta_labels),
    pain_points: sanitizeStringList(row.pain_points),
    faq_topics: sanitizeStringList(row.faq_topics),
    forbidden_words: sanitizeStringList(row.forbidden_words),
    section_structure: sanitizeStringList(row.section_structure),
    is_active: row.is_active !== false,
    raw_json: asRecord(row.raw_json),
    persona_json: asRecord(row.persona_json),
    created_at,
    updated_at,
  };
}
