import type { SupabaseClient } from '@supabase/supabase-js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** URL パラメータがプロジェクト UUID か（PostgREST の .or(slug.eq.x) はハイフン slug で壊れるため分岐に使う） */
export function isProjectUuidParam(param: string): boolean {
  return UUID_RE.test(param.trim());
}

/**
 * ルート [slug] に渡る値を DB の projects.slug と照合しやすくする。
 * Next は通常 1 回デコード済みだが、Link と encodeURIComponent の併用などで二重になった場合に緩和する。
 */
export function decodePathSlugParam(raw: string): string {
  let s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return '';
  for (let i = 0; i < 5; i++) {
    if (!/%[0-9A-Fa-f]{2}/.test(s)) break;
    try {
      const next = decodeURIComponent(s);
      if (next === s) break;
      s = next;
    } catch {
      break;
    }
  }
  return s.trim();
}

function slugLookupVariants(decoded: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (x: string) => {
    const t = x.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  push(decoded);
  const n = decoded.normalize('NFKC');
  push(n);
  push(n.toLowerCase());
  return out;
}

/**
 * projects を slug または id で 1 件取得（.or 文字列は使わない）
 */
export async function fetchProjectBySlugOrId(
  client: SupabaseClient,
  slugOrIdParam: string,
  select: string,
) {
  const t = decodePathSlugParam(slugOrIdParam);
  if (!t) {
    return { data: null, error: null };
  }

  if (isProjectUuidParam(t)) {
    return client.from('projects').select(select).eq('id', t).limit(1).maybeSingle();
  }

  for (const slug of slugLookupVariants(t)) {
    const res = await client
      .from('projects')
      .select(select)
      .eq('slug', slug)
      .limit(1)
      .maybeSingle();
    if (res.error) return res;
    if (res.data) return res;
  }

  return { data: null, error: null };
}

/** 公開 `/p/[slug]` 用（`lp_design` 列が無い本番 DB でもフォールバック取得する） */
export const PROJECTS_SELECT_PUBLIC_WITHOUT_LP_DESIGN =
  'id, slug, company_name, project_type, raw_answers, company_info, area, service, industry_key, target_area, areas, keyword, intent, publish_status, lp_group_id, variation_seed, hero_image_url, fv_catch_headline, fv_catch_subheadline, lp_ui_copy, mode';

export const PROJECTS_SELECT_PUBLIC_WITH_LP_DESIGN =
  `${PROJECTS_SELECT_PUBLIC_WITHOUT_LP_DESIGN}, lp_design`;

/**
 * `select` に lp_design を足したが、マイグレーション未適用の DB だと PostgREST が失敗する。
 * そのときだけ lp_design なしで再取得する。
 */
export function isMissingLpDesignColumnError(
  err: { message?: string; code?: string } | null | undefined,
): boolean {
  if (!err?.message) return false;
  const m = err.message.toLowerCase();
  if (!m.includes('lp_design')) return false;
  return (
    m.includes('does not exist') ||
    m.includes('could not find') ||
    m.includes('schema cache') ||
    m.includes('undefined column') ||
    String(err.code) === '42703'
  );
}

export async function fetchProjectBySlugOrIdForPublicPage(
  client: SupabaseClient,
  slugOrIdParam: string,
) {
  const primary = await fetchProjectBySlugOrId(
    client,
    slugOrIdParam,
    PROJECTS_SELECT_PUBLIC_WITH_LP_DESIGN,
  );
  if (
    primary.error &&
    isMissingLpDesignColumnError(primary.error) &&
    !primary.data
  ) {
    return fetchProjectBySlugOrId(
      client,
      slugOrIdParam,
      PROJECTS_SELECT_PUBLIC_WITHOUT_LP_DESIGN,
    );
  }
  return primary;
}

/** エージェント evaluate 用（`lp_design` 列なし DB でも取得可能） */
export const PROJECTS_SELECT_EVALUATE_WITHOUT_LP_DESIGN =
  'id, slug, company_name, project_type, raw_answers, company_info, area, service, industry_key, target_area, areas, keyword, intent, lp_group_id, variation_seed, hero_image_url, fv_catch_headline, fv_catch_subheadline, lp_ui_copy, mode';

export const PROJECTS_SELECT_EVALUATE_WITH_LP_DESIGN =
  `${PROJECTS_SELECT_EVALUATE_WITHOUT_LP_DESIGN}, lp_design`;

export async function fetchProjectRowByIdWithOptionalLpDesign(
  client: SupabaseClient,
  projectId: string,
) {
  const primary = await client
    .from('projects')
    .select(PROJECTS_SELECT_EVALUATE_WITH_LP_DESIGN)
    .eq('id', projectId)
    .maybeSingle();
  if (
    primary.error &&
    isMissingLpDesignColumnError(primary.error) &&
    !primary.data
  ) {
    return client
      .from('projects')
      .select(PROJECTS_SELECT_EVALUATE_WITHOUT_LP_DESIGN)
      .eq('id', projectId)
      .maybeSingle();
  }
  return primary;
}
