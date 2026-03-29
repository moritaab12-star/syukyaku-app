import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { getIndustryMasterById, getDefaultIndustryMaster } from '@/lib/industry/load-masters';
import { buildLpGenerationRule } from '@/lib/convert/build-rule';
import type { ExtractedPattern, PatternConsensus } from '@/types/lp';

type Body = {
  industry_master_id?: string | null;
  consensus?: PatternConsensus | null;
  patterns?: ExtractedPattern[];
  rule_id?: string | null;
  version?: number | null;
};

/**
 * PatternConsensus（任意）+ IndustryMaster → LpGenerationRule（Phase 4）
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
  const mid =
    typeof b.industry_master_id === 'string' ? b.industry_master_id.trim() : '';
  const master = mid
    ? getIndustryMasterById(mid.toLowerCase()) ?? getDefaultIndustryMaster()
    : getDefaultIndustryMaster();

  const consensus =
    b.consensus && typeof b.consensus === 'object' ? b.consensus : null;
  const patterns = Array.isArray(b.patterns) ? b.patterns : undefined;

  const rule = buildLpGenerationRule({
    master,
    consensus,
    patterns,
    ruleId:
      typeof b.rule_id === 'string' && b.rule_id.trim().length > 0
        ? b.rule_id.trim()
        : undefined,
    version:
      typeof b.version === 'number' && Number.isFinite(b.version)
        ? Math.max(1, Math.floor(b.version))
        : undefined,
  });

  return NextResponse.json({ ok: true, rule });
}
