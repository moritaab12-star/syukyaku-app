import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { verifyAdminRequest } from '@/lib/admin-auth';

const ALLOWED_POST_COUNTS = new Set([1, 3, 5, 10]);

/**
 * 本番公開テスト用: service role で候補取得（RLS とブレない）。
 * Cookie セッション（ADMIN_API_SECRET 設定時）または未設定時はそのまま通過。
 */
export async function GET(request: Request) {
  if (!verifyAdminRequest(request)) {
    return NextResponse.json(
      { ok: false, error: '認可に失敗しました。/admin/login でセッションを開始してください。' },
      { status: 401 },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const serviceRaw = searchParams.get('service');
    const supabase = createSupabaseAdminClient();

    if (!serviceRaw || !serviceRaw.trim()) {
      // 業種ドロップダウン用: 公開済みも含め service を列挙（slug 必須）。
      // 実際に公開する行の絞り込みは service 指定時のクエリ（draft + 未公開）のみ。
      const { data, error } = await supabase
        .from('projects')
        .select('service')
        .not('slug', 'is', null)
        .neq('slug', '')
        .not('service', 'is', null)
        .neq('service', '');

      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 },
        );
      }

      const set = new Set<string>();
      for (const row of data ?? []) {
        const s =
          row && typeof (row as { service?: string }).service === 'string'
            ? (row as { service: string }).service.trim()
            : '';
        if (s) set.add(s);
      }
      const services = [...set].sort((a, b) => a.localeCompare(b, 'ja'));
      return NextResponse.json({ ok: true, services });
    }

    const service = serviceRaw.trim();
    const postCountParam = parseInt(searchParams.get('postCount') ?? '1', 10);
    const postCount = ALLOWED_POST_COUNTS.has(postCountParam) ? postCountParam : 1;

    // 未WP・slug ありは維持。publish_status が未設定（NULL）のレガシー行も draft 相当で候補に含める。
    const draftOrUnsetStatus = 'publish_status.eq.draft,publish_status.is.null';

    const { count, error: countErr } = await supabase
      .from('projects')
      .select('*', { count: 'exact', head: true })
      .or(draftOrUnsetStatus)
      .not('slug', 'is', null)
      .neq('slug', '')
      .eq('service', service);

    if (countErr) {
      return NextResponse.json(
        { ok: false, error: countErr.message },
        { status: 500 },
      );
    }

    const totalCount = count ?? 0;

    const { data: rows, error: listErr } = await supabase
      .from('projects')
      .select('id, slug')
      .or(draftOrUnsetStatus)
      .not('slug', 'is', null)
      .neq('slug', '')
      .eq('service', service)
      .order('created_at', { ascending: true })
      .limit(postCount);

    if (listErr) {
      return NextResponse.json(
        { ok: false, error: listErr.message },
        { status: 500 },
      );
    }

    const previewTargets = (rows ?? [])
      .map((r) => {
        const row = r as { id?: string; slug?: string };
        const id = typeof row.id === 'string' ? row.id.trim() : '';
        const slug = typeof row.slug === 'string' ? row.slug.trim() : '';
        if (!id || !slug) return null;
        return { id, slug };
      })
      .filter((x): x is { id: string; slug: string } => x != null);

    const previewSlugs = previewTargets.map((t) => t.slug);
    const willPublish = Math.min(postCount, totalCount);

    return NextResponse.json({
      ok: true,
      service,
      postCount,
      totalCount,
      willPublish,
      firstSlug: previewSlugs[0] ?? null,
      previewSlugs,
      previewTargets,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '不明なエラー';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
