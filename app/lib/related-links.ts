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
};

function normalizeText(s: string | null | undefined): string {
  return (s ?? '').trim();
}

function tokenizeService(service: string): string[] {
  return service
    .split(/[\s/・、,，]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function serviceSimilarity(a: string, b: string): number {
  const ta = new Set(tokenizeService(a));
  const tb = new Set(tokenizeService(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const x of ta) if (tb.has(x)) inter++;
  return inter / Math.max(ta.size, tb.size);
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

export async function fetchRelatedProjectRows(
  supabase: SupabaseClient,
  current: {
    id: string;
    slug: string;
    area: string | null;
    service: string | null;
    intent: string | null;
  },
  opts?: { min?: number; max?: number; seed?: number },
): Promise<RelatedProjectRow[]> {
  const min = Math.max(0, opts?.min ?? 3);
  const max = Math.max(min, opts?.max ?? 5);
  const seed =
    typeof opts?.seed === 'number'
      ? opts.seed
      : Date.now() ^ Math.floor(Math.random() * 1_000_000);

  const currentId = current.id;
  const area = normalizeText(current.area);
  const service = normalizeText(current.service);
  const intent = normalizeText(current.intent);

  const base = () =>
    supabase
      .from('projects')
      .select(
        'id, slug, project_type, company_name, raw_answers, company_info, area, service, target_area, areas, keyword, intent, publish_status',
      )
      .eq('publish_status', 'published')
      .not('slug', 'is', null)
      .neq('id', currentId);

  const picked = new Map<string, RelatedProjectRow>();

  // 1) 同じ service かつ同じ area
  if (service && area) {
    const { data } = await base()
      .eq('service', service)
      .eq('area', area)
      .limit(12);
    (data ?? []).forEach((r: any) => picked.set(r.id, r));
  }

  // 2) 同じ service で intent が異なる
  if (service && picked.size < max) {
    const q = base().eq('service', service);
    const { data } = intent
      ? await q.neq('intent', intent).limit(18)
      : await q.limit(18);
    (data ?? []).forEach((r: any) => picked.set(r.id, r));
  }

  // 3) 同じ area で service が近い（トークン一致率）
  if (area && picked.size < max) {
    const { data } = await base().eq('area', area).limit(30);
    const rows = (data ?? []) as RelatedProjectRow[];
    rows.sort((a, b) => {
      const sa = serviceSimilarity(service, normalizeText(a.service));
      const sb = serviceSimilarity(service, normalizeText(b.service));
      return sb - sa;
    });
    rows.slice(0, 20).forEach((r) => picked.set(r.id, r));
  }

  let out = Array.from(picked.values()).filter((r) => r.slug && r.slug.length > 0);

  // 多い場合はシャッフルして分散
  if (out.length >= 6) {
    out = shuffleInPlace(out, seed);
  }

  // 3〜5件程度
  return out.slice(0, Math.min(max, Math.max(min, out.length)));
}

