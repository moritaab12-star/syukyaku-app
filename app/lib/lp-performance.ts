import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type LpPerformanceStatus = 'winner' | 'candidate' | 'watch' | 'weak';

export type LpMetricsRow = {
  project_id: string;
  pv_count: number | null;
  click_count: number | null;
  conversion_count: number | null;
  search_rank: number | null;
  last_updated_at: string | null;
};

export type LpPerformanceResult = {
  score: number;
  status: LpPerformanceStatus;
  reason: string[];
  metrics: {
    pvCount: number;
    clickCount: number;
    conversionCount: number;
    searchRank: number | null;
  };
};

export type LpPerformanceProject = {
  id: string;
  slug: string | null;
  area: string | null;
  service: string | null;
  intent: string | null;
  publish_status: string | null;
};

/**
 * 判定ルール（最小実装・定数化）
 * - conversion を最重要
 * - click を次に重視
 * - pv は補助
 * - search_rank（小さいほど上位）は微加点
 *
 * 推奨アクション:
 * - winner: 内部リンク集中 / CTA改善 / 内容追加
 * - candidate: タイトル改善 / メタ改善 / 追加セクション
 * - watch: しばらく観測（内部リンク・導線だけ整える）
 * - weak: noindex候補 / 統合候補（同テーマへ寄せる）
 */
export const LP_PERFORMANCE_RULES = {
  winner: {
    minConversions: 1,
    minClicks: 30,
    minPvs: 300,
  },
  candidate: {
    minClicks: 5,
    minPvs: 100,
  },
  watch: {
    minPvs: 50,
  },
  // score計算の重み
  weights: {
    conversion: 50,
    click: 2,
    pv: 0.1,
    rankBonusMax: 10,
  },
};

function n(x: unknown): number {
  return typeof x === 'number' && Number.isFinite(x) ? x : 0;
}

function clamp(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x));
}

export function calculateLpPerformanceScore(input: {
  pvCount?: number | null;
  clickCount?: number | null;
  conversionCount?: number | null;
  searchRank?: number | null;
}): { score: number; reason: string[] } {
  const pv = Math.max(0, n(input.pvCount));
  const click = Math.max(0, n(input.clickCount));
  const conv = Math.max(0, n(input.conversionCount));
  const rank = typeof input.searchRank === 'number' && input.searchRank > 0 ? input.searchRank : null;

  const reason: string[] = [];
  if (conv >= 1) reason.push('問い合わせ（CV）が発生しているため');
  if (click > 0) reason.push('クリックが発生しているため');
  if (pv > 0) reason.push('PVが計測されているため');
  if (rank && rank <= 10) reason.push('検索順位が比較的高いため');

  const w = LP_PERFORMANCE_RULES.weights;
  const rankBonus =
    rank == null ? 0 : clamp((30 - rank) / 30, 0, 1) * w.rankBonusMax; // 1位付近ほど微加点

  const score = conv * w.conversion + click * w.click + pv * w.pv + rankBonus;
  return { score: Math.round(score * 10) / 10, reason };
}

export function classifyLpPerformance(input: {
  pvCount?: number | null;
  clickCount?: number | null;
  conversionCount?: number | null;
  searchRank?: number | null;
}): { status: LpPerformanceStatus; reason: string[]; score: number } {
  const pv = Math.max(0, n(input.pvCount));
  const click = Math.max(0, n(input.clickCount));
  const conv = Math.max(0, n(input.conversionCount));

  const { score, reason: scoreReason } = calculateLpPerformanceScore(input);
  const r: string[] = [];

  // winner
  if (conv >= LP_PERFORMANCE_RULES.winner.minConversions) {
    r.push('CVが発生しているため winner と判定');
    return { status: 'winner', reason: [...r, ...scoreReason], score };
  }
  if (click >= LP_PERFORMANCE_RULES.winner.minClicks && pv >= LP_PERFORMANCE_RULES.winner.minPvs) {
    r.push('クリックとPVが十分あるため winner と判定');
    return { status: 'winner', reason: [...r, ...scoreReason], score };
  }

  // candidate
  if (click >= LP_PERFORMANCE_RULES.candidate.minClicks && pv >= LP_PERFORMANCE_RULES.candidate.minPvs) {
    r.push('クリックとPVが一定以上あるため candidate と判定');
    return { status: 'candidate', reason: [...r, ...scoreReason], score };
  }

  // watch
  if (pv >= LP_PERFORMANCE_RULES.watch.minPvs && click === 0) {
    r.push('PVはあるがクリックが無いため watch と判定');
    return { status: 'watch', reason: [...r, ...scoreReason], score };
  }

  // weak
  r.push('PV/クリックが少ないため weak と判定');
  return { status: 'weak', reason: [...r, ...scoreReason], score };
}

function metricsTableName(): string {
  const name = process.env.LP_METRICS_TABLE?.trim();
  return name || 'lp_metrics';
}

export async function getLpPerformanceStatus(
  supabase: SupabaseClient,
  projectId: string,
): Promise<LpPerformanceResult | null> {
  const pid = (projectId || '').trim();
  if (!pid) return null;

  const { data, error } = await supabase
    .from(metricsTableName())
    .select('project_id, pv_count, click_count, conversion_count, search_rank, last_updated_at')
    .eq('project_id', pid)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as LpMetricsRow;
  const pvCount = n(row.pv_count);
  const clickCount = n(row.click_count);
  const conversionCount = n(row.conversion_count);
  const searchRank =
    typeof row.search_rank === 'number' && Number.isFinite(row.search_rank) ? row.search_rank : null;

  const { status, score, reason } = classifyLpPerformance({
    pvCount,
    clickCount,
    conversionCount,
    searchRank,
  });

  return {
    score,
    status,
    reason,
    metrics: { pvCount, clickCount, conversionCount, searchRank },
  };
}

export async function getLpPerformanceLists(
  supabase: SupabaseClient,
  opts?: { limit?: number },
): Promise<{
  winners: Array<{ project: LpPerformanceProject; performance: LpPerformanceResult }>;
  candidates: Array<{ project: LpPerformanceProject; performance: LpPerformanceResult }>;
  weaks: Array<{ project: LpPerformanceProject; performance: LpPerformanceResult }>;
}> {
  const limit = Math.min(Math.max(opts?.limit ?? 500, 50), 2000);

  const { data: metrics } = await supabase
    .from(metricsTableName())
    .select('project_id, pv_count, click_count, conversion_count, search_rank, last_updated_at')
    .order('last_updated_at', { ascending: false })
    .limit(limit);

  const metricRows = (metrics ?? []) as LpMetricsRow[];
  const ids = metricRows.map((m) => m.project_id).filter(Boolean);

  if (ids.length === 0) {
    return { winners: [], candidates: [], weaks: [] };
  }

  const { data: projects } = await supabase
    .from('projects')
    .select('id, slug, area, service, intent, publish_status')
    .in('id', ids)
    .limit(ids.length);

  const projectById = new Map<string, LpPerformanceProject>();
  (projects ?? []).forEach((p: any) => projectById.set(p.id, p as LpPerformanceProject));

  const winners: Array<{ project: LpPerformanceProject; performance: LpPerformanceResult }> = [];
  const candidates: Array<{ project: LpPerformanceProject; performance: LpPerformanceResult }> = [];
  const weaks: Array<{ project: LpPerformanceProject; performance: LpPerformanceResult }> = [];

  for (const m of metricRows) {
    const project = projectById.get(m.project_id);
    if (!project) continue;
    if ((project.publish_status || '').trim() !== 'published') continue;
    if (!project.slug) continue;

    const perf: LpPerformanceResult = (() => {
      const pvCount = n(m.pv_count);
      const clickCount = n(m.click_count);
      const conversionCount = n(m.conversion_count);
      const searchRank =
        typeof m.search_rank === 'number' && Number.isFinite(m.search_rank) ? m.search_rank : null;
      const { status, score, reason } = classifyLpPerformance({
        pvCount,
        clickCount,
        conversionCount,
        searchRank,
      });
      return { score, status, reason, metrics: { pvCount, clickCount, conversionCount, searchRank } };
    })();

    if (perf.status === 'winner') winners.push({ project, performance: perf });
    else if (perf.status === 'candidate') candidates.push({ project, performance: perf });
    else if (perf.status === 'weak') weaks.push({ project, performance: perf });
  }

  // 重要度順（score desc）
  winners.sort((a, b) => b.performance.score - a.performance.score);
  candidates.sort((a, b) => b.performance.score - a.performance.score);
  weaks.sort((a, b) => a.performance.score - b.performance.score);

  return { winners, candidates, weaks };
}

/**
 * noindex 候補連携ポイント
 * - いまは自動 noindex しない
 * - 将来: weak が一定期間継続したら noindex（seo-indexing.ts の isNoindexProject へ統合）
 */
export function isNoindexCandidateFromPerformance(status: LpPerformanceStatus): boolean {
  return status === 'weak';
}

