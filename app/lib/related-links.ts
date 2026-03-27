import type { SupabaseClient } from '@supabase/supabase-js';
import type { SearchIntent } from './intent';

export type RelatedLink = {
  title: string;
  slug: string;
  area: string;
  service: string;
  intent: SearchIntent;
};

export type RelatedProjectRow = {
  id: string;
  slug: string;
  project_type: string | null;
  company_name: string | null;
  raw_answers: unknown;
  company_info: unknown;
  area?: string | null;
  service?: string | null;
  target_area?: string | null;
  areas?: string[] | null;
  keyword?: string | null;
  intent?: string | null;
  publish_status?: string | null;
  industry_key?: string | null;
};

function normalizeText(s: string | null | undefined): string {
  return (s ?? '').trim();
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(arr: T[], seed: number): T[] {
  const rng = mulberry32(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function intentPhrase(intent: string): string {
  switch (intent) {
    case 'price':
      return '費用相場';
    case 'trouble':
      return 'トラブル対策';
    case 'insurance':
      return '保険申請';
    case 'comparison':
      return '業者比較';
    case 'emergency':
      return '緊急対応';
    default:
      return 'ポイント';
  }
}

export function buildAnchorTitle(input: {
  area: string;
  service: string;
  intent: SearchIntent;
}): string {
  const area = normalizeText(input.area) || '地域';
  const service = normalizeText(input.service) || 'サービス';
  const phrase = intentPhrase(input.intent);
  const base = `${area}の${service}${phrase}`;
  // 15〜20文字程度を目安にしつつ、長すぎる場合はカット
  return base.length > 22 ? base.slice(0, 22) : base;
}

/**
 * 関連LPの採用ルール（後方互換）:
 * - 必須: 同一 `area` かつ同一 `service`（trim 後の文字列一致）。
 * - `industry_key` が current と候補の両方で非 NULL のときは、値が一致する行のみ。
 * - 片方または両方が NULL のときは、area+service 一致のみでよい（従来どおり）。
 */
export function passesRelatedIndustryGate(
  currentIndustryKey: string | null,
  row: Pick<RelatedProjectRow, 'industry_key'>,
): boolean {
  const a = normalizeText(currentIndustryKey) || null;
  const b = normalizeText(row.industry_key) || null;
  if (a && b) return a === b;
  return true;
}

export async function fetchRelatedProjectRows(
  supabase: SupabaseClient,
  current: {
    id: string;
    slug: string;
    area: string | null;
    service: string | null;
    intent: string | null;
    industry_key?: string | null;
  },
  opts?: { min?: number; max?: number; seed?: number },
): Promise<RelatedProjectRow[]> {
  const min = Math.max(0, opts?.min ?? 0);
  const max = Math.max(min, opts?.max ?? 5);
  const seed =
    typeof opts?.seed === 'number'
      ? opts.seed
      : Date.now() ^ Math.floor(Math.random() * 1_000_000);

  const currentId = current.id;
  const area = normalizeText(current.area);
  const service = normalizeText(current.service);
  const currentIndustryKey = normalizeText(current.industry_key) || null;

  if (!area || !service) {
    return [];
  }

  const base = () =>
    supabase
      .from('projects')
      .select(
        'id, slug, project_type, company_name, raw_answers, company_info, area, service, target_area, areas, keyword, intent, publish_status, industry_key',
      )
      .eq('publish_status', 'published')
      .not('slug', 'is', null)
      .neq('id', currentId)
      .eq('area', area)
      .eq('service', service)
      .limit(40);

  const { data, error } = await base();
  if (error) {
    console.error('[fetchRelatedProjectRows]', error);
    return [];
  }

  let out = ((data ?? []) as RelatedProjectRow[]).filter((r) =>
    passesRelatedIndustryGate(currentIndustryKey, r),
  );

  out = out.filter((r) => r.slug && r.slug.length > 0);

  if (out.length >= 6) {
    out = shuffleInPlace(out, seed);
  }

  const cap = Math.min(max, Math.max(min, out.length));
  return out.slice(0, cap);
}
