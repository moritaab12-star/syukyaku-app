import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { servicePersonaCreateBodySchema } from '@/app/lib/service-persona/schema';
import {
  canonicalNestedMasterFromFormBody,
  flatColumnsFromMasterJson,
  parseMasterJsonText,
} from '@/app/lib/service-persona/master-json-mapper';
import { readMasterJsonTextFromBody } from '@/app/lib/service-persona/master-json-api';
import {
  listActiveServicePersonasForSelect,
  listAllServicePersonasOrdered,
} from '@/app/lib/service-persona/db-server';
import { refreshLpUiCopyForIndustryKey } from '@/app/lib/fv-catch-generation';

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

    const bodyRaw = (await request.json().catch(() => null)) as unknown;
    const masterText = readMasterJsonTextFromBody(bodyRaw);

    const supabase = createSupabaseAdminClient();

    if (masterText.length > 0) {
      const pr = parseMasterJsonText(masterText);
      if (pr._result !== 'valid') {
        return NextResponse.json({ ok: false, error: pr.error }, { status: 400 });
      }
      const flat = flatColumnsFromMasterJson(pr.data);
      const bodyObj =
        bodyRaw && typeof bodyRaw === 'object'
          ? (bodyRaw as Record<string, unknown>)
          : {};
      let rawJsonVal: unknown = null;
      if (bodyObj.raw_json !== undefined) {
        rawJsonVal = bodyObj.raw_json;
      }

      const insertRow = {
        service_key: flat.service_key,
        service_name: flat.service_name,
        tone: flat.tone,
        cta_labels: flat.cta_labels,
        pain_points: flat.pain_points,
        faq_topics: flat.faq_topics,
        forbidden_words: flat.forbidden_words,
        section_structure: flat.section_structure,
        is_active: flat.is_active,
        master_json: pr.data,
        persona_json: pr.data,
        raw_json: rawJsonVal,
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

      const skFromMaster =
        typeof pr.data.service_key === 'string' ? pr.data.service_key.trim() : '';
      if (skFromMaster) {
        void refreshLpUiCopyForIndustryKey(supabase, skFromMaster).catch((e) =>
          console.error('[service-personas] dependent LP refresh', e),
        );
      }
      return NextResponse.json({
        ok: true,
        id: typeof data?.id === 'string' ? data.id : null,
      });
    }

    const parsed = servicePersonaCreateBodySchema.safeParse(bodyRaw);
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
    const master = canonicalNestedMasterFromFormBody(body);
    const flat = flatColumnsFromMasterJson(master);

    const insertRow = {
      service_key: flat.service_key,
      service_name: flat.service_name,
      tone: flat.tone,
      cta_labels: flat.cta_labels,
      pain_points: flat.pain_points,
      faq_topics: flat.faq_topics,
      forbidden_words: flat.forbidden_words,
      section_structure: flat.section_structure,
      is_active: flat.is_active,
      master_json: master,
      persona_json: master,
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

    void refreshLpUiCopyForIndustryKey(supabase, flat.service_key).catch((e) =>
      console.error('[service-personas] dependent LP refresh', e),
    );
    return NextResponse.json({
      ok: true,
      id: typeof data?.id === 'string' ? data.id : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '登録に失敗しました';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
