import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { publishProjectToNextSite } from '@/app/lib/publish-project-next';

type Body = {
  project_ids?: unknown;
};

export async function POST(request: Request) {
  if (!verifyAdminRequest(request)) {
    return NextResponse.json(
      {
        error:
          '認可に失敗しました。/admin/login でセッションを開始するか、ADMIN_API_SECRET を未設定の開発環境で利用してください。',
      },
      { status: 401 },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const idsRaw = body.project_ids;
  if (!Array.isArray(idsRaw) || idsRaw.length === 0) {
    return NextResponse.json(
      { error: 'project_ids は1件以上の配列で指定してください。' },
      { status: 400 },
    );
  }

  const projectIds = idsRaw
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((x) => x.trim());

  if (projectIds.length === 0) {
    return NextResponse.json(
      { error: 'project_ids に有効な ID がありません。' },
      { status: 400 },
    );
  }

  const supabase = createSupabaseAdminClient();
  const results: {
    id: string;
    skipped: boolean;
    reason?: string;
    published?: boolean;
    url?: string;
    error?: string;
  }[] = [];

  for (const id of projectIds) {
    const { data: row, error } = await supabase
      .from('projects')
      .select('id, slug, agent_status, publish_status')
      .eq('id', id)
      .maybeSingle();

    if (error || !row) {
      results.push({
        id,
        skipped: true,
        reason: 'not_found',
      });
      continue;
    }

    const r = row as {
      id: string;
      slug: string | null;
      agent_status?: string | null;
      publish_status?: string | null;
    };

    const agentStatus = (r.agent_status ?? '').trim();
    const publishStatus = (r.publish_status ?? '').trim();

    if (agentStatus !== 'ok') {
      results.push({
        id,
        skipped: true,
        reason: 'agent_status_not_ok',
      });
      continue;
    }

    if (publishStatus !== 'draft') {
      results.push({
        id,
        skipped: true,
        reason: 'publish_status_not_draft',
      });
      continue;
    }

    const slug = typeof r.slug === 'string' ? r.slug.trim() : '';
    if (!slug) {
      results.push({
        id,
        skipped: true,
        reason: 'empty_slug',
      });
      continue;
    }

    const pub = await publishProjectToNextSite(supabase, slug, {
      projectId: r.id,
    });

    if (pub.success) {
      results.push({
        id,
        skipped: false,
        published: true,
        url: pub.url,
      });
    } else {
      results.push({
        id,
        skipped: false,
        published: false,
        error: pub.success === false ? pub.error : undefined,
      });
    }
  }

  return NextResponse.json({ results });
}
