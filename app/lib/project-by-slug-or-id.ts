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
