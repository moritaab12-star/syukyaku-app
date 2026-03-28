import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { runHeroImagePipelineForProject } from '@/app/lib/lp-hero-pipeline';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Body = {
  projectId?: string;
};

/**
 * ヒーロー画像のみ生成（Gemini 英語プロンプト → Vertex Imagen → Supabase lp-images → projects.hero_image_url）。
 * `{projectId}/hero.png` は upsert で常に上書き。本文生成は /api/generate（projectId 付きでヒーロー未設定時のみ同パイプラインを前置）。
 */
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

  try {
    const result = await runHeroImagePipelineForProject(supabase, rawId);
    return NextResponse.json({
      ok: true,
      hero_image_url: result.publicUrl,
      imagePrompt: result.imagePrompt,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'ヒーロー画像の生成に失敗しました';
    console.error('[api/generate-lp]', e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
