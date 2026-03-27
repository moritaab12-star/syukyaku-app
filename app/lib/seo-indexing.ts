import type { MetadataRoute } from 'next';

export type ProjectForIndexing = {
  id: string;
  slug: string | null;
  publish_status: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  area?: string | null;
  service?: string | null;
  intent?: string | null;
  raw_answers?: unknown;
  company_info?: unknown;
  company_name?: string | null;
  project_type?: string | null;
};

function safeTrim(s: unknown): string {
  return typeof s === 'string' ? s.trim() : '';
}

function countAnswerTokens(raw: unknown): number {
  // raw_answers は jsonb（配列想定）だが、壊れていても落とさない
  if (!Array.isArray(raw)) return 0;
  let count = 0;
  for (const item of raw) {
    if (item && typeof item === 'object') {
      const answer = (item as any).answer;
      const text = safeTrim(answer);
      if (text) count += text.split(/\s+/).filter(Boolean).length;
    } else if (typeof item === 'string') {
      const text = safeTrim(item);
      if (text) count += text.split(/\s+/).filter(Boolean).length;
    }
  }
  return count;
}

/**
 * noindex 判定（最小実装・静的ルール）
 *
 * ルール（明文化）:
 * - 下書きページは noindex（publish_status !== 'published'）
 * - slug が無いものは noindex（URLが確定しない）
 * - 情報不足ページは noindex（area/service が空、または本文要素が極端に少ない）
 * - 公開済みでも品質条件を満たさないページは noindex 候補
 *
 * 将来的には impressions/clicks/滞在時間 などの指標をここへ追加し、
 * 「勝ちLPだけ index」「弱いLPは noindex」等の運用に繋げる。
 */
export function isNoindexProject(row: ProjectForIndexing): boolean {
  const status = safeTrim(row.publish_status);
  if (status !== 'published') return true;

  const slug = safeTrim(row.slug);
  if (!slug) return true;

  const area = safeTrim(row.area);
  const service = safeTrim(row.service);
  if (!area || !service) return true;

  // 本文要素が極端に少ない（raw_answersの回答語数ベース）
  const tokens = countAnswerTokens(row.raw_answers);
  if (tokens > 0 && tokens < 20) return true;

  return false;
}

/**
 * このアプリの公開オリジン（canonical / サイトマップ / robots の sitemap URL）。
 *
 * - 本番では **必ず `NEXT_PUBLIC_SITE_URL`** を設定すること（例: `https://example.com`）。
 *   未設定のままデプロイするとサイトマップ・JSON-LD の url が誤る。
 * - Vercel 上では `VERCEL_URL` をフォールバックとして使う（cron が自ホスト API を叩く用途）。
 *   それでも本番の正規ホストは `NEXT_PUBLIC_SITE_URL` で固定するのが推奨。
 */
export function getSiteOrigin(): string {
  const site = safeTrim(process.env.NEXT_PUBLIC_SITE_URL);
  if (site) return site.replace(/\/+$/, '');

  const vercel = safeTrim(process.env.VERCEL_URL);
  if (vercel) {
    return vercel.startsWith('http') ? vercel.replace(/\/+$/, '') : `https://${vercel.replace(/\/+$/, '')}`;
  }

  const fallback = 'http://localhost:3000';
  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '[seo-indexing] NEXT_PUBLIC_SITE_URL is unset in production; using http://localhost:3000 for sitemap/robots. Set NEXT_PUBLIC_SITE_URL to your public Next origin.',
    );
  }
  return fallback;
}

/** 公開 LP のパス（`app/p/[slug]/page.tsx` と一致） */
export function buildPublicLpUrl(slug: string): string {
  const origin = getSiteOrigin();
  return `${origin}/p/${encodeURIComponent(slug)}/`;
}

export function buildSitemapEntry(input: {
  slug: string;
  lastModified?: string | null;
}): MetadataRoute.Sitemap[number] {
  return {
    url: buildPublicLpUrl(input.slug),
    lastModified: input.lastModified ? new Date(input.lastModified) : undefined,
  };
}

