import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { runReferenceResearch } from '@/lib/research/run-reference-research';

type Body = {
  industry_key?: string | null;
  lp_industry_tone?: string | null;
  area?: string | null;
  service?: string | null;
  intent_keyword?: string | null;
};

/**
 * 参照 LP URL 調査（Phase 2）。管理画面・バッチから。
 * Perplexity 必須。3〜8 URL または理由コード。
 */
export async function POST(request: Request) {
  if (!verifyAdminRequest(request)) {
    return NextResponse.json(
      {
        ok: false,
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
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const b = body as Body;
  const result = await runReferenceResearch({
    industryKey: b.industry_key ?? null,
    lpIndustryTone: b.lp_industry_tone ?? null,
    area: b.area ?? null,
    service: b.service ?? null,
    intentKeyword: b.intent_keyword ?? null,
  });

  if (result.ok === false) {
    return NextResponse.json({
      ok: false,
      code: result.code,
      detail: result.detail,
      run_id: result.run_id,
      industry_master_id: result.industry_master_id,
      query_variants_used: result.query_variants_used,
      candidates: result.candidates,
    });
  }

  return NextResponse.json({
    ok: true,
    urls: result.urls,
    run_id: result.run_id,
    industry_master_id: result.industry_master_id,
    query_variants_used: result.query_variants_used,
    candidates: result.candidates,
  });
}
