import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type DraftProjectRow = {
  id: string;
  slug: string | null;
  publish_status: string | null;
  created_at: string | null;
  updated_at: string | null;
  published_at?: string | null;
  publish_retry_count?: number | null;
  last_publish_error?: string | null;
  next_publish_retry_at?: string | null;
  area?: string | null;
  service?: string | null;
  intent?: string | null;
};

export type ScheduledPostPick = {
  project: DraftProjectRow;
  reason: string[];
};

function t(s: unknown): string {
  return typeof s === 'string' ? s.trim() : '';
}

function isDraftLike(publishStatus: string | null): boolean {
  const s = t(publishStatus);
  return !s || s === 'draft';
}

type RecentPublished = {
  id: string;
  area: string | null;
  service: string | null;
  intent: string | null;
  published_at: string | null;
};

/**
 * スケジュール投稿対象の取得（1件だけ選ぶための候補取得）
 *
 * 条件:
 * - publish_status が draft 相当（'draft' or null）
 * - slug がある
 * - まだ Next 上で公開済みマークでない（publish_status が draft 相当など）
 */
export async function fetchDraftPostCandidates(
  supabase: SupabaseClient,
  opts?: { limit?: number },
): Promise<DraftProjectRow[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 60, 10), 200);
  const nowIso = new Date().toISOString();
  const { data } = await supabase
    .from('projects')
    .select(
      'id, slug, publish_status, created_at, updated_at, published_at, publish_retry_count, last_publish_error, next_publish_retry_at, area, service, intent',
    )
    .not('slug', 'is', null)
    // 対象:
    // - draft（または null）
    // - retry_wait かつ next_publish_retry_at <= now()
    // publishing は除外（二重投稿防止）
    .or(
      `publish_status.is.null,publish_status.eq.draft,and(publish_status.eq.retry_wait,next_publish_retry_at.lte.${nowIso})`,
    )
    .order('created_at', { ascending: true })
    .limit(limit);

  return (data ?? []) as DraftProjectRow[];
}

export async function fetchRecentPublished(
  supabase: SupabaseClient,
  opts?: { limit?: number },
): Promise<RecentPublished[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 20, 5), 50);
  const { data } = await supabase
    .from('projects')
    .select('id, area, service, intent, published_at')
    .eq('publish_status', 'published')
    .order('published_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as RecentPublished[];
}

function scoreCandidate(
  c: DraftProjectRow,
  recent: RecentPublished[],
): { score: number; reason: string[] } {
  const reason: string[] = [];

  const intent = t(c.intent);
  const area = t(c.area);
  const service = t(c.service);

  // ベーススコア（古いものを優先）
  let score = 10;
  const createdAt = c.created_at ? Date.parse(c.created_at) : NaN;
  if (Number.isFinite(createdAt)) {
    const ageDays = (Date.now() - createdAt) / (1000 * 60 * 60 * 24);
    score += Math.min(10, Math.max(0, ageDays / 7)); // 最大+10
  }

  const last = recent[0];
  const lastArea = t(last?.area);
  const lastService = t(last?.service);
  const lastIntent = t(last?.intent);

  // ① intent 分散（最優先）
  if (intent && lastIntent && intent === lastIntent) {
    score -= 8;
    reason.push('直近の投稿と intent が同じため減点');
  } else if (intent) {
    score += 3;
    reason.push('intent が直近と被りにくいため加点');
  }

  // ② area 連続を避ける
  if (area && lastArea && area === lastArea) {
    score -= 6;
    reason.push('直近の投稿と area が同じため減点');
  } else if (area) {
    score += 2;
    reason.push('area が直近と被りにくいため加点');
  }

  // ③ service 偏りを避ける
  if (service && lastService && service === lastService) {
    score -= 5;
    reason.push('直近の投稿と service が同じため減点');
  } else if (service) {
    score += 2;
    reason.push('service が直近と被りにくいため加点');
  }

  // 直近N件で同じ intent/area/service が多いほど軽く減点（偏り防止）
  const recentIntents = recent.map((r) => t(r.intent)).filter(Boolean);
  const recentAreas = recent.map((r) => t(r.area)).filter(Boolean);
  const recentServices = recent.map((r) => t(r.service)).filter(Boolean);

  const countSame = (arr: string[], v: string) => arr.filter((x) => x === v).length;
  if (intent) score -= Math.min(6, countSame(recentIntents, intent));
  if (area) score -= Math.min(4, countSame(recentAreas, area));
  if (service) score -= Math.min(4, countSame(recentServices, service));

  // 必須条件チェック（安全）
  if (!t(c.slug)) {
    score = -999;
    reason.push('slug が無いため除外');
  }
  if (!isDraftLike(c.publish_status) && t(c.publish_status) !== 'retry_wait') {
    score = -999;
    reason.push('publish_status が draft ではないため除外');
  }
  if (t(c.publish_status) === 'retry_wait') {
    const nextAt = c.next_publish_retry_at ? Date.parse(c.next_publish_retry_at) : NaN;
    if (Number.isFinite(nextAt) && nextAt > Date.now()) {
      score = -999;
      reason.push('retry_wait だが next_publish_retry_at が未来のため除外');
    } else {
      score += 1;
      reason.push('retry_wait かつ 実行時刻が到来しているため加点');
    }
  }

  return { score, reason };
}

/**
 * 1回の実行で 1件だけ選ぶ（簡易最適化）
 *
 * 優先順位:
 * 1. intent が偏らない
 * 2. area が連続しない
 * 3. service が偏らない
 */
export function pickOneScheduledPostTarget(
  candidates: DraftProjectRow[],
  recent: RecentPublished[],
): ScheduledPostPick | null {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  let best: { c: DraftProjectRow; score: number; reason: string[] } | null = null;
  for (const c of candidates) {
    const { score, reason } = scoreCandidate(c, recent);
    if (!best || score > best.score) {
      best = { c, score, reason };
    }
  }

  if (!best || best.score <= -100) return null;

  return { project: best.c, reason: best.reason };
}

