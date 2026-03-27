import type { Metadata } from 'next';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { isNoindexProject, type ProjectForIndexing } from '@/app/lib/seo-indexing';
import { fetchProjectBySlugOrId } from '@/app/lib/project-by-slug-or-id';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const s = typeof slug === 'string' ? slug.trim() : '';

  if (!s) {
    return {
      robots: { index: false, follow: true },
    };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data } = await fetchProjectBySlugOrId(
      supabase,
      s,
      'id, slug, publish_status, area, service, intent, updated_at, created_at, raw_answers',
    );

    const row = (data as unknown) as ProjectForIndexing | null;
    const noindex = row ? isNoindexProject(row) : true;

    return {
      robots: { index: !noindex, follow: true },
    };
  } catch {
    // 取得に失敗した場合は保守的に noindex
    return {
      robots: { index: false, follow: true },
    };
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

