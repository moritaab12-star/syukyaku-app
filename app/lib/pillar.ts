import type { SupabaseClient } from '@supabase/supabase-js';
import type { SearchIntent } from './intent';
import { normalizeCompanyInfo, type CompanyInfoDisplay } from './companyInfoFormatter';
import { buildAnchorTitle } from './related-links';

export type PillarChildLp = {
  title: string;
  slug: string;
  intent: SearchIntent;
};

export type PillarViewModel = {
  title: string;
  description: string;
  area: string;
  service: string;
  summarySections: string[];
  faqItems: { q: string; a: string }[];
  relatedLps: PillarChildLp[];
  company?: CompanyInfoDisplay;
  slug: string;
};

function normalizeText(s: string | null | undefined): string {
  return (s ?? '').trim();
}

function slugify(text: string): string {
  const normalized = text
    .replace(/[\s　]+/g, '-')
    .replace(/[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return normalized || 'guide';
}

export function buildPillarSlugBase(area: string, service: string): string {
  return `${slugify(area)}-${slugify(service)}-guide`;
}

export function buildPillarSlug(area: string, service: string, used?: Set<string>): string {
  const base = buildPillarSlugBase(area, service);
  if (!used || !used.has(base)) return base;
  let i = 2;
  while (used.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

export function buildPillarTitle(area: string, service: string): string {
  const a = normalizeText(area) || '地域';
  const s = normalizeText(service) || 'サービス';
  const variants = [
    `${a}の${s}完全ガイド`,
    `${a}で${s}を検討中の方向けガイド`,
  ];
  // なるべく自然で短めの方を優先
  return variants.sort((x, y) => x.length - y.length)[0] || `${a}の${s}ガイド`;
}

function buildPillarDescription(area: string, service: string): string {
  const a = normalizeText(area) || '地域';
  const s = normalizeText(service) || 'サービス';
  return `${a}で${s}を検討している方向けに、よくある悩み・選び方のポイント・費用感の考え方を分かりやすくまとめました。関連ページもあわせてご覧ください。`;
}

function coerceIntent(x: unknown): SearchIntent {
  const v = typeof x === 'string' ? x : '';
  switch (v) {
    case 'price':
    case 'trouble':
    case 'insurance':
    case 'comparison':
    case 'emergency':
    case 'general':
      return v;
    default:
      return 'general';
  }
}

export type PillarFetchChildRow = {
  id: string;
  slug: string | null;
  area?: string | null;
  service?: string | null;
  intent?: string | null;
  raw_answers: unknown;
  company_info: unknown;
  company_name: string | null;
  project_type: string | null;
  publish_status?: string | null;
};

export async function fetchPillarChildLps(
  supabase: SupabaseClient,
  input: { area: string; service: string },
  opts?: { limit?: number },
): Promise<PillarFetchChildRow[]> {
  const area = normalizeText(input.area);
  const service = normalizeText(input.service);
  const limit = Math.min(Math.max(opts?.limit ?? 30, 5), 60);

  if (!area || !service) return [];

  const { data } = await supabase
    .from('projects')
    .select(
      'id, slug, area, service, intent, raw_answers, company_info, company_name, project_type, publish_status',
    )
    .eq('publish_status', 'published')
    .eq('area', area)
    .eq('service', service)
    .not('slug', 'is', null)
    .limit(limit);

  return (data ?? []) as PillarFetchChildRow[];
}

function pickUniqueIntentsFirst<T extends { intent?: string | null }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const uniq: T[] = [];
  const rest: T[] = [];
  for (const r of rows) {
    const i = normalizeText(r.intent);
    if (i && !seen.has(i)) {
      seen.add(i);
      uniq.push(r);
    } else {
      rest.push(r);
    }
  }
  return [...uniq, ...rest];
}

export function buildPillarViewModel(input: {
  area: string;
  service: string;
  childRows: PillarFetchChildRow[];
  companyInfoRaw?: unknown;
  fallbackCompanyName?: string;
  usedSlugs?: Set<string>;
}): PillarViewModel {
  const area = normalizeText(input.area) || '{{area_name}}';
  const service = normalizeText(input.service) || '{{service_name}}';
  const title = buildPillarTitle(area, service);
  const description = buildPillarDescription(area, service);
  const slug = buildPillarSlug(area, service, input.usedSlugs);

  const sorted = pickUniqueIntentsFirst(input.childRows || []);
  const relatedLps: PillarChildLp[] = sorted
    .filter((r) => typeof r.slug === 'string' && r.slug.trim().length > 0)
    .slice(0, 10)
    .map((r) => {
      const intent = coerceIntent(r.intent);
      return {
        title: buildAnchorTitle({ area, service, intent }),
        slug: (r.slug || '').trim(),
        intent,
      };
    });

  const summarySections: string[] = [
    `${area}で${service}を探すときは、対応範囲・実績・見積もりの明確さをまず確認しましょう。`,
    `急ぎの場合は、連絡手段（電話/LINE）と即日対応の可否が重要です。`,
    `相見積もりを取るなら「含まれる作業範囲」と「追加費用の条件」を必ず揃えて比較しましょう。`,
  ];

  const faqItems: { q: string; a: string }[] = [
    {
      q: `Q. ${area}で${service}の相談は無料ですか？`,
      a: 'A. まずは無料相談・概算見積もりに対応している事業者が多いです。現地調査の有無や条件は事前に確認しましょう。',
    },
    {
      q: `Q. ${service}の費用は何で変わりますか？`,
      a: 'A. 作業範囲・現場状況・部材/塗料などのグレード・緊急対応の有無で変動します。見積もり項目が具体的かを確認しましょう。',
    },
    {
      q: `Q. 当日の対応は可能ですか？`,
      a: `A. ${area}では状況により即日対応できる場合もあります。緊急度が高い場合は、電話などで早めに相談するのがおすすめです。`,
    },
  ];

  const company =
    input.companyInfoRaw || input.fallbackCompanyName
      ? normalizeCompanyInfo(input.companyInfoRaw, {
          fallbackName: input.fallbackCompanyName,
          fallbackArea: area,
        })
      : undefined;

  return { title, description, area, service, summarySections, faqItems, relatedLps, company, slug };
}

