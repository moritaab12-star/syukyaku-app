import type { SupabaseClient } from '@supabase/supabase-js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** URL パラメータがプロジェクト UUID か（PostgREST の .or(slug.eq.x) はハイフン slug で壊れるため分岐に使う） */
export function isProjectUuidParam(param: string): boolean {
  return UUID_RE.test(param.trim());
}

/**
 * projects を slug または id で 1 件取得（.or 文字列は使わない）
 */
export async function fetchProjectBySlugOrId(
  client: SupabaseClient,
  slugOrIdParam: string,
  select: string,
) {
  const t = slugOrIdParam.trim();
  const base = client.from('projects').select(select);
  const filtered = isProjectUuidParam(t) ? base.eq('id', t) : base.eq('slug', t);
  return filtered.limit(1).maybeSingle();
}
