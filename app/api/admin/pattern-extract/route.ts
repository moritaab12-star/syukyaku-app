import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { runPatternExtraction } from '@/lib/extract/run-extraction';

type Body = {
  urls?: string[];
  min_support_url_count?: number;
};

/**
 * 参照 URL から構造メタ抽出 + PatternConsensus（Phase 3）。管理用。
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
  const urls = Array.isArray(b.urls)
    ? b.urls.filter((u): u is string => typeof u === 'string' && /^https?:\/\//i.test(u.trim()))
    : [];

  if (urls.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'urls（https の配列）が必須です' },
      { status: 400 },
    );
  }

  const result = await runPatternExtraction({
    urls: [...new Set(urls.map((u) => u.trim()))],
    minSupportUrlCount:
      typeof b.min_support_url_count === 'number' && b.min_support_url_count >= 2
        ? Math.floor(b.min_support_url_count)
        : 2,
  });

  return NextResponse.json({
    ok: true,
    patterns: result.patterns,
    consensus: result.consensus,
    errors: result.errors,
    policy: 'docs/lp-pattern-extraction-policy.md',
  });
}
