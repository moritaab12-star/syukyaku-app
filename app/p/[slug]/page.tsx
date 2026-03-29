import { createSupabaseAdminClient } from '@/lib/supabase';
import { fetchProjectBySlugOrId } from '@/app/lib/project-by-slug-or-id';
import {
  PublicLpClient,
  type PublicLpProjectRow,
} from './PublicLpClient';

const PUBLIC_LP_SELECT =
  'id, slug, company_name, project_type, raw_answers, company_info, area, service, industry_key, target_area, areas, keyword, intent, publish_status, lp_group_id, variation_seed, hero_image_url, fv_catch_headline, fv_catch_subheadline, lp_ui_copy, mode';

export default async function PublicLpPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug = typeof rawSlug === 'string' ? rawSlug.trim() : '';

  if (!slug) {
    return (
      <PublicLpClient initialProject={null} initialError="不正なURLです" />
    );
  }

  const supabase = createSupabaseAdminClient();
  const { data: projectData, error: projectErr } = await fetchProjectBySlugOrId(
    supabase,
    slug,
    PUBLIC_LP_SELECT,
  );

  if (projectErr || !projectData) {
    return (
      <PublicLpClient
        initialProject={null}
        initialError="プロジェクトが見つかりません"
      />
    );
  }

  const initialProject = projectData as unknown as PublicLpProjectRow;

  return (
    <PublicLpClient initialProject={initialProject} initialError={null} />
  );
}
