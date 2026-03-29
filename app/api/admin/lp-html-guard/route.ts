import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import {
  runLpHtmlGuards,
  type RunLpHtmlGuardsOpts,
} from '@/lib/guard/lp-html-static-check';

type Body = {
  html?: string;
  reference_html?: string;
  min_cta_touchpoints?: number;
  min_sections?: number;
  trigram_warn_threshold?: number;
  long_substring_warn_min?: number;
};

/**
 * LP bodyInner（または HTML 断片）の静的ガード。生成直後の確認用。
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
  const html = typeof b.html === 'string' ? b.html : '';
  if (!html.trim()) {
    return NextResponse.json(
      { ok: false, error: 'html は必須です' },
      { status: 400 },
    );
  }

  const opts: RunLpHtmlGuardsOpts = {
    referenceHtml:
      typeof b.reference_html === 'string' ? b.reference_html : undefined,
    minCtaTouchpoints:
      typeof b.min_cta_touchpoints === 'number' ? b.min_cta_touchpoints : undefined,
    minSections: typeof b.min_sections === 'number' ? b.min_sections : undefined,
    trigramWarnThreshold:
      typeof b.trigram_warn_threshold === 'number'
        ? b.trigram_warn_threshold
        : undefined,
    longSubstringWarnMin:
      typeof b.long_substring_warn_min === 'number'
        ? b.long_substring_warn_min
        : undefined,
  };

  const report = runLpHtmlGuards(html, opts);
  return NextResponse.json({ ok: report.ok, report });
}
