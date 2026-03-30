import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeServiceName } from '@/app/lib/agent/normalize-service';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DRAFT_OR_NULL_STATUS =
  'publish_status.eq.draft,publish_status.is.null';

const POOL_LIMIT = 48;

export type ProjectRow = Record<string, unknown>;

/**
 * LP 複製用テンプレ行の解決。
 *
 * 優先順位:
 * 1. template_project_id（focus）の行が存在すれば service 不一致でも採用
 * 2. draft/slug あり かつ DB の service 列が正規化後に parsed と一致（.eq）
 * 3. 直近の候補プールをメモリ上で正規化比較し一致する先頭
 * 4. 先頭の有効行（1 テンプレ運用の最終フォールバック）
 */
export async function resolveLpTemplateRow(
  supabase: SupabaseClient,
  serviceRaw: string,
  focusProjectId: string | null,
  notFoundMessage: string,
): Promise<{ template: ProjectRow | null; error: string | null }> {
  if (focusProjectId && UUID_RE.test(focusProjectId.trim())) {
    const { data: focusRow, error: focusErr } = await supabase
      .from('projects')
      .select('*')
      .eq('id', focusProjectId.trim())
      .maybeSingle();
    if (focusErr) {
      return { template: null, error: focusErr.message };
    }
    if (focusRow) {
      return { template: focusRow as ProjectRow, error: null };
    }
  }

  const serviceNorm = normalizeServiceName(serviceRaw);

  if (serviceNorm.length > 0) {
    const { data: cand, error: candErr } = await supabase
      .from('projects')
      .select('*')
      .or(DRAFT_OR_NULL_STATUS)
      .not('slug', 'is', null)
      .neq('slug', '')
      .eq('service', serviceNorm)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (candErr) {
      return { template: null, error: candErr.message };
    }
    if (cand) {
      return { template: cand as ProjectRow, error: null };
    }
  }

  const { data: pool, error: poolErr } = await supabase
    .from('projects')
    .select('*')
    .or(DRAFT_OR_NULL_STATUS)
    .not('slug', 'is', null)
    .neq('slug', '')
    .order('created_at', { ascending: false })
    .limit(POOL_LIMIT);

  if (poolErr) {
    return { template: null, error: poolErr.message };
  }

  const rows = (pool ?? []) as ProjectRow[];

  if (serviceNorm.length > 0) {
    for (const row of rows) {
      if (normalizeServiceName(row.service as string) === serviceNorm) {
        return { template: row, error: null };
      }
    }
  }

  if (rows.length > 0) {
    return { template: rows[0], error: null };
  }

  return { template: null, error: notFoundMessage };
}
