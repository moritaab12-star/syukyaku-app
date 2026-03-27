import type { MetadataRoute } from 'next';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { buildSitemapEntry, isNoindexProject, type ProjectForIndexing } from '@/app/lib/seo-indexing';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createSupabaseAdminClient();

  // 最小差分: projects の公開済みLPのみ。将来ピラー/カテゴリが増えたらここに追加する。
  const { data } = await supabase
    .from('projects')
    .select('id, slug, publish_status, updated_at, created_at, area, service, intent, raw_answers')
    .eq('publish_status', 'published')
    .not('slug', 'is', null)
    .limit(5000);

  const rows = (data ?? []) as ProjectForIndexing[];

  return rows
    .filter((r) => !isNoindexProject(r))
    .map((r) =>
      buildSitemapEntry({
        slug: (r.slug || '').trim(),
        lastModified: r.updated_at || r.created_at || null,
      }),
    );
}

