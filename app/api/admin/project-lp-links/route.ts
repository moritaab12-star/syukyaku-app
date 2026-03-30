import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { verifyAdminRequest } from '@/lib/admin-auth';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ProjectLpRow = {
  id: string;
  slug: string | null;
  area: string | null;
  service: string | null;
  publish_status: string | null;
  parent_project_id: string | null;
  lp_group_id: string | null;
  created_at: string | null;
};

/**
 * 管理画面・プレビュー用は `/p/{projects.id}`（UUID）。
 * `fetchProjectBySlugOrId` が UUID を id 照会するため、日本語ロング slug やエンコードずれの影響を受けない。
 */
function lpPreviewPath(row: { id: string; slug: string | null }): {
  path: string;
  slug_missing: boolean;
} {
  const s = (row.slug ?? '').trim();
  return {
    path: `/p/${row.id}`,
    slug_missing: !s,
  };
}

/**
 * LP パス一覧:
 * - lp_group_id があれば同一グループの全行
 * - なければ従来どおり parent_project_id の親＋子
 *
 * Cookie セッション（ADMIN_API_SECRET 設定時）または未設定時は検証スキップ。
 */
export async function GET(request: Request) {
  if (!verifyAdminRequest(request)) {
    return NextResponse.json(
      {
        ok: false,
        error: '認可に失敗しました。/admin/login でセッションを開始してください。',
      },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const projectIdRaw = (searchParams.get('projectId') ?? '').trim();

  if (!projectIdRaw || !UUID_RE.test(projectIdRaw)) {
    return NextResponse.json(
      { ok: false, error: 'projectId（UUID）が必要です。' },
      { status: 400 },
    );
  }

  const selectCols =
    'id, slug, area, service, publish_status, parent_project_id, lp_group_id, created_at';

  try {
    const supabase = createSupabaseAdminClient();

    const { data: anchor, error: anchorErr } = await supabase
      .from('projects')
      .select(selectCols)
      .eq('id', projectIdRaw)
      .maybeSingle();

    if (anchorErr) {
      return NextResponse.json(
        { ok: false, error: anchorErr.message },
        { status: 500 },
      );
    }

    if (!anchor) {
      return NextResponse.json(
        { ok: false, error: 'プロジェクトが見つかりません。' },
        { status: 404 },
      );
    }

    const a = anchor as ProjectLpRow;
    const groupId = (a.lp_group_id ?? '').trim();

    if (groupId && UUID_RE.test(groupId)) {
      const { data: groupRows, error: groupErr } = await supabase
        .from('projects')
        .select(selectCols)
        .eq('lp_group_id', groupId)
        .order('created_at', { ascending: true });

      if (groupErr) {
        return NextResponse.json(
          { ok: false, error: groupErr.message },
          { status: 500 },
        );
      }

      const ordered = (groupRows ?? []) as ProjectLpRow[];
      const items = ordered.map((row) => {
        const { path, slug_missing } = lpPreviewPath(row);
        return {
          id: row.id,
          slug: row.slug,
          area: row.area,
          service: row.service,
          publish_status: row.publish_status,
          path,
          slug_missing,
        };
      });

      return NextResponse.json({ ok: true, items });
    }

    const parentId =
      a.parent_project_id && UUID_RE.test(a.parent_project_id)
        ? a.parent_project_id
        : a.id;

    const { data: parentRow, error: parentErr } = await supabase
      .from('projects')
      .select(selectCols)
      .eq('id', parentId)
      .maybeSingle();

    if (parentErr) {
      return NextResponse.json(
        { ok: false, error: parentErr.message },
        { status: 500 },
      );
    }

    const { data: childRows, error: childrenErr } = await supabase
      .from('projects')
      .select(selectCols)
      .eq('parent_project_id', parentId)
      .order('created_at', { ascending: true });

    if (childrenErr) {
      return NextResponse.json(
        { ok: false, error: childrenErr.message },
        { status: 500 },
      );
    }

    const children = (childRows ?? []) as ProjectLpRow[];

    let ordered: ProjectLpRow[];
    if (parentRow) {
      const p = parentRow as ProjectLpRow;
      const rest = children.filter((c) => c.id !== p.id);
      ordered = [p, ...rest];
    } else {
      ordered = [...children].sort((x, y) => {
        const tx = x.created_at ?? '';
        const ty = y.created_at ?? '';
        return tx.localeCompare(ty);
      });
    }

    const items = ordered.map((row) => {
      const { path, slug_missing } = lpPreviewPath(row);
      return {
        id: row.id,
        slug: row.slug,
        area: row.area,
        service: row.service,
        publish_status: row.publish_status,
        path,
        slug_missing,
      };
    });

    return NextResponse.json({ ok: true, items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '不明なエラー';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
