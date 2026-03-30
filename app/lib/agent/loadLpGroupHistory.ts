/**
 * 同一 LP グループ履歴（親系譜 × service × area）を projects から取得する。
 * planLpThemes / 回避ロジックとは切り離したユーティリティ。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeServiceName } from '@/app/lib/agent/normalize-service';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type LpGroupHistoryItem = {
  id: string;
  slug: string | null;
  title: string | null;
  keyword: string | null;
  mode: string | null;
  lpGroupId: string | null;
  service: string | null;
  area: string | null;
  createdAt: string | null;
  /** draft / published など。下書き・公開の両方を返す（フィルタしない） */
  publishStatus: string | null;
};

export type LoadLpGroupHistoryParams = {
  /**
   * 親プロジェクト行の id、またはその子行の id。
   * 子の場合は DB 上の parent_project_id からルート親を解決する。
   */
  parentProjectId: string;
  service: string;
  area: string;
  /** 並びは created_at 降順。既定 200 */
  limit?: number;
};

function normalizeAreaKey(input: string | null | undefined): string {
  if (input == null) return '';
  return String(input).normalize('NFKC').trim().replace(/\s+/g, ' ');
}

function rawAnswerById(rawAnswers: unknown, qid: string): string {
  if (!Array.isArray(rawAnswers)) return '';
  for (const entry of rawAnswers) {
    if (!entry || typeof entry !== 'object') continue;
    const o = entry as Record<string, unknown>;
    if (o.id !== qid) continue;
    if (typeof o.answer === 'string') return o.answer.trim();
    if (o.answer != null) return String(o.answer).trim();
  }
  return '';
}

function resolveKeyword(row: {
  keyword?: string | null;
  raw_answers?: unknown;
}): string | null {
  const col = typeof row.keyword === 'string' ? row.keyword.trim() : '';
  if (col) return col;
  const q49 = rawAnswerById(row.raw_answers, 'q49');
  return q49.length > 0 ? q49 : null;
}

function resolveTitle(row: {
  fv_catch_headline?: string | null;
  keyword?: string | null;
  raw_answers?: unknown;
}): string | null {
  const fv = typeof row.fv_catch_headline === 'string' ? row.fv_catch_headline.trim() : '';
  if (fv) return fv;
  return resolveKeyword(row);
}

type ProjectHistoryRow = {
  id: string;
  slug: string | null;
  keyword: string | null;
  mode: string | null;
  lp_group_id: string | null;
  service: string | null;
  area: string | null;
  created_at: string | null;
  parent_project_id: string | null;
  raw_answers?: unknown;
  fv_catch_headline?: string | null;
  publish_status?: string | null;
};

async function resolveRootProjectId(
  supabase: SupabaseClient,
  projectId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, parent_project_id')
    .eq('id', projectId)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as { id: string; parent_project_id: string | null };
  const pid = row.parent_project_id;
  if (typeof pid === 'string' && UUID_RE.test(pid)) return pid;
  return row.id;
}

/**
 * ルート親とその直接子（split 作成時の家族）のうち、service / area が一致する行だけを返す。
 *
 * - **draft / published**: どちらも含む（publish_status で区別可能）。
 * - **エージェント量産**で `parent_project_id` が null のみの行は、本関数の家族条件に入らない（別途 lp_group 等が必要）。
 */
export async function loadLpGroupHistory(
  supabase: SupabaseClient,
  params: LoadLpGroupHistoryParams,
): Promise<LpGroupHistoryItem[]> {
  const idRaw = (params.parentProjectId ?? '').trim();
  if (!UUID_RE.test(idRaw)) return [];

  const serviceNeedle = normalizeServiceName(params.service);
  const areaNeedle = normalizeAreaKey(params.area);
  if (!serviceNeedle || !areaNeedle) return [];

  const rootId = await resolveRootProjectId(supabase, idRaw);
  if (!rootId) return [];

  const limit =
    typeof params.limit === 'number' && Number.isFinite(params.limit)
      ? Math.min(500, Math.max(1, Math.trunc(params.limit)))
      : 200;

  const orFilter = `id.eq.${rootId},parent_project_id.eq.${rootId}`;

  const { data, error } = await supabase
    .from('projects')
    .select(
      'id, slug, keyword, mode, lp_group_id, service, area, created_at, parent_project_id, raw_answers, fv_catch_headline, publish_status',
    )
    .or(orFilter)
    .order('created_at', { ascending: false })
    .limit(Math.min(limit * 4, 400));

  if (error || !data?.length) {
    if (error) {
      console.error('[loadLpGroupHistory]', error.message);
    }
    return [];
  }

  const rows = data as ProjectHistoryRow[];

  const filtered = rows.filter((r) => {
    const s = normalizeServiceName(r.service);
    const a = normalizeAreaKey(r.area);
    return s === serviceNeedle && a === areaNeedle;
  });

  filtered.sort((a, b) => {
    const ta = a.created_at ?? '';
    const tb = b.created_at ?? '';
    return tb.localeCompare(ta);
  });

  const sliced = filtered.slice(0, limit);

  return sliced.map((r) => ({
    id: r.id,
    slug: r.slug ?? null,
    title: resolveTitle(r),
    keyword: resolveKeyword(r),
    mode: r.mode ?? null,
    lpGroupId: r.lp_group_id ?? null,
    service: r.service ?? null,
    area: r.area ?? null,
    createdAt: r.created_at ?? null,
    publishStatus:
      typeof r.publish_status === 'string' ? r.publish_status.trim() || null : null,
  }));
}

/**
 * 履歴行から planLpThemes 用の回避フレーズ一覧を作る（keyword / title。重複・長文は圧縮）。
 */
export function buildAvoidKeywordsFromHistory(
  items: LpGroupHistoryItem[],
  opts?: { maxPhrases?: number; maxTotalChars?: number },
): string[] {
  const maxPhrases = opts?.maxPhrases ?? 48;
  const maxTotalChars = opts?.maxTotalChars ?? 4000;

  const seen = new Set<string>();
  const out: string[] = [];

  function pushPhrase(raw: string) {
    const t = raw.normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (t.length < 2) return;
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(t.slice(0, 200));
  }

  for (const it of items) {
    if (out.length >= maxPhrases) break;
    if (it.keyword) pushPhrase(it.keyword);
    if (it.title) {
      const kt = (it.keyword ?? '').normalize('NFKC').trim().toLowerCase();
      const tt = it.title.normalize('NFKC').trim().toLowerCase();
      if (tt.length > 0 && tt !== kt) pushPhrase(it.title);
    }
  }

  let total = 0;
  const capped: string[] = [];
  for (const p of out) {
    if (total + p.length > maxTotalChars) break;
    capped.push(p);
    total += p.length + 1;
  }
  return capped;
}
