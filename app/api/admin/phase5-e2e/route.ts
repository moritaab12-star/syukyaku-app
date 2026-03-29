import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { runPhase5StructureSelfCheck } from '@/lib/generate/phase5-structure-self-check';

/**
 * Phase 5 構造 E2E 自己検証（ルール OFF / ON でセクション順が変わること）。
 */
export async function GET(request: Request) {
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

  const result = runPhase5StructureSelfCheck();
  return NextResponse.json({
    ok: result.ok,
    ...result,
  });
}
