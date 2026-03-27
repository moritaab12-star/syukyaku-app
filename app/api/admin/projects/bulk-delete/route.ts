import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { verifyAdminRequest } from '@/lib/admin-auth';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== 'string') continue;
    const t = x.trim();
    if (UUID_RE.test(t)) out.push(t);
  }
  return [...new Set(out)];
}

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

  try {
    const body = (await request.json().catch(() => ({}))) as {
      ids?: unknown;
    };
    const ids = normalizeIds(body.ids);
    if (ids.length === 0) {
      return NextResponse.json(
        { ok: false, error: '削除対象の有効な project id（UUID）が1件以上必要です。' },
        { status: 400 },
      );
    }

    const supabase = createSupabaseAdminClient();
    const { error, data } = await supabase
      .from('projects')
      .delete()
      .in('id', ids)
      .select('id');

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }

    const deletedCount = Array.isArray(data) ? data.length : 0;

    return NextResponse.json({
      ok: true,
      deletedCount,
      requestedCount: ids.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '不明なエラー';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
