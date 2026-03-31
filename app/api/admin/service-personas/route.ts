import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { servicePersonaCreateBodySchema } from '@/app/lib/service-persona/schema';
import {
  listActiveServicePersonasForSelect,
  listAllServicePersonasOrdered,
} from '@/app/lib/service-persona/db-server';

export async function GET(request: Request) {
  try {
    if (!verifyAdminRequest(request)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            '認可に失敗しました。/admin/login でセッションを開始してください。',
        },
        { status: 401 },
      );
    }

    const url = new URL(request.url);
    const activeOnly = url.searchParams.get('active_only') === '1';

    const supabase = createSupabaseAdminClient();
    if (activeOnly) {
      const rows = await listActiveServicePersonasForSelect(supabase);
      return NextResponse.json({ ok: true, rows });
    }

    const rows = await listAllServicePersonasOrdered(supabase);
    return NextResponse.json({ ok: true, rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '一覧の取得に失敗しました';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!verifyAdminRequest(request)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            '認可に失敗しました。/admin/login でセッションを開始してください。',
        },
        { status: 401 },
      );
    }

    const json = await request.json().catch(() => null);
    const parsed = servicePersonaCreateBodySchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.flatten().fieldErrors;
      const msg = Object.entries(first)
        .map(([k, v]) => `${k}: ${(v ?? []).join(', ')}`)
        .join(' / ');
      return NextResponse.json(
        {
          ok: false,
          error: msg || '入力内容を確認してください',
          issues: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const body = parsed.data;
    const supabase = createSupabaseAdminClient();

    const insertRow = {
      service_key: body.service_key,
      service_name: body.service_name,
      tone: body.tone ?? null,
      cta_labels: body.cta_labels,
      pain_points: body.pain_points,
      faq_topics: body.faq_topics,
      forbidden_words: body.forbidden_words,
      section_structure: body.section_structure,
      is_active: body.is_active,
      raw_json: body.raw_json ?? null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('service_personas')
      .insert(insertRow)
      .select('id')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          {
            ok: false,
            error: '同じ service_key の登録が既に存在します。',
          },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      id: typeof data?.id === 'string' ? data.id : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '登録に失敗しました';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
