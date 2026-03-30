import { createSupabaseAdminClient } from '@/lib/supabase';
import {
  decodePathSlugParam,
  fetchProjectBySlugOrIdForPublicPage,
} from '@/app/lib/project-by-slug-or-id';
import {
  PublicLpClient,
  type PublicLpProjectRow,
} from './PublicLpClient';

export default async function PublicLpPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug =
    typeof rawSlug === 'string' ? decodePathSlugParam(rawSlug) : '';

  if (!slug) {
    return (
      <PublicLpClient initialProject={null} initialError="不正なURLです" />
    );
  }

  let supabase;
  try {
    supabase = createSupabaseAdminClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (
      msg.includes('Supabase service env') ||
      msg.includes('SUPABASE_SERVICE_ROLE_KEY')
    ) {
      return (
        <PublicLpClient
          initialProject={null}
          initialError="サービスロール用の Supabase 環境変数が設定されていません（SUPABASE_SERVICE_ROLE_KEY）。"
        />
      );
    }
    throw e;
  }

  const { data: projectData, error: projectErr } =
    await fetchProjectBySlugOrIdForPublicPage(supabase, slug);

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
