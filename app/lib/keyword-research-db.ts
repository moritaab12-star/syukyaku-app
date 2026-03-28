/**
 * keyword_research_run からの履歴読み（service_role クライアント想定）。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export function normalizeResearchService(service: string | null | undefined): string {
  return (typeof service === 'string' ? service : '').trim();
}

export async function loadAvoidKeywordsFromHistory(
  supabase: SupabaseClient,
  params: { areaKey: string; service: string; industryKey: string | null },
  opts: { maxRuns?: number; maxPhrases?: number; maxTotalChars?: number } = {},
): Promise<string[]> {
  const maxRuns = opts.maxRuns ?? 25;
  const maxPhrases = opts.maxPhrases ?? 120;
  const maxTotalChars = opts.maxTotalChars ?? 6000;

  const area = params.areaKey.trim();
  const svc = normalizeResearchService(params.service);
  const ind =
    params.industryKey && params.industryKey.trim()
      ? params.industryKey.trim()
      : null;

  let q = supabase
    .from('keyword_research_run')
    .select('suggested_keywords')
    .eq('area_key', area)
    .eq('service', svc)
    .order('created_at', { ascending: false })
    .limit(maxRuns);

  if (ind) {
    q = q.eq('industry_key', ind);
  } else {
    q = q.is('industry_key', null);
  }

  const { data, error } = await q;
  if (error) {
    console.error('[keyword-research-db] loadAvoidKeywordsFromHistory', error);
    return [];
  }
  if (!data?.length) return [];

  const flat: string[] = [];
  for (const row of data) {
    const arr = (row as { suggested_keywords?: unknown }).suggested_keywords;
    if (!Array.isArray(arr)) continue;
    for (const k of arr) {
      if (typeof k === 'string' && k.trim()) flat.push(k.trim());
    }
  }

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const k of flat) {
    const low = k.toLowerCase();
    if (seen.has(low)) continue;
    seen.add(low);
    deduped.push(k);
    if (deduped.length >= maxPhrases) break;
  }

  let total = 0;
  const capped: string[] = [];
  for (const k of deduped) {
    if (total + k.length > maxTotalChars) break;
    capped.push(k);
    total += k.length + 1;
  }
  return capped;
}

/** 最新1件の suggested_keywords（同一スコープ）。 */
export async function loadLatestSuggestedKeywords(
  supabase: SupabaseClient,
  params: { areaKey: string; service: string; industryKey: string | null },
): Promise<string[] | null> {
  const area = params.areaKey.trim();
  const svc = normalizeResearchService(params.service);
  const ind =
    params.industryKey && params.industryKey.trim()
      ? params.industryKey.trim()
      : null;

  let q = supabase
    .from('keyword_research_run')
    .select('suggested_keywords')
    .eq('area_key', area)
    .eq('service', svc)
    .order('created_at', { ascending: false })
    .limit(1);

  if (ind) {
    q = q.eq('industry_key', ind);
  } else {
    q = q.is('industry_key', null);
  }

  const { data, error } = await q.maybeSingle();
  if (error) {
    console.error('[keyword-research-db] loadLatestSuggestedKeywords', error);
    return null;
  }
  const row = data as { suggested_keywords?: unknown } | null;
  const arr = row?.suggested_keywords;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const out = arr
    .filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
    .map((k) => k.trim());
  return out.length ? out : null;
}
