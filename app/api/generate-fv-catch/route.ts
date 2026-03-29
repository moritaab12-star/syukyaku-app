import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { runFvCatchForProject } from '@/app/lib/fv-catch-generation';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Body = {
  projectId?: string;
  force?: boolean;
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const b = body as Body;
  const rawId = typeof b.projectId === 'string' ? b.projectId.trim() : '';
  if (!UUID_RE.test(rawId)) {
    return NextResponse.json(
      { error: 'projectId（UUID）が必須です。' },
      { status: 400 },
    );
  }

  const supabase = createSupabaseAdminClient();
  const result = await runFvCatchForProject(supabase, rawId, {
    force: Boolean(b.force),
  });

  if (result.ok === false) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  if ('skipped' in result && result.skipped) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      message: '既に fv_catch_headline があるためスキップしました（上書きは force: true）',
    });
  }

  if (!('headline' in result)) {
    return NextResponse.json(
      { error: '予期しない応答形式です' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    headline: result.headline,
    subheadline: result.subheadline,
  });
}
