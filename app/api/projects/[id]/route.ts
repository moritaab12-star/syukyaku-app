import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { verifyAdminRequest } from '@/lib/admin-auth';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(id: string): boolean {
  return UUID_RE.test(id.trim());
}

type PatchBody = {
  company_name?: string | null;
  resolved_area?: string | null;
  areas?: string[] | null;
  service?: string | null;
  raw_answers?: unknown;
  company_info?: unknown;
};

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
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

    const { id: rawId } = await context.params;
    const id = rawId?.trim() ?? '';
    if (!id || !isUuid(id)) {
      return NextResponse.json(
        { ok: false, error: '無効なプロジェクトIDです。' },
        { status: 400 },
      );
    }

    const supabase = createSupabaseAdminClient();
    // wp_page_id: レガシー列（常に null 想定）。wp_url: 列名は歴史的経緯だが Next 公開の canonical URL。詳細は docs/db-legacy-wordpress-columns.md
    const { data, error } = await supabase
      .from('projects')
      .select(
        'id, slug, project_type, company_name, status, raw_answers, company_info, area, service, target_area, areas, publish_status, wp_page_id, wp_url, lp_group_id, variation_seed',
      )
      .eq('id', id)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }
    if (!data) {
      return NextResponse.json(
        { ok: false, error: 'プロジェクトが見つかりません。' },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, project: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '不明なエラー';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
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

    const { id: rawId } = await context.params;
    const id = rawId?.trim() ?? '';
    if (!id || !isUuid(id)) {
      return NextResponse.json(
        { ok: false, error: '無効なプロジェクトIDです。' },
        { status: 400 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as PatchBody;
    const rawAnswers = body.raw_answers ?? [];
    const companyInfo = body.company_info ?? {};
    const companyName =
      typeof body.company_name === 'string' && body.company_name.trim().length > 0
        ? body.company_name.trim()
        : null;
    const resolvedArea =
      typeof body.resolved_area === 'string' && body.resolved_area.trim().length > 0
        ? body.resolved_area.trim()
        : null;
    const areas = Array.isArray(body.areas) ? body.areas : [];
    const service =
      typeof body.service === 'string' && body.service.trim().length > 0
        ? body.service.trim()
        : null;

    const supabase = createSupabaseAdminClient();

    const { data: existing, error: fetchErr } = await supabase
      .from('projects')
      .select('id, project_type')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json(
        { ok: false, error: fetchErr.message },
        { status: 500 },
      );
    }
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: 'プロジェクトが見つかりません。' },
        { status: 404 },
      );
    }
    if (existing.project_type === 'saas') {
      return NextResponse.json(
        { ok: false, error: 'SaaS プロジェクトはこのAPIでは更新できません。' },
        { status: 400 },
      );
    }

    // updated_at はマイグレーション未適用環境で落ちるため送らない。
    // 追跡が必要なら supabase/migrations/*_add_projects_updated_at.sql を適用し、ここで再追加する。
    const updateRow: Record<string, unknown> = {
      company_name: companyName,
      area: resolvedArea,
      target_area: resolvedArea,
      areas,
      service,
      raw_answers: rawAnswers,
      company_info: companyInfo,
    };

    const { data: updated, error: updateErr } = await supabase
      .from('projects')
      .update(updateRow)
      .eq('id', id)
      .select('id, slug')
      .maybeSingle();

    if (updateErr) {
      return NextResponse.json(
        { ok: false, error: updateErr.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      id: updated?.id ?? id,
      slug: updated?.slug ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '不明なエラー';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
